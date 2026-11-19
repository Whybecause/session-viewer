import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isIcon } from "./icon.ts";
import {
  CONTROL_MODES,
  DEFAULT_CHAIN_MACRO,
  DEFAULT_SETTINGS,
  MAX_CONTROLS,
  MAX_MACRO,
  MAX_MUSICIANS,
  SEND_LETTERS,
  isRecFileStem,
  ownValue,
  type ControlMode,
  type DisplaySettings,
  type DisplaySettingsPatch,
  type Cue,
  type MacroFlag,
  type Musician,
  type MusicianView,
  type RackControl,
  type Settings,
  type TrackSpan,
} from "./protocol.ts";

const MAX_SCENE = 9999;
const MAX_TRACK_NAME_LENGTH = 200;
const MAX_TRACKS_PER_UPDATE = 200;
export const MAX_ICONS = 2000;
export const MAX_VOLUME_SOURCES = 200;
export const MAX_CHAIN_LABELS = 200;
export const MAX_MACRO_FLAGS = 200;

export const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === "object" && input !== null && !Array.isArray(input);

const isTrackName = (name: unknown): name is string =>
  typeof name === "string" && name.length > 0 && name.length <= MAX_TRACK_NAME_LENGTH;

const isScene = (scene: unknown): scene is number =>
  Number.isInteger(scene) && (scene as number) >= 1 && (scene as number) <= MAX_SCENE;

const optional = <T>(value: unknown, check: (v: unknown) => v is T): boolean => value === undefined || check(value);
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isSendLetter = (value: unknown): value is string => typeof value === "string" && SEND_LETTERS.includes(value);

const COLOR = /^#[0-9a-f]{6}$/i;
const MAX_TRACK_INDEX = 100_000;

const isIndex = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_TRACK_INDEX;

const trackSpan = (input: unknown): TrackSpan | null =>
  isRecord(input) && isTrackName(input.first) && isTrackName(input.last)
    ? { first: input.first, last: input.last }
    : null;

function musicianView(input: unknown): MusicianView | null {
  const span = trackSpan(input);
  if (!span || !isRecord(input)) return null;
  const { lastFirstIndex, lastLastIndex } = input;
  if (!optional(lastFirstIndex, isIndex) || !optional(lastLastIndex, isIndex)) return null;
  return {
    ...span,
    ...(lastFirstIndex !== undefined && { lastFirstIndex: lastFirstIndex as number }),
    ...(lastLastIndex !== undefined && { lastLastIndex: lastLastIndex as number }),
  };
}

const sameSpan = (a: TrackSpan, b: TrackSpan) => a.first === b.first && a.last === b.last;

/** null is a valid "no cue"; undefined is an invalid one. Reads the older { send, first, last } too. */
function cue(input: unknown, view: TrackSpan): Cue | null | undefined {
  if (input === null || input === undefined) return null;
  if (!isRecord(input) || !isSendLetter(input.send)) return undefined;
  if (!("span" in input)) {
    const legacy = trackSpan(input);
    return legacy ? { send: input.send, span: sameSpan(legacy, view) ? null : legacy } : undefined;
  }
  const span = input.span === null ? null : trackSpan(input.span);
  return span === null && input.span !== null ? undefined : { send: input.send, span };
}

// Racks are named like tracks in Live, so the same length bound applies.
const isRackName = (name: unknown): name is string => isTrackName(name);
const isControlMode = (mode: unknown): mode is ControlMode => CONTROL_MODES.includes(mode as ControlMode);

const rackControl = (input: unknown): RackControl | null =>
  isRecord(input) && isTrackName(input.track) && isRackName(input.rack) && isControlMode(input.mode)
    ? { track: input.track, rack: input.rack, mode: input.mode }
    : null;

/** One control per track: the panel of a track shows a single rack. undefined = invalid in strict mode. */
function rackControls(input: unknown, strict: boolean): RackControl[] | undefined {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || (strict && input.length > MAX_CONTROLS)) return undefined;
  const parsed = input.map(rackControl);
  const valid = parsed.filter((c): c is RackControl => c !== null);
  const unique = valid.filter((c, i) => valid.findIndex((other) => other.track === c.track) === i);
  if (strict && unique.length !== input.length) return undefined;
  return unique.slice(0, MAX_CONTROLS);
}

/** Strict for a patch; a saved file only loses the field that is broken, not the musician's valid view. */
function musician(input: unknown, strict: boolean): Musician | null {
  if (!isRecord(input) || !isTrackName(input.name) || !isRecFileStem(input.name)) return null;
  const view = musicianView(input.view);
  if (!view) return null;
  const parsedCue = cue(input.cue, view);
  const hasRec = input.rec !== undefined && input.rec !== null;
  const rec = hasRec ? trackSpan(input.rec) : null;
  const { color } = input;
  const validColor = typeof color === "string" && COLOR.test(color);
  const controls = rackControls(input.controls, strict);
  if (strict && (parsedCue === undefined || (hasRec && !rec) || !(color === undefined || validColor) || !controls)) {
    return null;
  }
  return {
    name: input.name,
    ...(validColor && { color }),
    view,
    cue: parsedCue ?? null,
    ...(rec && { rec }),
    ...(controls?.length && { controls }),
  };
}

const hasUniqueNames = (musicians: readonly Musician[]) => new Set(musicians.map((m) => m.name)).size === musicians.length;

/** A saved file keeps the valid musicians, like icons: one bad entry must not lose the others. */
function parseMusicians(input: unknown): Musician[] | null {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return null;
  const valid = input.flatMap((entry) => musician(entry, false) ?? []);
  return valid.filter((m, i) => valid.findIndex((other) => other.name === m.name) === i).slice(0, MAX_MUSICIANS);
}

/** A patch is all or nothing: the list replaces the saved one, so a half-valid list must not. */
function parseMusiciansPatch(input: unknown): Musician[] | null {
  if (!Array.isArray(input) || input.length > MAX_MUSICIANS) return null;
  const parsed = input.flatMap((entry) => musician(entry, true) ?? []);
  return parsed.length === input.length && hasUniqueNames(parsed) ? parsed : null;
}

/** Files written before musicians existed: one per shortcut family, with its saved view and cue. */
function legacyMusicians(input: Record<string, unknown>): Musician[] {
  const { navFamilies, familyViews, familyCues } = input;
  if (!Array.isArray(navFamilies) || !isRecord(familyViews)) return [];
  const cues = isRecord(familyCues) ? familyCues : {};
  const legacy = navFamilies.flatMap((name) => {
    if (!isTrackName(name) || !Object.hasOwn(familyViews, name)) return [];
    const saved = Object.hasOwn(cues, name) ? cues[name] : null;
    return musician({ name, view: familyViews[name], cue: saved }, false) ?? [];
  });
  return parseMusicians(legacy) ?? [];
}

/** Validates untrusted input (phones on the LAN); null when invalid. */
export function parseDisplaySettings(input: unknown): DisplaySettings | null {
  if (!isRecord(input)) return null;
  const { startScene, hideScenesBefore } = input;
  if (!isScene(startScene) || typeof hideScenesBefore !== "boolean") return null;
  const musicians = input.musicians === undefined ? legacyMusicians(input) : parseMusicians(input.musicians);
  const showArm = input.showArm ?? true;
  const locked = input.locked ?? false;
  if (!musicians || typeof showArm !== "boolean" || typeof locked !== "boolean") return null;
  // A saved letter that no longer parses only loses the marker, not the whole file.
  const signalSend = isSendLetter(input.signalSend) ? input.signalSend : null;
  // Missing in files saved before these settings existed: the file stays valid and takes the default.
  const recLengthFiles = input.recLengthFiles === true;
  const chainMacro = isMacro(input.chainMacro) ? input.chainMacro : DEFAULT_CHAIN_MACRO;
  return { startScene, hideScenesBefore, musicians, showArm, signalSend, recLengthFiles, chainMacro, locked };
}

/** Validates an untrusted partial update; every field is optional, null when any given one is invalid. */
export function parseDisplaySettingsPatch(input: unknown): DisplaySettingsPatch | null {
  if (!isRecord(input)) return null;
  const { startScene, hideScenesBefore, showArm, signalSend, recLengthFiles, chainMacro, locked } = input;
  const valid =
    optional(startScene, isScene) &&
    optional(hideScenesBefore, isBoolean) &&
    optional(showArm, isBoolean) &&
    (signalSend === null || optional(signalSend, isSendLetter)) &&
    optional(recLengthFiles, isBoolean) &&
    optional(chainMacro, isMacro) &&
    optional(locked, isBoolean);
  if (!valid) return null;
  const musicians = input.musicians === undefined ? undefined : parseMusiciansPatch(input.musicians);
  if (musicians === null) return null;
  const fields = { startScene, hideScenesBefore, showArm, signalSend, recLengthFiles, chainMacro, locked, musicians };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as DisplaySettingsPatch;
}

/** Concert mode freezes everything but its own switch, so it can always be turned off from any phone. */
export const isUnlockOnly = (patch: DisplaySettingsPatch): boolean =>
  Object.keys(patch).every((key) => key === "locked");

export function applyDisplaySettingsPatch(settings: Settings, patch: DisplaySettingsPatch): Settings {
  return { ...settings, ...patch };
}

/** Keeps the valid entries: an emoji accepted by one Node version must not wipe the whole map on another. */
function parseTrackIcons(input: unknown): Record<string, string> | null {
  if (input === undefined) return {};
  if (!isRecord(input)) return null;
  const valid = Object.entries(input).filter(([name, icon]) => isTrackName(name) && isIcon(icon));
  return Object.fromEntries(valid.slice(0, MAX_ICONS)) as Record<string, string>;
}

const isVolumeSource = (target: string, source: unknown): source is string =>
  isTrackName(target) && isTrackName(source) && source !== target;

function parseVolumeSources(input: unknown): Record<string, string> | null {
  if (input === undefined) return {};
  if (!isRecord(input)) return null;
  const valid = Object.entries(input).filter(([target, source]) => isVolumeSource(target, source));
  return Object.fromEntries(valid.slice(0, MAX_VOLUME_SOURCES)) as Record<string, string>;
}

function parseChainLabels(input: unknown): Record<string, string> | null {
  if (input === undefined) return {};
  if (!isRecord(input)) return null;
  const valid = Object.entries(input).filter(([track, rack]) => isTrackName(track) && isRackName(rack));
  return Object.fromEntries(valid.slice(0, MAX_CHAIN_LABELS)) as Record<string, string>;
}

/** Reads the settings file; the track maps may be missing in files written before they existed. */
export function parseSettings(input: unknown): Settings | null {
  const scene = parseDisplaySettings(input);
  if (!scene || !isRecord(input)) return null;
  const trackIcons = parseTrackIcons(input.trackIcons);
  const volumeSources = parseVolumeSources(input.volumeSources);
  const chainLabels = parseChainLabels(input.chainLabels);
  const macroFlags = parseMacroFlags(input.macroFlags);
  const version = Number.isInteger(input.version) ? (input.version as number) : 1;
  return trackIcons && volumeSources && chainLabels && macroFlags
    ? { version, ...scene, trackIcons, volumeSources, chainLabels, macroFlags }
    : null;
}

const isMacro = (macro: unknown): macro is number =>
  Number.isInteger(macro) && (macro as number) >= 1 && (macro as number) <= MAX_MACRO;

const macroFlag = (input: unknown): MacroFlag | null =>
  isRecord(input) && isTrackName(input.track) && isRackName(input.rack) && isMacro(input.macro)
    ? { track: input.track, rack: input.rack, macro: input.macro }
    : null;

function parseMacroFlags(input: unknown): Record<string, MacroFlag> | null {
  if (input === undefined) return {};
  if (!isRecord(input)) return null;
  const valid = Object.entries(input).flatMap(([name, flag]) => {
    const parsed = macroFlag(flag);
    return isTrackName(name) && parsed ? [[name, parsed] as const] : [];
  });
  return Object.fromEntries(valid.slice(0, MAX_MACRO_FLAGS));
}

export interface MacroFlagUpdate {
  trackName: string;
  flag: MacroFlag | null;
}

export function parseMacroFlagUpdate(input: unknown): MacroFlagUpdate | null {
  if (!isRecord(input) || !isTrackName(input.trackName)) return null;
  const { trackName, flag } = input;
  if (flag === null) return { trackName, flag };
  const parsed = macroFlag(flag);
  return parsed ? { trackName, flag: parsed } : null;
}

const sameFlag = (a: MacroFlag | undefined, b: MacroFlag | null) =>
  a === undefined ? b === null : b !== null && a.track === b.track && a.rack === b.rack && a.macro === b.macro;

/** Null when the map is full. */
export function applyMacroFlagUpdate(settings: Settings, { trackName, flag }: MacroFlagUpdate): Settings | null {
  // Compared by content: an object is never === its copy, and a moved key would re-read the whole set for nothing.
  if (sameFlag(ownValue(settings.macroFlags, trackName), flag)) return settings;
  const { [trackName]: _previous, ...others } = settings.macroFlags;
  if (flag === null) return { ...settings, macroFlags: others };
  if (Object.keys(others).length >= MAX_MACRO_FLAGS) return null;
  return { ...settings, macroFlags: { ...others, [trackName]: flag } };
}

export interface ChainLabelUpdate {
  trackName: string;
  rack: string | null;
}

export function parseChainLabelUpdate(input: unknown): ChainLabelUpdate | null {
  if (!isRecord(input)) return null;
  const { trackName, rack } = input;
  if (!isTrackName(trackName) || !(rack === null || isRackName(rack))) return null;
  return { trackName, rack };
}

/** Null when the map is full. */
export function applyChainLabelUpdate(settings: Settings, { trackName, rack }: ChainLabelUpdate): Settings | null {
  // Unchanged keeps the key order too: a moved key would look like a new label and re-read the whole set.
  if ((ownValue(settings.chainLabels, trackName) ?? null) === rack) return settings;
  const { [trackName]: _previous, ...others } = settings.chainLabels;
  if (rack === null) return { ...settings, chainLabels: others };
  if (Object.keys(others).length >= MAX_CHAIN_LABELS) return null;
  return { ...settings, chainLabels: { ...others, [trackName]: rack } };
}

export interface VolumeSourceUpdate {
  trackName: string;
  source: string | null;
}

export function parseVolumeSourceUpdate(input: unknown): VolumeSourceUpdate | null {
  if (!isRecord(input)) return null;
  const { trackName, source } = input;
  if (!isTrackName(trackName)) return null;
  if (source !== null && !isVolumeSource(trackName, source)) return null;
  return { trackName, source };
}

/** Null when the map is full; entries are tiny and few, so unlike icons there is no pruning of renamed tracks. */
export function applyVolumeSourceUpdate(settings: Settings, { trackName, source }: VolumeSourceUpdate): Settings | null {
  const { [trackName]: _previous, ...others } = settings.volumeSources;
  if (source === null) return { ...settings, volumeSources: others };
  if (Object.keys(others).length >= MAX_VOLUME_SOURCES) return null;
  return { ...settings, volumeSources: { ...others, [trackName]: source } };
}

export interface TrackIconUpdate {
  trackNames: string[];
  icon: string | null;
}

export function parseTrackIconUpdate(input: unknown): TrackIconUpdate | null {
  if (!isRecord(input)) return null;
  const { trackNames, icon } = input;
  if (!Array.isArray(trackNames) || trackNames.length === 0 || trackNames.length > MAX_TRACKS_PER_UPDATE) return null;
  if (!trackNames.every(isTrackName)) return null;
  if (icon !== null && !isIcon(icon)) return null;
  return { trackNames: [...new Set(trackNames)], icon };
}

function withIcons(settings: Settings, entries: [string, string][]): Settings {
  return { ...settings, trackIcons: Object.fromEntries(entries) };
}

/**
 * Icons are keyed by track name, so renamed tracks leave orphans behind. They are only dropped when the cap
 * is hit and Live's current track names are known: dropping them earlier would erase the icons of another set.
 * Returns null when the update still does not fit.
 */
export function applyTrackIconUpdate(
  settings: Settings,
  { trackNames, icon }: TrackIconUpdate,
  liveNames: ReadonlySet<string> = new Set(),
): Settings | null {
  const updated = new Set(trackNames);
  const kept = Object.entries(settings.trackIcons).filter(([name]) => !updated.has(name));
  const added = icon ? trackNames.map((name): [string, string] => [name, icon]) : [];
  if (kept.length + added.length <= MAX_ICONS) return withIcons(settings, [...kept, ...added]);
  if (liveNames.size === 0) return null;
  const current = kept.filter(([name]) => liveNames.has(name));
  return current.length + added.length <= MAX_ICONS ? withIcons(settings, [...current, ...added]) : null;
}

export const settingsEqual = (a: Settings, b: Settings): boolean => JSON.stringify(a) === JSON.stringify(b);

export async function loadSettings(path: string): Promise<Settings> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[settings] cannot read ${path}, using defaults:`, (err as Error).message);
    }
    return DEFAULT_SETTINGS;
  }
  try {
    const parsed = parseSettings(JSON.parse(raw));
    if (parsed) return parsed;
  } catch {
    // falls through to the backup below
  }
  // The next save overwrites the file, so keep what was unreadable.
  const isBackedUp = await copyFile(path, `${path}.bak`).then(
    () => true,
    () => false,
  );
  console.warn(`[settings] ${path} is invalid, using defaults${isBackedUp ? ` (copy kept as ${path}.bak)` : ""}`);
  return DEFAULT_SETTINGS;
}

/** Writes beside the target then renames: a crash mid-write leaves the previous file intact. */
export async function saveSettings(path: string, settings: Settings): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(settings, null, 2)}\n`);
  await rename(temp, path);
}
