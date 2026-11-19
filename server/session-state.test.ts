import { describe, expect, test } from "vitest";
import {
  renameReturn,
  type ClipModel,
  type SessionModel,
  type TrackModel,
  changedTracks,
  recordingEnd,
  renameScene,
  selectScene,
  setClip,
  slotState,
  toSessionView,
  toTrackUpdate,
  trackUpdates,
  withMixSource,
  updateClip,
  updateTrack,
} from "./session-state.ts";

const clip = (patch: Partial<ClipModel> = {}): ClipModel => ({
  name: "Bass",
  isRecording: false,
  launchQuantization: "q_global",
  ...patch,
});

const track = (patch: Partial<TrackModel> = {}): TrackModel => ({
  id: "t1",
  name: "Midi",
  color: "#00ff00",
  armed: false,
  muted: false,
  volume: 0.85,
  solo: false,
  playingSlot: -2,
  firedSlot: -1,
  clips: [clip(), null, null],
  ...patch,
});

const session = (t: TrackModel = track()): SessionModel => ({
  tracks: [t],
  scenes: [
    { id: "s1", name: "Intro" },
    { id: "s2", name: "Verse" },
    { id: "s3", name: "Chorus" },
  ],
  selectedScene: -1,
  returns: [],
});

describe("slotState", () => {
  test("returns empty for a slot without clip", () => {
    expect(slotState(track(), 1)).toBe("empty");
  });

  test("returns stopped for a clip that is not playing", () => {
    expect(slotState(track(), 0)).toBe("stopped");
  });

  test("returns playing for the clip at playing_slot_index", () => {
    expect(slotState(track({ playingSlot: 0 }), 0)).toBe("playing");
  });

  test("returns triggered for the clip at fired_slot_index, even while another plays", () => {
    const t = track({ clips: [clip(), clip()], playingSlot: 0, firedSlot: 1 });
    expect(slotState(t, 1)).toBe("triggered");
    expect(slotState(t, 0)).toBe("playing");
  });

  test("returns record_pending for a fired empty slot on an armed track", () => {
    expect(slotState(track({ armed: true, firedSlot: 1 }), 1)).toBe("record_pending");
  });

  test("returns recording over playing and triggered", () => {
    const t = track({ clips: [clip({ isRecording: true })], playingSlot: 0, firedSlot: 0 });
    expect(slotState(t, 0)).toBe("recording");
  });

  test("never treats negative sentinels as slot indexes", () => {
    const t = track({ playingSlot: -2, firedSlot: -2 });
    expect(t.clips.map((_, i) => slotState(t, i))).toEqual(["stopped", "empty", "empty"]);
  });
});

describe("toSessionView", () => {
  test("flags a pending track stop when fired_slot_index is -2", () => {
    const view = toSessionView(session(track({ playingSlot: 0, firedSlot: -2 })));
    expect(view.tracks[0].stopPending).toBe(true);
    expect(view.tracks[0].slots[0]?.state).toBe("playing");
  });

  test("exposes the clip name per slot", () => {
    const view = toSessionView(session());
    expect(view.tracks[0].slots[0]).toEqual({ state: "stopped", clipName: "Bass" });
    expect(view.tracks[0].slots[1]).toBeNull();
  });

  test("resolves a chain recall clip to the name of its chain", () => {
    const recall = clip({ name: '[CHAIN_2] "Midi"/DEV("Rack") B2 P8 2' });
    const unknown = clip({ name: '[CHAIN_9] "Midi"/DEV("Rack") B2 P8 9' });
    const t = track({ clips: [recall, unknown], rackChains: { Rack: ["a", "b"] } });
    const slots = toSessionView({ tracks: [t], scenes: [], selectedScene: -1, returns: [] }).tracks[0].slots;
    expect(slots[0]?.chain).toEqual({ number: 2, name: "b" });
    expect(slots[1]?.chain).toEqual({ number: 9, name: null });
  });
});

describe("updates", () => {
  test("updateTrack keeps the same model when the patch changes nothing", () => {
    const original = session();
    expect(updateTrack(original, 0, { playingSlot: -2, solo: false })).toBe(original);
  });

  test("updateTrack returns a new model and leaves the original untouched", () => {
    const original = session();
    const next = updateTrack(original, 0, { playingSlot: 0 });
    expect(next.tracks[0].playingSlot).toBe(0);
    expect(original.tracks[0].playingSlot).toBe(-2);
  });

  test("setClip adds a clip recorded into an empty slot", () => {
    const next = setClip(session(), 0, 2, clip({ name: "Take", isRecording: true }));
    expect(toSessionView(next).tracks[0].slots[2]?.state).toBe("recording");
  });

  test("setClip with null removes a deleted clip", () => {
    const next = setClip(session(), 0, 0, null);
    expect(toSessionView(next).tracks[0].slots[0]).toBeNull();
  });

  test("updateClip renames an existing clip", () => {
    const next = updateClip(session(), 0, 0, { name: "Lead" });
    expect(next.tracks[0].clips[0]?.name).toBe("Lead");
  });

  test("updateClip ignores an empty slot", () => {
    const original = session();
    expect(updateClip(original, 0, 1, { name: "Ghost" })).toBe(original);
  });

  test("renameScene renames only the target scene", () => {
    const next = renameScene(session(), 1, "Bridge");
    expect(next.scenes.map((s) => s.name)).toEqual(["Intro", "Bridge", "Chorus"]);
  });
});

describe("toSessionView", () => {
  test("shows what a musician checks before recording", () => {
    const view = toSessionView(session(track({ armed: true, muted: true })));
    expect(view.tracks[0]).toMatchObject({ armed: true, muted: true });
  });

  test("gives the length of a clip in bars", () => {
    const view = toSessionView(session(track({ clips: [clip({ lengthBars: 8 }), null, null] })));
    expect(view.tracks[0].slots[0]?.lengthBars).toBe(8);
  });
});

describe("recordingEnd", () => {
  const take = (patch: Partial<ClipModel>, firedSlot = -1) =>
    track({ armed: true, playingSlot: 0, firedSlot, clips: [clip({ isRecording: true, ...patch })] });

  test("is undefined for a free take", () => {
    expect(recordingEnd(take({}), 0)).toBeUndefined();
  });

  test("is auto while the slot of the take stays fired", () => {
    expect(recordingEnd(take({}, 0), 0)).toBe("auto");
  });

  test("is stopping once the clip is triggered, fixed length or not", () => {
    expect(recordingEnd(take({ isTriggered: true }), 0)).toBe("stopping");
    expect(recordingEnd(take({ isTriggered: true }, 0), 0)).toBe("stopping");
  });

  test("is undefined when nothing records", () => {
    expect(recordingEnd(track({ firedSlot: 0 }), 0)).toBeUndefined();
  });

  test("reaches the slot view only while recording", () => {
    const [free, auto] = [take({}), take({}, 0)].map((t) => toSessionView(session(t)).tracks[0].slots[0]);
    expect(free).not.toHaveProperty("recEnd");
    expect(auto?.recEnd).toBe("auto");
  });
});

test("a clip with no note reaches the slot view as empty, one with notes without the key", () => {
  const view = (isEmpty: boolean) => toSessionView(session(track({ clips: [clip({ isEmpty })] }))).tracks[0].slots[0];
  expect(view(true)?.isEmpty).toBe(true);
  expect(view(false)).not.toHaveProperty("isEmpty");
});

describe("selectScene", () => {
  test("keeps the same model when the selection does not change", () => {
    const model = selectScene(session(), 1);
    expect(selectScene(model, 1)).toBe(model);
    expect(model.selectedScene).toBe(1);
  });
});

describe("changedTracks", () => {
  test("resends everything when the selected scene changes", () => {
    const model = session();
    expect(changedTracks(model, selectScene(model, 1))).toBe("structure");
  });

  test("resends everything when a return track is renamed", () => {
    const model = { ...session(), returns: ["A-Reverb"] };
    expect(changedTracks(model, renameReturn(model, 0, "A-Delay"))).toBe("structure");
  });

  const big = (): SessionModel => ({
    tracks: [track({ id: "a" }), track({ id: "b" }), track({ id: "c" })],
    scenes: session().scenes,
    selectedScene: -1,
    returns: [],
  });

  test("returns only the indexes of tracks that were replaced", () => {
    const prev = big();
    expect(changedTracks(prev, updateTrack(prev, 1, { solo: true }))).toEqual([1]);
  });

  test("returns an empty list when nothing changed", () => {
    const prev = big();
    expect(changedTracks(prev, { ...prev })).toEqual([]);
  });

  test("asks for the full state when scenes change", () => {
    const prev = big();
    expect(changedTracks(prev, renameScene(prev, 0, "Outro"))).toBe("structure");
  });

  test("asks for the full state when the track count changes", () => {
    const prev = big();
    expect(changedTracks(prev, { ...prev, tracks: prev.tracks.slice(1) })).toBe("structure");
  });

  test("asks for the full state when most tracks changed, as after a reload", () => {
    const prev = big();
    expect(changedTracks(prev, { ...prev, tracks: prev.tracks.map((t) => ({ ...t })) })).toBe("structure");
  });
});

describe("setClip no-op", () => {
  test("keeps the same model when the clip is unchanged, missing optional keys included", () => {
    const model = session(track({ clips: [clip({ lengthBars: undefined }), null, null] }));
    const { lengthBars: _, ...withoutLength } = clip();
    expect(setClip(model, 0, 0, withoutLength)).toBe(model);
    expect(updateClip(model, 0, 0, { name: "Bass" })).toBe(model);
    expect(setClip(model, 0, 1, null)).toBe(model);
  });

  test("still replaces a clip that changed", () => {
    const model = session();
    expect(setClip(model, 0, 0, clip({ name: "Lead" })).tracks[0].clips[0]?.name).toBe("Lead");
  });
});

describe("toTrackUpdate", () => {
  test("sends the volume alone when nothing else changed", () => {
    const before = track();
    expect(toTrackUpdate(3, before, { ...before, volume: 0.5 })).toEqual({ index: 3, volume: 0.5 });
  });

  test("sends the whole track when anything else changed", () => {
    const before = track();
    const update = toTrackUpdate(0, before, { ...before, volume: 0.5, muted: true });
    expect(update).toMatchObject({ index: 0, track: { volume: 0.5, muted: true } });
  });
});

describe("overdub in the track view", () => {
  test("is sent only for tracks that have the Overdub device", () => {
    const [on, off, without] = toSessionView({
      ...session(),
      tracks: [track({ overdub: true }), track({ overdub: false }), track()],
    }).tracks;
    expect(on.overdub).toBe(true);
    expect(off.overdub).toBe(false);
    expect("overdub" in without).toBe(false);
  });

  test("sends the whole track when the switch flips, not a volume update", () => {
    const before = track({ overdub: false });
    const update = toTrackUpdate(0, before, { ...before, overdub: true });
    expect(update).toMatchObject({ index: 0, track: { overdub: true } });
  });
});

describe("volume sources", () => {
  const synth = track({ id: "a", name: "CAM 1", volume: 0.85 });
  const bus = track({ id: "b", name: "cam 1 bus", volume: 0.5 });
  const other = track({ id: "c", name: "bass", volume: 0.3 });
  const sources = { "CAM 1": "cam 1 bus" };
  const world = (...tracks: TrackModel[]): SessionModel => ({ ...session(), tracks });

  test("shows the source's fader, and mutes when either track is muted", () => {
    expect(withMixSource(synth, bus)).toMatchObject({ volume: 0.5, muted: false });
    expect(withMixSource(synth, { ...bus, muted: true }).muted).toBe(true);
    expect(withMixSource({ ...synth, muted: true }, bus).muted).toBe(true);
    expect(withMixSource(synth, undefined)).toBe(synth);
  });

  test("leaves the session view alone without sources, and resolves it with one", () => {
    const model = world(synth, bus);
    expect(toSessionView(model).tracks[0].volume).toBe(0.85);
    expect(toSessionView(model, sources).tracks[0].volume).toBe(0.5);
  });

  test("falls back to the track's own fader when its source is not in the set", () => {
    expect(toSessionView(world(synth, other), sources).tracks[0].volume).toBe(0.85);
  });

  test("a bus fader move updates the bus and the track showing it, volume only", () => {
    const before = world(synth, bus, other);
    const after = { ...before, tracks: [synth, { ...bus, volume: 0.7 }, other] };
    expect(trackUpdates(before, after, [1], sources)).toEqual([
      { index: 0, volume: 0.7 },
      { index: 1, volume: 0.7 },
    ]);
  });

  test("a bus mute resends the whole track showing it", () => {
    const before = world(synth, bus);
    const after = { ...before, tracks: [synth, { ...bus, muted: true }] };
    const [first] = trackUpdates(before, after, [1], sources);
    expect(first).toMatchObject({ index: 0, track: { muted: true } });
  });

  test("skips a track whose shown state did not change", () => {
    const before = world(synth, bus);
    const after = { ...before, tracks: [synth, { ...bus, solo: true }] };
    expect(trackUpdates(before, after, [1], sources).map((u) => u.index)).toEqual([1]);
  });

  test("without sources, updates exactly the changed tracks", () => {
    const before = world(synth, bus);
    const after = { ...before, tracks: [synth, { ...bus, volume: 0.7 }] };
    expect(trackUpdates(before, after, [1], {})).toEqual([{ index: 1, volume: 0.7 }]);
  });
});

describe("effect and send markers in the track view", () => {
  test("are sent only on tracks where they were set", () => {
    const [flagged, plain] = toSessionView({
      ...session(),
      tracks: [track({ fx: false, sendOn: true }), track()],
    }).tracks;
    expect(flagged).toMatchObject({ fx: false, sendOn: true });
    expect("fx" in plain).toBe(false);
    expect("sendOn" in plain).toBe(false);
  });

  test("send the whole track when a marker flips", () => {
    const before = track({ fx: false });
    expect(toTrackUpdate(0, before, { ...before, fx: true })).toMatchObject({ index: 0, track: { fx: true } });
  });
});
