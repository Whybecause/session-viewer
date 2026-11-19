import { Ableton } from "ableton-js";

const ableton = new Ableton();
const t0 = Date.now();
const log = (...args: unknown[]) =>
  console.log(`[${((Date.now() - t0) / 1000).toFixed(2)}s]`, ...args);

async function main() {
  ableton.on("connect", (e) => log("connect", e));
  ableton.on("disconnect", (e) => log("disconnect", e));
  await ableton.start();
  log("connected");

  const [tracks, scenes] = await Promise.all([
    ableton.song.get("tracks"),
    ableton.song.get("scenes"),
  ]);
  log(`${tracks.length} tracks, ${scenes.length} scenes`);

  const [slotsPerTrack, armable] = await Promise.all([
    Promise.all(tracks.map((t) => t.get("clip_slots"))),
    Promise.all(tracks.map((t) => t.get("can_be_armed"))),
  ]);
  const filled = slotsPerTrack.flat().filter((s) => s.raw.has_clip);
  log(`${slotsPerTrack.flat().length} slots, ${filled.length} clips`);
  const liveHasClip = await Promise.all(slotsPerTrack.flat().map((s) => s.get("has_clip", false)));
  log(`cross-check has_clip via get: ${liveHasClip.filter(Boolean).length} clips`);

  const subscriptions: Promise<unknown>[] = [];
  tracks.forEach((track, ti) => {
    const name = track.raw.name;
    subscriptions.push(
      track.addListener("playing_slot_index", (v) => log(`T${ti} ${name} playing_slot_index=${v}`)),
      track.addListener("fired_slot_index", (v) => log(`T${ti} ${name} fired_slot_index=${v}`)),
    );
    if (armable[ti]) {
      subscriptions.push(track.addListener("arm", (v) => log(`T${ti} ${name} arm=${v}`)));
    }
    slotsPerTrack[ti].forEach((slot, si) => {
      subscriptions.push(slot.addListener("has_clip", (v) => log(`T${ti}S${si} has_clip=${v}`)));
    });
  });
  const clips = await Promise.all(filled.map((s) => s.get("clip")));
  clips.forEach((clip) => {
    if (!clip) return;
    subscriptions.push(
      clip.addListener("is_recording", (v) => log(`clip ${clip.raw.name} is_recording=${v}`)),
      clip.addListener("name", (v) => log(`clip renamed -> ${v}`)),
    );
  });
  subscriptions.push(
    ableton.song.addListener("tracks", (v) => log(`song.tracks changed (${v.length})`)),
    ableton.song.addListener("scenes", (v) => log(`song.scenes changed (${v.length})`)),
  );
  await Promise.all(subscriptions);
  log(`${subscriptions.length} listeners ready — play with Live, Ctrl+C to quit`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
