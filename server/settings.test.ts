import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS } from "./protocol.ts";
import {
  MAX_CHAIN_LABELS,
  MAX_ICONS,
  MAX_MACRO_FLAGS,
  MAX_VOLUME_SOURCES,
  applyChainLabelUpdate,
  applyMacroFlagUpdate,
  applyTrackIconUpdate,
  applyVolumeSourceUpdate,
  loadSettings,
  isUnlockOnly,
  parseDisplaySettings,
  parseChainLabelUpdate,
  parseMacroFlagUpdate,
  parseDisplaySettingsPatch,
  parseSettings,
  parseTrackIconUpdate,
  parseVolumeSourceUpdate,
  saveSettings,
  settingsEqual,
} from "./settings.ts";

const BASE = { startScene: 9, hideScenesBefore: true };
const alex = { name: "ALEX", view: { first: "ALEX 1", last: "vocal 4" }, cue: { send: "E", span: { first: "ALEX 1", last: "vocal 4" } } };

describe("tracks named like Object.prototype members", () => {
  test("a label or flag update is not mistaken for an existing one", () => {
    expect(applyChainLabelUpdate(DEFAULT_SETTINGS, { trackName: "constructor", rack: null })).toBe(DEFAULT_SETTINGS);
    const labelled = applyChainLabelUpdate(DEFAULT_SETTINGS, { trackName: "toString", rack: "R" });
    expect(Object.keys(labelled?.chainLabels ?? {})).toEqual(["toString"]);
    expect(applyMacroFlagUpdate(DEFAULT_SETTINGS, { trackName: "constructor", flag: null })).toBe(DEFAULT_SETTINGS);
  });
});

describe("musician names", () => {
  const view = { first: "a 1", last: "a 2" };
  const named = (name: string) => ({ ...BASE, musicians: [{ name, view }] });

  test("accepts free names, since they are also the rec file name", () => {
    for (const name of ["Ben", "ALEX2", "Jean-Luc", "Émile", "sax & gtr"]) {
      expect(parseDisplaySettingsPatch({ musicians: named(name).musicians })?.musicians?.[0].name).toBe(name);
    }
  });

  test("refuses names that cannot be a file name", () => {
    for (const name of ["a/b", "a\\b", ".hidden", "takes", "Takes", "a\0b"]) {
      expect(parseDisplaySettingsPatch({ musicians: named(name).musicians })).toBeNull();
    }
  });
});

describe("parseDisplaySettings", () => {
  test("accepts a valid start scene and hide flag, dropping unknown fields", () => {
    expect(parseDisplaySettings({ ...BASE, admin: true })).toEqual({
      ...BASE,
      musicians: [],
      showArm: true,
      signalSend: null,
      recLengthFiles: false,
      chainMacro: 16,
      locked: false,
    });
  });

  test("keeps a valid musician with its colour and remembered positions, dropping unknown fields", () => {
    const input = {
      name: "ALEX",
      color: "#E8962E",
      view: { first: "ALEX 1", last: "vocal 4", lastFirstIndex: 3, lastLastIndex: 14, extra: 1 },
      cue: { send: "E", span: { first: "ALEX 1", last: "vocal 4", extra: 1 } },
      admin: true,
    };
    expect(parseDisplaySettings({ ...BASE, musicians: [input] })?.musicians).toEqual([
      {
        name: "ALEX",
        color: "#E8962E",
        view: { first: "ALEX 1", last: "vocal 4", lastFirstIndex: 3, lastLastIndex: 14 },
        cue: { send: "E", span: { first: "ALEX 1", last: "vocal 4" } },
      },
    ]);
  });

  test("reads an older cue: one equal to the view follows it, another keeps its own span", () => {
    const view = { first: "ALEX 1", last: "vocal 4" };
    const same = { name: "ALEX", view, cue: { send: "E", ...view } };
    const own = { name: "CAM", view, cue: { send: "G", first: "ALEX 1", last: "sax 4" } };
    expect(parseDisplaySettings({ ...BASE, musicians: [same, own] })?.musicians.map((m) => m.cue)).toEqual([
      { send: "E", span: null },
      { send: "G", span: { first: "ALEX 1", last: "sax 4" } },
    ]);
  });

  test("rejects a cue whose span is neither null nor a span", () => {
    const view = { first: "ALEX 1", last: "vocal 4" };
    const broken = { name: "ALEX", view, cue: { send: "E", span: { first: "ALEX 1" } } };
    expect(parseDisplaySettingsPatch({ musicians: [broken] })).toBeNull();
  });

  test("accepts a musician without cue", () => {
    const musician = { name: "CAM", view: { first: "CAM 1", last: "DRUMS" } };
    expect(parseDisplaySettings({ ...BASE, musicians: [musician] })?.musicians).toEqual([{ ...musician, cue: null }]);
  });

  test("keeps a rec span, and leaves it out when null", () => {
    const view = { first: "CAM 1", last: "DRUMS" };
    const rec = { first: "CAM 1", last: "gtr cam 4" };
    expect(parseDisplaySettings({ ...BASE, musicians: [{ name: "CAM", view, rec: { ...rec, extra: 1 } }] })?.musicians).toEqual([
      { name: "CAM", view, cue: null, rec },
    ]);
    expect(parseDisplaySettings({ ...BASE, musicians: [{ name: "CAM", view, rec: null }] })?.musicians).toEqual([
      { name: "CAM", view, cue: null },
    ]);
  });

  test("rejects a patch with a broken rec span, but a saved file only loses that span", () => {
    const broken = { name: "CAM", view: { first: "CAM 1", last: "DRUMS" }, rec: { first: "CAM 1" } };
    expect(parseDisplaySettingsPatch({ musicians: [broken] })).toBeNull();
    expect(parseDisplaySettings({ ...BASE, musicians: [broken] })?.musicians).toEqual([
      { name: "CAM", view: broken.view, cue: null },
    ]);
  });

  test("keeps controls, one per track, and leaves them out when empty", () => {
    const view = { first: "ALEX 1", last: "vocal 4" };
    const controls = [
      { track: "ALEX 1", rack: "ALEX 1", mode: "chain" },
      { track: "ALEX 4", rack: "DRUMS", mode: "rack" },
    ];
    const input = { name: "ALEX", view, controls: [...controls, { track: "ALEX 1", rack: "ARP", mode: "rack" }] };
    expect(parseDisplaySettings({ ...BASE, musicians: [input] })?.musicians).toEqual([{ name: "ALEX", view, cue: null, controls }]);
    expect(parseDisplaySettings({ ...BASE, musicians: [{ name: "ALEX", view, controls: [] }] })?.musicians).toEqual([
      { name: "ALEX", view, cue: null },
    ]);
  });

  test("rejects a patch with a broken or duplicate control, but a saved file only loses that control", () => {
    const view = { first: "ALEX 1", last: "vocal 4" };
    const good = { track: "ALEX 1", rack: "ALEX 1", mode: "chain" };
    const broken = { name: "ALEX", view, controls: [good, { track: "ALEX 2", rack: "ALEX 2", mode: "knobs" }] };
    const twice = { name: "ALEX", view, controls: [good, { ...good, rack: "ARP" }] };
    expect(parseDisplaySettingsPatch({ musicians: [broken] })).toBeNull();
    expect(parseDisplaySettingsPatch({ musicians: [twice] })).toBeNull();
    expect(parseDisplaySettings({ ...BASE, musicians: [broken] })?.musicians).toEqual([
      { name: "ALEX", view, cue: null, controls: [good] },
    ]);
  });

  test("loses only the broken field of a saved musician, not its view", () => {
    const musicians = parseDisplaySettings({
      ...BASE,
      musicians: [
        { name: "CAM", view: { first: "CAM 1", last: "DRUMS" }, cue: { send: "Z", span: { first: "CAM 1", last: "DRUMS" } } },
        { name: "BASS", color: "red", view: { first: "bass 1", last: "bass 4" }, cue: null },
      ],
    })?.musicians;
    expect(musicians).toEqual([
      { name: "CAM", view: { first: "CAM 1", last: "DRUMS" }, cue: null },
      { name: "BASS", view: { first: "bass 1", last: "bass 4" }, cue: null },
    ]);
  });

  test("keeps the valid musicians and drops broken or repeated ones", () => {
    const musicians = parseDisplaySettings({
      ...BASE,
      musicians: [
        alex,
        { ...alex, view: { first: "other", last: "other" } },
        { name: "BEN", view: { first: "" }, cue: null },
        { name: "BASS" },
        "ALEX",
      ],
    })?.musicians;
    expect(musicians).toEqual([alex]);
  });

  test("migrates the families written before musicians existed", () => {
    const legacy = {
      ...BASE,
      navFamilies: ["ALEX", "BEN", "CAM"],
      familyViews: { ALEX: { first: "ALEX 1", last: "vocal 4" }, BEN: { first: "BEN 1", last: "gtr 4" } },
      familyCues: { ALEX: { send: "E", span: { first: "ALEX 1", last: "vocal 4" } }, SAX: { send: "F", span: { first: "a", last: "b" } } },
    };
    expect(parseDisplaySettings(legacy)?.musicians).toEqual([
      alex,
      { name: "BEN", view: { first: "BEN 1", last: "gtr 4" }, cue: null },
    ]);
  });

  test("prefers musicians over leftover legacy fields", () => {
    const input = { ...BASE, musicians: [], navFamilies: ["ALEX"], familyViews: { ALEX: alex.view } };
    expect(parseDisplaySettings(input)?.musicians).toEqual([]);
  });

  test("hides the arm state when asked", () => {
    expect(parseDisplaySettings({ ...BASE, showArm: false })?.showArm).toBe(false);
  });

  test("reads the concert mode lock", () => {
    expect(parseDisplaySettings({ ...BASE, locked: true })?.locked).toBe(true);
  });

  test.each([
    ["a missing object", null],
    ["a scene below 1", { startScene: 0, hideScenesBefore: false }],
    ["a fractional scene", { startScene: 2.5, hideScenesBefore: false }],
    ["a scene given as text", { startScene: "9", hideScenesBefore: false }],
    ["an absurd scene number", { startScene: 1e9, hideScenesBefore: false }],
    ["a non-boolean flag", { startScene: 9, hideScenesBefore: "yes" }],
    ["musicians that are not a list", { ...BASE, musicians: "ALEX" }],
    ["a non-boolean arm flag", { ...BASE, showArm: "no" }],
    ["a non-boolean lock", { ...BASE, locked: "yes" }],
  ])("rejects %s", (_, input) => {
    expect(parseDisplaySettings(input)).toBeNull();
  });
});

describe("parseDisplaySettingsPatch", () => {
  test("keeps only the given fields", () => {
    expect(parseDisplaySettingsPatch({ showArm: false, admin: true })).toEqual({ showArm: false });
  });

  test("accepts a musician list", () => {
    expect(parseDisplaySettingsPatch({ musicians: [alex] })).toEqual({ musicians: [alex] });
  });

  test("accepts an emptied musician list", () => {
    expect(parseDisplaySettingsPatch({ musicians: [] })).toEqual({ musicians: [] });
  });

  test("accepts a signal send letter, and null to clear it", () => {
    expect(parseDisplaySettingsPatch({ signalSend: "H" })).toEqual({ signalSend: "H" });
    expect(parseDisplaySettingsPatch({ signalSend: null })).toEqual({ signalSend: null });
  });

  test("accepts the record length switch and a chain macro from 1 to 16", () => {
    expect(parseDisplaySettingsPatch({ recLengthFiles: true })).toEqual({ recLengthFiles: true });
    expect(parseDisplaySettingsPatch({ chainMacro: 1 })).toEqual({ chainMacro: 1 });
    expect(parseDisplaySettingsPatch({ chainMacro: 16 })).toEqual({ chainMacro: 16 });
  });

  test.each([
    ["a list of 21 musicians", { musicians: Array.from({ length: 21 }, (_, i) => ({ ...alex, name: `M${i}` })) }],
    ["a bad entry among good ones", { musicians: [alex, { name: "BEN" }] }],
    ["two musicians with one name", { musicians: [alex, alex] }],
    ["a colour that is not hexadecimal", { musicians: [{ ...alex, color: "orange" }] }],
    ["a negative remembered position", { musicians: [{ ...alex, view: { ...alex.view, lastFirstIndex: -1 } }] }],
    ["a non-boolean lock", { locked: 1 }],
    ["a send letter past L", { signalSend: "M" }],
    ["a send that is not a letter", { signalSend: 7 }],
    ["a non-boolean record length switch", { recLengthFiles: "on" }],
    ["a chain macro of 0", { chainMacro: 0 }],
    ["a chain macro past 16", { chainMacro: 17 }],
    ["a fractional chain macro", { chainMacro: 2.5 }],
  ])("rejects %s", (_, input) => {
    expect(parseDisplaySettingsPatch(input)).toBeNull();
  });
});

describe("isUnlockOnly", () => {
  test("is true for the lock alone and for nothing at all", () => {
    expect(isUnlockOnly({ locked: false })).toBe(true);
    expect(isUnlockOnly({})).toBe(true);
  });

  test("is false once anything else comes with it", () => {
    expect(isUnlockOnly({ locked: false, showArm: true })).toBe(false);
  });
});

describe("signalSend in a saved file", () => {
  test("keeps a valid letter", () => {
    expect(parseDisplaySettings({ ...BASE, signalSend: "H" })?.signalSend).toBe("H");
  });

  test("drops a broken letter without rejecting the whole file", () => {
    expect(parseDisplaySettings({ ...BASE, signalSend: "nope" })?.signalSend).toBeNull();
  });
});

describe("recLengthFiles and chainMacro in a saved file", () => {
  test("a file written before they existed stays valid and takes the defaults", () => {
    expect(parseDisplaySettings(BASE)).toMatchObject({ recLengthFiles: false, chainMacro: 16 });
  });

  test("keeps valid values", () => {
    expect(parseDisplaySettings({ ...BASE, recLengthFiles: true, chainMacro: 8 })).toMatchObject({ recLengthFiles: true, chainMacro: 8 });
  });

  test.each([0, 17, 2.5, "8", null])("drops a chain macro of %j without rejecting the whole file", (chainMacro) => {
    expect(parseDisplaySettings({ ...BASE, chainMacro })?.chainMacro).toBe(16);
  });

  test("reads anything but true as off", () => {
    expect(parseDisplaySettings({ ...BASE, recLengthFiles: "yes" })?.recLengthFiles).toBe(false);
  });
});

describe("parseSettings", () => {
  test("reads a file written before icons and musicians existed", () => {
    expect(parseSettings(BASE)).toEqual({
      version: 1,
      ...BASE,
      musicians: [],
      showArm: true,
      signalSend: null,
      recLengthFiles: false,
      chainMacro: 16,
      locked: false,
      trackIcons: {},
      volumeSources: {},
      chainLabels: {},
      macroFlags: {},
    });
  });

  test("keeps valid icons and musicians", () => {
    const input = {
      version: 2,
      ...BASE,
      musicians: [alex],
      showArm: false,
      locked: true,
      trackIcons: { "sax 1": "🎷" },
      volumeSources: { "CAM 1": "cam 1 bus" },
      chainLabels: { "ALEX 1": "ALEX 1" },
      signalSend: "H",
      recLengthFiles: true,
      chainMacro: 8,
      macroFlags: { "sax 1": { track: "FX", rack: "SFX", macro: 2 } },
    };
    expect(parseSettings(input)).toEqual(input);
  });

  test("drops invalid icons and keeps the valid ones", () => {
    const input = { startScene: 1, hideScenesBefore: false, trackIcons: { "sax 1": "saxophone", "gtr 1": "🎸" } };
    expect(parseSettings(input)?.trackIcons).toEqual({ "gtr 1": "🎸" });
  });

  test("rejects a file whose scene settings are invalid", () => {
    expect(parseSettings({ startScene: 0, hideScenesBefore: false })).toBeNull();
  });

  test("rejects a trackIcons value that is not an object", () => {
    expect(parseSettings({ startScene: 1, hideScenesBefore: false, trackIcons: ["🎷"] })).toBeNull();
  });
});

describe("parseTrackIconUpdate", () => {
  test("collapses duplicate track names", () => {
    expect(parseTrackIconUpdate({ trackNames: ["bass 1", "bass 1"], icon: "🎸" })?.trackNames).toEqual(["bass 1"]);
  });

  test("accepts an icon for several tracks", () => {
    expect(parseTrackIconUpdate({ trackNames: ["sax 1", "sax 2"], icon: "🎷" })).toEqual({
      trackNames: ["sax 1", "sax 2"],
      icon: "🎷",
    });
  });

  test("accepts null to remove an icon", () => {
    expect(parseTrackIconUpdate({ trackNames: ["sax 1"], icon: null })).toEqual({ trackNames: ["sax 1"], icon: null });
  });

  test.each([
    ["no track", { trackNames: [], icon: "🎷" }],
    ["too many tracks", { trackNames: Array.from({ length: 201 }, (_, i) => `t${i}`), icon: "🎷" }],
    ["an empty track name", { trackNames: [""], icon: "🎷" }],
    ["free text as icon", { trackNames: ["sax 1"], icon: "sax" }],
    ["a string instead of a list", { trackNames: "sax 1", icon: "🎷" }],
  ])("rejects %s", (_, input) => {
    expect(parseTrackIconUpdate(input)).toBeNull();
  });
});

describe("applyTrackIconUpdate", () => {
  const settings = { ...DEFAULT_SETTINGS, trackIcons: { "sax 1": "🎷", "gtr 1": "🎸" } };

  test("sets an icon on the named tracks and leaves the others untouched", () => {
    const next = applyTrackIconUpdate(settings, { trackNames: ["sax 1", "sax 2"], icon: "🎺" });
    expect(next?.trackIcons).toEqual({ "gtr 1": "🎸", "sax 1": "🎺", "sax 2": "🎺" });
    expect(settings.trackIcons).toEqual({ "sax 1": "🎷", "gtr 1": "🎸" });
  });

  test("removes the icon of the named tracks", () => {
    expect(applyTrackIconUpdate(settings, { trackNames: ["sax 1"], icon: null })?.trackIcons).toEqual({ "gtr 1": "🎸" });
  });

  describe("at the icon cap", () => {
    const full = {
      ...DEFAULT_SETTINGS,
      trackIcons: Object.fromEntries(Array.from({ length: MAX_ICONS }, (_, i) => [`t${i}`, "🎷"])),
    };
    const update = { trackNames: ["new"], icon: "🎸" };

    test("refuses a new icon when Live's track names are unknown", () => {
      expect(applyTrackIconUpdate(full, update)).toBeNull();
    });

    test("drops icons of tracks that no longer exist to make room", () => {
      const next = applyTrackIconUpdate(full, update, new Set(["t0", "t1", "new"]));
      expect(next?.trackIcons).toEqual({ t0: "🎷", t1: "🎷", new: "🎸" });
    });

    test("still refuses when every stored icon belongs to an existing track", () => {
      const live = new Set(Object.keys(full.trackIcons));
      expect(applyTrackIconUpdate(full, update, live)).toBeNull();
    });

    test("always allows removing an icon", () => {
      expect(applyTrackIconUpdate(full, { trackNames: ["t0"], icon: null })?.trackIcons.t0).toBeUndefined();
    });
  });
});

describe("settingsEqual", () => {
  test("compares by content", () => {
    expect(settingsEqual({ ...DEFAULT_SETTINGS }, { ...DEFAULT_SETTINGS, trackIcons: {} })).toBe(true);
    expect(settingsEqual(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, startScene: 2 })).toBe(false);
  });
});

describe("loadSettings / saveSettings", () => {
  test("returns defaults when the file does not exist yet", async () => {
    const dir = await mkdtemp(join(tmpdir(), "settings-"));
    expect(await loadSettings(join(dir, "missing.json"))).toEqual(DEFAULT_SETTINGS);
  });

  test("returns defaults and keeps a backup when the file holds invalid settings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "settings-"));
    const path = join(dir, "settings.json");
    await writeFile(path, '{"startScene": -3}');
    expect(await loadSettings(path)).toEqual(DEFAULT_SETTINGS);
    expect(await readFile(`${path}.bak`, "utf8")).toBe('{"startScene": -3}');
  });

  test("returns defaults and keeps a backup when the file is truncated JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "settings-"));
    const path = join(dir, "settings.json");
    await writeFile(path, '{"startScene": 9, "trackIc');
    expect(await loadSettings(path)).toEqual(DEFAULT_SETTINGS);
    expect(await readFile(`${path}.bak`, "utf8")).toBe('{"startScene": 9, "trackIc');
  });

  test("leaves no temporary file behind after saving", async () => {
    const dir = await mkdtemp(join(tmpdir(), "settings-"));
    await saveSettings(join(dir, "settings.json"), DEFAULT_SETTINGS);
    expect(await readdir(dir)).toEqual(["settings.json"]);
  });

  test("round-trips saved settings, creating the folder", async () => {
    const dir = await mkdtemp(join(tmpdir(), "settings-"));
    const path = join(dir, "nested", "settings.json");
    const settings = {
      ...DEFAULT_SETTINGS,
      startScene: 9,
      hideScenesBefore: true,
      musicians: [alex],
      trackIcons: { "sax 1": "🎷" },
    };
    await saveSettings(path, settings);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(settings);
    expect(await loadSettings(path)).toEqual(settings);
  });
});

describe("volume sources", () => {
  const settings = { ...DEFAULT_SETTINGS, volumeSources: { "CAM 1": "cam 1 bus" } };

  test("drops a source that is its own track or not a name, keeping the valid ones", () => {
    const input = { ...BASE, volumeSources: { "CAM 1": "cam 1 bus", "CAM 2": "CAM 2", "CAM 3": 4 } };
    expect(parseSettings(input)?.volumeSources).toEqual({ "CAM 1": "cam 1 bus" });
  });

  test("rejects an update pointing a track at itself or at a non-string", () => {
    expect(parseVolumeSourceUpdate({ trackName: "CAM 1", source: "CAM 1" })).toBeNull();
    expect(parseVolumeSourceUpdate({ trackName: "CAM 1", source: 3 })).toBeNull();
    expect(parseVolumeSourceUpdate({ trackName: "", source: null })).toBeNull();
  });

  test("sets, replaces and clears a source without touching the others", () => {
    const set = applyVolumeSourceUpdate(settings, { trackName: "CAM 2", source: "cam 2 bus" });
    expect(set?.volumeSources).toEqual({ "CAM 1": "cam 1 bus", "CAM 2": "cam 2 bus" });
    const replaced = applyVolumeSourceUpdate(settings, { trackName: "CAM 1", source: "other" });
    expect(replaced?.volumeSources).toEqual({ "CAM 1": "other" });
    expect(applyVolumeSourceUpdate(settings, { trackName: "CAM 1", source: null })?.volumeSources).toEqual({});
    expect(settings.volumeSources).toEqual({ "CAM 1": "cam 1 bus" });
  });

  test("refuses a new entry once the map is full", () => {
    const full = Object.fromEntries(Array.from({ length: MAX_VOLUME_SOURCES }, (_, i) => [`t${i}`, "bus"]));
    expect(applyVolumeSourceUpdate({ ...settings, volumeSources: full }, { trackName: "new", source: "bus" })).toBeNull();
  });
});

describe("chain labels", () => {
  const settings = { ...DEFAULT_SETTINGS, chainLabels: { "ALEX 1": "ALEX 1" } };

  test("keeps the valid entries of a saved file", () => {
    const input = { ...BASE, chainLabels: { "ALEX 1": "ALEX 1", "ALEX 2": 3, "": "rack" } };
    expect(parseSettings(input)?.chainLabels).toEqual({ "ALEX 1": "ALEX 1" });
  });

  test("rejects an update without a track or with a non-string rack", () => {
    expect(parseChainLabelUpdate({ trackName: "", rack: "ALEX 1" })).toBeNull();
    expect(parseChainLabelUpdate({ trackName: "ALEX 1", rack: 2 })).toBeNull();
    expect(parseChainLabelUpdate({ trackName: "ALEX 1", rack: null })).toEqual({ trackName: "ALEX 1", rack: null });
  });

  test("sets and clears a label without touching the others", () => {
    const set = applyChainLabelUpdate(settings, { trackName: "ALEX 2", rack: "ALEX 2" });
    expect(set?.chainLabels).toEqual({ "ALEX 1": "ALEX 1", "ALEX 2": "ALEX 2" });
    expect(applyChainLabelUpdate(settings, { trackName: "ALEX 1", rack: null })?.chainLabels).toEqual({});
    expect(settings.chainLabels).toEqual({ "ALEX 1": "ALEX 1" });
  });

  test("refuses a new entry once the map is full", () => {
    const full = Object.fromEntries(Array.from({ length: MAX_CHAIN_LABELS }, (_, i) => [`t${i}`, "rack"]));
    expect(applyChainLabelUpdate({ ...settings, chainLabels: full }, { trackName: "new", rack: "rack" })).toBeNull();
  });
});

test("re-setting a chain label to its rack returns the settings untouched", () => {
  const settings = { ...DEFAULT_SETTINGS, chainLabels: { "ALEX 1": "ALEX 1", "ALEX 2": "ALEX 2" } };
  expect(applyChainLabelUpdate(settings, { trackName: "ALEX 1", rack: "ALEX 1" })).toBe(settings);
});

describe("macro flags", () => {
  const flag = { track: "FX", rack: "SFX", macro: 3 };
  const settings = { ...DEFAULT_SETTINGS, macroFlags: { "synth 1": flag } };

  test("keeps the valid entries of a saved file", () => {
    const input = {
      ...BASE,
      macroFlags: { "synth 1": flag, "synth 2": { ...flag, macro: 17 }, "synth 3": { ...flag, macro: 0 }, "synth 4": "FX", "": flag },
    };
    expect(parseSettings(input)?.macroFlags).toEqual({ "synth 1": flag });
  });

  test("rejects an update with a macro outside 1-16, a missing rack or an empty track", () => {
    expect(parseMacroFlagUpdate({ trackName: "synth 1", flag: { ...flag, macro: 17 } })).toBeNull();
    expect(parseMacroFlagUpdate({ trackName: "synth 1", flag: { ...flag, macro: 1.5 } })).toBeNull();
    expect(parseMacroFlagUpdate({ trackName: "synth 1", flag: { track: "FX", macro: 1 } })).toBeNull();
    expect(parseMacroFlagUpdate({ trackName: "", flag })).toBeNull();
    expect(parseMacroFlagUpdate({ trackName: "synth 1", flag: null })).toEqual({ trackName: "synth 1", flag: null });
  });

  test("sets and clears a flag without touching the others", () => {
    const other = { ...flag, macro: 4 };
    const set = applyMacroFlagUpdate(settings, { trackName: "synth 2", flag: other });
    expect(set?.macroFlags).toEqual({ "synth 1": flag, "synth 2": other });
    expect(applyMacroFlagUpdate(settings, { trackName: "synth 1", flag: null })?.macroFlags).toEqual({});
    expect(settings.macroFlags).toEqual({ "synth 1": flag });
  });

  test("re-sending the same flag returns the settings untouched, not a reordered copy", () => {
    expect(applyMacroFlagUpdate(settings, { trackName: "synth 1", flag: { ...flag } })).toBe(settings);
  });

  test("refuses a new entry once the map is full", () => {
    const full = Object.fromEntries(Array.from({ length: MAX_MACRO_FLAGS }, (_, i) => [`t${i}`, flag]));
    expect(applyMacroFlagUpdate({ ...settings, macroFlags: full }, { trackName: "new", flag })).toBeNull();
  });
});
