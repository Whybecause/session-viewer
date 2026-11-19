/** Black or white, whichever reads best on the given background. */
export function contrastText(hex: string | null): string {
  if (!hex) return "var(--text)";
  const n = parseInt(hex.slice(1), 16);
  const luminance = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luminance > 0.6 ? "#111" : "#fff";
}

/** Red means "recording": a track in a red-ish colour is shown in this one instead. */
export const RED_REPLACEMENT = "#9B86D6";
const RED_HUE_RANGE = 20;
const RED_MIN_SATURATION = 0.4;

/** The colour a track is drawn in. */
export function displayColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  if (saturation <= RED_MIN_SATURATION) return hex;
  const hue = (max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60;
  return hue <= RED_HUE_RANGE || hue >= 360 - RED_HUE_RANGE ? RED_REPLACEMENT : hex;
}
