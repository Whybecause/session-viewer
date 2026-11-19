import type { Ableton } from "ableton-js";
import type { Clip } from "ableton-js/ns/clip";
import type { ClipSlot } from "ableton-js/ns/clip-slot";
import type { AnyDevice, Device } from "ableton-js/ns/device";
import type { DeviceParameter } from "ableton-js/ns/device-parameter";
import type { MixerDevice } from "ableton-js/ns/mixer-device";
import type { RackDevice } from "ableton-js/ns/rack-device";
import type { Scene } from "ableton-js/ns/scene";
import type { Track } from "ableton-js/ns/track";
import { Color } from "ableton-js/util/color";
import { warnLive } from "./live-log.ts";
import { findRacks } from "./live-racks.ts";
import type { ClipModel, TrackModel } from "./session-state.ts";

// A fader move emits dozens of near-identical values; 3 decimals is finer than any screen shows.
export const roundVolume = (value: number): number => Math.round(value * 1000) / 1000;

export const hex = (color: number | Color): string => (color instanceof Color ? color : new Color(color)).hex;

// Live gives a clip being recorded this placeholder length (2 years of seconds); the real one exists once the take ends.
const RECORDING_PLACEHOLDER_LENGTH = 63_072_000;

/** Length in bars, to the quarter bar; undefined when Live counts it in seconds (unwarped audio) or the clip is recording. */
export async function readClipLength(clip: Clip): Promise<number | undefined> {
  const [length, numerator, denominator, warping] = await Promise.all([
    clip.get("length"),
    clip.get("signature_numerator"),
    clip.get("signature_denominator"),
    clip.raw.is_audio_clip ? clip.get("warping") : Promise.resolve(true),
  ]);
  if (!warping || numerator <= 0 || denominator <= 0 || length >= RECORDING_PLACEHOLDER_LENGTH) return undefined;
  return Math.round((length / ((numerator * 4) / denominator)) * 4) / 4;
}

const WHOLE_CLIP_BEATS = 1e9;
const ALL_PITCHES = 128;

export const countNotes = async (clip: Clip): Promise<number> =>
  (await clip.getNotes(0, 0, WHOLE_CLIP_BEATS, ALL_PITCHES)).length;

export interface TrackData {
  model: TrackModel;
  slots: ClipSlot[];
  clips: (Clip | null)[];
  armable: boolean;
  mixer: MixerDevice;
  volume: DeviceParameter;
  overdub: DeviceParameter | null;
  racks: RackDevice[];
}

// The Max for Live device's own name and the name of its switch; only a device at the top of the chain is looked at.
const OVERDUB_DEVICE = "Overdub";
const OVERDUB_PARAM = "Overdub";

export const warnRead = (label: string) => (err: unknown) => warnLive(`${label} not read`, err);

async function findOverdub(devices: readonly AnyDevice[]): Promise<DeviceParameter | null> {
  const device = devices.find((d) => d.raw.name === OVERDUB_DEVICE);
  if (!device) return null;
  // Same union problem as chains: every kind of device lists its parameters the same way.
  return (await (device as Device).get("parameters")).find((p) => p.raw.name === OVERDUB_PARAM) ?? null;
}

export interface TrackDevices {
  overdub: DeviceParameter | null;
  racks: RackDevice[];
}

/** A failed read only costs the highlight and the rack panels: it must not fail the whole set load. */
export async function readDevices(track: Track): Promise<TrackDevices> {
  try {
    const devices = await track.get("devices");
    const [overdub, racks] = await Promise.all([findOverdub(devices), findRacks(devices)]);
    return { overdub, racks };
  } catch (err) {
    warnRead(`devices ${track.raw.name}`)(err);
    return { overdub: null, racks: [] };
  }
}

/** Ids of what the watchers hold, to tell a device edit that changes it from one that does not. */
export const devicesKey = ({ overdub, racks }: TrackDevices): string =>
  JSON.stringify([overdub?.raw.id ?? null, racks.map((r) => [r.raw.id, r.raw.name])]);

export interface SongSnapshot {
  tracks: Track[];
  scenes: Scene[];
  trackData: TrackData[];
  selectedScene: number;
  returnTracks: Track[];
}

/** The name comes with the clip. Only a playing clip can be recording, so other clips skip that read. */
async function readClipState(clip: Clip, canBeRecording: boolean): Promise<ClipModel> {
  const isRecording = canBeRecording ? await clip.get("is_recording") : false;
  return { name: clip.raw.name, isRecording };
}

/** The launch quantization is read when the clip is launched, the only time the countdown needs it. */
export async function readClip(clip: Clip, canBeRecording: boolean): Promise<ClipModel> {
  const [state, lengthBars] = await Promise.all([readClipState(clip, canBeRecording), readClipLength(clip)]);
  return { ...state, lengthBars };
}

async function readRackChains(racks: readonly RackDevice[]): Promise<Record<string, string[]>> {
  const entries = await Promise.all(
    racks.map(async (rack) => {
      try {
        return [rack.raw.name, (await rack.get("chains")).map((c) => c.raw.name)] as const;
      } catch (err) {
        warnRead(`chains ${rack.raw.name}`)(err);
        return [rack.raw.name, []] as const;
      }
    }),
  );
  return Object.fromEntries(entries.reverse());
}

export async function readTrack(track: Track): Promise<TrackData> {
  const [armable, mixer, playingSlot, firedSlot, slots] = await Promise.all([
    track.get("can_be_armed"),
    track.get("mixer_device"),
    track.get("playing_slot_index"),
    track.get("fired_slot_index"),
    track.get("clip_slots"),
  ]);
  const [armed, volume, clips, { overdub, racks }] = await Promise.all([
    armable ? track.get("arm") : Promise.resolve(false),
    mixer.get("volume"),
    Promise.all(slots.map(async (s) => (s.raw.has_clip ? s.get("clip") : null))),
    readDevices(track),
  ]);
  // The length is left to watchClip, which must read it again after attaching its listeners anyway.
  const clipModels = await Promise.all(clips.map((c, si) => (c ? readClipState(c, si === playingSlot) : null)));
  const rackChains = await readRackChains(racks);
  const { id, name, color, solo, mute } = track.raw;
  const model: TrackModel = {
    id,
    name,
    color: hex(color),
    armed,
    muted: mute,
    volume: roundVolume(volume.raw.value),
    solo,
    ...(overdub && { overdub: overdub.raw.value > 0 }),
    ...(racks.length > 0 && { racks: racks.map((r) => r.raw.name), rackChains }),
    playingSlot,
    firedSlot,
    clips: clipModels,
  };
  return { model, slots, clips, armable, mixer, volume, overdub, racks };
}

export const sceneIndex = (scenes: readonly { raw: { id: string } }[], selected: Scene | null): number =>
  selected ? scenes.findIndex((s) => s.raw.id === selected.raw.id) : -1;

export async function readSong(ableton: Ableton): Promise<SongSnapshot> {
  const [tracks, scenes, selected, returnTracks] = await Promise.all([
    ableton.song.get("tracks"),
    ableton.song.get("scenes"),
    ableton.song.view.get("selected_scene"),
    ableton.song.get("return_tracks"),
  ]);
  const trackData = await Promise.all(tracks.map(readTrack));
  return { tracks, scenes, trackData, selectedScene: sceneIndex(scenes, selected), returnTracks };
}
