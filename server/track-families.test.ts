import { describe, expect, test } from "vitest";
import { familyMembers, trackFamilies } from "./track-families.ts";

describe("trackFamilies", () => {
  test("groups consecutive numbered tracks under their prefix", () => {
    const names = ["STRUCTURE", "CLIC", "ALEX 1", "ALEX 2", "ALEX 3", "sax 1", "sax 2", "gtr cam 1", "gtr cam 2"];
    expect(trackFamilies(names)).toEqual([
      { name: "ALEX", firstIndex: 2 },
      { name: "sax", firstIndex: 5 },
      { name: "gtr cam", firstIndex: 7 },
    ]);
  });

  test("tolerates duplicate or skipped numbers inside a run", () => {
    expect(trackFamilies(["bass 1", "bass 1", "bass 3"])).toEqual([{ name: "bass", firstIndex: 0 }]);
  });

  test("ignores single numbered tracks and names with text after the number", () => {
    expect(trackFamilies(["DECK 1", "BEN 1 RESET FX", "BEN 2 RESET FX", "Loop 1 Resample"])).toEqual([]);
  });

  test("keeps only the first run when a prefix appears again later", () => {
    expect(trackFamilies(["CAM 1", "CAM 2", "other", "CAM 3", "CAM 4"])).toEqual([{ name: "CAM", firstIndex: 0 }]);
  });
});

describe("familyMembers", () => {
  const names = ["CLIC", "sax 1", "sax 2", "sax 3", "gtr 1", "sax 4"];

  test("returns the whole consecutive run around the track", () => {
    expect(familyMembers(names, 2)).toEqual([1, 2, 3]);
  });

  test("returns only the track itself when it has no number", () => {
    expect(familyMembers(names, 0)).toEqual([0]);
  });

  test("does not reach a same-prefix track separated by another family", () => {
    expect(familyMembers(names, 5)).toEqual([5]);
  });
});
