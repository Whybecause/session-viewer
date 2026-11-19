import { afterEach, describe, expect, test, vi } from "vitest";

const store = new Map<string, string>();

function fakeDocument(fullscreenEnabled: boolean) {
  const listeners: (() => void)[] = [];
  const doc = {
    fullscreenEnabled,
    fullscreenElement: null as object | null,
    documentElement: { requestFullscreen: vi.fn(() => Promise.resolve()) },
    exitFullscreen: vi.fn(() => Promise.resolve()),
    addEventListener: (_: string, listener: () => void) => listeners.push(listener),
    /** What the browser does on the back gesture or a screen lock. */
    leaveFullscreen() {
      doc.fullscreenElement = null;
      for (const listener of listeners) listener();
    },
  };
  return doc;
}

/** The module reads the platform once, at import: each test imports a fresh copy. */
async function load(fullscreenEnabled: boolean) {
  vi.resetModules();
  const doc = fakeDocument(fullscreenEnabled);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  return { doc, ...(await import("./fullscreen.svelte.ts")) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
});

describe("fullscreen with the fullscreen API (Android)", () => {
  test("asks for real fullscreen and hides the toolbar", async () => {
    const { doc, fullscreen, toggleFullscreen } = await load(true);
    toggleFullscreen();
    expect(fullscreen.on).toBe(true);
    expect(doc.documentElement.requestFullscreen).toHaveBeenCalledOnce();
  });

  test("brings the toolbar back when the browser leaves fullscreen by itself", async () => {
    const { doc, fullscreen, toggleFullscreen } = await load(true);
    toggleFullscreen();
    doc.leaveFullscreen();
    expect(fullscreen.on).toBe(false);
  });

  test("keeps the toolbar hidden when fullscreen is refused", async () => {
    const { doc, fullscreen, toggleFullscreen } = await load(true);
    doc.documentElement.requestFullscreen.mockReturnValueOnce(Promise.reject(new Error("denied")));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    toggleFullscreen();
    await Promise.resolve();
    expect(fullscreen.on).toBe(true);
  });

  test("is never restored from storage: real fullscreen needs a tap", async () => {
    store.set("session-viewer:fullscreen", "1");
    const { fullscreen } = await load(true);
    expect(fullscreen.on).toBe(false);
  });
});

describe("fullscreen without the API (iPhone)", () => {
  test("only hides the toolbar, and remembers it", async () => {
    const { doc, toggleFullscreen } = await load(false);
    toggleFullscreen();
    expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
    expect(store.get("session-viewer:fullscreen")).toBe("1");
    const reloaded = await load(false);
    expect(reloaded.fullscreen.on).toBe(true);
  });
});
