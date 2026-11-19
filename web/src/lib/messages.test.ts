import { describe, expect, test } from "vitest";
import type { StateMessage, TrackView } from "../../../server/protocol.ts";
import { applyTrackUpdates } from "./messages.ts";

const track = (id: string, volume = 0.5): TrackView => ({
  id,
  name: id,
  color: "#000000",
  volume,
  solo: false,
  armed: false,
  muted: false,
  stopPending: false,
  slots: [],
});
const state: StateMessage = {
  type: "state",
  liveConnected: true,
  session: { tracks: [track("a"), track("b"), track("c")], scenes: [], selectedScene: -1, returns: [] },
};

describe("applyTrackUpdates", () => {
  test("replaces only the updated tracks and keeps the others by reference", () => {
    const next = applyTrackUpdates(state, { type: "tracks", updates: [{ index: 1, track: track("b", 0.9) }] });
    expect(next.session.tracks[1].volume).toBe(0.9);
    expect(next.session.tracks[0]).toBe(state.session.tracks[0]);
    expect(next.session.tracks[2]).toBe(state.session.tracks[2]);
    expect(next.session.scenes).toBe(state.session.scenes);
  });

  test("patches a volume-only update and keeps the slots by reference", () => {
    const next = applyTrackUpdates(state, { type: "tracks", updates: [{ index: 2, volume: 0.1 }] });
    expect(next.session.tracks[2]).toEqual({ ...state.session.tracks[2], volume: 0.1 });
    expect(next.session.tracks[2].slots).toBe(state.session.tracks[2].slots);
  });

  test("never mutates the previous state", () => {
    applyTrackUpdates(state, { type: "tracks", updates: [{ index: 0, track: track("a", 1) }] });
    expect(state.session.tracks[0].volume).toBe(0.5);
  });

  test("ignores an index beyond the track list", () => {
    const next = applyTrackUpdates(state, { type: "tracks", updates: [{ index: 9, track: track("z") }] });
    expect(next.session.tracks).toHaveLength(3);
  });
});
