import { describe, expect, test } from "vitest";
import { isIcon } from "./icon.ts";

describe("isIcon", () => {
  test.each(["🎷", "🎸", "🎛️", "🧑‍🎤", "👍🏽", "🇫🇷", "1️⃣", "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "⚡"])("accepts the emoji %s", (icon) => {
    expect(isIcon(icon)).toBe(true);
  });

  test.each([
    ["an empty string", ""],
    ["a plain letter", "A"],
    ["markup", "<"],
    ["a word", "bass"],
    ["two emojis", "🎷🎸"],
    ["a leading space", " 🎷"],
    ["a zero-width space", "​"],
    ["a lone zero-width joiner", "‍"],
    ["a right-to-left override", "‮"],
    ["an emoji hidden behind a zero-width space", "​🎷"],
    ["an emoji followed by a right-to-left override", "🎷‮"],
    ["stacked accents", "à́̂̃̄"],
    ["a number", 42],
    ["null", null],
  ])("rejects %s", (_, icon) => {
    expect(isIcon(icon)).toBe(false);
  });
});
