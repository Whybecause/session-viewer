import { describe, expect, test } from "vitest";
import type { SlotView, TrackView } from "../../../server/protocol.ts";
import { formatBars, formatTakeBars, holdRecording, recTotalBars, recordingTracks, takeDetail } from "./recording.ts";

const slot = (state: SlotView["state"]): SlotView => ({ state, clipName: null });
const track = (name: string, slots: (SlotView | null)[]): TrackView => ({
  id: name,
  name,
  color: "#000000",
  volume: 0.85,
  solo: false,
  armed: true,
  muted: false,
  stopPending: false,
  slots,
});

describe("recordingTracks", () => {
  test("lists recording tracks, then pending ones, with their index", () => {
    const tracks = [
      track("ALEX 1", [slot("playing"), null]),
      track("ALEX 2", [null, slot("recording")]),
      track("sax 1", [slot("record_pending")]),
    ];
    expect(recordingTracks(tracks)).toEqual([
      { index: 1, name: "ALEX 2", isPending: false },
      { index: 2, name: "sax 1", isPending: true },
    ]);
  });

  test("carries how the take will end", () => {
    const fixed: SlotView = { ...slot("recording"), recEnd: "auto" };
    expect(recordingTracks([track("sax 2", [fixed])])).toEqual([
      { index: 0, name: "sax 2", isPending: false, recEnd: "auto" },
    ]);
  });

  test("carries a take that got no note, and says so in place of the bars", () => {
    const empty: SlotView = { ...slot("recording"), isEmpty: true };
    const [take] = recordingTracks([track("ALEX 1", [empty])]);
    expect(take).toEqual({ index: 0, name: "ALEX 1", isPending: false, isEmpty: true });
    expect(takeDetail(take, { recordedBars: 2 })).toBe("no notes received");
  });

  test("is empty when nothing records", () => {
    expect(recordingTracks([track("a", [slot("stopped")])])).toEqual([]);
  });
});

describe("holdRecording", () => {
  const sax = { index: 2, name: "sax 1", isPending: true };
  const alex = { index: 0, name: "ALEX 1", isPending: false };

  test("keeps a track that just left, so the gap before the take starts does not blink", () => {
    const pending = holdRecording([], [sax], 1000, 800);
    expect(holdRecording(pending, [], 1300, 800)).toEqual([{ ...sax, seenAt: 1000 }]);
  });

  test("drops it once the hold is over", () => {
    const pending = holdRecording([], [sax], 1000, 800);
    expect(holdRecording(pending, [], 1800, 800)).toEqual([]);
  });

  test("takes the current state of a track still listed, in track order", () => {
    const pending = holdRecording([], [sax], 1000, 800);
    expect(holdRecording(pending, [{ ...sax, isPending: false }, alex], 1100, 800)).toEqual([
      { ...alex, seenAt: 1100 },
      { ...sax, isPending: false, seenAt: 1100 },
    ]);
  });
});

describe("takeDetail", () => {
  test("counts the bars of a take, free or fixed-length", () => {
    expect(takeDetail({ isPending: false }, { recordedBars: 3 })).toBe("3 B");
    expect(takeDetail({ isPending: false, recEnd: "auto" }, { recordedBars: 3 })).toBe("3 B");
  });

  test("counts down to the end of a take once its stop is requested", () => {
    expect(takeDetail({ isPending: false, recEnd: "stopping" }, { recordedBars: 3, countdown: "2" })).toBe(
      "ending in 2",
    );
    expect(takeDetail({ isPending: false, recEnd: "stopping" }, undefined)).toBe("ending");
  });

  test("says nothing more while the take has not started", () => {
    expect(takeDetail({ isPending: true }, { countdown: "2" })).toBe("");
  });
});

describe("formatBars", () => {
  test("uses a decimal comma", () => {
    expect(formatBars(2.5)).toBe("2,5");
    expect(formatBars(8)).toBe("8");
  });

  test("stops at 999+ once the digits no longer fit a column", () => {
    expect(formatBars(999)).toBe("999");
    expect(formatBars(1000)).toBe("999+");
  });
});

describe("fixed-length take total", () => {
  const auto: SlotView = { state: "recording", clipName: null, recEnd: "auto" };

  test("is known only for a take that stops by itself", () => {
    expect(recTotalBars("auto", "sax 1", { "sax 1": 4 })).toBe(4);
    expect(recTotalBars(undefined, "sax 1", { "sax 1": 4 })).toBeUndefined();
    expect(recTotalBars("stopping", "sax 1", { "sax 1": 4 })).toBeUndefined();
    expect(recTotalBars("auto", "sax 2", { "sax 1": 4 })).toBeUndefined();
    expect(recTotalBars("auto", "constructor", {})).toBeUndefined();
  });

  test("goes from the file to the take, then to the detail", () => {
    const [take] = recordingTracks([track("sax 1", [auto])], { "sax 1": 4 });
    expect(take?.totalBars).toBe(4);
    expect(takeDetail(take!, { recordedBars: 2 })).toBe("2/4 B");
  });

  test("never reads past the total", () => {
    expect(formatTakeBars(5, 4)).toBe("4/4");
    expect(formatTakeBars(3)).toBe("3");
  });
});
