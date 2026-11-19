import { describe, expect, test } from "vitest";
import { TimingWatcher } from "./live-time.ts";
import { asSlot, buildWorld, deferred } from "./testing/fake-live.ts";

const live = () => true;

describe("TimingWatcher.watchSong", () => {
  test("reads the transport and follows later changes", async () => {
    const world = buildWorld();
    const timing = new TimingWatcher(world.ableton);
    await timing.watchSong(live);
    expect(timing.snapshot().song).toMatchObject({ isPlaying: false, quantization: "q_bar", tempo: 120 });
    world.song.emit("is_playing", true);
    world.song.emit("signature_numerator", 3);
    world.song.emit("tempo", 98.5);
    expect(timing.snapshot().song).toMatchObject({
      isPlaying: true,
      signature: { numerator: 3, denominator: 4 },
      tempo: 98.5,
    });
  });

  test("ignores events once superseded", async () => {
    const world = buildWorld();
    const timing = new TimingWatcher(world.ableton);
    let current = true;
    await timing.watchSong(() => current);
    current = false;
    world.song.emit("is_playing", true);
    expect(timing.snapshot().song.isPlaying).toBe(false);
  });
});

describe("TimingWatcher.watchPlaying", () => {
  test("follows the position of the playing clip with its loop bounds", async () => {
    const world = buildWorld();
    const timing = new TimingWatcher(world.ableton);
    await timing.watchPlaying(0, asSlot(world.slots[0]), live);
    world.firstClip.emit("playing_position", 3.5);
    expect(timing.snapshot().positions.get(0)).toMatchObject({
      position: 3.5,
      bounds: { looping: true, loopStart: 0, loopEnd: 8 },
    });
  });

  test("forgets the position of a track that stopped playing", async () => {
    const world = buildWorld();
    const timing = new TimingWatcher(world.ableton);
    await timing.watchPlaying(0, asSlot(world.slots[0]), live);
    await timing.watchPlaying(0, null, live);
    expect(timing.snapshot().positions.has(0)).toBe(false);
    expect(world.firstClip.listenerCount("playing_position")).toBe(0);
  });

  test("a stale generation cannot evict the current watcher", async () => {
    const world = buildWorld();
    const timing = new TimingWatcher(world.ableton);
    await timing.watchPlaying(0, asSlot(world.slots[0]), live);
    await timing.watchPlaying(0, null, () => false);
    expect(timing.snapshot().positions.has(0)).toBe(true);
    expect(world.firstClip.listenerCount("playing_position")).toBe(1);
  });

  test("an older call that finishes last does not replace the newer one", async () => {
    const world = buildWorld();
    const timing = new TimingWatcher(world.ableton);
    const gate = deferred<void>();
    world.slots[0].script("clip", () => gate.promise.then(() => world.firstClip));
    const older = timing.watchPlaying(0, asSlot(world.slots[0]), live);
    await timing.watchPlaying(0, null, live);
    gate.resolve();
    await older;
    expect(timing.snapshot().positions.has(0)).toBe(false);
    expect(world.firstClip.listenerCount("playing_position")).toBe(0);
  });

  test("a clip that disappears mid-read costs the progress bar, not an error", async () => {
    const world = buildWorld();
    const timing = new TimingWatcher(world.ableton);
    world.firstClip.script("looping", () => Promise.reject(new Error("clip deleted")));
    await expect(timing.watchPlaying(0, asSlot(world.slots[0]), live)).resolves.toBeUndefined();
    expect(timing.snapshot().positions.has(0)).toBe(false);
  });
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("TimingWatcher.setSongTimeNeeded", () => {
  test("does not follow the song time until a launch needs it", async () => {
    const world = buildWorld();
    const timing = new TimingWatcher(world.ableton);
    await timing.watchSong(live);
    expect(world.song.listenerCount("current_song_time")).toBe(0);
  });

  test("follows the song time while needed, starting from its current value", async () => {
    const world = buildWorld();
    const timing = new TimingWatcher(world.ableton);
    world.song.props.current_song_time = 7;
    timing.setSongTimeNeeded(true);
    await settle();
    expect(timing.snapshot().song.songTime).toBe(7);
    world.song.emit("current_song_time", 12.5);
    expect(timing.snapshot().song.songTime).toBe(12.5);
    timing.setSongTimeNeeded(false);
    await settle();
    expect(world.song.listenerCount("current_song_time")).toBe(0);
  });

  test("never follows it while nobody is watching", async () => {
    const world = buildWorld();
    const timing = new TimingWatcher(world.ableton);
    await timing.setActive(false, async () => undefined);
    timing.setSongTimeNeeded(true);
    await settle();
    expect(world.song.listenerCount("current_song_time")).toBe(0);
  });

  test("an attach still running at reset is detached rather than leaked", async () => {
    const world = buildWorld();
    const timing = new TimingWatcher(world.ableton);
    timing.setSongTimeNeeded(true);
    timing.reset();
    await settle();
    expect(world.song.listenerCount("current_song_time")).toBe(0);
  });
});

describe("TimingWatcher.setActive", () => {
  test("drops clip positions when the last viewer leaves and follows again on return", async () => {
    const world = buildWorld();
    const timing = new TimingWatcher(world.ableton);
    await timing.watchPlaying(0, asSlot(world.slots[0]), live);
    await timing.setActive(false, async () => undefined);
    expect(world.firstClip.listenerCount("playing_position")).toBe(0);
    expect(timing.snapshot().positions.size).toBe(0);
    await timing.setActive(true, () => timing.watchPlaying(0, asSlot(world.slots[0]), live));
    expect(world.firstClip.listenerCount("playing_position")).toBe(1);
  });

  test("a clip launched while nobody watches is not followed", async () => {
    const world = buildWorld();
    const timing = new TimingWatcher(world.ableton);
    await timing.setActive(false, async () => undefined);
    await timing.watchPlaying(0, asSlot(world.slots[0]), live);
    expect(world.firstClip.listenerCount("playing_position")).toBe(0);
  });
});

describe("TimingWatcher.reset", () => {
  test("clears positions and the transport, and returns the removers to detach", async () => {
    const world = buildWorld();
    const timing = new TimingWatcher(world.ableton);
    await timing.watchSong(live);
    await timing.watchPlaying(0, asSlot(world.slots[0]), live);
    const removers = timing.reset();
    expect(removers.length).toBeGreaterThan(0);
    expect(timing.snapshot().positions.size).toBe(0);
    expect(timing.snapshot().song.songTime).toBe(0);
  });
});
