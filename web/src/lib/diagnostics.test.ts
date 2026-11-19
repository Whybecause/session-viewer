import { describe, expect, test } from "vitest";
import type { ControlsMessage, Musician } from "../../../server/protocol.ts";
import { describeDiagnostic, diagnostics } from "./diagnostics.ts";

const alex: Musician = { name: "ALEX", view: { first: "ALEX 1", last: "ALEX 4" }, cue: null };
const ben: Musician = { name: "BEN", view: { first: "BEN 1", last: "BEN 4" }, cue: null };
const ours = { script: "other_writer.py", dir: "/repo/data/rec-length", isOurs: true };

describe("diagnostics", () => {
  test("nothing to report when every musician has a rec length and every script writes where the app reads", () => {
    expect(diagnostics([alex], { ALEX: 4 }, [ours], null, true)).toEqual([]);
  });

  test("reports a script writing elsewhere and a musician without rec length", () => {
    const moved = { script: "rec_writer.py", dir: "/old/data/rec-length", isOurs: false };
    expect(diagnostics([alex, ben], { ALEX: null }, [ours, moved], null, true)).toEqual([
      { kind: "rec_length_elsewhere", script: "rec_writer.py", dir: "/old/data/rec-length" },
      { kind: "rec_length_missing", musician: "BEN" },
    ]);
  });

  test("says nothing about record lengths while the setting is off", () => {
    const moved = { script: "rec_writer.py", dir: "/old/data/rec-length", isOurs: false };
    expect(diagnostics([alex, ben], {}, [ours, moved], null, false)).toEqual([]);
  });

  test("lists the overridden macros of each panel", () => {
    const controls: ControlsMessage = {
      type: "controls",
      full: true,
      focus: {},
      panels: {
        "ALEX 1": { track: "ALEX 1", rack: "ALEX 1", macros: [{ name: "cutoff", value: 0, overridden: true }, { name: "OTT", value: 3 }] },
        "ALEX 4": { track: "ALEX 4", rack: "ALEX 4", macros: [{ name: "LC", value: 0 }] },
      },
    };
    const found = diagnostics([], {}, [], controls, true);
    expect(found).toEqual([{ kind: "automation_overridden", track: "ALEX 1", macros: ["cutoff"] }]);
    expect(describeDiagnostic(found[0])).toContain("ALEX 1");
    expect(describeDiagnostic(found[0])).toContain("cutoff");
  });
});
