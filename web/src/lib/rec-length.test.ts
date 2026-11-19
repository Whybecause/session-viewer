import { describe, expect, test } from "vitest";
import { formatRecLength, recLengthSpan } from "./rec-length.ts";

const NAMES = ["CAM 1", "ALEX 1", "ALEX 2", "sax 1", "sax 2", "BEN 1"];

describe("formatRecLength", () => {
  test("shows the bar count, or a free length", () => {
    expect(formatRecLength(4)).toBe("4 B");
    expect(formatRecLength(null)).toBe("free");
  });
});

describe("recLengthSpan", () => {
  const view = { first: "ALEX 1", last: "sax 2" };

  test("follows the view without a rec span, numbered tracks included", () => {
    expect(recLengthSpan(NAMES, { view })).toEqual({ start: 1, count: 4 });
  });

  test("uses the rec span when one is set", () => {
    expect(recLengthSpan(NAMES, { view, rec: { first: "sax 1", last: "BEN 1" } })).toEqual({ start: 3, count: 3 });
  });

  test("is null when the span no longer matches the set", () => {
    expect(recLengthSpan(NAMES, { view: { first: "ALEX 1", last: "gone" } })).toBeNull();
    expect(recLengthSpan(NAMES, { view, rec: { first: "gone", last: "sax 2" } })).toBeNull();
  });
});
