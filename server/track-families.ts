export interface TrackFamily {
  name: string;
  firstIndex: number;
}

const NUMBERED = /^(.*\S)\s+\d+$/;
const MIN_FAMILY_SIZE = 2;

const prefixOf = (name: string) => NUMBERED.exec(name.trim())?.[1] ?? null;

/** Runs of consecutive tracks named "<prefix> <number>" (ALEX 1, ALEX 2…), first run per prefix. */
export function trackFamilies(names: readonly string[]): TrackFamily[] {
  const prefixes = names.map(prefixOf);
  const runs = prefixes.flatMap((prefix, i) => {
    if (!prefix || prefixes[i - 1] === prefix) return [];
    let end = i;
    while (prefixes[end + 1] === prefix) end += 1;
    return end - i + 1 >= MIN_FAMILY_SIZE ? [{ name: prefix, firstIndex: i }] : [];
  });
  return runs.filter((run, i) => runs.findIndex((r) => r.name === run.name) === i);
}

/** Indexes of the numbered run containing the track (sax 1…4 for "sax 2"), or just the track itself. */
export function familyMembers(names: readonly string[], index: number): number[] {
  const prefix = prefixOf(names[index] ?? "");
  if (!prefix) return [index];
  let start = index;
  let end = index;
  while (start > 0 && prefixOf(names[start - 1]) === prefix) start -= 1;
  while (end < names.length - 1 && prefixOf(names[end + 1]) === prefix) end += 1;
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
