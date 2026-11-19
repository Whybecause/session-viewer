import { describe, expect, test } from "vitest";
import { ICON_PRESETS } from "./icon-presets.ts";
import { iconShape } from "./icon-shapes.ts";

describe("iconShape", () => {
  test.each(ICON_PRESETS.map(([icon, label]) => [label, icon]))("draws the %s preset", (_, icon) => {
    expect(iconShape(icon)).toMatch(/^M[\d. -]/);
  });

  test("leaves an emoji of the user's own to be shown as text", () => {
    expect(iconShape("🦆")).toBeUndefined();
  });

  test("does not hand out inherited properties", () => {
    expect(iconShape("constructor")).toBeUndefined();
    expect(iconShape("__proto__")).toBeUndefined();
  });
});
