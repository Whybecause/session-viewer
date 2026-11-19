import type { LaunchQuantization } from "ableton-js/ns/clip";
import { parseChainClip } from "./clip-chain.ts";
import type { ActiveChain, ClipChain, RecEnd, SessionView, SlotState, SlotView, TrackUpdate, TrackView } from "./protocol.ts";

// Live sends negative slot indexes as sentinels; -2 on fired_slot_index means a track Stop is pending.
const STOP_PENDING = -2;

export interface ClipModel {
  name: string;
  isRecording: boolean;
  /** Watched only while recording: true once a stop is requested. */
  isTriggered?: boolean;
  /** Read when the clip is launched; until then the song quantization applies. */
  launchQuantization?: LaunchQuantization;
  lengthBars?: number;
  /** MIDI clips recorded while watched: no note yet, checked during the take and at its end. */
  isEmpty?: boolean;
}

export interface TrackModel {
  id: string;
  name: string;
  color: string;
  armed: boolean;
  muted: boolean;
  volume: number;
  solo: boolean;
  /** Set only on tracks a family cue covers: their cue send is at full level. */
  cue?: boolean;
  /** Set only on tracks that have the Overdub device. */
  overdub?: boolean;
  /** Set only on tracks with a macro flag: that macro is at 127. */
  fx?: boolean;
  /** Set only while a signal send is chosen: the track's send to it is above 0. */
  sendOn?: boolean;
  /** Set only on tracks with racks; one array per load, so the shallow diff sees it unchanged. */
  racks?: string[];
  /** Set with racks: the chain names of each, first rack of a name winning, as DEV("…") does. */
  rackChains?: Record<string, string[]>;
  /** Set only on tracks with a chain label. */
  chain?: ActiveChain | null;
  playingSlot: number;
  firedSlot: number;
  clips: (ClipModel | null)[];
}

export interface SceneModel {
  id: string;
  name: string;
}

export interface SessionModel {
  tracks: TrackModel[];
  scenes: SceneModel[];
  selectedScene: number;
  /** Return track names as Live gives them ("H-FX GEN PRE"), in send order. */
  returns: string[];
}

export const EMPTY_SESSION: SessionModel = { tracks: [], scenes: [], selectedScene: -1, returns: [] };

export function slotState(track: TrackModel, index: number): SlotState {
  const clip = track.clips[index] ?? null;
  if (clip?.isRecording) return "recording";
  if (track.firedSlot === index) return clip || !track.armed ? "triggered" : "record_pending";
  if (track.playingSlot === index && clip) return "playing";
  return clip ? "stopped" : "empty";
}

/**
 * What Live shows while a take runs: the clip turns triggered once a stop is requested, while a fixed-length take
 * keeps its slot fired from start to end.
 */
export function recordingEnd(track: TrackModel, index: number): RecEnd | undefined {
  const clip = track.clips[index];
  if (!clip?.isRecording) return undefined;
  if (clip.isTriggered) return "stopping";
  return track.firedSlot === index ? "auto" : undefined;
}

function clipChain(track: TrackModel, clipName: string): ClipChain | undefined {
  const command = parseChainClip(clipName);
  if (!command) return undefined;
  const chains = command.rack === null ? undefined : track.rackChains?.[command.rack];
  return { number: command.number, name: chains?.[command.number - 1] ?? null };
}

function toSlotView(track: TrackModel, index: number): SlotView | null {
  const clip = track.clips[index] ?? null;
  const state = slotState(track, index);
  if (state === "empty") return null;
  const recEnd = recordingEnd(track, index);
  const chain = clip ? clipChain(track, clip.name) : undefined;
  return {
    state,
    clipName: clip?.name ?? null,
    ...(chain && { chain }),
    lengthBars: clip?.lengthBars,
    ...(recEnd && { recEnd }),
    ...(clip?.isEmpty && { isEmpty: true as const }),
  };
}

export function toTrackView(track: TrackModel): TrackView {
  return {
    id: track.id,
    name: track.name,
    color: track.color,
    volume: track.volume,
    solo: track.solo,
    armed: track.armed,
    muted: track.muted,
    stopPending: track.firedSlot === STOP_PENDING,
    ...(track.cue !== undefined && { cue: track.cue }),
    ...(track.overdub !== undefined && { overdub: track.overdub }),
    ...(track.fx !== undefined && { fx: track.fx }),
    ...(track.sendOn !== undefined && { sendOn: track.sendOn }),
    ...(track.racks && { racks: track.racks }),
    ...(track.chain !== undefined && { chain: track.chain }),
    slots: track.clips.map((_, i) => toSlotView(track, i)),
  };
}

/** Undefined and missing fields count as equal: clip models are built with and without optional keys. */
function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof T>;
  return [...keys].every((key) => a[key] === b[key]);
}

export function toTrackUpdate(index: number, previous: TrackModel, track: TrackModel): TrackUpdate {
  const volumeOnly = shallowEqual({ ...previous, volume: track.volume }, track);
  return volumeOnly ? { index, volume: track.volume } : { index, track: toTrackView(track) };
}

/** Track name → name of the track whose fader and mute it shows. */
export type VolumeSources = Readonly<Record<string, string>>;

const indexByName = (model: SessionModel): Map<string, number> => {
  const indexes = new Map<string, number>();
  model.tracks.forEach((t, i) => indexes.has(t.name) || indexes.set(t.name, i));
  return indexes;
};

/** A muted source mutes the track too: Live cuts its sends along with it, so the cue and the return go quiet. */
export function withMixSource(track: TrackModel, source: TrackModel | undefined): TrackModel {
  return source ? { ...track, volume: source.volume, muted: track.muted || source.muted } : track;
}

function resolveTracks(model: SessionModel, sources: VolumeSources): TrackModel[] {
  if (Object.keys(sources).length === 0) return model.tracks;
  const indexes = indexByName(model);
  return model.tracks.map((track) => {
    const source = Object.hasOwn(sources, track.name) ? indexes.get(sources[track.name]) : undefined;
    return withMixSource(track, source === undefined ? undefined : model.tracks[source]);
  });
}

export function toSessionView(model: SessionModel, sources: VolumeSources = {}): SessionView {
  return {
    tracks: resolveTracks(model, sources).map(toTrackView),
    scenes: model.scenes,
    selectedScene: model.selectedScene,
    returns: model.returns,
  };
}

/** Updates for the changed tracks, plus those showing the fader of a changed track: a bus move then costs one more small entry. */
export function trackUpdates(
  previous: SessionModel,
  model: SessionModel,
  changed: number[],
  sources: VolumeSources,
): TrackUpdate[] {
  if (Object.keys(sources).length === 0) {
    return changed.map((index) => toTrackUpdate(index, previous.tracks[index], model.tracks[index]));
  }
  const indexes = indexByName(model);
  const touched = new Set(changed);
  for (const [name, source] of Object.entries(sources)) {
    const target = indexes.get(name);
    const sourceIndex = indexes.get(source);
    if (target !== undefined && sourceIndex !== undefined && touched.has(sourceIndex)) touched.add(target);
  }
  const before = resolveTracks(previous, sources);
  const after = resolveTracks(model, sources);
  return [...touched]
    .sort((a, b) => a - b)
    .filter((index) => !shallowEqual(before[index], after[index]))
    .map((index) => toTrackUpdate(index, before[index], after[index]));
}

export function updateTrack(
  model: SessionModel,
  trackIndex: number,
  patch: Partial<Omit<TrackModel, "id" | "clips">>,
): SessionModel {
  const current = model.tracks[trackIndex];
  // Keeping the same object on a no-op is what lets changedTracks skip it.
  const isNoop =
    current && (Object.keys(patch) as (keyof typeof patch)[]).every((key) => current[key] === patch[key]);
  if (!current || isNoop) return model;
  return {
    ...model,
    tracks: model.tracks.map((t, i) => (i === trackIndex ? { ...t, ...patch } : t)),
  };
}

export function setClip(
  model: SessionModel,
  trackIndex: number,
  slotIndex: number,
  clip: ClipModel | null,
): SessionModel {
  const track = model.tracks[trackIndex];
  const current = track?.clips[slotIndex] ?? null;
  // Keeping the same object on a no-op is what lets changedTracks skip it.
  if (!track || current === clip || (current && clip && shallowEqual(current, clip))) return model;
  return {
    ...model,
    tracks: model.tracks.map((t, i) =>
      i === trackIndex ? { ...t, clips: t.clips.map((c, j) => (j === slotIndex ? clip : c)) } : t,
    ),
  };
}

export function updateClip(
  model: SessionModel,
  trackIndex: number,
  slotIndex: number,
  patch: Partial<ClipModel>,
): SessionModel {
  const current = model.tracks[trackIndex]?.clips[slotIndex];
  return current ? setClip(model, trackIndex, slotIndex, { ...current, ...patch }) : model;
}

export function selectScene(model: SessionModel, selectedScene: number): SessionModel {
  return model.selectedScene === selectedScene ? model : { ...model, selectedScene };
}

export function renameScene(model: SessionModel, sceneIndex: number, name: string): SessionModel {
  return {
    ...model,
    scenes: model.scenes.map((s, i) => (i === sceneIndex ? { ...s, name } : s)),
  };
}

export function renameReturn(model: SessionModel, returnIndex: number, name: string): SessionModel {
  return { ...model, returns: model.returns.map((r, i) => (i === returnIndex ? name : r)) };
}

/**
 * Indexes of tracks whose object changed, relying on updates never mutating untouched tracks.
 * "structure" means the full state must be resent.
 */
export function changedTracks(prev: SessionModel, next: SessionModel): number[] | "structure" {
  // A scene selection is rare enough that resending the full state beats a message type of its own.
  if (
    prev.scenes !== next.scenes ||
    prev.selectedScene !== next.selectedScene ||
    prev.returns !== next.returns ||
    prev.tracks.length !== next.tracks.length
  )
    return "structure";
  const changed = next.tracks.flatMap((t, i) => (t === prev.tracks[i] ? [] : [i]));
  return changed.length > next.tracks.length / 2 ? "structure" : changed;
}
