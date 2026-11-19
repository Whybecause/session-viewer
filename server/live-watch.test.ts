import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Generation } from "./live-generation.ts";
import { TimingWatcher } from "./live-time.ts";
import { BOUNDS_SETTLE_MS, NOTES_POLL_MS, NO_NOTES_MS, type WatchContext, watchSession } from "./live-watch.ts";
import { EMPTY_SESSION, type SessionModel } from "./session-state.ts";
import { FakeObject, type FakeWorld, buildWorld, deferred, makeClip } from "./testing/fake-live.ts";

function harness(
  world: FakeWorld,
  cueSends: WatchContext["cueSends"] = (names) => names.map(() => null),
  signalSend: number | null = null,
  racks: WatchContext["racks"] = () => [],
) {
  let currentId = 0;
  let model: SessionModel = EMPTY_SESSION;
  let commits = 0;
  let reloads = 0;
  const ctx: WatchContext = {
    ableton: world.ableton,
    timing: new TimingWatcher(world.ableton),
    model: () => model,
    scheduleReload: () => {
      reloads += 1;
    },
    failLoad: () => () => undefined,
    cueSends,
    signalSend: () => signalSend,
    racks,
    chainMacro: () => 16,
    controls: { reset: () => undefined, setPanel: () => undefined, touch: () => undefined },
  };
  const generation = new Generation(++currentId, () => currentId, (update) => {
    model = update(model);
    commits += 1;
  });
  return {
    ctx,
    generation,
    model: () => model,
    commits: () => commits,
    reloads: () => reloads,
    supersede: () => {
      currentId += 1;
    },
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Longer than one stop poll (200 ms), so a poll that should not happen would have had its chance.
const PAST_A_POLL_MS = 300;

const eventually = async (check: () => void) => {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      return check();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  check();
};

describe("watchSession", () => {
  test("publishes the tracks, clips and scenes of the set", async () => {
    const h = harness(buildWorld());
    await watchSession(h.generation, h.ctx);
    const [track] = h.model().tracks;
    expect(track).toMatchObject({ name: "bass 1", color: "#112233", volume: 0.85, solo: false, playingSlot: -2 });
    expect(track.clips.map((c) => c?.name ?? null)).toEqual(["Riff", null, null]);
    expect(h.model().scenes.map((s) => s.name)).toEqual(["A", "B", "C"]);
  });

  test("keeps following track properties, rounding the fader", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    world.track.emit("playing_slot_index", 0);
    world.track.emit("solo", true);
    world.volume.emit("value", 0.123456);
    expect(h.model().tracks[0]).toMatchObject({ playingSlot: 0, solo: true, volume: 0.123 });
  });

  test("picks up a clip created later in an empty slot", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    world.slots[1].props.clip = makeClip("New");
    world.slots[1].emit("has_clip", true);
    await eventually(() => expect(h.model().tracks[0].clips[1]?.name).toBe("New"));
  });

  test("shows a recording as soon as it starts and renames follow", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    world.firstClip.emit("is_recording", true);
    world.firstClip.emit("name", "Take 2");
    expect(h.model().tracks[0].clips[0]).toMatchObject({ isRecording: true, name: "Take 2" });
  });

  test("leaves no ghost when a clip is created then deleted before the first read returns", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    const ghost = makeClip("Ghost");
    const slow = deferred<void>();
    world.slots[1].script(
      "clip",
      () => slow.promise.then(() => ghost),
      () => Promise.resolve(null),
    );
    world.slots[1].emit("has_clip", true);
    world.slots[1].emit("has_clip", false);
    await eventually(() => expect(h.model().tracks[0].clips[1]).toBeNull());
    slow.resolve();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(h.model().tracks[0].clips[1]).toBeNull();
    expect(ghost.listenerCount("name")).toBe(0);
  });

  test("stops committing once a newer generation took over", async () => {
    const world = buildWorld();
    const h = harness(world);
    const gate = deferred<void>();
    world.song.script("tracks", () => gate.promise.then(() => [world.track]));
    const loading = watchSession(h.generation, h.ctx);
    h.supersede();
    gate.resolve();
    await loading;
    expect(h.commits()).toBe(0);
  });

  test("asks for a reload when tracks change, but not from a superseded generation", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    world.song.emit("tracks", []);
    expect(h.reloads()).toBe(1);
    h.supersede();
    world.song.emit("scenes", []);
    expect(h.reloads()).toBe(1);
  });

  test("reads the launch quantization of a clip when it is launched", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0].clips[0]?.launchQuantization).toBeUndefined();
    world.firstClip.props.launch_quantization = "q_half";
    world.track.emit("fired_slot_index", 0);
    await eventually(() => expect(h.model().tracks[0].clips[0]?.launchQuantization).toBe("q_half"));
  });

  test("reads the launch quantization of a clip already launched at load", async () => {
    const world = buildWorld();
    const h = harness(world);
    world.track.props.fired_slot_index = 0;
    world.firstClip.props.launch_quantization = "q_2_bars";
    await watchSession(h.generation, h.ctx);
    await eventually(() => expect(h.model().tracks[0].clips[0]?.launchQuantization).toBe("q_2_bars"));
  });

  test("only reads the recording state of the playing clip at load", async () => {
    const world = buildWorld();
    const h = harness(world);
    world.firstClip.script("is_recording", () => Promise.reject(new Error("should not be read")));
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0].clips[0]?.isRecording).toBe(false);
  });

  test("follows mute", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0].muted).toBe(false);
    world.track.emit("mute", true);
    expect(h.model().tracks[0].muted).toBe(true);
  });

  test("follows the Overdub switch of the track's Overdub device", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0].overdub).toBe(false);
    world.overdub.emit("value", 1);
    expect(h.model().tracks[0].overdub).toBe(true);
    world.overdub.emit("value", 0);
    expect(h.model().tracks[0].overdub).toBe(false);
  });

  test("leaves overdub unset on a track without the Overdub device", async () => {
    const world = buildWorld();
    world.track.props.devices = [];
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0].overdub).toBeUndefined();
  });

  test("asks for a reload when the Overdub switch disappears from a track", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    world.track.emit("devices", []);
    await eventually(() => expect(h.reloads()).toBe(1));
  });

  test("ignores a device change that leaves the Overdub switch alone", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    world.track.emit("devices", [...(world.track.props.devices as unknown[]), new FakeObject()]);
    await wait(PAST_A_POLL_MS);
    expect(h.reloads()).toBe(0);
  });

  test("still loads the set when the devices of a track cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const world = buildWorld();
    world.track.script("devices", () => Promise.reject(new Error("boom")));
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0]).toMatchObject({ name: "bass 1" });
    expect(h.model().tracks[0].overdub).toBeUndefined();
    warn.mockRestore();
  });

  test("reads the Overdub switch again once its listener is attached", async () => {
    const world = buildWorld();
    world.overdub.script("value", () => Promise.resolve(1));
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0].overdub).toBe(true);
  });

  test("follows the scene selected in Live", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    expect(h.model().selectedScene).toBe(0);
    world.view.emit("selected_scene", world.scenes[2]);
    expect(h.model().selectedScene).toBe(2);
  });

  test("publishes the return track names and follows their renames", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    expect(h.model().returns).toEqual(["A-Reverb"]);
    world.returnTrack.emit("name", "A-Delay");
    expect(h.model().returns).toEqual(["A-Delay"]);
  });

  test("reads clip lengths at load and again once a recording ends", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0].clips[0]?.lengthBars).toBe(2);
    world.firstClip.emit("is_recording", true);
    world.firstClip.props.length = 16;
    world.firstClip.emit("is_recording", false);
    await eventually(() => expect(h.model().tracks[0].clips[0]?.lengthBars).toBe(4));
  });

  test("hands every subscription back so the next generation can detach them", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    expect(world.track.listenerCount("name")).toBe(1);
    expect(world.firstClip.listenerCount("is_recording")).toBe(1);
    await Promise.all(h.generation.allRemovers().map((remove) => remove()));
    expect(world.track.listenerCount("name")).toBe(0);
    expect(world.firstClip.listenerCount("is_recording")).toBe(0);
    expect(world.volume.listenerCount("value")).toBe(0);
    expect(world.overdub.listenerCount("value")).toBe(0);
    expect(world.track.listenerCount("devices")).toBe(0);
  });
});

describe("stop requested during a take", () => {
  test("flags the clip once Live reports it triggered", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    world.firstClip.props.is_triggered = true;
    world.firstClip.emit("is_recording", true);
    await eventually(() => expect(h.model().tracks[0].clips[0]?.isTriggered).toBe(true));
    h.supersede();
  });

  test("stops polling, and clears the flag, once the take ends", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    world.firstClip.emit("is_recording", true);
    world.firstClip.emit("is_recording", false);
    world.firstClip.props.is_triggered = true;
    await wait(PAST_A_POLL_MS);
    expect(h.model().tracks[0].clips[0]?.isTriggered).toBe(false);
  });

  test("stops polling once a newer generation took over", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    world.firstClip.emit("is_recording", true);
    await wait(10);
    h.supersede();
    const commits = h.commits();
    world.firstClip.props.is_triggered = true;
    await wait(PAST_A_POLL_MS);
    expect(h.commits()).toBe(commits);
  });

  test("warns once for a run of failed reads, not at every poll", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fail = () => Promise.reject(new Error("clip gone"));
    world.firstClip.script("is_triggered", fail, fail, fail);
    try {
      world.firstClip.emit("is_recording", true);
      await wait(2 * PAST_A_POLL_MS);
      expect(warn.mock.calls.filter(([message]) => String(message).includes("is_triggered"))).toHaveLength(1);
    } finally {
      h.supersede();
      warn.mockRestore();
    }
  });
});

describe("take with no notes", () => {
  let h: ReturnType<typeof harness>;
  const isEmpty = () => h.model().tracks[0].clips[0]?.isEmpty;

  async function recording(audio = false) {
    const world = buildWorld();
    world.firstClip.raw.is_audio_clip = audio;
    h = harness(world);
    await watchSession(h.generation, h.ctx);
    world.firstClip.emit("is_recording", true);
    return world;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    h.supersede();
    vi.useRealTimers();
  });

  test("flags a MIDI take still empty a moment after it started, and clears it at the first note", async () => {
    const world = await recording();
    await vi.advanceTimersByTimeAsync(NO_NOTES_MS - 1);
    expect(isEmpty()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(isEmpty()).toBe(true);
    world.firstClip.props.notes = [{ pitch: 60 }];
    await vi.advanceTimersByTimeAsync(NOTES_POLL_MS);
    expect(isEmpty()).toBe(false);
  });

  test("reads the notes once more when the take ends", async () => {
    const world = await recording();
    world.firstClip.emit("is_recording", false);
    await vi.advanceTimersByTimeAsync(0);
    expect(isEmpty()).toBe(true);
  });

  test("skips the final read once a note was seen", async () => {
    const world = await recording();
    world.firstClip.props.notes = [{ pitch: 60 }];
    await vi.advanceTimersByTimeAsync(NO_NOTES_MS);
    world.firstClip.props.notes = [];
    world.firstClip.emit("is_recording", false);
    await vi.advanceTimersByTimeAsync(0);
    expect(isEmpty()).toBe(false);
  });

  test("leaves audio clips alone", async () => {
    await recording(true);
    await vi.advanceTimersByTimeAsync(NO_NOTES_MS);
    expect(isEmpty()).toBeUndefined();
  });
});

describe("family cue", () => {
  const firstSend = (names: readonly string[]) => names.map((name) => (name === "bass 1" ? 0 : null));

  test("shows the track as cued while its send sits at full level", async () => {
    const world = buildWorld();
    world.send.props.value = 1;
    const h = harness(world, firstSend);
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0].cue).toBe(true);
    world.send.emit("value", 0.5);
    expect(h.model().tracks[0].cue).toBe(false);
  });

  test("leaves tracks outside any cue span on solo", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0].cue).toBeUndefined();
    expect(world.send.listenerCount("value")).toBe(0);
  });

  test("reads the set again when a rename moves a track out of a cue span", async () => {
    const world = buildWorld();
    const h = harness(world, firstSend);
    await watchSession(h.generation, h.ctx);
    world.track.emit("name", "bass 2");
    expect(h.reloads()).toBe(1);
  });

  test("does not reload for a rename that changes no cue span", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    world.track.emit("name", "bass 2");
    expect(h.reloads()).toBe(0);
  });
});

describe("signal send", () => {
  const firstSend = (names: readonly string[]) => names.map((name) => (name === "bass 1" ? 0 : null));

  test("marks the track while its send is above 0", async () => {
    const world = buildWorld();
    const h = harness(world, undefined, 0);
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0].sendOn).toBe(false);
    world.send.emit("value", 0.01);
    expect(h.model().tracks[0].sendOn).toBe(true);
    world.send.emit("value", 0);
    expect(h.model().tracks[0].sendOn).toBe(false);
  });

  test("leaves sendOn unset, and listens to nothing, while no signal send is chosen", async () => {
    const world = buildWorld();
    const h = harness(world);
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0].sendOn).toBeUndefined();
    expect(world.send.listenerCount("value")).toBe(0);
  });

  test("a cue on the same send keeps working, with one listener for both", async () => {
    const world = buildWorld();
    world.send.props.value = 1;
    const h = harness(world, firstSend, 0);
    await watchSession(h.generation, h.ctx);
    expect(h.model().tracks[0]).toMatchObject({ cue: true, sendOn: true });
    expect(world.send.listenerCount("value")).toBe(1);
    world.send.emit("value", 0.5);
    expect(h.model().tracks[0]).toMatchObject({ cue: false, sendOn: true });
  });
});

describe("macro flag names", () => {
  const flagging = (track: string) => () => [
    { track: "FX", rack: "SFX", label: false, mode: null, musicians: [], flags: [{ track, macro: 1 }] },
  ];

  test("reads the set again when a rename moves a flagged track out of its name", async () => {
    const world = buildWorld();
    const h = harness(world, undefined, null, flagging("bass 1"));
    await watchSession(h.generation, h.ctx);
    world.track.emit("name", "bass 2");
    expect(h.reloads()).toBe(1);
  });

  test("does not reload for a rename that touches no flagged track", async () => {
    const world = buildWorld();
    const h = harness(world, undefined, null, flagging("ghost"));
    await watchSession(h.generation, h.ctx);
    world.track.emit("name", "bass 2");
    expect(h.reloads()).toBe(0);
  });
});

describe("clip bounds", () => {
  let h: ReturnType<typeof harness>;

  async function watched() {
    const world = buildWorld();
    h = harness(world);
    await watchSession(h.generation, h.ctx);
    let lengthReads = 0;
    world.firstClip.script("length", ...Array.from({ length: 5 }, () => () => {
      lengthReads += 1;
      return Promise.resolve(world.firstClip.props.length);
    }));
    return { world, lengthReads: () => lengthReads };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    h.supersede();
    vi.useRealTimers();
  });

  test("reads the length again once an edit of the bounds settles", async () => {
    const { world, lengthReads } = await watched();
    world.firstClip.props.length = 16;
    world.firstClip.emit("loop_end", 12);
    world.firstClip.emit("loop_end", 16);
    await vi.advanceTimersByTimeAsync(BOUNDS_SETTLE_MS - 1);
    expect(h.model().tracks[0].clips[0]?.lengthBars).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.model().tracks[0].clips[0]?.lengthBars).toBe(4);
    expect(lengthReads()).toBe(1);
  });

  test("leaves the length to the end of a take", async () => {
    const { world, lengthReads } = await watched();
    world.firstClip.emit("is_recording", true);
    world.firstClip.emit("loop_end", 16);
    await vi.advanceTimersByTimeAsync(BOUNDS_SETTLE_MS);
    expect(lengthReads()).toBe(0);
  });
});
