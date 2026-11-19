/** Own-property lookup: a track named "constructor" or "__proto__" must not inherit an icon. */
export function iconFor(icons: Readonly<Record<string, string>>, trackName: string): string | undefined {
  return Object.hasOwn(icons, trackName) ? icons[trackName] : undefined;
}
