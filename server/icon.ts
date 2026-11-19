const MAX_ICON_LENGTH = 32;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const KEYCAP = /^[#*0-9]️?⃣$/u;
const FLAG = /^\p{Regional_Indicator}{2}$/u;
// One pictograph with its own modifiers, optionally joined to others (🧑‍🎤); tags build subdivision flags (🏴󠁧󠁢󠁥󠁮󠁧󠁿).
const PICTOGRAPH =
  /^\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|[\u{E0020}-\u{E007F}])*(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})*)*$/u;

/** Exactly one emoji: never free text, invisible, bidi-control or stacked-accent characters. */
export function isIcon(icon: unknown): icon is string {
  if (typeof icon !== "string" || icon.length === 0 || icon.length > MAX_ICON_LENGTH) return false;
  if ([...graphemes.segment(icon)].length !== 1) return false;
  return PICTOGRAPH.test(icon) || KEYCAP.test(icon) || FLAG.test(icon);
}
