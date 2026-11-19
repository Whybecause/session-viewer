import { afterEach, describe, expect, test, vi } from "vitest";
import { readStored, writeStored } from "./stored.ts";

afterEach(() => vi.unstubAllGlobals());

describe("stored", () => {
  test("writes, reads back and forgets a value", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    writeStored("k", "v");
    expect(readStored("k")).toBe("v");
    writeStored("k", null);
    expect(readStored("k")).toBeNull();
  });

  test("never throws when storage is blocked", () => {
    const blocked = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(readStored("k")).toBeNull();
    expect(() => writeStored("k", "v")).not.toThrow();
  });
});
