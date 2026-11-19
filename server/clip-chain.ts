export interface ClipChainCommand {
  number: number;
  rack: string | null;
}

const CHAIN_CLIP = /^\[CHAIN_(\d+)\](?:\s+"[^"]*"\/DEV\("([^"]*)"\))?/;

/** The name a take gets from a ClyphX user action: an X-Clip that recalls chain n of a rack. 0 selects none. */
export function parseChainClip(name: string): ClipChainCommand | null {
  const match = CHAIN_CLIP.exec(name);
  const number = match ? Number(match[1]) : 0;
  return match && number > 0 ? { number, rack: match[2] ?? null } : null;
}
