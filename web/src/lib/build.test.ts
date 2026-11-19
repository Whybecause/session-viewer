import { describe, expect, test } from "vitest";
import { isOutdated } from "./build.ts";

describe("isOutdated", () => {
  test("is true when the server serves another build", () => {
    expect(isOutdated("/assets/index-old.js", "/assets/index-new.js", null)).toBe(true);
  });

  test("is false on the current build", () => {
    expect(isOutdated("/assets/index-new.js", "/assets/index-new.js", null)).toBe(false);
  });

  test("reloads only once per build, so a stale cache cannot loop", () => {
    expect(isOutdated("/assets/index-old.js", "/assets/index-new.js", "/assets/index-new.js")).toBe(false);
  });

  test("never reloads the dev server's page or without a build on the server", () => {
    expect(isOutdated("/src/main.ts", "/assets/index-new.js", null)).toBe(false);
    expect(isOutdated("/assets/index-old.js", null, null)).toBe(false);
  });
});
