import { describe, expect, test } from "vitest";
import { DEFAULT_VISIBLE_TRACKS, defaultView, viewSpan } from "./family-view.ts";

const names = ["ALEX 1", "ALEX 2", "sax 1", "sax 2", "BEN 1", "BEN 2"];

describe("viewSpan", () => {
  test("covers the tracks from first to last", () => {
    expect(viewSpan(names, { first: "ALEX 2", last: "sax 2" })).toEqual({ start: 1, count: 3 });
  });

  test("falls back to the default width at the last known position when a track is missing", () => {
    expect(viewSpan(names, { first: "BEN 1", last: "gone", lastFirstIndex: 4 })).toEqual({
      start: 4,
      count: DEFAULT_VISIBLE_TRACKS,
    });
  });

  test("falls back to the start of the set without a known position", () => {
    expect(viewSpan(names, { first: "gone", last: "gone" })).toEqual({ start: 0, count: DEFAULT_VISIBLE_TRACKS });
  });

  test("ignores a view whose last track comes before its first", () => {
    expect(viewSpan(names, { first: "sax 2", last: "ALEX 1", lastFirstIndex: 3 })).toEqual({
      start: 3,
      count: DEFAULT_VISIBLE_TRACKS,
    });
  });

  test("keeps the fallback start inside a shorter set", () => {
    expect(viewSpan(["a"], { first: "gone", last: "gone", lastFirstIndex: 40 }).start).toBe(0);
  });
});

describe("defaultView", () => {
  test("stops at the last track of the set", () => {
    expect(defaultView(names, 4)).toEqual({ first: "BEN 1", last: "BEN 2" });
  });
});
