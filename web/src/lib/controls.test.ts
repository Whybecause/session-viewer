import { describe, expect, test } from "vitest";
import type { ControlsMessage } from "../../../server/protocol.ts";
import { mergeControls, myControls } from "./controls.ts";

const panel = { track: "ALEX 1", rack: "ALEX 1", chain: { number: 1, name: "1 sub" }, macros: [{ name: "Cutoff", value: 64 }] };
const message: ControlsMessage = {
  type: "controls",
  full: true,
  panels: { "ALEX 1": panel, "BEN 1": { track: "BEN 1", rack: "BEN 1", macros: [] } },
  focus: { ALEX: { track: "ALEX 1", macro: 1, touch: 3 }, BEN: { track: "BEN 2", macro: null, touch: 0 } },
};

describe("myControls", () => {
  test("gives the musician the panel of their focused track", () => {
    expect(myControls(message, "ALEX")).toEqual({ focus: message.focus.ALEX, panel });
  });

  test("keeps the focus but no panel while the focused rack is missing", () => {
    expect(myControls(message, "BEN")).toEqual({ focus: message.focus.BEN, panel: null });
  });

  test("is null without a musician, without controls, or before the first message", () => {
    expect(myControls(message, null)).toBeNull();
    expect(myControls(message, "CAM")).toBeNull();
    expect(myControls(message, "toString")).toBeNull();
    expect(myControls(null, "ALEX")).toBeNull();
  });
});

describe("mergeControls", () => {
  const changed = { ...panel, macros: [{ name: "Cutoff", value: 90 }] };

  test("a partial message replaces only the panels it carries", () => {
    const partial: ControlsMessage = { type: "controls", full: false, panels: { "ALEX 1": changed }, focus: message.focus };
    expect(mergeControls(message, partial)?.panels).toEqual({ ...message.panels, "ALEX 1": changed });
  });

  test("a full message replaces everything, and a partial one before any full one is dropped", () => {
    const full: ControlsMessage = { type: "controls", full: true, panels: {}, focus: {} };
    expect(mergeControls(message, full)).toBe(full);
    expect(mergeControls(null, { ...full, full: false })).toBeNull();
  });
});
