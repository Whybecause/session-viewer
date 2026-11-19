import type { Musician } from "../../../server/protocol.ts";
import { recSpan, spanIndexes } from "../../../server/musicians.ts";
import type { ViewSpan } from "./family-view.ts";
import { t } from "./i18n.ts";

export const formatRecLength = (bars: number | null): string => (bars === null ? t("grid.recLengthFree") : `${bars} B`);

/** The tracks a musician's record switches drive; null when the span no longer matches the set, as a guess would put the label over the wrong tracks. */
export function recLengthSpan(names: readonly string[], musician: Pick<Musician, "view" | "rec">): ViewSpan | null {
  const span = spanIndexes(names, recSpan(musician));
  return span && { start: span.start, count: span.end - span.start + 1 };
}
