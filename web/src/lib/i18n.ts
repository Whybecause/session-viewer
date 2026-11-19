import * as common from "./i18n/common.ts";
import * as grid from "./i18n/grid.ts";
import * as icons from "./i18n/icons.ts";
import * as musician from "./i18n/musician.ts";
import * as settings from "./i18n/settings.ts";

export type Lang = "en" | "fr";

const english = { ...common.en, ...grid.en, ...icons.en, ...musician.en, ...settings.en };
export type MessageKey = keyof typeof english;
const french: Record<MessageKey, string> = { ...common.fr, ...grid.fr, ...icons.fr, ...musician.fr, ...settings.fr };
const dictionaries: Record<Lang, Record<MessageKey, string>> = { en: english, fr: french };

/** The first requested language the app speaks; English when none. */
export function pickLang(requested: readonly (string | null | undefined)[]): Lang {
  for (const tag of requested) {
    const language = tag?.toLowerCase().split("-")[0];
    if (language === "fr" || language === "en") return language;
  }
  return "en";
}

// ?lang=fr wins over the phone's languages: handy for screenshots and for support.
const fromUrl = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("lang");
const fromPhone = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]);

export let lang: Lang = pickLang([fromUrl, ...fromPhone]);

/** For tests: the language otherwise comes from the phone, and a test must not depend on it. */
export function setLang(next: Lang): void {
  lang = next;
}

type Params = Record<string, string | number>;

const fill = (text: string, params: Params | undefined): string =>
  params ? text.replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in params ? String(params[name]) : placeholder)) : text;

/** The text for a key, with each {name} replaced by its param. */
export function t(key: MessageKey, params?: Params): string {
  return fill(dictionaries[lang][key], params);
}

type OneKey<K> = K extends `${infer Base}_one` ? Base : never;
export type PluralKey = OneKey<MessageKey>;

/** "1 track" / "3 tracks": picks `<base>_one` or `<base>_other` by the language's plural rules; {count} is filled in. */
export function plural(base: PluralKey, count: number, params?: Params): string {
  const form = new Intl.PluralRules(lang).select(count);
  const key = `${base}_${form === "one" ? "one" : "other"}` as MessageKey;
  return fill(dictionaries[lang][key], { ...params, count });
}
