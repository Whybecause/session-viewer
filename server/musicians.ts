import type { Musician, MusicianView, TrackSpan } from "./protocol.ts";

export type SpanTarget = "view" | "cue" | "rec";

export type MusicianIssue =
  | { kind: "missing_bound"; musician: string; target: SpanTarget; bound: keyof TrackSpan; name: string; suggestion?: string }
  | { kind: "inverted"; musician: string; target: SpanTarget }
  | { kind: "duplicate_name"; musician: string; target: SpanTarget; bound: keyof TrackSpan; name: string }
  | { kind: "cue_overlap"; musicians: [string, string] }
  | { kind: "control_missing_track"; musician: string; track: string }
  | { kind: "control_missing_rack"; musician: string; track: string; rack: string }
  | { kind: "control_conflict"; musician: string; track: string; owner: string }
  | { kind: "unassigned"; tracks: string[] };

export const isError = (issue: MusicianIssue): boolean => issue.kind !== "unassigned";

/** Both bounds found, the last not before the first (a name used twice resolves to its first track). */
export function spanIndexes(names: readonly string[], span: TrackSpan): { start: number; end: number } | null {
  const start = names.indexOf(span.first);
  if (start < 0) return null;
  const end = names.indexOf(span.last, start);
  return end < 0 ? null : { start, end };
}

/** The tracks the cue covers, null when there is no cue. */
export const cueSpan = (m: Pick<Musician, "view" | "cue">): TrackSpan | null => m.cue && (m.cue.span ?? m.view);

/** The tracks under the record-length band. */
export const recSpan = (m: Pick<Musician, "view" | "rec">): TrackSpan => m.rec ?? m.view;

const count = (names: readonly string[], name: string) => names.filter((n) => n === name).length;

function spanIssues(
  names: readonly string[],
  musician: string,
  target: SpanTarget,
  span: TrackSpan,
  remembered: readonly [number | undefined, number | undefined],
): MusicianIssue[] {
  const bounds = ["first", "last"] as const;
  const missing = bounds.flatMap((bound, i): MusicianIssue[] => {
    const name = span[bound];
    if (names.includes(name)) return [];
    const guess = remembered[i] === undefined ? undefined : names[remembered[i]];
    return [{ kind: "missing_bound", musician, target, bound, name, ...(guess !== undefined && { suggestion: guess }) }];
  });
  const duplicated = bounds.flatMap((bound): MusicianIssue[] =>
    count(names, span[bound]) > 1 ? [{ kind: "duplicate_name", musician, target, bound, name: span[bound] }] : [],
  );
  const isInverted = missing.length === 0 && !spanIndexes(names, span);
  return [...missing, ...duplicated, ...(isInverted ? [{ kind: "inverted", musician, target } as const] : [])];
}

function cueOverlaps(names: readonly string[], musicians: readonly Musician[]): MusicianIssue[] {
  const spans = musicians.flatMap((m) => {
    const span = cueSpan(m);
    const indexes = span && spanIndexes(names, span);
    return indexes ? [{ name: m.name, ...indexes }] : [];
  });
  return spans.flatMap((a, i) =>
    spans
      .slice(i + 1)
      .filter((b) => a.start <= b.end && b.start <= a.end)
      .map((b): MusicianIssue => ({ kind: "cue_overlap", musicians: [a.name, b.name] })),
  );
}

function unassignedTracks(names: readonly string[], musicians: readonly Musician[]): MusicianIssue[] {
  const spans = musicians.flatMap((m) => spanIndexes(names, m.view) ?? []);
  if (spans.length === 0) return [];
  const free = names.filter((_, i) => !spans.some((s) => i >= s.start && i <= s.end));
  return free.length > 0 ? [{ kind: "unassigned", tracks: free }] : [];
}

/** racksOf returns undefined while the racks are unknown (Live away): a rack is then not reported missing. */
function controlIssues(
  names: readonly string[],
  { name: musician, controls = [] }: Musician,
  racksOf: (track: string) => readonly string[] | undefined,
): MusicianIssue[] {
  return controls.flatMap(({ track, rack }): MusicianIssue[] => {
    if (!names.includes(track)) return [{ kind: "control_missing_track", musician, track }];
    const racks = racksOf(track);
    return racks && !racks.includes(rack) ? [{ kind: "control_missing_rack", musician, track, rack }] : [];
  });
}

/** A track shows one panel: the first musician to control it sets its rack and mode, a different choice is ignored. */
function controlConflicts(musicians: readonly Musician[]): MusicianIssue[] {
  return musicians.flatMap((m, i) =>
    (m.controls ?? []).flatMap(({ track, rack, mode }): MusicianIssue[] => {
      const owner = musicians
        .slice(0, i)
        .find((other) => other.controls?.some((c) => c.track === track && (c.rack !== rack || c.mode !== mode)));
      return owner ? [{ kind: "control_conflict", musician: m.name, track, owner: owner.name }] : [];
    }),
  );
}

/**
 * What is wrong with the musicians' spans and controls against the tracks of the set now.
 * Views may overlap (two people can watch the same drums); cues may not, as a track follows one return.
 */
export function musicianIssues(
  names: readonly string[],
  musicians: readonly Musician[],
  racksOf: (track: string) => readonly string[] | undefined = () => undefined,
): MusicianIssue[] {
  const own = musicians.flatMap((m) => [
    ...spanIssues(names, m.name, "view", m.view, [m.view.lastFirstIndex, m.view.lastLastIndex]),
    ...(m.cue?.span ? spanIssues(names, m.name, "cue", m.cue.span, [undefined, undefined]) : []),
    ...(m.rec ? spanIssues(names, m.name, "rec", m.rec, [undefined, undefined]) : []),
    ...controlIssues(names, m, racksOf),
  ]);
  return [...own, ...controlConflicts(musicians), ...cueOverlaps(names, musicians), ...unassignedTracks(names, musicians)];
}

/** The views with their last known positions refreshed; null when nothing moved. */
export function rememberIndexes(names: readonly string[], musicians: readonly Musician[]): Musician[] | null {
  let changed = false;
  const next = musicians.map((m): Musician => {
    const found = spanIndexes(names, m.view);
    if (!found || (m.view.lastFirstIndex === found.start && m.view.lastLastIndex === found.end)) return m;
    changed = true;
    const view: MusicianView = { first: m.view.first, last: m.view.last, lastFirstIndex: found.start, lastLastIndex: found.end };
    return { ...m, view };
  });
  return changed ? next : null;
}
