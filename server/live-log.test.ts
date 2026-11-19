import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { warnLive } from "./live-log.ts";

describe("warnLive", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("prints other errors as they come", () => {
    const log = vi.fn();
    warnLive("devices bass 1 not read", new Error("boom"), log);
    expect(log).toHaveBeenCalledWith("[live] devices bass 1 not read: boom");
  });

  test("sums up a burst of timeouts in two lines", () => {
    const log = vi.fn();
    for (let i = 0; i < 500; i++) warnLive(`devices track ${i} not read`, new Error("The command timed out after 3000 ms."), log);
    expect(log).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenLastCalledWith("[live] 500 requests to Live timed out, the last one: devices track 499 not read");
  });
});
