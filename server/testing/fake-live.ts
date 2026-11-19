import type { Ableton } from "ableton-js";
import type { ClipSlot } from "ableton-js/ns/clip-slot";

type Listener = (value: unknown) => void;
type Getter = () => Promise<unknown>;

/** A stand-in for any ableton-js object: readable and observable properties, plus a raw summary. */
export class FakeObject {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly scripted = new Map<string, Getter[]>();

  constructor(
    public props: Record<string, unknown> = {},
    readonly raw: Record<string, unknown> = {},
  ) {}

  get(prop: string): Promise<unknown> {
    const next = this.scripted.get(prop)?.shift();
    return next ? next() : Promise.resolve(this.props[prop]);
  }

  addListener(prop: string, listener: Listener): Promise<() => Promise<boolean>> {
    const set = this.listeners.get(prop) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(prop, set);
    return Promise.resolve(() => Promise.resolve(set.delete(listener)));
  }

  /** The next reads of `prop` run these instead of returning the stored value, to control timing. */
  script(prop: string, ...getters: Getter[]): void {
    this.scripted.set(prop, getters);
  }

  /** Every note of a clip, whatever the range asked: tests only count them. */
  getNotes(): Promise<unknown[]> {
    return Promise.resolve((this.props.notes as unknown[] | undefined) ?? []);
  }

  emit(prop: string, value: unknown): void {
    this.props[prop] = value;
    for (const listener of this.listeners.get(prop) ?? []) listener(value);
  }

  listenerCount(prop: string): number {
    return this.listeners.get(prop)?.size ?? 0;
  }
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

export const makeClip = (name: string, color = 0xff0000): FakeObject =>
  new FakeObject(
    {
      is_recording: false,
      launch_quantization: "q_global",
      looping: true,
      loop_start: 0,
      loop_end: 8,
      start_marker: 0,
      end_marker: 8,
      playing_position: 0,
      length: 8,
      signature_numerator: 4,
      signature_denominator: 4,
      warping: true,
      is_triggered: false,
    },
    { id: `clip-${name}`, name, color, is_audio_clip: false },
  );

export interface FakeWorld {
  ableton: Ableton;
  song: FakeObject;
  track: FakeObject;
  slots: FakeObject[];
  volume: FakeObject;
  /** The track's first send (A), the one a family cue follows in the tests. */
  send: FakeObject;
  /** The Overdub switch of the track's Overdub device. */
  overdub: FakeObject;
  firstClip: FakeObject;
  view: FakeObject;
  scenes: FakeObject[];
  returnTrack: FakeObject;
}

/** One track "bass 1" with three slots (only the first holds a clip) and three scenes A, B, C. */
export function buildWorld(): FakeWorld {
  const firstClip = makeClip("Riff");
  const slots = [0, 1, 2].map(
    (i) =>
      new FakeObject(
        { has_clip: i === 0, clip: i === 0 ? firstClip : null },
        { id: `slot-${i}`, has_clip: i === 0 },
      ),
  );
  const volume = new FakeObject({ value: 0.85 }, { value: 0.85 });
  const send = new FakeObject({ value: 0 }, { value: 0 });
  const overdub = new FakeObject({ value: 0 }, { id: "overdub-switch", name: "Overdub", value: 0 });
  const overdubDevice = new FakeObject(
    { parameters: [new FakeObject({ value: 1 }, { id: "overdub-on", name: "Device On", value: 1 }), overdub] },
    { name: "Overdub" },
  );
  const track = new FakeObject(
    {
      name: "bass 1",
      color: { hex: "#112233" },
      can_be_armed: true,
      arm: false,
      solo: false,
      mute: false,
      mixer_device: new FakeObject({ volume, sends: [send] }),
      playing_slot_index: -2,
      fired_slot_index: -1,
      clip_slots: slots,
      devices: [overdubDevice],
    },
    { id: "track-1", name: "bass 1", color: 0x112233, solo: false, mute: false },
  );
  const scenes = ["A", "B", "C"].map((name) => new FakeObject({ name }, { id: `scene-${name}`, name }));
  const returnTrack = new FakeObject({ name: "A-Reverb" }, { id: "return-A", name: "A-Reverb" });
  const song = new FakeObject({
    tracks: [track],
    scenes,
    return_tracks: [returnTrack],
    is_playing: false,
    current_song_time: 0,
    clip_trigger_quantization: "q_bar",
    signature_numerator: 4,
    signature_denominator: 4,
    tempo: 120,
  });
  const view = new FakeObject({ selected_scene: scenes[0] });
  Object.assign(song, { view });
  return { ableton: { song } as unknown as Ableton, song, track, slots, volume, send, overdub, firstClip, view, scenes, returnTrack };
}

export const asSlot = (slot: FakeObject): ClipSlot => slot as unknown as ClipSlot;

export interface FakeRack {
  device: FakeObject;
  /** parameters[0] = Device On, then Macros 1-16, as Live lists them. */
  params: FakeObject[];
  chains: FakeObject[];
}

let fakeIds = 0;

/** A rack with 16 macros "<name> m1"…; macro 16 holds `chain`. Each chain holds the given devices. */
export function makeRack(name: string, { chain = 0, chains = [] as { name: string; devices: FakeObject[] }[] } = {}): FakeRack {
  const param = (paramName: string, value: number) =>
    new FakeObject({ name: paramName, value, automation_state: "none" }, { id: `p${++fakeIds}`, name: paramName, value });
  const params = [
    param("Device On", 1),
    ...Array.from({ length: 16 }, (_, i) => param(`${name} m${i + 1}`, i === 15 ? chain : 10 * (i + 1))),
  ];
  const chainObjects = chains.map((c) => new FakeObject({ name: c.name, devices: c.devices }, { id: `c${++fakeIds}`, name: c.name }));
  const device = new FakeObject(
    { name, parameters: params, chains: chainObjects },
    { id: `r${++fakeIds}`, name, class_name: "InstrumentGroupDevice" },
  );
  return { device, params, chains: chainObjects };
}
