import { describe, expect, test } from "vitest";
import { qrPath } from "./qr.ts";

describe("qrPath", () => {
  test("draws a square code with its finder patterns", () => {
    const { size, path } = qrPath("http://192.168.1.23:3000");
    expect(size).toBeGreaterThanOrEqual(21);
    // The top-left finder pattern starts on the first module.
    expect(path.startsWith("M0 0h1v1h-1z")).toBe(true);
  });
});
