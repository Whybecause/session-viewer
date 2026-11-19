import { describe, expect, test } from "vitest";
import { isError, musicianIssues, rememberIndexes, spanIndexes } from "./musicians.ts";
import type { Cue, Musician } from "./protocol.ts";

const names = ["ALEX 1", "ALEX 2", "sax 1", "sax 2", "BEN 1", "gtr 4", "DRUMS"];

const musician = (name: string, first: string, last: string, cue: Cue | null = null): Musician => ({
  name,
  view: { first, last },
  cue,
});

describe("spanIndexes", () => {
  test("returns the positions of a nominal range", () => {
    expect(spanIndexes(names, { first: "ALEX 1", last: "sax 2" })).toEqual({ start: 0, end: 3 });
  });

  test("includes a track inserted in the middle", () => {
    const withInsert = ["ALEX 1", "new", "ALEX 2", "sax 1"];
    expect(spanIndexes(withInsert, { first: "ALEX 1", last: "sax 1" })).toEqual({ start: 0, end: 3 });
  });

  test("leaves out a track inserted right after the end", () => {
    const withInsert = ["ALEX 1", "ALEX 2", "new", "sax 1"];
    expect(spanIndexes(withInsert, { first: "ALEX 1", last: "ALEX 2" })).toEqual({ start: 0, end: 1 });
  });

  test("is null when a bound is missing or the last comes before the first", () => {
    expect(spanIndexes(names, { first: "ALEX 1", last: "gone" })).toBeNull();
    expect(spanIndexes(names, { first: "sax 1", last: "ALEX 1" })).toBeNull();
  });

  test("is null on an empty set", () => {
    expect(spanIndexes([], { first: "ALEX 1", last: "sax 2" })).toBeNull();
  });
});

describe("musicianIssues", () => {
  test("reports nothing for a nominal range covering the set", () => {
    expect(musicianIssues(names, [musician("ALEX", "ALEX 1", "DRUMS")])).toEqual([]);
  });

  test("reports a renamed bound and suggests the track now at its old position", () => {
    const renamed = ["ALEX 1", "ALEX 2", "gtr 4 bis"];
    const m: Musician = { name: "ALEX", view: { first: "ALEX 1", last: "gtr 4", lastFirstIndex: 0, lastLastIndex: 2 }, cue: null };
    expect(musicianIssues(renamed, [m])).toEqual([
      { kind: "missing_bound", musician: "ALEX", target: "view", bound: "last", name: "gtr 4", suggestion: "gtr 4 bis" },
    ]);
  });

  test("reports a missing bound without suggestion when no position is remembered", () => {
    const [issue] = musicianIssues(names, [musician("ALEX", "gone", "DRUMS")]);
    expect(issue).toMatchObject({ kind: "missing_bound", bound: "first", name: "gone" });
    expect(issue).not.toHaveProperty("suggestion");
  });

  test("reports a bound moved before the start as inverted", () => {
    expect(musicianIssues(names, [musician("ALEX", "sax 1", "ALEX 1")])).toContainEqual({
      kind: "inverted",
      musician: "ALEX",
      target: "view",
    });
  });

  test("checks the rec span like the view", () => {
    const m: Musician = { ...musician("CAM", "ALEX 1", "DRUMS"), rec: { first: "sax 2", last: "gone" } };
    expect(musicianIssues(names, [m])).toEqual([
      { kind: "missing_bound", musician: "CAM", target: "rec", bound: "last", name: "gone" },
    ]);
  });

  test("allows views that overlap", () => {
    const issues = musicianIssues(names, [musician("ALEX", "ALEX 1", "BEN 1"), musician("BEN", "BEN 1", "DRUMS")]);
    expect(issues.filter(isError)).toEqual([]);
  });

  test("reports cues that share a track", () => {
    const a = musician("ALEX", "ALEX 1", "sax 2", { send: "E", span: { first: "ALEX 1", last: "sax 1" } });
    const b = musician("BEN", "sax 1", "DRUMS", { send: "F", span: { first: "sax 1", last: "BEN 1" } });
    expect(musicianIssues(names, [a, b])).toContainEqual({ kind: "cue_overlap", musicians: ["ALEX", "BEN"] });
  });

  test("reports a cue that follows a view overlapping another cue", () => {
    const a = musician("ALEX", "ALEX 1", "sax 2", { send: "E", span: null });
    const b = musician("BEN", "BEN 1", "DRUMS", { send: "F", span: { first: "sax 2", last: "BEN 1" } });
    expect(musicianIssues(names, [a, b])).toContainEqual({ kind: "cue_overlap", musicians: ["ALEX", "BEN"] });
  });

  test("accepts cues that only touch", () => {
    const a = musician("ALEX", "ALEX 1", "sax 2", { send: "E", span: { first: "ALEX 1", last: "sax 1" } });
    const b = musician("BEN", "BEN 1", "DRUMS", { send: "F", span: { first: "sax 2", last: "BEN 1" } });
    expect(musicianIssues(names, [a, b]).filter(isError)).toEqual([]);
  });

  test("reports a bound whose name is used by several tracks", () => {
    const twice = ["a 1", "a 2", "x", "a 2"];
    expect(musicianIssues(twice, [musician("A", "a 1", "a 2")])).toContainEqual({
      kind: "duplicate_name",
      musician: "A",
      target: "view",
      bound: "last",
      name: "a 2",
    });
  });

  test("lists the tracks outside every view as information, not as an error", () => {
    const issues = musicianIssues(names, [musician("ALEX", "ALEX 1", "sax 2")]);
    expect(issues).toEqual([{ kind: "unassigned", tracks: ["BEN 1", "gtr 4", "DRUMS"] }]);
    expect(issues.some(isError)).toBe(false);
  });

  test("reports nothing without musicians or tracks", () => {
    expect(musicianIssues(names, [])).toEqual([]);
    expect(musicianIssues([], [musician("ALEX", "ALEX 1", "sax 2")]).every((i) => i.kind === "missing_bound")).toBe(true);
  });
});

describe("rememberIndexes", () => {
  test("stores where the bounds were found", () => {
    const [next] = rememberIndexes(names, [musician("ALEX", "ALEX 2", "sax 2")]) ?? [];
    expect(next.view).toEqual({ first: "ALEX 2", last: "sax 2", lastFirstIndex: 1, lastLastIndex: 3 });
  });

  test("is null when nothing moved", () => {
    const once = rememberIndexes(names, [musician("ALEX", "ALEX 2", "sax 2")])!;
    expect(rememberIndexes(names, once)).toBeNull();
  });

  test("keeps the last positions while a bound is missing", () => {
    const once = rememberIndexes(names, [musician("ALEX", "ALEX 2", "sax 2")])!;
    expect(rememberIndexes(["ALEX 2"], once)).toBeNull();
  });
});

describe("control issues", () => {
  const alex: Musician = {
    ...musician("ALEX", "ALEX 1", "DRUMS"),
    controls: [
      { track: "ALEX 1", rack: "ALEX 1", mode: "chain" },
      { track: "ALEX 9", rack: "ALEX 9", mode: "rack" },
      { track: "ALEX 2", rack: "GONE", mode: "rack" },
    ],
  };
  const racks: Record<string, string[]> = { "ALEX 1": ["ARP", "ALEX 1"], "ALEX 2": ["ALEX 2"] };

  test("reports a control on a missing track or a rack no longer on its track", () => {
    expect(musicianIssues(names, [alex], (track) => racks[track])).toEqual([
      { kind: "control_missing_track", musician: "ALEX", track: "ALEX 9" },
      { kind: "control_missing_rack", musician: "ALEX", track: "ALEX 2", rack: "GONE" },
    ]);
  });

  test("does not report racks while they are unknown", () => {
    expect(musicianIssues(names, [alex]).map((i) => i.kind)).toEqual(["control_missing_track"]);
  });
});

describe("control conflicts", () => {
  test("flags a later musician who controls the same track with another rack or mode", () => {
    const alex: Musician = { ...musician("ALEX", "ALEX 1", "sax 2"), controls: [{ track: "ALEX 1", rack: "ALEX 1", mode: "chain" }] };
    const same: Musician = { ...musician("BEN", "BEN 1", "DRUMS"), controls: [{ track: "ALEX 1", rack: "ALEX 1", mode: "chain" }] };
    const other: Musician = { ...musician("CAM", "BEN 1", "DRUMS"), controls: [{ track: "ALEX 1", rack: "ARP", mode: "chain" }] };
    const conflicts = musicianIssues(names, [alex, same, other]).filter((i) => i.kind === "control_conflict");
    expect(conflicts).toEqual([{ kind: "control_conflict", musician: "CAM", track: "ALEX 1", owner: "ALEX" }]);
  });
});
