import type { Ableton } from "ableton-js";
import type { Clip } from "ableton-js/ns/clip";
import type { ClipSlot } from "ableton-js/ns/clip-slot";
import type { Remover } from "./live-generation.ts";
import type { ClipBounds, ClipPosition, SongTiming } from "./timing.ts";

type IsLive = () => boolean;

export interface TimingSnapshot {
  song: SongTiming;
  positions: ReadonlyMap<number, ClipPosition>;
}

const INITIAL_SONG: SongTiming = {
  isPlaying: false,
  songTime: 0,
  quantization: "q_bar",
  signature: { numerator: 4, denominator: 4 },
  tempo: 120,
};

const warn = (label: string) => (err: unknown) =>
  console.warn(`[live] timing ${label} not attached:`, (err as Error).message);

async function readBounds(clip: Clip): Promise<{ bounds: ClipBounds; position: number }> {
  const [looping, loopStart, loopEnd, startMarker, endMarker, position] = await Promise.all([
    clip.get("looping"),
    clip.get("loop_start"),
    clip.get("loop_end"),
    clip.get("start_marker"),
    clip.get("end_marker"),
    clip.get("playing_position"),
  ]);
  return { bounds: { looping, loopStart, loopEnd, startMarker, endMarker }, position };
}

/** Follows the transport and the playing clip of each track, for progress bars and launch countdowns. */
export class TimingWatcher {
  private song = INITIAL_SONG;
  private positions: ReadonlyMap<number, ClipPosition> = new Map();
  private songRemovers: Remover[] = [];
  private readonly trackRemovers = new Map<number, Remover>();
  private readonly tokens = new Map<number, number>();
  private active = true;
  private songTimeWanted = false;
  private songTimeRemove: Remover | null = null;
  private songTimeQueue: Promise<void> = Promise.resolve();
  private epoch = 0;

  constructor(private readonly ableton: Ableton) {}

  snapshot(): TimingSnapshot {
    return { song: this.song, positions: this.positions };
  }

  async watchSong(isLive: IsLive): Promise<void> {
    // Listeners before the reads: addListener sends no initial value, so a change between read and attach would be lost.
    await this.attachSongListeners(isLive);
    const s = this.ableton.song;
    const [isPlaying, songTime, quantization, numerator, denominator, tempo] = await Promise.all([
      s.get("is_playing"),
      s.get("current_song_time"),
      s.get("clip_trigger_quantization"),
      s.get("signature_numerator"),
      s.get("signature_denominator"),
      s.get("tempo"),
    ]);
    if (isLive()) this.song = { isPlaying, songTime, quantization, signature: { numerator, denominator }, tempo };
  }

  /** Forgets every subscription and returns their removers; the caller decides whether Live still needs telling. */
  reset(): Remover[] {
    const all = [...this.songRemovers, ...this.trackRemovers.values(), ...(this.songTimeRemove ? [this.songTimeRemove] : [])];
    this.epoch += 1;
    this.songRemovers = [];
    this.songTimeRemove = null;
    this.songTimeWanted = false;
    this.trackRemovers.clear();
    this.tokens.clear();
    this.positions = new Map();
    this.song = INITIAL_SONG;
    return all;
  }

  /**
   * Live pushes the song time and every playing clip's position many times a second, each push costing work on
   * its main thread: with no viewer connected, both are dropped; `resume` re-follows the clips playing now.
   */
  async setActive(active: boolean, resume: () => Promise<unknown>): Promise<void> {
    if (active === this.active) return;
    this.active = active;
    if (active) {
      await resume();
      return;
    }
    const removers = [...this.trackRemovers.values()];
    this.trackRemovers.clear();
    this.positions = new Map();
    await Promise.all(removers.map((remove) => remove().catch(() => undefined)));
  }

  /** The song time feeds the transport and the launch countdowns: it is followed while a viewer is connected. */
  setSongTimeNeeded(needed: boolean): void {
    const wanted = needed && this.active;
    if (wanted === this.songTimeWanted) return;
    this.songTimeWanted = wanted;
    this.songTimeQueue = this.songTimeQueue.then(() => this.syncSongTime()).catch((err) => {
      // Not wanted any more as far as the next model update is concerned, so it asks again.
      this.songTimeWanted = false;
      warn("song_time")(err);
    });
  }

  private async syncSongTime(): Promise<void> {
    const epoch = this.epoch;
    const s = this.ableton.song;
    if (this.songTimeWanted && !this.songTimeRemove) {
      const remove = await s.addListener("current_song_time", (songTime) => {
        if (this.epoch === epoch) this.patchSong({ songTime });
      });
      // A reset during the attach already handed out its removers: this one would never be detached.
      if (this.epoch !== epoch) return void (await remove());
      this.songTimeRemove = remove;
      const songTime = await s.get("current_song_time");
      if (this.epoch === epoch) this.patchSong({ songTime });
    } else if (!this.songTimeWanted && this.songTimeRemove) {
      const remove = this.songTimeRemove;
      this.songTimeRemove = null;
      await remove();
    }
  }

  async watchPlaying(trackIndex: number, slot: ClipSlot | null, isLive: IsLive): Promise<void> {
    // Checked before touching shared state: a stale generation must not evict the current one's watcher.
    if (!isLive()) return;
    const token = (this.tokens.get(trackIndex) ?? 0) + 1;
    this.tokens.set(trackIndex, token);
    const isLatest = () => isLive() && this.active && this.tokens.get(trackIndex) === token;

    const previous = this.trackRemovers.get(trackIndex);
    this.trackRemovers.delete(trackIndex);
    this.setPosition(trackIndex, null);
    await previous?.().catch(() => undefined);

    // A clip vanishing mid-read only costs this track its progress bar, never a full reload.
    try {
      const clip = slot ? await slot.get("clip") : null;
      if (clip && isLatest()) await this.followClip(trackIndex, clip, isLatest);
    } catch (err) {
      warn(`track ${trackIndex} position`)(err);
    }
  }

  private async followClip(trackIndex: number, clip: Clip, isLatest: IsLive): Promise<void> {
    const { bounds, position } = await readBounds(clip);
    if (!isLatest()) return;
    this.setPosition(trackIndex, { position, bounds });
    const remove = await clip.addListener("playing_position", (p) => {
      if (isLatest()) this.setPosition(trackIndex, { position: p, bounds });
    });
    if (isLatest()) this.trackRemovers.set(trackIndex, remove);
    // ableton-js counts listeners per subscription, so this only drops ours, never a newer watcher's.
    else await remove().catch(() => undefined);
  }

  private patchSong(patch: Partial<SongTiming>): void {
    this.song = { ...this.song, ...patch };
  }

  private setPosition(trackIndex: number, value: ClipPosition | null): void {
    const next = new Map(this.positions);
    if (value) next.set(trackIndex, value);
    else next.delete(trackIndex);
    this.positions = next;
  }

  private async attachSongListeners(isLive: IsLive): Promise<void> {
    const s = this.ableton.song;
    const on = (attach: Promise<Remover>, label: string) =>
      attach.then((remove) => {
        if (isLive()) this.songRemovers.push(remove);
      }, warn(label));
    const guarded =
      <T>(apply: (value: T) => void) =>
      (value: T) => {
        if (isLive()) apply(value);
      };
    await Promise.all([
      on(s.addListener("is_playing", guarded((v: boolean) => this.patchSong({ isPlaying: v }))), "is_playing"),
      on(s.addListener("tempo", guarded((v: number) => this.patchSong({ tempo: v }))), "tempo"),
      on(
        s.addListener("clip_trigger_quantization", guarded((v) => this.patchSong({ quantization: v }))),
        "quantization",
      ),
      on(
        s.addListener(
          "signature_numerator",
          guarded((v: number) => this.patchSong({ signature: { ...this.song.signature, numerator: v } })),
        ),
        "signature",
      ),
      on(
        s.addListener(
          "signature_denominator",
          guarded((v: number) => this.patchSong({ signature: { ...this.song.signature, denominator: v } })),
        ),
        "signature",
      ),
    ]);
  }
}
