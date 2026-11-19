import { spanIndexes } from "../../../server/musicians.ts";
import type { MusicianView, TrackSpan } from "../../../server/protocol.ts";

/** What a musician watches when their view no longer matches the set; 12 is the most anyone drives. */
export const DEFAULT_VISIBLE_TRACKS = 12;

export interface ViewSpan {
  start: number;
  count: number;
}

/** The tracks a musician's view covers; a view that no longer matches falls back to the default width near where it was. */
export function viewSpan(names: readonly string[], view: MusicianView): ViewSpan {
  const found = spanIndexes(names, view);
  if (found) return { start: found.start, count: found.end - found.start + 1 };
  return { start: Math.min(view.lastFirstIndex ?? 0, Math.max(names.length - 1, 0)), count: DEFAULT_VISIBLE_TRACKS };
}

/** A starting view for a new musician: the track at `firstIndex` and the default width. */
export function defaultView(names: readonly string[], firstIndex: number): TrackSpan {
  const last = Math.min(firstIndex + DEFAULT_VISIBLE_TRACKS - 1, names.length - 1);
  return { first: names[firstIndex], last: names[last] };
}
