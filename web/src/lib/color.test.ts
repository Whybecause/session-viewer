import { describe, expect, test } from "vitest";
import { RED_REPLACEMENT, contrastText, displayColor } from "./color.ts";

describe("contrastText", () => {
  test("uses dark text on a light background", () => {
    expect(contrastText("#ffff00")).toBe("#111");
  });
  test("uses white text on a dark background", () => {
    expect(contrastText("#112233")).toBe("#fff");
  });
  test("falls back to the page text color without a background", () => {
    expect(contrastText(null)).toBe("var(--text)");
  });
});

describe("displayColor", () => {
  test.each(["#e5484d", "#ff0000", "#c0392b", "#ff2a55"])("replaces the red-ish %s", (red) => {
    expect(displayColor(red)).toBe(RED_REPLACEMENT);
  });

  test.each(["#E8962E", "#4FA3E3", "#B98AF0", "#5FB3A6", "#9B86D6"])("keeps %s", (color) => {
    expect(displayColor(color)).toBe(color);
  });

  test("keeps greys and washed-out reds, which do not read as a recording", () => {
    expect(displayColor("#808080")).toBe("#808080");
    expect(displayColor("#b09090")).toBe("#b09090");
  });

  test("keeps an orange just past the red range", () => {
    expect(displayColor("#ff7a00")).toBe("#ff7a00");
  });
});
