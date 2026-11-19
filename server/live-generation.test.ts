import { describe, expect, test } from "vitest";
import { keep } from "./live-generation.ts";

describe("keep", () => {
  test("hands a live subscription to the bucket", async () => {
    const bucket: (() => Promise<unknown>)[] = [];
    const remove = async () => true;
    await keep(() => true, Promise.resolve(remove), "x", bucket);
    expect(bucket).toEqual([remove]);
  });

  test("removes a subscription that lands after its generation was superseded", async () => {
    const bucket: (() => Promise<unknown>)[] = [];
    let removed = false;
    await keep(() => false, Promise.resolve(async () => (removed = true)), "x", bucket);
    expect(bucket).toEqual([]);
    expect(removed).toBe(true);
  });

  test("survives a listener Live refuses", async () => {
    const bucket: (() => Promise<unknown>)[] = [];
    await expect(keep(() => true, Promise.reject(new Error("no arm")), "x", bucket)).resolves.toBeUndefined();
  });
});
