import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LiveWatch, OnChange, SettingsHooks } from "./ableton.ts";
import { DEFAULT_SETTINGS, type MacroView, type Musician, type Settings } from "./protocol.ts";
import type { ClipModel, SessionModel, TrackModel } from "./session-state.ts";
import type { ClipPosition, SongTiming } from "./timing.ts";

// A made-up set for trying the app without Live (`npm run demo`) and for the README screenshots.
const TEMPO = 104;
const SIGNATURE = { numerator: 4, denominator: 4 };
const BEATS_PER_BAR = 4;
const RECORDING_TRACK = "sax 2";

const clip = (name: string, lengthBars = 4): ClipModel => ({ name, isRecording: false, lengthBars });

interface TrackSpec {
  name: string;
  color: string;
  clips: (ClipModel | null)[];
  playingSlot?: number;
  firedSlot?: number;
  armed?: boolean;
  extra?: Partial<TrackModel>;
}

const CHAINS = ["Warm pad", "Wide pad", "Glass"];

const TRACKS: TrackSpec[] = [
  {
    name: "ALEX 1",
    color: "#ff7a6b",
    clips: [clip("Pad"), clip('[CHAIN_2] "ALEX 1"/DEV("ALEX 1") B2 P8 2'), null, clip("Pad swell", 8), null, null],
    playingSlot: 1,
    extra: { racks: ["ALEX 1"], rackChains: { "ALEX 1": CHAINS }, chain: { number: 2, name: "Wide pad" } },
  },
  { name: "ALEX 2", color: "#ff7a6b", clips: [null, clip("Arp"), clip("Arp up"), null, clip("Arp 2"), null], playingSlot: 1 },
  { name: "sax 1", color: "#f4b942", clips: [clip("Melody", 8), clip("Melody b", 8), null, clip("Solo", 16), null, null], playingSlot: 1 },
  {
    name: RECORDING_TRACK,
    color: "#f4b942",
    clips: [null, null, null, { name: "", isRecording: true }, null, null],
    playingSlot: 3,
    firedSlot: 3,
    armed: true,
  },
  { name: "BEN 1", color: "#4ea8de", clips: [clip("Chords"), clip("Chords b"), clip("Stabs"), null, null, null], playingSlot: 0 },
  { name: "gtr 1", color: "#5ec8a0", clips: [null, clip("Riff"), clip("Riff 2"), clip("Riff 3"), null, null], playingSlot: 2, extra: { overdub: true } },
  { name: "gtr 2", color: "#5ec8a0", clips: [null, null, clip("Lead", 8), null, clip("Lead 2", 8), null] },
  { name: "CAM 1", color: "#b084f5", clips: [clip("Bass"), clip("Bass"), clip("Bass 2"), clip("Bass 3"), null, null], playingSlot: 1 },
  { name: "CAM 2", color: "#b084f5", clips: [null, null, clip("Sub"), null, null, null], extra: { fx: true } },
  {
    name: "DRUMS",
    color: "#d9d9d9",
    clips: [clip("Beat", 2), clip("Beat", 2), clip("Fill", 1), clip("Beat 2", 2), clip("Break", 2), null],
    playingSlot: 1,
    firedSlot: 2,
  },
];

const SCENES = ["Intro", "Verse", "Chorus", "Bridge", "Solo", "Outro"].map((name, i) => ({ id: `scene-${i}`, name }));

const toTrack = ({ name, color, clips, playingSlot = -1, firedSlot = -1, armed = false, extra }: TrackSpec, i: number): TrackModel => ({
  id: `track-${i}`,
  name,
  color,
  armed,
  muted: false,
  solo: false,
  volume: 0.85,
  playingSlot,
  firedSlot,
  clips,
  ...extra,
});

const MODEL: SessionModel = {
  tracks: TRACKS.map(toTrack),
  scenes: SCENES,
  selectedScene: 1,
  returns: ["A-REVERB", "B-DELAY", "C-ALEX", "D-BEN", "E-CAM"],
};

const musician = (name: string, first: string, last: string, extra: Partial<Musician> = {}): Musician => ({
  name,
  view: { first, last },
  cue: null,
  ...extra,
});

const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  recLengthFiles: true,
  musicians: [
    musician("ALEX", "ALEX 1", "sax 2", {
      color: "#ff7a6b",
      cue: { send: "C", span: null },
      controls: [{ track: "ALEX 1", rack: "ALEX 1", mode: "chain" }],
    }),
    musician("BEN", "BEN 1", "gtr 2", { color: "#4ea8de", cue: { send: "D", span: null } }),
    musician("CAM", "CAM 1", "CAM 2", { color: "#b084f5", cue: { send: "E", span: null } }),
  ],
  trackIcons: { "ALEX 1": "🎹", "sax 1": "🎷", "sax 2": "🎷", "BEN 1": "🎹", "gtr 1": "🎸", "gtr 2": "🎸", "CAM 1": "🎸", DRUMS: "🥁" },
  chainLabels: { "ALEX 1": "ALEX 1" },
  macroFlags: { "CAM 2": { track: "ALEX 1", rack: "ALEX 1", macro: 8 } },
};

const MACRO_NAMES = ["Cutoff", "Reso", "Attack", "Release", "Chorus", "Reverb", "Drive", "Level"];
const MACRO_VALUES = [92, 40, 18, 74, 55, 30, 0, 100];

const MACROS: MacroView[] = MACRO_NAMES.map((name, i) => ({ name, value: MACRO_VALUES[i] }));

/** Writes the settings and rec lengths the demo starts from, replacing the previous run's. */
export async function seedDemoData(dir: string): Promise<void> {
  const recLengthDir = join(dir, "rec-length");
  await mkdir(recLengthDir, { recursive: true });
  await Promise.all([
    writeFile(join(dir, "settings.json"), JSON.stringify(SETTINGS, null, 2)),
    writeFile(join(recLengthDir, "ALEX.json"), JSON.stringify({ bars: 4 })),
    writeFile(join(recLengthDir, "BEN.json"), JSON.stringify({ bars: null })),
    writeFile(join(recLengthDir, "CAM.json"), JSON.stringify({ bars: 8 })),
    writeFile(join(recLengthDir, "takes.json"), JSON.stringify({ [RECORDING_TRACK]: 4 })),
  ]);
}

function position(track: TrackModel, songTime: number): ClipPosition | null {
  const current = track.clips[track.playingSlot];
  if (!current) return null;
  const loopEnd = (current.lengthBars ?? 1) * BEATS_PER_BAR;
  const bounds = { looping: true, loopStart: 0, loopEnd, startMarker: 0, endMarker: loopEnd };
  const elapsed = current.isRecording ? songTime % (4 * BEATS_PER_BAR) : songTime % loopEnd;
  return { position: elapsed, bounds };
}

export function watchDemo(onChange: OnChange, hooks: SettingsHooks): LiveWatch {
  const startedAt = Date.now();
  const songTime = () => (((Date.now() - startedAt) / 1000) * TEMPO) / 60;
  const song = (): SongTiming => ({
    isPlaying: true,
    songTime: songTime(),
    quantization: "q_bar",
    signature: SIGNATURE,
    tempo: TEMPO,
  });
  const publish = () => {
    hooks.controls.reset();
    hooks.controls.setPanel({
      track: "ALEX 1",
      rack: "ALEX 1",
      chain: { number: 2, name: CHAINS[1] },
      macros: MACROS,
    });
    onChange(MODEL, true);
  };
  setTimeout(publish, 0);
  return {
    timing: () => {
      const time = songTime();
      const positions = new Map(
        MODEL.tracks.flatMap((track, i): [number, ClipPosition][] => {
          const at = position(track, time);
          return at ? [[i, at]] : [];
        }),
      );
      return { song: song(), positions };
    },
    setViewers: () => undefined,
    reload: publish,
  };
}
