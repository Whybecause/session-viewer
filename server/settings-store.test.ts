import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS } from "./protocol.ts";
import { SettingsStore } from "./settings-store.ts";

const tempPath = async () => join(await mkdtemp(join(tmpdir(), "store-")), "settings.json");
const saved = async (path: string) => JSON.parse(await readFile(path, "utf8"));

describe("SettingsStore", () => {
  test("exposes the latest value immediately, before anything is written", async () => {
    const store = new SettingsStore(await tempPath(), DEFAULT_SETTINGS);
    store.set({ ...DEFAULT_SETTINGS, startScene: 9 });
    expect(store.current.startScene).toBe(9);
    await store.flush();
  });

  test("writes only the last value of a burst of changes", async () => {
    const path = await tempPath();
    const store = new SettingsStore(path, DEFAULT_SETTINGS, 20);
    for (let scene = 2; scene <= 6; scene++) store.set({ ...DEFAULT_SETTINGS, startScene: scene });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect((await saved(path)).startScene).toBe(6);
  });

  test("flush writes a pending change without waiting for the delay", async () => {
    const path = await tempPath();
    const store = new SettingsStore(path, DEFAULT_SETTINGS, 60_000);
    store.set({ ...DEFAULT_SETTINGS, hideScenesBefore: true });
    await store.flush();
    expect((await saved(path)).hideScenesBefore).toBe(true);
  });

  test("flush with nothing pending writes nothing", async () => {
    const path = await tempPath();
    await new SettingsStore(path, DEFAULT_SETTINGS).flush();
    expect(await readdir(join(path, ".."))).toEqual([]);
  });

  test("reports a failed write", async () => {
    const blocker = join(await mkdtemp(join(tmpdir(), "store-")), "a-file");
    await writeFile(blocker, "");
    const failures: Error[] = [];
    const store = new SettingsStore(join(blocker, "settings.json"), DEFAULT_SETTINGS, 5, (err) => failures.push(err));
    store.set({ ...DEFAULT_SETTINGS, startScene: 2 });
    await store.flush();
    expect(failures).toHaveLength(1);
  });

  test("keeps serving values after a failed write", async () => {
    const blocker = join(await mkdtemp(join(tmpdir(), "store-")), "a-file");
    await writeFile(blocker, "");
    const store = new SettingsStore(join(blocker, "settings.json"), DEFAULT_SETTINGS, 5);
    store.set({ ...DEFAULT_SETTINGS, startScene: 4 });
    await store.flush();
    expect(store.current.startScene).toBe(4);
  });
});
