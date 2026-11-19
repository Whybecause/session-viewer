import { type FSWatcher, watch } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { RecLengths, RecTakes } from "./protocol.ts";
import { isRecord } from "./settings.ts";

const MAX_BARS = 64;
// Only the final files: the ClyphX script writes NAME.json.tmp, then renames it.
const FILE_NAME = /^([A-Z]+)\.json$/;
// Lowercase on purpose: FILE_NAME must never take it for a musician.
const TAKES_FILE = "takes.json";

/** Validates a file written by the ClyphX script; undefined when invalid. */
export function parseRecLength(input: unknown): number | null | undefined {
  if (!isRecord(input)) return undefined;
  const { bars } = input;
  if (bars === null) return null;
  return Number.isInteger(bars) && (bars as number) >= 1 && (bars as number) <= MAX_BARS ? (bars as number) : undefined;
}

/** Keeps the entries that are a track name with a whole bar count; the rest of a half-written or edited file is dropped. */
export function parseRecTakes(input: unknown): RecTakes {
  if (!isRecord(input)) return {};
  return Object.fromEntries(
    Object.entries(input).filter(([, bars]) => Number.isInteger(bars) && (bars as number) >= 1 && (bars as number) <= MAX_BARS),
  ) as RecTakes;
}

/** Bars each track's last ClyphX take was started with; empty when the script has not written the file. */
export async function loadRecTakes(dir: string): Promise<RecTakes> {
  try {
    return parseRecTakes(JSON.parse(await readFile(join(dir, TAKES_FILE), "utf8")));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`[rec-length] cannot read ${TAKES_FILE}:`, err);
    return {};
  }
}

/** One file per musician; a missing folder means nobody has set a length yet. */
export async function loadRecLengths(dir: string): Promise<RecLengths> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.warn("[rec-length] cannot list", dir, err);
    return {};
  }
  const entries = await Promise.all(
    names.map(async (name): Promise<[string, number | null] | null> => {
      const musician = FILE_NAME.exec(name)?.[1];
      if (!musician) return null;
      try {
        const bars = parseRecLength(JSON.parse(await readFile(join(dir, name), "utf8")));
        if (bars !== undefined) return [musician, bars];
        console.warn(`[rec-length] ignored invalid ${name}`);
      } catch (err) {
        // A file removed between readdir and readFile is not worth a warning.
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`[rec-length] cannot read ${name}:`, err);
      }
      return null;
    }),
  );
  return Object.fromEntries(entries.filter((e) => e !== null));
}

/**
 * Watches the folder, not the files: an atomic rename replaces the file a file watcher holds.
 * Reloads run one after the other so a slow read never overwrites a newer one.
 * Never throws: the viewer must start even when the folder cannot be created or watched.
 */
export async function watchRecLengths(
  dir: string,
  onChange: (recLengths: RecLengths, recTakes: RecTakes) => void,
  delayMs = 50,
): Promise<() => void> {
  let timer: NodeJS.Timeout | undefined;
  let loading = Promise.resolve();
  let watcher: FSWatcher;
  try {
    await mkdir(dir, { recursive: true });
    watcher = watch(dir, onEvent);
  } catch (err) {
    console.error("[rec-length] not watched, lengths will not update:", (err as Error).message);
    return () => undefined;
  }
  function onEvent() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      loading = loading
        .then(async () => {
          const [lengths, takes] = await Promise.all([loadRecLengths(dir), loadRecTakes(dir)]);
          onChange(lengths, takes);
        })
        .catch((err: Error) => console.error("[rec-length] reload failed:", err.message));
    }, delayMs);
  }
  watcher.on("error", (err) => console.error("[rec-length] watch failed:", err.message));
  // The caller's first load ran before the watch started: a file written in between would wait for the next change.
  onEvent();
  return () => {
    clearTimeout(timer);
    watcher.close();
  };
}
