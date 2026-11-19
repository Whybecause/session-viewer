import { describe, expect, test } from "vitest";
import { sendChoices } from "./sends.ts";

describe("sendChoices", () => {
  test("names each return of the set, without the letter Live puts in front", () => {
    expect(sendChoices(["A-Reverb", "Delay"], "None")).toEqual([
      { value: "", label: "None" },
      { value: "A", label: "Return A · Reverb" },
      { value: "B", label: "Return B · Delay" },
    ]);
  });

  test("offers every letter while the set is unknown", () => {
    expect(sendChoices([], "None").map((c) => c.value)).toEqual(["", ..."ABCDEFGHIJKL"]);
  });

  test("keeps a saved letter the set no longer has, flagged", () => {
    expect(sendChoices(["A-Reverb"], "None", "H")[1]).toEqual({ value: "H", label: "Return H (missing)" });
  });
});
