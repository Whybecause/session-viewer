import type { StateMessage, TrackView, TracksMessage } from "../../../server/protocol.ts";

export function applyTrackUpdates(current: StateMessage, { updates }: TracksMessage): StateMessage {
  const byIndex = new Map(updates.map((u) => [u.index, u]));
  const apply = (track: TrackView, i: number): TrackView => {
    const update = byIndex.get(i);
    if (!update) return track;
    return "track" in update ? update.track : { ...track, volume: update.volume };
  };
  return { ...current, session: { ...current.session, tracks: current.session.tracks.map(apply) } };
}
