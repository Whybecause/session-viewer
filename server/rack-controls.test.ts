import { describe, expect, test, vi } from "vitest";
import type { Musician } from "./protocol.ts";
import { ControlsState, rackTargets } from "./rack-controls.ts";

const view = { first: "ALEX 1", last: "ALEX 4" };
const alex: Musician = {
  name: "ALEX",
  view,
  cue: null,
  controls: [
    { track: "ALEX 1", rack: "ALEX 1", mode: "chain" },
    { track: "ALEX 4", rack: "DRUMS", mode: "rack" },
  ],
};

describe("rackTargets", () => {
  test("one target per control, plus the chain labels, merged when they name the same rack", () => {
    const targets = rackTargets({ musicians: [alex], chainLabels: { "ALEX 1": "ALEX 1", "ALEX 2": "ALEX 2" }, macroFlags: {} });
    expect(targets).toEqual([
      { track: "ALEX 1", rack: "ALEX 1", label: true, mode: "chain", musicians: ["ALEX"], flags: [] },
      { track: "ALEX 4", rack: "DRUMS", label: false, mode: "rack", musicians: ["ALEX"], flags: [] },
      { track: "ALEX 2", rack: "ALEX 2", label: true, mode: null, musicians: [], flags: [] },
    ]);
  });

  test("a label on another rack of a controlled track is a target of its own", () => {
    const targets = rackTargets({ musicians: [alex], chainLabels: { "ALEX 1": "ARP" }, macroFlags: {} });
    expect(targets.filter((t) => t.track === "ALEX 1").map((t) => [t.rack, t.label, t.mode])).toEqual([
      ["ALEX 1", false, "chain"],
      ["ARP", true, null],
    ]);
  });

  test("a second musician on the same rack shares its panel; on another rack of that track, the first one wins", () => {
    const ben: Musician = { name: "BEN", view, cue: null, controls: [{ track: "ALEX 1", rack: "ALEX 1", mode: "rack" }] };
    const max: Musician = { name: "CAM", view, cue: null, controls: [{ track: "ALEX 1", rack: "ARP", mode: "rack" }] };
    const [first, ...others] = rackTargets({ musicians: [alex, ben, max], chainLabels: {}, macroFlags: {} });
    expect(first).toEqual({ track: "ALEX 1", rack: "ALEX 1", label: false, mode: "chain", musicians: ["ALEX", "BEN"], flags: [] });
    expect(others.some((t) => t.rack === "ARP")).toBe(false);
  });

  test("macro flags on one rack share a target; on a rack already followed they join it", () => {
    const macroFlags = {
      "synth 1": { track: "FX", rack: "SFX", macro: 1 },
      "synth 2": { track: "FX", rack: "SFX", macro: 2 },
      "ALEX 1 bis": { track: "ALEX 1", rack: "ALEX 1", macro: 3 },
    };
    const targets = rackTargets({ musicians: [alex], chainLabels: {}, macroFlags });
    expect(targets.find((t) => t.track === "FX")).toEqual({
      track: "FX",
      rack: "SFX",
      label: false,
      mode: null,
      musicians: [],
      flags: [
        { track: "synth 1", macro: 1 },
        { track: "synth 2", macro: 2 },
      ],
    });
    expect(targets.find((t) => t.track === "ALEX 1")?.flags).toEqual([{ track: "ALEX 1 bis", macro: 3 }]);
    expect(targets.filter((t) => t.track === "ALEX 1")).toHaveLength(1);
  });
});

describe("ControlsState", () => {
  test("a musician starts on their first control, then follows touches", () => {
    const onChange = vi.fn();
    const state = new ControlsState(onChange);
    expect(state.message([alex]).focus).toEqual({ ALEX: { track: "ALEX 1", macro: null, touch: 0 } });

    state.touch(["ALEX"], "ALEX 4", 3);
    expect(state.message([alex]).focus.ALEX).toEqual({ track: "ALEX 4", macro: 3, touch: 1 });
    expect(onChange).toHaveBeenCalled();
  });

  test("a focus on a track the musician no longer controls falls back to their first control", () => {
    const state = new ControlsState(() => undefined);
    state.touch(["ALEX"], "ALEX 4", 1);
    const withoutDrums = { ...alex, controls: alex.controls?.slice(0, 1) };
    expect(state.message([withoutDrums]).focus.ALEX.track).toBe("ALEX 1");
  });

  test("musicians without controls get no focus, and reset clears the panels", () => {
    const state = new ControlsState(() => undefined);
    state.setPanel({ track: "ALEX 4", rack: "DRUMS", macros: [] });
    const ben: Musician = { name: "BEN", view, cue: null };
    expect(state.message([ben])).toEqual({
      type: "controls",
      full: true,
      panels: { "ALEX 4": { track: "ALEX 4", rack: "DRUMS", macros: [] } },
      focus: {},
    });
    state.reset();
    expect(state.message([ben]).panels).toEqual({});
  });

  test("after a first full message, only the panels set since then are taken", () => {
    const state = new ControlsState(() => undefined);
    const drums = { track: "ALEX 4", rack: "DRUMS", macros: [] };
    const keys = { track: "ALEX 1", rack: "ALEX 1", macros: [] };
    state.setPanel(drums);
    state.setPanel(keys);
    expect(state.takeChanges([alex])).toMatchObject({ full: true, panels: { "ALEX 4": drums, "ALEX 1": keys } });

    const moved = { ...drums, macros: [{ name: "LC", value: 64 }] };
    state.setPanel(moved);
    expect(state.takeChanges([alex])).toMatchObject({ full: false, panels: { "ALEX 4": moved } });
    expect(state.takeChanges([alex]).panels).toEqual({});

    state.reset();
    expect(state.takeChanges([alex])).toMatchObject({ full: true, panels: {} });
  });
});
