import type { LaunchQuantization } from "ableton-js/ns/clip";
import type { Quantization } from "ableton-js/ns/song";
import type { TrackTime } from "./protocol.ts";
import type { SessionModel, TrackModel } from "./session-state.ts";

export interface Signature {
  numerator: number;
  denominator: number;
}

export interface SongTiming {
  isPlaying: boolean;
  songTime: number;
  quantization: Quantization;
  signature: Signature;
  tempo: number;
}

export interface ClipBounds {
  looping: boolean;
  loopStart: number;
  loopEnd: number;
  startMarker: number;
  endMarker: number;
}

export interface ClipPosition {
  position: number;
  bounds: ClipBounds;
}

const ON_BOUNDARY = 1e-6;

export const beatsPerBar = ({ numerator, denominator }: Signature): number => (numerator * 4) / denominator;

// Live spells the same grids differently on the song ("q_eight", "q_sixtenth") and on clips ("q_eighth", "q_sixteenth").
const GRID_BEATS: Record<string, number | ((bar: number) => number)> = {
  q_8_bars: (bar) => 8 * bar,
  q_4_bars: (bar) => 4 * bar,
  q_2_bars: (bar) => 2 * bar,
  q_bar: (bar) => bar,
  q_half: 2,
  q_half_triplet: 4 / 3,
  q_quarter: 1,
  q_quarter_triplet: 2 / 3,
  q_eight: 0.5,
  q_eighth: 0.5,
  q_eight_triplet: 1 / 3,
  q_eighth_triplet: 1 / 3,
  q_sixtenth: 0.25,
  q_sixteenth: 0.25,
  q_sixtenth_triplet: 1 / 6,
  q_sixteenth_triplet: 1 / 6,
  q_thirtytwoth: 0.125,
  q_thirtysecond: 0.125,
};

/** Launch grid in beats, or null when launches are not quantized. */
export function launchGridBeats(
  clipQuantization: LaunchQuantization | undefined,
  songQuantization: Quantization,
  signature: Signature,
): number | null {
  const name = !clipQuantization || clipQuantization === "q_global" ? songQuantization : clipQuantization;
  const grid = GRID_BEATS[name];
  if (grid === undefined) return null;
  return typeof grid === "number" ? grid : grid(beatsPerBar(signature));
}

export function beatsUntilLaunch(songTime: number, gridBeats: number): number {
  const phase = ((songTime % gridBeats) + gridBeats) % gridBeats;
  const remaining = gridBeats - phase;
  return remaining >= gridBeats - ON_BOUNDARY ? 0 : remaining;
}

export function formatCountdown(beats: number, signature: Signature): string {
  const bar = beatsPerBar(signature);
  return beats > bar ? `${Math.ceil(beats / bar)} B` : `${Math.ceil(beats)}`;
}

// Coarser than a pixel on any cell, and lets the 100 ms tick skip resending an unchanged frame.
const PROGRESS_STEPS = 200;

export function clipProgress(position: number, bounds: ClipBounds): number {
  const [start, end] = bounds.looping ? [bounds.loopStart, bounds.loopEnd] : [bounds.startMarker, bounds.endMarker];
  const span = end - start;
  if (span <= 0) return 0;
  const progress = Math.min(1, Math.max(0, (position - start) / span));
  return Math.round(progress * PROGRESS_STEPS) / PROGRESS_STEPS;
}

const SIXTEENTHS_PER_WHOLE = 16;

export interface TransportPosition {
  bar: number;
  beat: number;
  sub: number;
}

/** Live's "bar.beat.sixteenth", 1-based: beats count in the unit of the signature's denominator. */
export function transportPosition(songTime: number, { numerator, denominator }: Signature): TransportPosition {
  const beatLength = 4 / denominator;
  const time = Math.max(0, songTime);
  const inBar = time % (numerator * beatLength);
  return {
    bar: Math.floor(time / (numerator * beatLength)) + 1,
    beat: Math.floor(inBar / beatLength) + 1,
    sub: Math.floor(((inBar % beatLength) / beatLength) * (SIXTEENTHS_PER_WHOLE / denominator)) + 1,
  };
}

/** The 1-based bar of the clip the position is in, counted from the loop (or the start marker when not looping). */
export function clipBar(position: number, bounds: ClipBounds, signature: Signature): number {
  const start = bounds.looping ? bounds.loopStart : bounds.startMarker;
  return Math.max(0, Math.floor((position - start) / beatsPerBar(signature))) + 1;
}

export function recordedBars(position: number, signature: Signature): number {
  return Math.floor(Math.max(0, position) / beatsPerBar(signature)) + 1;
}

/** Bar counts of the takes running in a frame, keyed by track id and slot so they never leak to another take. */
export type TakeBars = ReadonlyMap<string, number>;

const takeKey = (track: TrackModel): string => `${track.id}:${track.playingSlot}`;

export function takeBars(model: SessionModel, times: Readonly<Record<number, TrackTime>>): TakeBars {
  return new Map(
    model.tracks.flatMap((track, i) => {
      const bars = times[i]?.recordedBars;
      return bars ? [[takeKey(track), bars] as const] : [];
    }),
  );
}

/**
 * `previous` comes from the last frame: a take's position goes missing for up to a bar each time its watcher
 * restarts, and the bar count would blink off meanwhile.
 */
export function trackTimes(
  model: SessionModel,
  song: SongTiming,
  positions: ReadonlyMap<number, ClipPosition>,
  previous: TakeBars = new Map(),
): Record<number, TrackTime> {
  const times: Record<number, TrackTime> = {};
  model.tracks.forEach((track, i) => {
    const time: TrackTime = {};
    const playing = positions.get(i);
    const playingClip = track.playingSlot >= 0 ? track.clips[track.playingSlot] : null;
    if (playing && playingClip) {
      if (playingClip.isRecording) time.recordedBars = recordedBars(playing.position, song.signature);
      else {
        time.progress = clipProgress(playing.position, playing.bounds);
        time.positionBars = clipBar(playing.position, playing.bounds, song.signature);
      }
    } else if (playingClip?.isRecording && previous.has(takeKey(track))) {
      time.recordedBars = previous.get(takeKey(track));
    }
    const firedClip = track.firedSlot >= 0 ? track.clips[track.firedSlot] : null;
    // A fixed-length take keeps its slot fired the whole time: only a requested stop lands on the grid.
    const isRunningTake = firedClip?.isRecording && !firedClip.isTriggered;
    if (song.isPlaying && track.firedSlot >= 0 && !isRunningTake) {
      const grid = launchGridBeats(firedClip?.launchQuantization, song.quantization, song.signature);
      const remaining = grid ? beatsUntilLaunch(song.songTime, grid) : 0;
      // 0 also covers the transport-start race where is_playing lands before the new song time.
      if (remaining > 0) time.countdown = formatCountdown(remaining, song.signature);
    }
    if (Object.keys(time).length > 0) times[i] = time;
  });
  return times;
}
