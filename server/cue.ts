import { cueSpan, spanIndexes } from "./musicians.ts";
import type { Musician } from "./protocol.ts";

/** Live sends run from 0 to 1, and the ClyphX cue pushes them to 1: anything this close counts as full. */
export const CUE_LEVEL = 0.999;

export const sendIndex = (letter: string): number => letter.charCodeAt(0) - "A".charCodeAt(0);

/**
 * The send each track's cue follows, by track index; null leaves the track on solo.
 * A span naming a track missing from the set is ignored; where spans overlap, the first musician wins.
 */
export function cueSendIndexes(names: readonly string[], musicians: readonly Musician[]): (number | null)[] {
  const spans = musicians.flatMap((m) => {
    const span = cueSpan(m);
    const found = span && spanIndexes(names, span);
    return m.cue && found ? [{ ...found, send: sendIndex(m.cue.send) }] : [];
  });
  return names.map((_, i) => spans.find((s) => i >= s.start && i <= s.end)?.send ?? null);
}
