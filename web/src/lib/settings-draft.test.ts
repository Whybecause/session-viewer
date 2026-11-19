import { describe, expect, test } from "vitest";
import type { Musician } from "../../../server/protocol.ts";
import { changeCount, draftError, holds, myNameAfterSave, settingsPatch, withRename, type SharedDraft } from "./settings-draft.ts";

const alex: Musician = { name: "ALEX", view: { first: "ALEX 1", last: "ALEX 4" }, cue: null };
const ben: Musician = { name: "BEN", view: { first: "BEN 1", last: "BEN 2" }, cue: null };
const base: SharedDraft = {
  startScene: 1,
  hideScenesBefore: false,
  musicians: [alex],
  showArm: true,
  signalSend: null,
  recLengthFiles: false,
  chainMacro: 16,
};

describe("draftError names", () => {
  test("refuses a name that cannot be a rec file name", () => {
    for (const name of ["a/b", ".x", "takes"]) {
      expect(draftError({ ...base, musicians: [{ ...alex, name }] }, 5)).toContain(name);
    }
  });

  test("accepts free names", () => {
    expect(draftError({ ...base, musicians: [{ ...alex, name: "Jean-Luc" }] }, 5)).toBeNull();
  });
});

describe("settingsPatch", () => {
  test("is empty when nothing was edited", () => {
    expect(settingsPatch(base, { ...base, musicians: [{ ...alex }] })).toEqual({});
  });

  test("holds only the edited fields", () => {
    expect(settingsPatch(base, { ...base, startScene: 5, signalSend: "H" })).toEqual({ startScene: 5, signalSend: "H" });
  });

  test("sends the record length switch and the chain macro when edited", () => {
    expect(settingsPatch(base, { ...base, recLengthFiles: true, chainMacro: 8 })).toEqual({ recLengthFiles: true, chainMacro: 8 });
  });

  test("sends the whole musician list when one of them changed, or when emptied", () => {
    expect(settingsPatch(base, { ...base, musicians: [alex, ben] })).toEqual({ musicians: [alex, ben] });
    expect(settingsPatch(base, { ...base, musicians: [] })).toEqual({ musicians: [] });
  });
});

describe("changeCount", () => {
  test("counts each edited setting and each musician added, removed or edited", () => {
    expect(changeCount(base, base)).toBe(0);
    expect(changeCount(base, { ...base, startScene: 2, showArm: false })).toBe(2);
    expect(changeCount(base, { ...base, musicians: [{ ...alex, color: "#ffffff" }, ben] })).toBe(2);
    expect(changeCount(base, { ...base, musicians: [] })).toBe(1);
  });
});

describe("draftError", () => {
  test("accepts a valid draft", () => {
    expect(draftError(base, 10)).toBeNull();
  });

  test("names what the server would refuse", () => {
    expect(draftError({ ...base, startScene: 11 }, 10)).toContain("Pick a scene between 1 and 10");
    expect(draftError({ ...base, musicians: [{ ...alex, name: " " }] }, 10)).toContain("Every musician needs a name");
    expect(draftError({ ...base, musicians: [alex, { ...ben, name: "ALEX" }] }, 10)).toContain("Two musicians are called “ALEX”");
    const control = { track: "ALEX 1", rack: "ALEX 1", mode: "chain" as const };
    expect(draftError({ ...base, musicians: [{ ...alex, controls: [control, control] }] }, 10)).toContain(
      "ALEX has two racks on track “ALEX 1”",
    );
  });
});

describe("withRename", () => {
  test("keys a rename by the name the musician had when opened, even after several", () => {
    const once = withRename(new Map(), "ALEX", "ALEXANDRE");
    expect([...withRename(once, "ALEXANDRE", "AL")]).toEqual([["ALEX", "AL"]]);
  });

  test("leaves the given map untouched", () => {
    const before = new Map([["CAM", "CAMILLE"]]);
    withRename(before, "BEN", "TOM");
    expect([...before]).toEqual([["CAM", "CAMILLE"]]);
  });
});

describe("myNameAfterSave", () => {
  const renamed = new Map([["ALEX", "ALEXANDRE"]]);

  test("follows a rename of the musician this phone is", () => {
    expect(myNameAfterSave("ALEX", renamed, ["ALEXANDRE", "BEN"])).toBe("ALEXANDRE");
  });

  test("keeps a name nobody renamed, and nobody stays nobody", () => {
    expect(myNameAfterSave("BEN", renamed, ["ALEXANDRE", "BEN"])).toBe("BEN");
    expect(myNameAfterSave(null, renamed, ["ALEXANDRE"])).toBeNull();
  });

  test("forgets a renamed musician that is no longer saved", () => {
    expect(myNameAfterSave("ALEX", renamed, ["BEN"])).toBeNull();
  });
});

describe("holds", () => {
  test("is true once the saved settings carry what was sent", () => {
    expect(holds({ ...base, startScene: 4 }, { startScene: 4 })).toBe(true);
  });

  test("is false for settings that do not carry it yet, such as someone else's change arriving first", () => {
    expect(holds(base, { startScene: 4 })).toBe(false);
  });

  test("ignores the positions the server remembers on its own", () => {
    const moved = { ...alex, view: { ...alex.view, lastFirstIndex: 3, lastLastIndex: 6 } };
    expect(holds({ ...base, musicians: [moved] }, { musicians: [alex] })).toBe(true);
  });
});
