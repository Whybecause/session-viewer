import { mkdir, mkdtemp, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { RecLengths } from "./protocol.ts";
import { loadRecLengths, loadRecTakes, parseRecLength, parseRecTakes, watchRecLengths } from "./rec-lengths.ts";

const tempDir = () => mkdtemp(join(tmpdir(), "rec-length-"));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Same sequence as the ClyphX script: write a .tmp file, then rename it over the real one. */
async function writeAtomically(dir: string, musician: string, content: string) {
  const path = join(dir, `${musician}.json`);
  await writeFile(`${path}.tmp`, content);
  await rename(`${path}.tmp`, path);
}

describe("parseRecLength", () => {
  test("accepts whole bar counts and null for a free length", () => {
    expect(parseRecLength({ bars: 4 })).toBe(4);
    expect(parseRecLength({ bars: 1 })).toBe(1);
    expect(parseRecLength({ bars: null })).toBeNull();
  });

  test("rejects anything else", () => {
    for (const input of [{ bars: 0 }, { bars: 2.5 }, { bars: 65 }, { bars: "4" }, { bars: true }, {}, [4], null, 4]) {
      expect(parseRecLength(input)).toBeUndefined();
    }
  });
});

describe("loadRecLengths", () => {
  test("reads one value per musician file", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "ALEX.json"), '{"bars": 4}');
    await writeFile(join(dir, "BEN.json"), '{"bars": null}');
    expect(await loadRecLengths(dir)).toEqual({ ALEX: 4, BEN: null });
  });

  test("skips temporary, invalid and unrelated files", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "ALEX.json"), '{"bars": 2}');
    await writeFile(join(dir, "ALEX.json.tmp"), '{"bars": 8}');
    await writeFile(join(dir, "BEN.json"), "not json");
    await writeFile(join(dir, "CAM.json"), '{"bars": 3.5}');
    await writeFile(join(dir, "notes.txt"), "");
    expect(await loadRecLengths(dir)).toEqual({ ALEX: 2 });
  });

  test("reads files named like any musician, accents and case included", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "Ben.json"), '{"bars": 2}');
    await writeFile(join(dir, "Jean-Luc 2.json"), '{"bars": null}');
    await writeFile(join(dir, "Émile.json"), '{"bars": 8}');
    expect(await loadRecLengths(dir)).toEqual({ Ben: 2, "Jean-Luc 2": null, Émile: 8 });
  });

  test("never takes takes.json or a hidden file for a musician", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "takes.json"), '{"sax 1": 4}');
    await writeFile(join(dir, ".hidden.json"), '{"bars": 4}');
    expect(await loadRecLengths(dir)).toEqual({});
  });

  test("is empty when the folder does not exist yet", async () => {
    expect(await loadRecLengths(join(await tempDir(), "missing"))).toEqual({});
  });
});

describe("watchRecLengths", () => {
  // No count of reloads: under load, macOS spreads file events past any debounce.
  test("reports the latest value of a file replaced atomically", async () => {
    const dir = join(await tempDir(), "rec-length");
    const seen: RecLengths[] = [];
    const close = await watchRecLengths(dir, (value) => seen.push(value), 20);
    try {
      await writeAtomically(dir, "ALEX", '{"bars": 1}');
      await writeAtomically(dir, "ALEX", '{"bars": 2}');
      await wait(150);
      expect(seen.at(-1)).toEqual({ ALEX: 2 });

      await writeAtomically(dir, "ALEX", '{"bars": null}');
      await wait(150);
      expect(seen.at(-1)).toEqual({ ALEX: null });
    } finally {
      close();
    }
  });

  test("reports a file written before the watch started", async () => {
    const dir = join(await tempDir(), "rec-length");
    await mkdir(dir, { recursive: true });
    await writeAtomically(dir, "BEN", '{"bars": 8}');
    const seen: RecLengths[] = [];
    const close = await watchRecLengths(dir, (value) => seen.push(value), 20);
    try {
      await wait(150);
      expect(seen.at(-1)).toEqual({ BEN: 8 });
    } finally {
      close();
    }
  });
});

describe("rec takes", () => {
  test("keeps whole bar counts and drops the rest", () => {
    expect(parseRecTakes({ "sax 1": 4, "sax 2": 0, "sax 3": 2.5, "sax 4": "4", "vocal 1": 65 })).toEqual({ "sax 1": 4 });
    expect(parseRecTakes([4])).toEqual({});
    expect(parseRecTakes(null)).toEqual({});
  });

  test("loads takes.json, and an absent file means no takes", async () => {
    const dir = await tempDir();
    expect(await loadRecTakes(dir)).toEqual({});
    await writeFile(join(dir, "takes.json"), '{"ALEX 1": 2}');
    expect(await loadRecTakes(dir)).toEqual({ "ALEX 1": 2 });
  });

  test("hands the takes to the watcher with the lengths", async () => {
    const dir = await tempDir();
    const seen: [RecLengths, Record<string, number>][] = [];
    const close = await watchRecLengths(dir, (lengths, takes) => seen.push([lengths, takes]), 20);
    await writeAtomically(dir, "takes", '{"ALEX 1": 2}');
    await wait(150);
    close();
    expect(seen.at(-1)?.[1]).toEqual({ "ALEX 1": 2 });
  });

  test("takes.json is not read as a musician", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "takes.json"), '{"ALEX 1": 2}');
    expect(await loadRecLengths(dir)).toEqual({});
  });
});
