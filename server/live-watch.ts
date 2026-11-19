import type { Ableton } from "ableton-js";
import type { Clip } from "ableton-js/ns/clip";
import type { ClipSlot } from "ableton-js/ns/clip-slot";
import type { DeviceParameter } from "ableton-js/ns/device-parameter";
import type { MixerDevice } from "ableton-js/ns/mixer-device";
import type { Scene } from "ableton-js/ns/scene";
import type { Track } from "ableton-js/ns/track";
import { CUE_LEVEL } from "./cue.ts";
import { Generation, type Remover, keep } from "./live-generation.ts";
import {
  type SongSnapshot,
  type TrackData,
  devicesKey,
  countNotes,
  readClip,
  readClipLength,
  readDevices,
  readSong,
  roundVolume,
  sceneIndex,
  warnRead,
} from "./live-read.ts";
import type { TimingWatcher } from "./live-time.ts";
import type { ControlsSink, RackTarget } from "./rack-controls.ts";
import { watchRacks } from "./rack-watch.ts";
import {
  type ClipModel,
  type SessionModel,
  type TrackModel,
  renameReturn,
  renameScene,
  selectScene,
  setClip,
  updateClip,
  updateTrack,
} from "./session-state.ts";

// Fast enough for a "fin dans" countdown to start on time, cheap with one or two takes at once.
const STOP_POLL_MS = 200;

export interface WatchContext {
  ableton: Ableton;
  timing: TimingWatcher;
  model(): SessionModel;
  scheduleReload(delayMs?: number): void;
  failLoad(g: Generation): (err: unknown) => void;
  /** The send each track's cue follows (see cueSendIndexes), read at each load. */
  cueSends(trackNames: readonly string[]): (number | null)[];
  /** Index of the send whose level above 0 marks a track, null when none is chosen. */
  signalSend(): number | null;
  /** Racks to follow for chain labels and control panels, read at each load. */
  racks(): RackTarget[];
  /** Rack macro, 1-16, that selects the chain, read at each load. */
  chainMacro(): number;
  controls: ControlsSink;
}

/** Restarts the position watcher when the clip in the playing slot appears, changes or stops recording. */
function refreshTiming(g: Generation, ctx: WatchContext, ti: number, si: number, slot: ClipSlot): void {
  if (g.isLive() && ctx.model().tracks[ti]?.playingSlot === si) void ctx.timing.watchPlaying(ti, slot, g.isLive);
}

// Live's input meters froze for minutes on an armed track that kept receiving (measured): only the take's own
// notes are trusted, so the app can say a take got nothing, not where the notes went.
export const NO_NOTES_MS = 2000;
export const NOTES_POLL_MS = 1000;

/** Polls while the take is empty; at its end, reads once more unless a note was already seen. */
function watchNotes(clip: Clip, key: string, isLatest: () => boolean, patch: (p: Partial<ClipModel>) => void) {
  let timer: NodeJS.Timeout | undefined;
  let hasSeenNotes = false;
  const read = (onRead: (has: boolean) => void) =>
    void countNotes(clip).then((count) => onRead(count > 0), warnRead(`notes ${key}`));
  const show = (has: boolean) => {
    hasSeenNotes = has;
    patch({ isEmpty: !has });
  };
  const poll = (delayMs: number) => {
    timer = setTimeout(() => {
      if (!isLatest()) return;
      const current = timer;
      read((has) => {
        if (timer !== current) return;
        show(has);
        // Stops at the first note: an empty take costs one tiny read a second, a full one none.
        if (!has) poll(NOTES_POLL_MS);
      });
    }, delayMs);
  };
  const stop = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const onRecording = (isRecording: boolean) => {
    stop();
    if (isRecording) {
      hasSeenNotes = false;
      poll(NO_NOTES_MS);
    } else if (!hasSeenNotes) read(show);
  };
  return { onRecording, stop };
}

// Dragging a loop brace in Live sends a burst of bound changes: one read once it settles.
export const BOUNDS_SETTLE_MS = 150;
// length is not observable in Live: these are, and it follows from them.
const LENGTH_BOUNDS = ["loop_start", "loop_end", "start_marker", "end_marker"] as const;

/** Calls onSettled once a burst of bound changes is over. */
function watchBounds(onSettled: () => void) {
  let timer: NodeJS.Timeout | undefined;
  const onChange = () => {
    clearTimeout(timer);
    timer = setTimeout(onSettled, BOUNDS_SETTLE_MS);
  };
  return { props: LENGTH_BOUNDS, onChange, stop: () => clearTimeout(timer) };
}

interface WatchClipOptions {
  /** The clip appeared or changed after load, so a position watcher on its slot may be missing or stale. */
  fromLive?: boolean;
  /** Already read with the set: saves asking Live for it again. */
  clip?: Clip;
}

export async function watchClip(
  g: Generation,
  ctx: WatchContext,
  ti: number,
  si: number,
  slot: ClipSlot,
  { fromLive = false, clip: known }: WatchClipOptions = {},
): Promise<void> {
  const key = `${ti}:${si}`;
  const { isLatest, bucket, previous } = g.claimBucket(key);
  await Promise.all(previous.map((remove) => remove().catch(() => undefined)));

  const clip = known ?? (await slot.get("clip"));
  if (!isLatest()) return;
  if (!clip) return g.commit((m) => setClip(m, ti, si, null));

  // Listeners first: addListener sends no initial value, so a read done before attaching can miss a recording start.
  const patchClip = (patch: Partial<ClipModel>) => {
    if (isLatest()) g.commit((m) => updateClip(m, ti, si, patch));
  };
  const on = (attach: Promise<Remover>, prop: string) => keep(isLatest, attach, `clip ${key} ${prop}`, bucket);

  // A requested stop shows only in the clip's is_triggered, which Live cannot listen to and no other clip or slot
  // event reports (measured): it is polled, and only while this clip records.
  let stopPoll: NodeJS.Timeout | undefined;
  // One read at a time: a stalled Live would otherwise pile up reads that land out of order.
  let isReading = false;
  // Warned once per run of failures: a clip deleted mid-take fails every poll until has_clip replaces this watcher.
  let isFailing = false;
  const readTriggered = () => {
    if (!isLatest()) return unwatchStop();
    if (isReading) return;
    isReading = true;
    clip
      .get("is_triggered")
      .then(
        (isTriggered) => {
          isFailing = false;
          // A read answered after the take ended would flag a clip that no longer records.
          if (stopPoll) patchClip({ isTriggered });
        },
        (err: unknown) => {
          if (!isFailing) warnRead(`is_triggered ${key}`)(err);
          isFailing = true;
        },
      )
      .finally(() => (isReading = false));
  };
  const unwatchStop = () => {
    clearInterval(stopPoll);
    stopPoll = undefined;
  };
  const watchStop = () => {
    if (stopPoll || !isLatest()) return;
    stopPoll = setInterval(readTriggered, STOP_POLL_MS);
    readTriggered();
  };
  bucket.push(async () => unwatchStop());
  const readLength = () =>
    void readClipLength(clip).then((lengthBars) => patchClip({ lengthBars }), warnRead(`length ${key}`));
  const bounds = watchBounds(() => {
    // A take's bounds keep moving until it ends, and is_recording reads them again then.
    if (!isLatest() || ctx.model().tracks[ti]?.clips[si]?.isRecording) return;
    refreshTiming(g, ctx, ti, si, slot);
    readLength();
  });
  bucket.push(async () => bounds.stop());
  const notes = clip.raw.is_audio_clip ? null : watchNotes(clip, key, isLatest, patchClip);
  if (notes) bucket.push(async () => notes.stop());

  await Promise.all([
    on(clip.addListener("name", (name) => patchClip({ name })), "name"),
    ...bounds.props.map((prop) => on(clip.addListener(prop, bounds.onChange), prop)),
    on(
      clip.addListener("is_recording", (isRecording) => {
        patchClip({ isRecording, isTriggered: false });
        if (isRecording) watchStop();
        else unwatchStop();
        notes?.onRecording(isRecording);
        // Loop bounds and length read while recording are not the final ones.
        if (!isRecording && isLatest()) {
          refreshTiming(g, ctx, ti, si, slot);
          readLength();
        }
      }),
      "is_recording",
    ),
  ]);
  const clipModel = await readClip(clip, fromLive || ctx.model().tracks[ti]?.playingSlot === si);
  if (!isLatest()) return;
  g.commit((m) => setClip(m, ti, si, clipModel));
  // readClip knows nothing of a stop requested meanwhile and has just cleared it: read it again now.
  if (clipModel.isRecording) {
    watchStop();
    readTriggered();
    notes?.onRecording(true);
  }
  if (fromLive) refreshTiming(g, ctx, ti, si, slot);
}

/** Quantization is not observable: it is read again at each launch, when it matters. */
async function readLaunchInfo(g: Generation, ti: number, si: number, slot: ClipSlot): Promise<void> {
  try {
    const clip = await slot.get("clip");
    if (!clip || !g.isLive()) return;
    const [launchQuantization, lengthBars] = await Promise.all([clip.get("launch_quantization"), readClipLength(clip)]);
    g.commit((m) => updateClip(m, ti, si, { launchQuantization, lengthBars }));
  } catch (err) {
    warnRead(`launch info ${ti}:${si}`)(err);
  }
}

interface TrackHandlers {
  onPlaying(playingSlot: number): void;
  onFired(firedSlot: number): void;
}

function trackHandlers(g: Generation, ctx: WatchContext, ti: number, slots: ClipSlot[]): TrackHandlers {
  const set = (patch: Partial<TrackModel>) => g.commit((m) => updateTrack(m, ti, patch));
  return {
    onPlaying: (playingSlot) => {
      set({ playingSlot });
      if (playingSlot >= 0) g.launches.set(ti, Date.now());
      if (g.isLive()) void ctx.timing.watchPlaying(ti, slots[playingSlot] ?? null, g.isLive);
    },
    onFired: (firedSlot) => {
      set({ firedSlot });
      if (firedSlot >= 0) g.launches.set(ti, Date.now());
      if (firedSlot >= 0 && slots[firedSlot] && g.isLive()) void readLaunchInfo(g, ti, firedSlot, slots[firedSlot]);
    },
  };
}

export function watchTrack(
  g: Generation,
  ctx: WatchContext,
  ti: number,
  track: Track,
  data: TrackData,
  onRename: () => void = () => undefined,
): Promise<unknown> {
  const { slots, armable, volume, overdub, racks } = data;
  const loadedDevices = devicesKey({ overdub, racks });
  const set = (patch: Partial<TrackModel>) => g.commit((m) => updateTrack(m, ti, patch));
  const { onPlaying, onFired } = trackHandlers(g, ctx, ti, slots);
  const label = `track ${ti}`;
  // Most device edits leave the Overdub switch and the racks alone: only a change to those is worth re-reading the set.
  const onDevicesChange = async () => {
    const current = await readDevices(track);
    if (g.isLive() && devicesKey(current) !== loadedDevices) ctx.scheduleReload();
  };
  const onClipChange = (si: number, slot: ClipSlot) => () => {
    if (g.isLive()) void watchClip(g, ctx, ti, si, slot, { fromLive: true }).catch(ctx.failLoad(g));
  };
  return Promise.all([
    g.keep(
      track.addListener("name", (name) => {
        set({ name });
        onRename();
      }),
      `${label} name`,
    ),
    g.keep(track.addListener("color", (c) => set({ color: c.hex })), `${label} color`),
    g.keep(track.addListener("playing_slot_index", onPlaying), `${label} playing`),
    g.keep(track.addListener("fired_slot_index", onFired), `${label} fired`),
    g.keep(track.addListener("mute", (muted) => set({ muted })), `${label} mute`),
    armable ? g.keep(track.addListener("arm", (armed) => set({ armed })), `${label} arm`) : undefined,
    g.keep(track.addListener("solo", (solo) => set({ solo })), `${label} solo`),
    g.keep(volume.addListener("value", (value) => set({ volume: roundVolume(value) })), `${label} volume`),
    overdub ? watchOverdub(g, ti, overdub) : undefined,
    g.keep(track.addListener("devices", onDevicesChange), `${label} devices`),
    ...slots.map((slot, si) => g.keep(slot.addListener("has_clip", onClipChange(si, slot)), `slot ${ti}:${si} has_clip`)),
  ]);
}

/** Only the sends a track is followed on get a listener: its cue send and the signal send, one listener when they are the same. */
async function watchSends(
  g: Generation,
  ti: number,
  mixer: MixerDevice,
  cueIndex: number | null,
  signalIndex: number | null,
): Promise<void> {
  const followers = [
    ...(cueIndex === null ? [] : [{ index: cueIndex, patch: (v: number): Partial<TrackModel> => ({ cue: v >= CUE_LEVEL }) }]),
    ...(signalIndex === null ? [] : [{ index: signalIndex, patch: (v: number): Partial<TrackModel> => ({ sendOn: v > 0 }) }]),
  ];
  try {
    const sends = await mixer.get("sends");
    if (!g.isLive()) return;
    await Promise.all(
      [...new Set(followers.map((f) => f.index))].map(async (index) => {
        const send = sends[index];
        if (!send) return;
        const mine = followers.filter((f) => f.index === index);
        const set = (value: number) =>
          g.commit((m) => updateTrack(m, ti, mine.reduce((patch, f) => ({ ...patch, ...f.patch(value) }), {})));
        // Listener first: addListener sends no initial value, so a change between read and attach would be lost.
        await g.keep(send.addListener("value", set), `track ${ti} send ${index}`);
        if (g.isLive()) set(await send.get("value"));
      }),
    );
  } catch (err) {
    warnRead(`sends ${ti}`)(err);
  }
}

async function watchOverdub(g: Generation, ti: number, param: DeviceParameter): Promise<void> {
  try {
    const set = (value: number) => g.commit((m) => updateTrack(m, ti, { overdub: value > 0 }));
    // Listener first: addListener sends no initial value, so a switch flipped between load and attach would be lost.
    await g.keep(param.addListener("value", set), `track ${ti} overdub`);
    if (g.isLive()) set(await param.get("value"));
  } catch (err) {
    warnRead(`overdub switch ${ti}`)(err);
  }
}

function watchScene(g: Generation, si: number, scene: Scene): Promise<void> {
  return g.keep(
    scene.addListener("name", (name) => g.commit((m) => renameScene(m, si, name))),
    `scene ${si} name`,
  );
}

function publishSnapshot(g: Generation, { scenes, trackData, selectedScene, returnTracks }: SongSnapshot): void {
  g.slots = trackData.map((t) => t.slots);
  g.commit(() => ({
    tracks: trackData.map((t) => t.model),
    scenes: scenes.map((s) => ({ id: s.raw.id, name: s.raw.name })),
    selectedScene,
    returns: returnTracks.map((r) => r.raw.name),
  }));
}

function watchReturnName(g: Generation, ri: number, track: Track): Promise<void> {
  return g.keep(
    track.addListener("name", (name) => g.commit((m) => renameReturn(m, ri, name))),
    `return ${ri} name`,
  );
}

function startTiming(g: Generation, ctx: WatchContext, { trackData }: SongSnapshot): void {
  void ctx.timing.watchSong(g.isLive).catch(ctx.failLoad(g));
  trackData.forEach(({ model, slots }, ti) => {
    void ctx.timing.watchPlaying(ti, slots[model.playingSlot] ?? null, g.isLive);
  });
}

export async function watchSession(g: Generation, ctx: WatchContext): Promise<void> {
  const snapshot = await readSong(ctx.ableton);
  if (!g.isLive()) return;
  publishSnapshot(g, snapshot);
  startTiming(g, ctx, snapshot);

  const { tracks, scenes, trackData, returnTracks } = snapshot;
  const cueSends = ctx.cueSends(trackData.map((t) => t.model.name));
  const signalSend = ctx.signalSend();
  const racks = ctx.racks();
  const rackTracks = new Set(racks.flatMap((r) => [r.track, ...r.flags.map((f) => f.track)]));
  const followed = (names: readonly string[]) => names.map((name) => rackTracks.has(name)).join();
  const loadedFollowed = followed(trackData.map((t) => t.model.name));
  // Cue spans, racks and macro flags name their tracks, and the listeners are chosen here: a rename moving a track in or out
  // of what they name needs the set read again.
  const recheckNames = () => {
    const names = ctx.model().tracks.map((t) => t.name);
    const now = ctx.cueSends(names);
    const moved = now.some((send, ti) => send !== cueSends[ti]) || followed(names) !== loadedFollowed;
    if (g.isLive() && moved) ctx.scheduleReload();
  };
  const onStructureChange = () => {
    if (g.isLive()) ctx.scheduleReload();
  };
  // ponytail: a track/scene change landing between the reads above and these subscriptions is missed until the next reload.
  await Promise.all([
    g.keep(ctx.ableton.song.addListener("tracks", onStructureChange), "song tracks"),
    g.keep(ctx.ableton.song.addListener("scenes", onStructureChange), "song scenes"),
    g.keep(ctx.ableton.song.addListener("return_tracks", onStructureChange), "song returns"),
    ...returnTracks.map((track, ri) => watchReturnName(g, ri, track)),
    g.keep(
      ctx.ableton.song.view.addListener("selected_scene", (scene) =>
        g.commit((m) => selectScene(m, sceneIndex(scenes, scene))),
      ),
      "selected scene",
    ),
    ...scenes.map((scene, si) => watchScene(g, si, scene)),
    ...trackData.map((data, ti) => watchTrack(g, ctx, ti, tracks[ti], data, recheckNames)),
    watchRacks(g, ctx, racks, trackData),
    ...trackData.map((data, ti) =>
      cueSends[ti] === null && signalSend === null ? undefined : watchSends(g, ti, data.mixer, cueSends[ti], signalSend),
    ),
    ...trackData.flatMap((data, ti) =>
      data.clips.map((clip, si) => (clip ? watchClip(g, ctx, ti, si, data.slots[si], { clip }) : undefined)),
    ),
  ]);
  // After the clip reads above, which would otherwise overwrite it.
  trackData.forEach(({ model, slots }, ti) => {
    if (slots[model.firedSlot] && g.isLive()) void readLaunchInfo(g, ti, model.firedSlot, slots[model.firedSlot]);
  });
  if (g.isLive()) console.log(`[live] watching ${tracks.length} tracks, ${scenes.length} scenes`);
}
