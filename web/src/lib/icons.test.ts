import { describe, expect, test } from "vitest";
import { iconFor } from "./icons.ts";
import { ICON_PRESETS } from "./icon-presets.ts";
import { isIcon } from "../../../server/icon.ts";

describe("iconFor", () => {
  test("returns the icon of a named track", () => {
    expect(iconFor({ "sax 1": "🎷" }, "sax 1")).toBe("🎷");
  });
  test("returns undefined for an unknown track", () => {
    expect(iconFor({}, "sax 1")).toBeUndefined();
  });
  test.each(["constructor", "toString", "__proto__"])("does not inherit an icon for a track named %s", (name) => {
    expect(iconFor({}, name)).toBeUndefined();
  });
});

describe("ICON_PRESETS", () => {
  test("every preset is accepted by the server", () => {
    for (const [icon] of ICON_PRESETS) expect(isIcon(icon), icon).toBe(true);
  });
  test("has no duplicate icon", () => {
    expect(new Set(ICON_PRESETS.map(([icon]) => icon)).size).toBe(ICON_PRESETS.length);
  });
});
