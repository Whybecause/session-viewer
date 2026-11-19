import { spanIndexes } from "./musicians.ts";
import { SETTINGS_VERSION, type Musician, type Settings, type TrackSpan } from "./protocol.ts";
import { familyMembers, trackFamilies } from "./track-families.ts";

/** What a rec-less musician's band covered before version 2: the view past their own numbered tracks (ALEX 1…4). */
function legacyRecSpan(names: readonly string[], { name, view }: Musician): TrackSpan | null {
  const found = spanIndexes(names, view);
  if (!found) return null;
  const own = trackFamilies(names).find((family) => family.name === name);
  const members = own ? familyMembers(names, own.firstIndex) : [];
  const start = Math.max(found.start, (members.at(-1) ?? -1) + 1);
  return start <= found.end ? { first: names[start], last: names[found.end] } : null;
}

/**
 * Version 1 → 2: a musician without rec now follows the view, so the span the band showed is written down,
 * keeping the display as it was. Needs Live's track names; null when there is nothing to do.
 */
export function migrateRecSpans(names: readonly string[], settings: Settings): Settings | null {
  if (settings.version >= SETTINGS_VERSION || names.length === 0) return null;
  const musicians = settings.musicians.map((m): Musician => {
    if (m.rec) return m;
    const rec = legacyRecSpan(names, m);
    return rec ? { ...m, rec } : m;
  });
  return { ...settings, musicians, version: SETTINGS_VERSION };
}
