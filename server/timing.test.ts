import { describe, expect, test } from "vitest";
import type { ClipModel, SessionModel, TrackModel } from "./session-state.ts";
import {
  type ClipBounds,
  type SongTiming,
  beatsUntilLaunch,
  clipBar,
  clipProgress,
  formatCountdown,
  launchGridBeats,
  recordedBars,
  takeBars,
  transportPosition,
  trackTimes,
} from "./timing.ts";

const FOUR_FOUR = { numerator: 4, denominator: 4 };
const SIX_EIGHT = { numerator: 6, denominator: 8 };

const loop: ClipBounds = { looping: true, loopStart: 0, loopEnd: 8, startMarker: 0, endMarker: 8 };

describe("launchGridBeats", () => {
  test("uses the song quantization when the clip follows the global setting", () => {
    expect(launchGridBeats("q_global", "q_bar", FOUR_FOUR)).toBe(4);
  });

  test("uses the clip's own quantization over the song's", () => {
    expect(launchGridBeats("q_2_bars", "q_bar", FOUR_FOUR)).toBe(8);
  });

  test("maps the clip spelling and the song spelling of the same grid to the same value", () => {
    expect(launchGridBeats("q_eighth", "q_bar", FOUR_FOUR)).toBe(0.5);
    expect(launchGridBeats(undefined, "q_eight", FOUR_FOUR)).toBe(0.5);
    expect(launchGridBeats("q_sixteenth", "q_bar", FOUR_FOUR)).toBe(0.25);
    expect(launchGridBeats(undefined, "q_sixtenth", FOUR_FOUR)).toBe(0.25);
  });

  test("returns null when launches are not quantized", () => {
    expect(launchGridBeats("q_none", "q_bar", FOUR_FOUR)).toBeNull();
    expect(launchGridBeats("q_global", "q_no_q", FOUR_FOUR)).toBeNull();
  });

  test("sizes bars from the time signature", () => {
    expect(launchGridBeats(undefined, "q_bar", SIX_EIGHT)).toBe(3);
  });
});

describe("beatsUntilLaunch", () => {
  test("counts the beats left to the next grid line", () => {
    expect(beatsUntilLaunch(5, 4)).toBe(3);
    expect(beatsUntilLaunch(7.5, 4)).toBe(0.5);
  });

  test("returns 0 exactly on a grid line", () => {
    expect(beatsUntilLaunch(8, 4)).toBe(0);
  });

  test("stays within the grid for negative song times, as during a count-in", () => {
    expect(beatsUntilLaunch(-1, 4)).toBe(1);
  });
});

describe("formatCountdown", () => {
  test("counts down in beats within the last bar", () => {
    expect(formatCountdown(3, FOUR_FOUR)).toBe("3");
    expect(formatCountdown(0.4, FOUR_FOUR)).toBe("1");
  });

  test("counts down in bars beyond one bar", () => {
    expect(formatCountdown(6, FOUR_FOUR)).toBe("2 B");
  });
});

describe("clipProgress", () => {
  test("measures progress inside the loop for a looping clip", () => {
    expect(clipProgress(2, { ...loop, loopStart: 0, loopEnd: 8 })).toBe(0.25);
  });

  test("measures progress between markers for a one-shot clip", () => {
    expect(clipProgress(3, { ...loop, looping: false, startMarker: 1, endMarker: 5 })).toBe(0.5);
  });

  test("rounds progress so an unchanged frame can be skipped", () => {
    expect(clipProgress(1 / 3, { ...loop, loopEnd: 1 })).toBe(0.335);
  });

  test("clamps positions outside the range and survives an empty range", () => {
    expect(clipProgress(-1, loop)).toBe(0);
    expect(clipProgress(20, loop)).toBe(1);
    expect(clipProgress(1, { ...loop, loopStart: 4, loopEnd: 4 })).toBe(0);
  });
});

describe("transportPosition", () => {
  test("starts at 1.1.1", () => {
    expect(transportPosition(0, FOUR_FOUR)).toEqual({ bar: 1, beat: 1, sub: 1 });
  });

  test("reads bar, beat and sixteenth like Live", () => {
    expect(transportPosition(66.25, FOUR_FOUR)).toEqual({ bar: 17, beat: 3, sub: 2 });
  });

  test("moves to the next bar exactly on the bar line", () => {
    expect(transportPosition(4, FOUR_FOUR)).toEqual({ bar: 2, beat: 1, sub: 1 });
  });

  test("counts beats in the unit of the denominator", () => {
    expect(transportPosition(4, { numerator: 6, denominator: 8 })).toEqual({ bar: 2, beat: 3, sub: 1 });
  });

  test("counts the sixteenths of an eighth-note beat, two per beat", () => {
    expect(transportPosition(0.25, { numerator: 6, denominator: 8 })).toEqual({ bar: 1, beat: 1, sub: 2 });
    expect(transportPosition(0.5, { numerator: 6, denominator: 8 })).toEqual({ bar: 1, beat: 2, sub: 1 });
  });

  test("clamps a negative song time", () => {
    expect(transportPosition(-2, FOUR_FOUR)).toEqual({ bar: 1, beat: 1, sub: 1 });
  });
});

describe("clipBar", () => {
  test("counts bars from the loop start, starting at 1", () => {
    expect(clipBar(0, { ...loop, loopStart: 0, loopEnd: 16 }, FOUR_FOUR)).toBe(1);
    expect(clipBar(9, { ...loop, loopStart: 4, loopEnd: 20 }, FOUR_FOUR)).toBe(2);
  });

  test("counts from the start marker when the clip does not loop", () => {
    expect(clipBar(7, { ...loop, looping: false, loopStart: 0, startMarker: 3, endMarker: 15 }, FOUR_FOUR)).toBe(2);
  });

  test("follows the bar length of the signature", () => {
    expect(clipBar(6, { ...loop, loopStart: 0, loopEnd: 12 }, { numerator: 6, denominator: 8 })).toBe(3);
  });

  test("stays on the first bar while the position is before the loop", () => {
    expect(clipBar(1, { ...loop, loopStart: 4, loopEnd: 20 }, FOUR_FOUR)).toBe(1);
  });
});

describe("recordedBars", () => {
  test("returns the bar being recorded, starting at 1", () => {
    expect(recordedBars(0, FOUR_FOUR)).toBe(1);
    expect(recordedBars(9, FOUR_FOUR)).toBe(3);
  });
});

describe("trackTimes", () => {
  const clip = (patch: Partial<ClipModel> = {}): ClipModel => ({
    name: "c",
    isRecording: false,
    launchQuantization: "q_global",
    ...patch,
  });
  const track = (patch: Partial<TrackModel>): TrackModel => ({
    id: "t",
    name: "t",
    color: "#000000",
    armed: false,
    muted: false,
    volume: 0.85,
    solo: false,
    playingSlot: -2,
    firedSlot: -1,
    clips: [clip(), clip(), null],
    ...patch,
  });
  const song: SongTiming = { isPlaying: true, songTime: 5, quantization: "q_bar", signature: FOUR_FOUR, tempo: 120 };
  const model = (tracks: TrackModel[]): SessionModel => ({ tracks, scenes: [], selectedScene: -1, returns: [] });

  test("reports progress for the playing clip and a countdown for the fired one", () => {
    const times = trackTimes(
      model([track({ playingSlot: 0, firedSlot: 1 })]),
      song,
      new Map([[0, { position: 4, bounds: loop }]]),
    );
    expect(times).toEqual({ 0: { progress: 0.5, positionBars: 2, countdown: "3" } });
  });

  test("reports recorded bars instead of progress while recording", () => {
    const times = trackTimes(
      model([track({ playingSlot: 0, clips: [clip({ isRecording: true })] })]),
      song,
      new Map([[0, { position: 9, bounds: loop }]]),
    );
    expect(times).toEqual({ 0: { recordedBars: 3 } });
  });

  test("shows no countdown for a fixed-length take, whose slot stays fired the whole time", () => {
    const take = track({ playingSlot: 0, firedSlot: 0, clips: [clip({ isRecording: true })] });
    const times = trackTimes(model([take]), song, new Map([[0, { position: 9, bounds: loop }]]));
    expect(times).toEqual({ 0: { recordedBars: 3 } });
  });

  test("keeps the last bar count of a take while its position is missing", () => {
    const take = track({ playingSlot: 0, clips: [clip({ isRecording: true })] });
    const previous = takeBars(model([take]), { 0: { recordedBars: 2 } });
    expect(trackTimes(model([take]), song, new Map(), previous)).toEqual({ 0: { recordedBars: 2 } });
    const stopped = track({ playingSlot: 0 });
    expect(trackTimes(model([stopped]), song, new Map(), previous)).toEqual({});
  });

  test("never hands a bar count to another take, on another slot or another track", () => {
    const take = track({ playingSlot: 0, clips: [clip({ isRecording: true }), clip({ isRecording: true })] });
    const previous = takeBars(model([take]), { 0: { recordedBars: 2 } });
    expect(trackTimes(model([{ ...take, playingSlot: 1 }]), song, new Map(), previous)).toEqual({});
    expect(trackTimes(model([{ ...take, id: "other" }]), song, new Map(), previous)).toEqual({});
  });

  test("counts down to the end of a take once its stop is requested", () => {
    const take = track({ playingSlot: 0, firedSlot: 0, clips: [clip({ isRecording: true, isTriggered: true })] });
    const times = trackTimes(model([take]), song, new Map([[0, { position: 9, bounds: loop }]]));
    expect(times).toEqual({ 0: { recordedBars: 3, countdown: "3" } });
  });

  test("counts down on a fired empty slot using the song quantization", () => {
    const times = trackTimes(model([track({ armed: true, firedSlot: 2 })]), song, new Map());
    expect(times).toEqual({ 0: { countdown: "3" } });
  });

  test("shows no countdown when the song time sits exactly on the launch line", () => {
    const times = trackTimes(model([track({ firedSlot: 1 })]), { ...song, songTime: 8 }, new Map());
    expect(times).toEqual({});
  });

  test("shows no countdown while the transport is stopped", () => {
    const times = trackTimes(model([track({ firedSlot: 1 })]), { ...song, isPlaying: false }, new Map());
    expect(times).toEqual({});
  });

  test("ignores the stop-pending sentinel and idle tracks", () => {
    const times = trackTimes(model([track({ firedSlot: -2 }), track({})]), song, new Map());
    expect(times).toEqual({});
  });
});
