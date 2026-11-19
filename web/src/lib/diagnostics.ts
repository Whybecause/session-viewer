import { t } from "./i18n.ts";
import type { ControlsMessage, Musician, RecLengths, RecLengthWriter } from "../../../server/protocol.ts";

/** What the app can see is out of step between Live, ClyphX and its own settings (see docs/integrations.md). */
export type Diagnostic =
  | { kind: "rec_length_missing"; musician: string }
  | { kind: "rec_length_elsewhere"; script: string; dir: string | null }
  | { kind: "automation_overridden"; track: string; macros: string[] };

export function diagnostics(
  musicians: readonly Musician[],
  recLengths: RecLengths,
  writers: readonly RecLengthWriter[],
  controls: ControlsMessage | null,
  recLengthFiles: boolean,
): Diagnostic[] {
  // Without the record length setting nothing is expected to write those files: no warning to give.
  const elsewhere = recLengthFiles
    ? writers.filter((w) => !w.isOurs).map(({ script, dir }): Diagnostic => ({ kind: "rec_length_elsewhere", script, dir }))
    : [];
  const missing = recLengthFiles
    ? musicians
        .filter((m) => !Object.hasOwn(recLengths, m.name))
        .map(({ name }): Diagnostic => ({ kind: "rec_length_missing", musician: name }))
    : [];
  const overridden = Object.values(controls?.panels ?? {}).flatMap(({ track, macros }): Diagnostic[] => {
    const names = macros.filter((m) => m.overridden).map((m) => m.name);
    return names.length > 0 ? [{ kind: "automation_overridden", track, macros: names }] : [];
  });
  return [...elsewhere, ...missing, ...overridden];
}

export function describeDiagnostic(d: Diagnostic): string {
  switch (d.kind) {
    case "rec_length_elsewhere":
      return d.dir
        ? t("settings.recLengthWrittenElsewhere", { script: d.script, dir: d.dir })
        : t("settings.recLengthMissingLine", { script: d.script });
    case "rec_length_missing":
      return t("settings.recLengthNotReceived", { musician: d.musician });
    case "automation_overridden":
      return t("settings.automationSuspended", { track: d.track, macros: d.macros.join(", ") });
  }
}
