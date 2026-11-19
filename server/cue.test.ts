import { describe, expect, test } from "vitest";
import { cueSendIndexes } from "./cue.ts";
import type { Cue, Musician } from "./protocol.ts";

const NAMES = ["ALEX 1", "sax 1", "vocal 1", "BEN 1", "gtr 1", "DRUMS"];

const musician = (name: string, cue: Cue | null): Musician => ({ name, view: { first: NAMES[0], last: NAMES[5] }, cue });

describe("cueSendIndexes", () => {
  test("gives each track of a cue span the index of its send", () => {
    const musicians = [
      musician("ALEX", { send: "E", span: { first: "ALEX 1", last: "vocal 1" } }),
      musician("BEN", { send: "F", span: { first: "BEN 1", last: "gtr 1" } }),
    ];
    expect(cueSendIndexes(NAMES, musicians)).toEqual([4, 4, 4, 5, 5, null]);
  });

  test("leaves every track on solo without cues", () => {
    expect(cueSendIndexes(NAMES, [])).toEqual([null, null, null, null, null, null]);
    expect(cueSendIndexes(NAMES, [musician("ALEX", null)])).toEqual([null, null, null, null, null, null]);
  });

  test("ignores a span naming a missing track, or ending before it starts", () => {
    const musicians = [
      musician("ALEX", { send: "E", span: { first: "ALEX 1", last: "gone" } }),
      musician("BEN", { send: "F", span: { first: "gtr 1", last: "BEN 1" } }),
    ];
    expect(cueSendIndexes(NAMES, musicians)).toEqual([null, null, null, null, null, null]);
  });

  test("lets the first musician win where spans overlap", () => {
    const musicians = [
      musician("ALEX", { send: "A", span: { first: "ALEX 1", last: "vocal 1" } }),
      musician("ALL", { send: "B", span: { first: "ALEX 1", last: "DRUMS" } }),
    ];
    expect(cueSendIndexes(NAMES, musicians)).toEqual([0, 0, 0, 1, 1, 1]);
  });

  test("follows the view when the cue has no span of its own", () => {
    const alex: Musician = { name: "ALEX", view: { first: "sax 1", last: "vocal 1" }, cue: { send: "B", span: null } };
    expect(cueSendIndexes(NAMES, [alex])).toEqual([null, 1, 1, null, null, null]);
  });
});
