import { t } from "./i18n.ts";
import type { MusicianIssue } from "../../../server/musicians.ts";

/** The issues a musician's screen shows: their own, and the cue overlaps they are part of. */
export const issuesOf = (issues: readonly MusicianIssue[], name: string): MusicianIssue[] =>
  issues.filter((i) => (i.kind === "cue_overlap" ? i.musicians.includes(name) : "musician" in i && i.musician === name));

const TARGET_LABELS = { view: "settings.targetTab", cue: "settings.targetCue", rec: "settings.targetRecBar" } as const;

export function describeIssue(issue: MusicianIssue, musician: string): string {
  const target = t(TARGET_LABELS["target" in issue ? issue.target : "view"]);
  switch (issue.kind) {
    case "missing_bound":
      return t("settings.missingBound", { name: issue.name, target, bound: t(issue.bound === "first" ? "settings.boundStart" : "settings.boundEnd") });
    case "inverted":
      return t("settings.boundInverted", { target });
    case "duplicate_name":
      return t("settings.nameDuplicate", { name: issue.name });
    case "cue_overlap": {
      const other = issue.musicians.find((n) => n !== musician) ?? "";
      return t("settings.cueOverlap", { other });
    }
    case "control_missing_track":
      return t("settings.racksTrackMissing", { track: issue.track });
    case "control_conflict":
      return t("settings.racksConflict", { track: issue.track, owner: issue.owner });
    case "control_missing_rack":
      return t("settings.racksRackMissing", { rack: issue.rack, track: issue.track });
    case "unassigned":
      return "";
  }
}
