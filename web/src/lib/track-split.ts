import { spanIndexes } from "../../../server/musicians.ts";
import type { Musician } from "../../../server/protocol.ts";

/** Tracks of the set per musician, each counted once for the first whose view covers it (views may overlap). */
export function trackSplit(names: readonly string[], musicians: readonly Pick<Musician, "view">[]): { counts: number[]; free: number } {
  const spans = musicians.map((m) => spanIndexes(names, m.view));
  const owners = names.map((_, i) => spans.findIndex((s) => s !== null && i >= s.start && i <= s.end));
  const counts = musicians.map((_, m) => owners.filter((o) => o === m).length);
  return { counts, free: owners.filter((o) => o < 0).length };
}
