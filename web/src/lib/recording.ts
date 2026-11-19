import type { RecEnd, RecTakes, TrackTime, TrackView } from "../../../server/protocol.ts";
import { t } from "./i18n.ts";

export interface RecordingTrack {
  index: number;
  name: string;
  isPending: boolean;
  recEnd?: RecEnd;
  /** Bars the take was started with; only known for a fixed-length take. */
  totalBars?: number;
  /** No note reached the take: shown even when its column is on screen. */
  isEmpty?: true;
}

/**
 * Tracks recording now or about to, so everyone sees a take is running without watching its column.
 * Takes only the tracks, which change rarely: the bar count comes from the 10-per-second time messages at render.
 */
export function recordingTracks(tracks: readonly TrackView[], recTakes: RecTakes = {}): RecordingTrack[] {
  return tracks.flatMap((track, index): RecordingTrack[] => {
    const states = track.slots.map((s) => s?.state);
    const take = track.slots.find((s) => s?.state === "recording");
    if (take) {
      const totalBars = recTotalBars(take.recEnd, track.name, recTakes);
      return [{ index, name: track.name, isPending: false, recEnd: take.recEnd, isEmpty: take.isEmpty, totalBars }];
    }
    if (states.includes("record_pending")) return [{ index, name: track.name, isPending: true }];
    return [];
  });
}

/** Only a take that stops by itself has a known end: the file keeps the last length asked for, which a free take ignores. */
export const recTotalBars = (recEnd: RecEnd | undefined, trackName: string, recTakes: RecTakes): number | undefined =>
  recEnd === "auto" && Object.hasOwn(recTakes, trackName) ? recTakes[trackName] : undefined;

/** The bar position can read one past the end for a tick before Live flips the clip to playing. */
export const cappedBar = (recordedBars: number, totalBars?: number): number =>
  totalBars ? Math.min(recordedBars, totalBars) : recordedBars;

/** "2/4" once the end is known, "2" otherwise. */
export const formatTakeBars = (recordedBars: number, totalBars?: number): string =>
  totalBars ? `${formatBars(cappedBar(recordedBars, totalBars))}/${formatBars(totalBars)}` : formatBars(recordedBars);

export interface HeldRecordingTrack extends RecordingTrack {
  seenAt: number;
}

/**
 * Keeps a track listed for holdMs after it leaves: when a take starts, Live creates the clip a moment before
 * flagging it as recording, and the track would drop out of the list in between.
 */
export function holdRecording(
  previous: readonly HeldRecordingTrack[],
  current: readonly RecordingTrack[],
  now: number,
  holdMs: number,
): HeldRecordingTrack[] {
  const live = current.map((t) => ({ ...t, seenAt: now }));
  const kept = previous.filter((p) => now - p.seenAt < holdMs && !current.some((t) => t.index === p.index));
  return [...live, ...kept].sort((a, b) => a.index - b.index);
}

/** What follows the track name: the bars taken so far, or the countdown to the end once a stop is requested. */
export function takeDetail(
  take: Pick<RecordingTrack, "isPending" | "recEnd" | "isEmpty" | "totalBars">,
  time: TrackTime | undefined,
): string {
  if (take.isPending) return "";
  if (take.isEmpty) return t("grid.recordingNoNotes");
  if (take.recEnd === "stopping") return time?.countdown ? t("grid.slotCountdownEnd", { countdown: time.countdown }) : t("grid.recordingEnd");
  return time?.recordedBars ? `${formatTakeBars(time.recordedBars, take.totalBars)} B` : "";
}

const MAX_BARS_SHOWN = 999;

/** "8", "2,5": bars as French musicians write them; past 999 a column no longer fits the digits. */
export const formatBars = (bars: number): string =>
  bars > MAX_BARS_SHOWN ? `${MAX_BARS_SHOWN}+` : String(bars).replace(".", ",");
