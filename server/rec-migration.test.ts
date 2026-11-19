import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS, SETTINGS_VERSION, type Musician, type Settings } from "./protocol.ts";
import { migrateRecSpans } from "./rec-migration.ts";

const NAMES = ["CAM 1", "ALEX 1", "ALEX 2", "sax 1", "sax 2", "vocal 1", "BEN 1"];
const alex: Musician = { name: "ALEX", view: { first: "ALEX 1", last: "vocal 1" }, cue: null };
const v1 = (musicians: Musician[]): Settings => ({ ...DEFAULT_SETTINGS, version: 1, musicians });

describe("migrateRecSpans", () => {
  test("writes down the view past the musician's own numbered tracks", () => {
    const migrated = migrateRecSpans(NAMES, v1([alex]));
    expect(migrated?.musicians[0].rec).toEqual({ first: "sax 1", last: "vocal 1" });
    expect(migrated?.version).toBe(SETTINGS_VERSION);
  });

  test("writes the whole view for a musician without numbered tracks", () => {
    const guest = { ...alex, name: "Guest" };
    expect(migrateRecSpans(NAMES, v1([guest]))?.musicians[0].rec).toEqual(guest.view);
  });

  test("keeps a saved rec span", () => {
    const rec = { first: "ALEX 1", last: "sax 1" };
    expect(migrateRecSpans(NAMES, v1([{ ...alex, rec }]))?.musicians[0].rec).toBe(rec);
  });

  test("leaves a span it cannot place, or one with only numbered tracks, following the view", () => {
    const gone = { ...alex, view: { first: "ALEX 1", last: "gone" } };
    const numbered = { ...alex, view: { first: "ALEX 1", last: "ALEX 2" } };
    const migrated = migrateRecSpans(NAMES, v1([gone, numbered]));
    expect(migrated?.musicians.map((m) => m.rec)).toEqual([undefined, undefined]);
  });

  test("runs once, and only with the set's tracks known", () => {
    expect(migrateRecSpans(NAMES, { ...DEFAULT_SETTINGS, musicians: [alex] })).toBeNull();
    expect(migrateRecSpans([], v1([alex]))).toBeNull();
  });
});
