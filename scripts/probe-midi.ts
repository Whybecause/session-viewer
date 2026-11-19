import { Ableton } from "ableton-js";
import type { Clip } from "ableton-js/ns/clip";
import type { ClipSlot } from "ableton-js/ns/clip-slot";
import { countNotes } from "../server/live-read.ts";

const MUSICIAN = process.argv[2];
if (!MUSICIAN) {
  console.error("Usage: npm run probe:midi <musician>");
  process.exit(1);
}
const TRACK_NAME = new RegExp(`^${MUSICIAN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\d+$`);
const SUMMARY_MS = 1000;

const ableton = new Ableton();
const t0 = Date.now();
const log = (...args: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(2)}s]`, ...args);

interface MeterStats {
  events: number;
  max: number;
}

const NOTES_POLL_MS = 1000;

function pollNotesWhileRecording(name: string, clip: Clip): void {
  const id = setInterval(async () => {
    if (!(await clip.get("is_recording"))) return clearInterval(id);
    log(`${name} during take: ${await countNotes(clip)} notes`);
  }, NOTES_POLL_MS);
}

async function watchClip(name: string, clip: Clip): Promise<void> {
  if (await clip.get("is_recording")) pollNotesWhileRecording(name, clip);
  await clip.addListener("is_recording", async (isRecording) => {
    log(`${name} clip is_recording=${isRecording}`);
    if (isRecording) return;
    log(`${name} take ended: ${await countNotes(clip)} notes`);
  });
  await clip.addListener("notes", (notes) => log(`${name} notes event: ${notes.length} notes`));
}

async function watchSlot(name: string, si: number, slot: ClipSlot): Promise<void> {
  const label = `${name} S${si}`;
  const attach = async () => {
    const clip = await slot.get("clip");
    if (clip) await watchClip(label, clip);
  };
  await slot.addListener("has_clip", (hasClip) => {
    log(`${label} has_clip=${hasClip}`);
    if (hasClip) void attach();
  });
  await attach();
}

async function main() {
  await ableton.start();
  const tracks = (await ableton.song.get("tracks")).filter((t) => TRACK_NAME.test(t.raw.name));
  if (tracks.length === 0) throw new Error(`no track named like "${MUSICIAN} 1"`);

  const stats = new Map<string, MeterStats>();
  for (const track of tracks) {
    const name = track.raw.name;
    const [hasMidiInput, arm] = await Promise.all([track.get("has_midi_input"), track.get("arm")]);
    log(`${name}: has_midi_input=${hasMidiInput} arm=${arm}`);
    stats.set(name, { events: 0, max: 0 });
    await track.addListener("input_meter_level", (level) => {
      const s = stats.get(name)!;
      stats.set(name, { events: s.events + 1, max: Math.max(s.max, level) });
    });
    await track.addListener("arm", (v) => log(`${name} arm=${v}`));
    await track.addListener("fired_slot_index", (v) => log(`${name} fired_slot_index=${v}`));
    const slots = await track.get("clip_slots");
    await Promise.all(slots.map((slot, si) => watchSlot(name, si, slot)));
  }

  setInterval(() => {
    const active = [...stats].filter(([, s]) => s.events > 0);
    if (active.length > 0) {
      log("meter/s", active.map(([n, s]) => `${n}: ${s.events} ev, max ${s.max.toFixed(3)}`).join(" | "));
    }
    stats.forEach((_, name) => stats.set(name, { events: 0, max: 0 }));
  }, SUMMARY_MS);

  log(`listening on ${tracks.map((t) => t.raw.name).join(", ")} — play on one channel, then record a take; Ctrl+C to quit`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
