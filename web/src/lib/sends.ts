import { t } from "./i18n.ts";
import { SEND_LETTERS } from "../../../server/protocol.ts";

/**
 * One choice per return track of the set, named after it ("Return H · FX GEN PRE"), after `none`. Every letter while
 * the set is unknown; a saved letter the set no longer has stays listed, flagged, so the select never shows a stray value.
 */
export function sendChoices(returns: readonly string[], none: string, saved = ""): { value: string; label: string }[] {
  const letters = returns.length > 0 ? SEND_LETTERS.slice(0, returns.length) : SEND_LETTERS;
  const choices = letters.map((letter, i) => ({ value: letter, label: sendLabel(letter, returns[i]) }));
  const isStray = saved !== "" && !letters.includes(saved);
  return [
    { value: "", label: none },
    ...(isStray ? [{ value: saved, label: t("settings.returnAbsent", { letter: saved }) }] : []),
    ...choices,
  ];
}

// Live prefixes a return's name with its letter ("H-FX GEN PRE"); the label already says it.
function sendLabel(letter: string, name: string | undefined): string {
  const bare = name?.startsWith(`${letter}-`) ? name.slice(letter.length + 1) : name;
  return bare ? t("settings.returnLabel", { letter, name: bare }) : t("settings.returnOnly", { letter });
}
