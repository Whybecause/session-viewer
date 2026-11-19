import { afterEach, describe, expect, test, vi } from "vitest";

const store = new Map<string, string>();

async function load() {
  vi.resetModules();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  return import("./rec-bar.svelte.ts");
}

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
});

describe("recBar", () => {
  test("is shown by default", async () => {
    expect((await load()).recBar.shown).toBe(true);
  });

  test("remembers being hidden on this device, and being shown again", async () => {
    (await load()).setRecBarShown(false);
    expect((await load()).recBar.shown).toBe(false);
    (await load()).setRecBarShown(true);
    expect((await load()).recBar.shown).toBe(true);
  });
});
