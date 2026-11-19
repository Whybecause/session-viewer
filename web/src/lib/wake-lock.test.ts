import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { holdWakeLock } from "./wake-lock.ts";

class FakeLock {
  released = false;
  release = vi.fn(async () => {
    this.released = true;
  });
}

let visibility: "visible" | "hidden";
let doc: EventTarget & { visibilityState: string };
let locks: FakeLock[];
const request = vi.fn(async () => {
  const lock = new FakeLock();
  locks.push(lock);
  return lock;
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const changeVisibility = (state: "visible" | "hidden") => {
  visibility = state;
  doc.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  visibility = "visible";
  locks = [];
  request.mockClear();
  doc = new EventTarget() as typeof doc;
  Object.defineProperty(doc, "visibilityState", { get: () => visibility });
  vi.stubGlobal("navigator", { wakeLock: { request } });
  vi.stubGlobal("document", doc);
});

afterEach(() => vi.unstubAllGlobals());

describe("holdWakeLock", () => {
  test("asks for the screen lock right away", async () => {
    const release = holdWakeLock();
    await flush();
    expect(request).toHaveBeenCalledWith("screen");
    release();
  });

  test("asks again when the page comes back after the browser dropped the lock", async () => {
    const release = holdWakeLock();
    await flush();
    locks[0].released = true;
    changeVisibility("hidden");
    changeVisibility("visible");
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    release();
  });

  test("does not ask while the page is hidden, nor twice for a lock still held", async () => {
    visibility = "hidden";
    const release = holdWakeLock();
    await flush();
    expect(request).not.toHaveBeenCalled();
    changeVisibility("visible");
    changeVisibility("visible");
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    release();
  });

  test("releases the lock and stops listening once released", async () => {
    const release = holdWakeLock();
    await flush();
    release();
    expect(locks[0].release).toHaveBeenCalled();
    locks[0].released = true;
    changeVisibility("visible");
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  describe("where the browser has no wake lock", () => {
    const play = vi.fn(async () => undefined);
    const remove = vi.fn();
    let video: { muted: boolean; loop: boolean; playsInline: boolean; src: string; style: object; play: typeof play; remove: typeof remove; setAttribute: () => void };

    beforeEach(() => {
      play.mockClear();
      remove.mockClear();
      video = { muted: false, loop: false, playsInline: false, src: "", style: {}, play, remove, setAttribute: () => undefined };
      vi.stubGlobal("navigator", {});
      Object.assign(doc, { createElement: () => video, body: { append: vi.fn() } });
    });

    test("plays a muted looping video, and again when the page comes back", () => {
      const release = holdWakeLock();
      expect(video).toMatchObject({ src: "/keep-awake.mp4", muted: true, loop: true, playsInline: true });
      expect(play).toHaveBeenCalledTimes(1);
      changeVisibility("hidden");
      changeVisibility("visible");
      expect(play).toHaveBeenCalledTimes(2);
      release();
    });

    test("tries again on the first touch, the gesture browsers require", () => {
      const release = holdWakeLock();
      doc.dispatchEvent(new Event("pointerdown"));
      expect(play).toHaveBeenCalledTimes(2);
      release();
    });

    test("removes the video and stops listening once released", () => {
      holdWakeLock()();
      expect(remove).toHaveBeenCalled();
      changeVisibility("visible");
      expect(play).toHaveBeenCalledTimes(1);
    });

    test("stays quiet when play is refused before the first touch", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      play.mockRejectedValueOnce(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
      holdWakeLock()();
      await flush();
      expect(warn).not.toHaveBeenCalled();
    });

    test("warns when the video cannot play for another reason", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      play.mockRejectedValueOnce(Object.assign(new Error("bad source"), { name: "NotSupportedError" }));
      holdWakeLock()();
      await flush();
      expect(warn).toHaveBeenCalled();
    });
  });

  test("survives a refused request", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    request.mockRejectedValueOnce(new Error("low battery"));
    holdWakeLock()();
    await flush();
    expect(warn).toHaveBeenCalled();
  });
});
