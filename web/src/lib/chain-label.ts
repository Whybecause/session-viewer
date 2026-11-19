import type { ClipChain } from "../../../server/protocol.ts";
import type { ViewSpan } from "./family-view.ts";

const NUMBERED = /^(\d+)\s+(.+)$/;

/** "3 · BASS LEAD", without repeating the number when the chain's name already starts with it. */
export function chainLabel({ number, name }: ClipChain): string {
  if (name === null) return String(number);
  const match = NUMBERED.exec(name);
  return match && Number(match[1]) === number ? `${number} · ${match[2]}` : `${number} · ${name}`;
}

/** Chain labels share the REC band's row unless one would sit under a band; then they all move to a row of their own. */
export function chainRow(labelled: readonly number[], bands: readonly ViewSpan[]): 2 | 3 {
  const underBand = labelled.some((i) => bands.some((b) => i >= b.start && i < b.start + b.count));
  return underBand ? 3 : 2;
}
