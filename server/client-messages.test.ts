import { describe, expect, test } from "vitest";
import { applyClientMessage } from "./client-messages.ts";
import { DEFAULT_SETTINGS } from "./protocol.ts";
import { MAX_ICONS } from "./settings.ts";

const live = new Set(["sax 1", "sax 2"]);
const alex = { name: "ALEX", view: { first: "sax 1", last: "sax 2" }, cue: null };

describe("applyClientMessage", () => {
  test("applies valid scene settings and keeps the icons", () => {
    const current = { ...DEFAULT_SETTINGS, trackIcons: { "sax 1": "🎷" } };
    const result = applyClientMessage(
      current,
      { type: "updateSettings", settings: { startScene: 9, hideScenesBefore: true } },
      live,
    );
    expect(result).toEqual({ ok: true, settings: { ...current, startScene: 9, hideScenesBefore: true } });
  });

  test("applies only the fields sent, keeping the others", () => {
    const current = { ...DEFAULT_SETTINGS, startScene: 4, musicians: [alex] };
    const result = applyClientMessage(current, { type: "updateSettings", settings: { showArm: false } }, live);
    expect(result).toEqual({ ok: true, settings: { ...current, showArm: false } });
  });

  test("replaces the whole musician list", () => {
    const current = { ...DEFAULT_SETTINGS, musicians: [alex] };
    const ben = { name: "BEN", view: { first: "sax 2", last: "sax 2" }, cue: { send: "F", span: { first: "sax 2", last: "sax 2" } } };
    const result = applyClientMessage(current, { type: "updateSettings", settings: { musicians: [ben] } }, live);
    expect(result).toEqual({ ok: true, settings: { ...current, musicians: [ben] } });
  });

  test("sets and clears a volume source", () => {
    const set = applyClientMessage(DEFAULT_SETTINGS, { type: "setVolumeSource", trackName: "sax 1", source: "sax 2" }, live);
    expect(set).toEqual({ ok: true, settings: { ...DEFAULT_SETTINGS, volumeSources: { "sax 1": "sax 2" } } });
    const cleared = applyClientMessage(set.ok ? set.settings : DEFAULT_SETTINGS, { type: "setVolumeSource", trackName: "sax 1", source: null }, live);
    expect(cleared).toEqual({ ok: true, settings: DEFAULT_SETTINGS });
  });

  test("rejects a track used as its own volume source", () => {
    const result = applyClientMessage(DEFAULT_SETTINGS, { type: "setVolumeSource", trackName: "sax 1", source: "sax 1" }, live);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  test("sets and clears a chain label", () => {
    const set = applyClientMessage(DEFAULT_SETTINGS, { type: "setChainLabel", trackName: "ALEX 1", rack: "ALEX 1" }, live);
    expect(set).toEqual({ ok: true, settings: { ...DEFAULT_SETTINGS, chainLabels: { "ALEX 1": "ALEX 1" } } });
    const cleared = applyClientMessage(set.ok ? set.settings : DEFAULT_SETTINGS, { type: "setChainLabel", trackName: "ALEX 1", rack: null }, live);
    expect(cleared).toEqual({ ok: true, settings: DEFAULT_SETTINGS });
  });

  test("sets and clears a macro flag", () => {
    const flag = { track: "FX", rack: "SFX", macro: 2 };
    const set = applyClientMessage(DEFAULT_SETTINGS, { type: "setMacroFlag", trackName: "synth 1", flag }, live);
    expect(set).toEqual({ ok: true, settings: { ...DEFAULT_SETTINGS, macroFlags: { "synth 1": flag } } });
    const cleared = applyClientMessage(set.ok ? set.settings : DEFAULT_SETTINGS, { type: "setMacroFlag", trackName: "synth 1", flag: null }, live);
    expect(cleared).toEqual({ ok: true, settings: DEFAULT_SETTINGS });
  });

  test("refuses a macro flag whose macro is out of range", () => {
    const flag = { track: "FX", rack: "SFX", macro: 17 };
    const result = applyClientMessage(DEFAULT_SETTINGS, { type: "setMacroFlag", trackName: "synth 1", flag }, live);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  describe("concert mode", () => {
    const locked = { ...DEFAULT_SETTINGS, locked: true, musicians: [alex] };

    test("refuses any shared setting change", () => {
      const result = applyClientMessage(locked, { type: "updateSettings", settings: { startScene: 3 } }, live);
      expect(result).toEqual({ ok: false, reason: "locked" });
    });

    test("refuses a change sent along with the unlock", () => {
      const result = applyClientMessage(locked, { type: "updateSettings", settings: { locked: false, startScene: 3 } }, live);
      expect(result).toEqual({ ok: false, reason: "locked" });
    });

    test("refuses an icon change", () => {
      const result = applyClientMessage(locked, { type: "setTrackIcon", trackNames: ["sax 1"], icon: "🎷" }, live);
      expect(result).toEqual({ ok: false, reason: "locked" });
    });

    test("refuses a volume source change", () => {
      const result = applyClientMessage(locked, { type: "setVolumeSource", trackName: "sax 1", source: "sax 2" }, live);
      expect(result).toEqual({ ok: false, reason: "locked" });
    });

    test("refuses a chain label change", () => {
      const result = applyClientMessage(locked, { type: "setChainLabel", trackName: "ALEX 1", rack: "ALEX 1" }, live);
      expect(result).toEqual({ ok: false, reason: "locked" });
    });

    test("refuses a macro flag change", () => {
      const flag = { track: "FX", rack: "SFX", macro: 2 };
      const result = applyClientMessage(locked, { type: "setMacroFlag", trackName: "synth 1", flag }, live);
      expect(result).toEqual({ ok: false, reason: "locked" });
    });

    test("accepts the unlock alone", () => {
      const result = applyClientMessage(locked, { type: "updateSettings", settings: { locked: false } }, live);
      expect(result).toEqual({ ok: true, settings: { ...locked, locked: false } });
    });

    test("can be switched on together with other changes", () => {
      const result = applyClientMessage(
        DEFAULT_SETTINGS,
        { type: "updateSettings", settings: { locked: true, startScene: 3 } },
        live,
      );
      expect(result).toEqual({ ok: true, settings: { ...DEFAULT_SETTINGS, locked: true, startScene: 3 } });
    });
  });

  test("applies a valid icon update", () => {
    const result = applyClientMessage(DEFAULT_SETTINGS, { type: "setTrackIcon", trackNames: ["sax 1"], icon: "🎷" }, live);
    expect(result).toEqual({ ok: true, settings: { ...DEFAULT_SETTINGS, trackIcons: { "sax 1": "🎷" } } });
  });

  test.each([
    ["a non-object", "hello"],
    ["null", null],
    ["an unknown type", { type: "deleteEverything" }],
    ["scene settings out of range", { type: "updateSettings", settings: { startScene: -1, hideScenesBefore: true } }],
    ["a malformed musician", { type: "updateSettings", settings: { musicians: [{ name: "ALEX", view: { first: "" } }] } }],
    [
      "a cue on an unknown send",
      { type: "updateSettings", settings: { musicians: [{ ...alex, cue: { send: "Z", span: { first: "sax 1", last: "sax 2" } } }] } },
    ],
    ["two musicians with one name", { type: "updateSettings", settings: { musicians: [alex, alex] } }],
    ["a musician list with one bad entry", { type: "updateSettings", settings: { musicians: [alex, { name: "" }] } }],
    ["settings that are not an object", { type: "updateSettings", settings: "all" }],
    ["an icon that is free text", { type: "setTrackIcon", trackNames: ["sax 1"], icon: "sax" }],
    ["an icon update without tracks", { type: "setTrackIcon", trackNames: [], icon: "🎷" }],
  ])("rejects %s as invalid", (_, input) => {
    expect(applyClientMessage(DEFAULT_SETTINGS, input, live)).toEqual({ ok: false, reason: "invalid" });
  });

  test("reports a full icon store", () => {
    const full = {
      ...DEFAULT_SETTINGS,
      trackIcons: Object.fromEntries(Array.from({ length: MAX_ICONS }, (_, i) => [`other ${i}`, "🎷"])),
    };
    const result = applyClientMessage(full, { type: "setTrackIcon", trackNames: ["sax 1"], icon: "🎸" }, new Set(Object.keys(full.trackIcons)));
    expect(result).toEqual({ ok: false, reason: "full" });
  });
});
