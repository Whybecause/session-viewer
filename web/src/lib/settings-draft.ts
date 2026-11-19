import { t } from "./i18n.ts";
import type { DisplaySettings, DisplaySettingsPatch } from "../../../server/protocol.ts";

/** What the save bar holds back; concert mode is sent on its own, as soon as it is switched. */
export type SharedDraft = Omit<DisplaySettings, "locked">;

const FIELDS = ["startScene", "hideScenesBefore", "showArm", "signalSend", "recLengthFiles", "chainMacro", "musicians"] as const;

const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

/** The fields edited between the two snapshots; the musician list goes whole, as the server replaces it. */
export function settingsPatch(before: SharedDraft, after: SharedDraft): DisplaySettingsPatch {
  return Object.fromEntries(FIELDS.filter((key) => differs(before[key], after[key])).map((key) => [key, after[key]]));
}

/** For "N changements": each edited setting, and each musician added, removed or edited. */
export function changeCount(before: SharedDraft, after: SharedDraft): number {
  const scalars = FIELDS.filter((key) => key !== "musicians" && differs(before[key], after[key])).length;
  const slots = Math.max(before.musicians.length, after.musicians.length);
  const musicians = Array.from({ length: slots }, (_, i) => differs(before.musicians[i], after.musicians[i])).filter(Boolean);
  return scalars + musicians.length;
}

/** Why the server would refuse the draft, said in the user's terms; null when it can go. */
export function draftError({ startScene, musicians }: SharedDraft, sceneCount: number): string | null {
  if (!Number.isInteger(startScene) || startScene < 1 || startScene > sceneCount) return t("settings.pleaseChooseScene", { count: sceneCount });
  const names = musicians.map((m) => m.name.trim());
  if (names.some((n) => n === "")) return t("settings.everyMusicianNeedsName");
  const repeated = names.find((n, i) => names.indexOf(n) !== i);
  if (repeated) return t("settings.twoDuplicateNames", { name: repeated });
  for (const m of musicians) {
    const tracks = (m.controls ?? []).map((c) => c.track);
    const twice = tracks.find((t, i) => tracks.indexOf(t) !== i);
    if (twice) return t("settings.twoRacksOnTrack", { musician: m.name, track: twice });
  }
  return null;
}

/** Original name → current one, after `previous` was renamed `next`: a name renamed twice keeps its first name as key. */
export function withRename(renamed: ReadonlyMap<string, string>, previous: string, next: string): Map<string, string> {
  const original = [...renamed].find(([, current]) => current === previous)?.[0] ?? previous;
  return new Map([...renamed, [original, next]]);
}

/** Who "Je suis" points to once the renames are saved: the new name, or nobody when that name did not make it. */
export function myNameAfterSave(mine: string | null, renamed: ReadonlyMap<string, string>, saved: readonly string[]): string | null {
  if (mine === null || !renamed.has(mine)) return mine;
  const current = renamed.get(mine) as string;
  return saved.includes(current) ? current : null;
}

// The server refreshes these on its own (where a bound was last found): they must not tell a save apart from another.
const withoutPositions = (draft: Partial<SharedDraft>) =>
  draft.musicians
    ? { ...draft, musicians: draft.musicians.map(({ view: { first, last }, ...m }) => ({ ...m, view: { first, last } })) }
    : draft;

/** The saved settings hold everything sent: the save went through, rather than someone else's change arriving first. */
export function holds(saved: SharedDraft, sent: DisplaySettingsPatch): boolean {
  const keys = Object.keys(sent) as (keyof SharedDraft)[];
  const fields = (d: Partial<SharedDraft>) => withoutPositions(Object.fromEntries(keys.map((k) => [k, d[k]])));
  return !differs(fields(saved), fields(sent));
}
