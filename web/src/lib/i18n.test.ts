import { afterEach, describe, expect, test } from "vitest";
import { pickLang, plural, setLang, t } from "./i18n.ts";
import * as common from "./i18n/common.ts";
import * as grid from "./i18n/grid.ts";
import * as icons from "./i18n/icons.ts";
import * as musician from "./i18n/musician.ts";
import * as settings from "./i18n/settings.ts";

afterEach(() => setLang("en"));

describe("pickLang", () => {
  test("takes the first requested language the app speaks", () => {
    expect(pickLang(["de-DE", "fr-CA", "en-US"])).toBe("fr");
    expect(pickLang(["EN-gb", "fr"])).toBe("en");
  });

  test("falls back to English when none is spoken", () => {
    expect(pickLang([])).toBe("en");
    expect(pickLang(["de", "ja-JP"])).toBe("en");
    expect(pickLang([null, undefined, ""])).toBe("en");
  });
});

describe("t", () => {
  test("speaks the current language", () => {
    expect(t("common.cancel")).toBe("Cancel");
    setLang("fr");
    expect(t("common.cancel")).toBe("Annuler");
  });
});

describe("messages", () => {
  const areas = { common, grid, icons, musician, settings };
  const placeholders = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();

  test.each(Object.entries(areas))("%s: both languages take the same parameters", (_, { en, fr }) => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(fr[key]), key).toEqual(placeholders(en[key]));
    }
  });

  test.each(Object.entries(areas))("%s: every plural form shows its {count}", (_, { en, fr }) => {
    const pluralKeys = Object.keys(en).filter((key) => /_(one|other)$/.test(key)) as (keyof typeof en)[];
    for (const key of pluralKeys) {
      expect(en[key], key).toContain("{count}");
      expect(fr[key], key).toContain("{count}");
    }
  });
});

describe("plural", () => {
  test("picks the form of the current language and fills {count}", () => {
    expect(plural("settings.trackCount", 1)).toBe("1 track");
    expect(plural("settings.trackCount", 3)).toBe("3 tracks");
    setLang("fr");
    expect(plural("settings.trackCount", 1)).toBe("1 piste");
    expect(plural("settings.trackCount", 3)).toBe("3 pistes");
  });

  test("French counts zero as singular, English as plural", () => {
    expect(plural("settings.trackCount", 0)).toBe("0 tracks");
    setLang("fr");
    expect(plural("settings.trackCount", 0)).toBe("0 piste");
  });
});

describe("t with parameters", () => {
  test("fills each {name} and leaves an unknown one visible", () => {
    expect(t("settings.twoDuplicateNames", { name: "ALEX" })).toBe("Two musicians are called “ALEX”.");
    expect(t("settings.twoDuplicateNames")).toBe("Two musicians are called “{name}”.");
  });

  test("keeps the word order of each language", () => {
    expect(t("settings.missingBound", { name: "X", bound: t("settings.boundStart"), target: t("settings.targetTab") })).toBe(
      "“X” not found in the set (start of the tab).",
    );
    setLang("fr");
    expect(t("settings.missingBound", { name: "X", bound: t("settings.boundStart"), target: t("settings.targetTab") })).toBe(
      "« X » est introuvable dans le set (début de l'onglet).",
    );
  });
});
