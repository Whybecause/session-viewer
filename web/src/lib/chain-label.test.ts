import { describe, expect, test } from "vitest";
import { chainLabel, chainRow } from "./chain-label.ts";

describe("chainLabel", () => {
  test("drops the number the chain's name already starts with", () => {
    expect(chainLabel({ number: 3, name: "3 BASS LEAD" })).toBe("3 · BASS LEAD");
  });

  test("keeps a name that starts with another number or none", () => {
    expect(chainLabel({ number: 2, name: "1 sub" })).toBe("2 · 1 sub");
    expect(chainLabel({ number: 4, name: "Pad Juno" })).toBe("4 · Pad Juno");
    expect(chainLabel({ number: 5, name: "808" })).toBe("5 · 808");
  });

  test("shows the number alone when the chain has no known name", () => {
    expect(chainLabel({ number: 7, name: null })).toBe("7");
  });
});

describe("chainRow", () => {
  const maxBand = { start: 10, count: 8 };

  test("shares the REC row when no labelled track is under a band", () => {
    expect(chainRow([0, 1, 2], [maxBand, { start: 4, count: 4 }])).toBe(2);
  });

  test("moves to its own row as soon as one labelled track is under a band", () => {
    expect(chainRow([0, 12], [maxBand])).toBe(3);
    expect(chainRow([17], [maxBand])).toBe(3);
    expect(chainRow([18], [maxBand])).toBe(2);
  });
});

describe("chainRow", () => {
  const maxBand = { start: 10, count: 8 };

  test("shares the REC row when no labelled track is under a band", () => {
    expect(chainRow([0, 1, 2], [maxBand, { start: 4, count: 4 }])).toBe(2);
  });

  test("moves to its own row as soon as one labelled track is under a band", () => {
    expect(chainRow([0, 12], [maxBand])).toBe(3);
    expect(chainRow([17], [maxBand])).toBe(3);
    expect(chainRow([18], [maxBand])).toBe(2);
  });
});
