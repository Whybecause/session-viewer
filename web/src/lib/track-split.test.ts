import { describe, expect, test } from "vitest";
import { trackSplit } from "./track-split.ts";

const NAMES = ["ALEX 1", "sax 1", "BEN 1", "gtr 1", "DRUMS", "FX"];
const view = (first: string, last: string) => ({ view: { first, last } });

describe("trackSplit", () => {
  test("counts the tracks of each view and those in none", () => {
    expect(trackSplit(NAMES, [view("ALEX 1", "sax 1"), view("BEN 1", "gtr 1")])).toEqual({ counts: [2, 2], free: 2 });
  });

  test("gives a track two views share to the first", () => {
    expect(trackSplit(NAMES, [view("ALEX 1", "DRUMS"), view("BEN 1", "FX")])).toEqual({ counts: [5, 1], free: 0 });
  });

  test("counts nothing for a view that no longer matches the set", () => {
    expect(trackSplit(NAMES, [view("gone", "sax 1")])).toEqual({ counts: [0], free: 6 });
  });
});
