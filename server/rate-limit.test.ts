import { describe, expect, test } from "vitest";
import { RateLimiter } from "./rate-limit.ts";

describe("RateLimiter", () => {
  test("allows up to the maximum within the window, then refuses", () => {
    const limiter = new RateLimiter(3, 1000, () => 0);
    expect([limiter.allow(), limiter.allow(), limiter.allow(), limiter.allow()]).toEqual([true, true, true, false]);
  });

  test("allows again once the oldest events leave the window", () => {
    let t = 0;
    const limiter = new RateLimiter(2, 1000, () => t);
    limiter.allow();
    t = 400;
    limiter.allow();
    t = 999;
    expect(limiter.allow()).toBe(false);
    t = 1000;
    expect(limiter.allow()).toBe(true);
  });

  test("does not count refused events against the budget", () => {
    let t = 0;
    const limiter = new RateLimiter(1, 1000, () => t);
    limiter.allow();
    for (t = 1; t < 1000; t += 100) limiter.allow();
    t = 1000;
    expect(limiter.allow()).toBe(true);
  });
});
