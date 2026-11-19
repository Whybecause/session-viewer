import type { ClipSlot } from "ableton-js/ns/clip-slot";
import type { SessionModel } from "./session-state.ts";

export type Remover = () => Promise<unknown>;
export type Update = (model: SessionModel) => SessionModel;

/**
 * A subscription that lands after its generation was superseded is removed at once. That is safe even when a
 * newer generation listens to the same property: ableton-js counts listeners per subscription and only tells
 * Live to stop when the last one goes.
 */
export async function keep(
  isLive: () => boolean,
  attach: Promise<Remover>,
  label: string,
  bucket: Remover[],
): Promise<void> {
  try {
    const remove = await attach;
    if (isLive()) bucket.push(remove);
    else await remove().catch(() => undefined);
  } catch (err) {
    console.warn(`[live] listener ${label} not attached:`, (err as Error).message);
  }
}

/** One load of the set and the subscriptions made for it; everything it owns turns stale when the next one starts. */
export class Generation {
  readonly removers: Remover[] = [];
  /** Subscriptions swapped one key at a time (a clip slot, a rack's inner chain), apart from the load's own. */
  private readonly keyedRemovers = new Map<string, Remover[]>();
  /** Clip slots per track, to follow the playing clips again when a viewer reconnects. */
  slots: ClipSlot[][] = [];
  /** Track index → when a clip last fired or started there, to tell an X-Clip chain recall from a chain button. */
  readonly launches = new Map<number, number>();
  private readonly slotTokens = new Map<string, number>();

  constructor(
    readonly id: number,
    private readonly currentId: () => number,
    private readonly apply: (update: Update) => void,
  ) {}

  readonly isLive = (): boolean => this.currentId() === this.id;

  commit(update: Update): void {
    if (this.isLive()) this.apply(update);
  }

  keep(attach: Promise<Remover>, label: string): Promise<void> {
    return keep(this.isLive, attach, label, this.removers);
  }

  /**
   * Makes the caller the newest watcher of `key` with an empty bucket for its removers. isLatest turns false once
   * another claims the key; the previous watcher's removers must be awaited before attaching to the same objects.
   */
  claimBucket(key: string): { isLatest: () => boolean; bucket: Remover[]; previous: Remover[] } {
    const token = (this.slotTokens.get(key) ?? 0) + 1;
    this.slotTokens.set(key, token);
    const previous = this.keyedRemovers.get(key) ?? [];
    const bucket: Remover[] = [];
    this.keyedRemovers.set(key, bucket);
    return { isLatest: () => this.isLive() && this.slotTokens.get(key) === token, bucket, previous };
  }

  /** Every remover registered so far, to detach before the next generation attaches. */
  allRemovers(): Remover[] {
    return [...this.removers, ...[...this.keyedRemovers.values()].flat()];
  }
}
