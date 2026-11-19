export type SlotState =
  | "empty"
  | "stopped"
  | "playing"
  | "triggered"
  | "recording"
  | "record_pending";

export interface SlotView {
  state: Exclude<SlotState, "empty">;
  clipName: string | null;
  /** Only on a take named as a chain recall: shown instead of the raw name. */
  chain?: ClipChain;
  /** Absent when unknown, e.g. an unwarped audio clip whose length is in seconds. */
  lengthBars?: number;
  /**
   * Only while recording. auto: a fixed-length take, it stops by itself (Live does not say when);
   * stopping: a stop was requested and lands on the next launch boundary.
   */
  recEnd?: RecEnd;
  /** MIDI take with no note a moment after it started or once it ended: usually played on another track's channel. */
  isEmpty?: true;
}

export type RecEnd = "auto" | "stopping";

export interface TrackView {
  id: string;
  name: string;
  color: string;
  /** As shown: the fader and mute of the track's volume source when one is set. */
  volume: number;
  solo: boolean;
  armed: boolean;
  muted: boolean;
  stopPending: boolean;
  /** Only on tracks a family cue covers: their cue send is at full level. Other tracks show solo as cue. */
  cue?: boolean;
  /** Only on tracks that have the Overdub device: its Overdub switch is on. */
  overdub?: boolean;
  /** Only on tracks with a macro flag: that macro is at 127. */
  fx?: boolean;
  /** Only while a signal send is set: the track's send to it is above 0. */
  sendOn?: boolean;
  /** Racks a control or a chain label can follow, by name: the top-level ones and those inside one-chain wrappers. */
  racks?: string[];
  /** Only on tracks with a chain label: the chain macro 16 selects, null when it selects none. */
  chain?: ActiveChain | null;
  /** null = empty slot, kept out of the payload: big sets are mostly empty. */
  slots: (SlotView | null)[];
}

/** number is macro 16 as ClyphX sets it (B2 P8 n): chain n, the nth in the rack's list. */
export interface ActiveChain {
  number: number;
  name: string;
}

/** A clip that recalls a chain; name is null when the rack or the chain is not found. */
export interface ClipChain {
  number: number;
  name: string | null;
}

export interface SceneView {
  id: string;
  name: string;
}

export interface SessionView {
  tracks: TrackView[];
  scenes: SceneView[];
  /** Index of the scene selected in Live, -1 if none. */
  selectedScene: number;
  /** Return track names as Live gives them ("H-FX GEN PRE"), in send order. */
  returns: string[];
}

export interface DisplaySettings {
  /** 1-based, as shown in Live. */
  startScene: number;
  hideScenesBefore: boolean;
  /** The people the tabs jump to, in display order. */
  musicians: Musician[];
  showArm: boolean;
  /** Return track letter whose send, when not at 0, marks a track header; null = none. */
  signalSend: string | null;
  /** Show the record length of each musician, read from files an outside tool writes (see docs/integrations.md). */
  recLengthFiles: boolean;
  /** Rack macro, 1-16, whose value n selects the nth chain; 0 selects none. */
  chainMacro: number;
  /** Concert mode: every shared setting is read-only until it is switched off again. */
  locked: boolean;
}

/** Live names sends A, B…; 12 covers any set this viewer drives. */
export const SEND_LETTERS = "ABCDEFGHIJKL".split("");
export const MAX_MUSICIANS = 20;

/** A record's own entry: a track named "constructor" must not find Object.prototype's. */
export const ownValue = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** The musician's name is also their rec file's name: no path, no hidden file, and takes.json is another file's. */
export const isRecFileStem = (name: string): boolean =>
  name.length > 0 && !/[/\\\0]/.test(name) && !name.startsWith(".") && name.toLowerCase() !== "takes";

export interface TrackSpan {
  first: string;
  last: string;
}

/** A contiguous run of tracks, stored by name: an index alone would silently follow a track inserted before it. */
export interface MusicianView extends TrackSpan {
  /** Where the bounds were last found, to suggest the track now sitting there once a bound is renamed. */
  lastFirstIndex?: number;
  lastLastIndex?: number;
}

export interface Cue {
  /** Return track letter, as Live names sends: A for the first return. */
  send: string;
  /** null follows the view, never a copy of it: a copy would stay behind when the view moves. */
  span: TrackSpan | null;
}

export interface Musician {
  /** Also the ClyphX argument of their record controls (REC_LEN ALEX <), hence the data/rec-length/ALEX.json file. */
  name: string;
  /** #rrggbb; absent follows the colour of the first track of the view. */
  color?: string;
  /** Tracks the tab jumps to; columns widen so the span fills the screen. */
  view: MusicianView;
  /** Tracks sent to a cue return: they show as cued when that send is at full level. null = no cue. */
  cue: Cue | null;
  /** Tracks under the record-length band; absent = the view. */
  rec?: TrackSpan;
  /** Racks whose macros 1-8 their knobs drive; absent = none. */
  controls?: RackControl[];
}

/** rack: the panel shows the rack's own macros; chain: those of the first rack in the chain macro 16 selects. */
export type ControlMode = "rack" | "chain";
export const CONTROL_MODES: readonly ControlMode[] = ["rack", "chain"];
export const MAX_CONTROLS = 16;

export interface RackControl {
  track: string;
  rack: string;
  mode: ControlMode;
}

/** 2: a musician without rec follows the view; before, the view past their own numbered tracks. */
export const SETTINGS_VERSION = 2;

export interface Settings extends DisplaySettings {
  /** Of the file's format, for migrations that need Live's track names and so run once Live is read. */
  version: number;
  /** Emoji per track, keyed by track name: Live's object ids do not survive a restart. */
  trackIcons: Record<string, string>;
  /** Track name → name of the track whose fader and mute it shows: a bus that carries the level of the track it feeds. */
  volumeSources: Record<string, string>;
  /** Track name → name of the rack whose active chain shows under the track header. */
  chainLabels: Record<string, string>;
  /** Track name → the rack macro that, at 127 on another track, lights its header. */
  macroFlags: Record<string, MacroFlag>;
}

/** macro is 1-16 as Live numbers them; the switch is on at 127. */
export interface MacroFlag {
  track: string;
  rack: string;
  macro: number;
}

export const MAX_MACRO = 16;
export const DEFAULT_CHAIN_MACRO = 16;

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  startScene: 1,
  hideScenesBefore: false,
  musicians: [],
  showArm: true,
  signalSend: null,
  recLengthFiles: false,
  chainMacro: DEFAULT_CHAIN_MACRO,
  locked: false,
  trackIcons: {},
  volumeSources: {},
  chainLabels: {},
  macroFlags: {},
};

export interface TrackTime {
  progress?: number;
  /** 1-based bar the playing clip is in; paired with the clip's length as "3/8". */
  positionBars?: number;
  recordedBars?: number;
  countdown?: string;
}

export interface StateMessage {
  type: "state";
  liveConnected: boolean;
  session: SessionView;
}

/** A fader move sends the volume alone: resending the track would rebuild every slot on each phone. */
export type TrackUpdate = { index: number; track: TrackView } | { index: number; volume: number };

export interface TracksMessage {
  type: "tracks";
  updates: TrackUpdate[];
}

/** Where the song is, in Live's own terms; the viewer only draws it. */
export interface Transport {
  playing: boolean;
  bar: number;
  beat: number;
  sub: number;
  /** Beats in a bar, for the row of beat markers. */
  beatsPerBar: number;
}

export interface TimeMessage {
  type: "time";
  tracks: Record<number, TrackTime>;
  /** Beats per minute; absent while Live is unreachable. The cells blink once per beat. */
  tempo?: number;
  transport?: Transport;
}

export interface SettingsMessage {
  type: "settings";
  settings: Settings;
}

export type RejectionReason = "invalid" | "full" | "locked";

/** Tells one client that its last request was not applied; the phone words it in its own language. */
export interface NoticeMessage {
  type: "notice";
  reason: RejectionReason;
}

/** Bars a musician's record switches capture, keyed by musician (ALEX, BEN…); null = free length. */
export type RecLengths = Record<string, number | null>;

/** Bars of the last fixed-length take started on each track, by track name. */
export type RecTakes = Record<string, number>;

export interface RecTakesMessage {
  type: "recTakes";
  recTakes: RecTakes;
}

export interface RecLengthsMessage {
  type: "recLengths";
  recLengths: RecLengths;
}

export interface MacroView {
  name: string;
  /** 0-127, rounded: a knob sweep would otherwise send every fraction. */
  value: number;
  /** Its automation was overridden by a knob and no longer plays until Live's Re-Enable Automation. */
  overridden?: true;
}

/** What one control shows: the 8 macros of its rack, or of the rack in its active chain. */
export interface ControlPanel {
  track: string;
  rack: string;
  /** Chain mode only: the chain macro 16 selects, null when it selects none (macros then empty). */
  chain?: ActiveChain | null;
  macros: MacroView[];
}

export interface ControlFocus {
  track: string;
  /** 1-8: the knob just turned; null when the focus came from a chain change. */
  macro: number | null;
  /** Bumped at each touch, so a phone flashes the macro again without comparing clocks with the server. */
  touch: number;
}

export interface ControlsMessage {
  type: "controls";
  /** false: only the panels that changed, merged into those the phone has; true: every panel, replacing them. */
  full: boolean;
  /** Keyed by track name. */
  panels: Record<string, ControlPanel>;
  /** Keyed by musician name. */
  focus: Record<string, ControlFocus>;
}

/** The addresses other phones can open, so nobody has to read them off the Mac's terminal. */
export interface ServerInfoMessage {
  type: "serverInfo";
  urls: string[];
  /** Entry script of the build the server now serves; a phone still running another one reloads. */
  build: string | null;
  /** The ClyphX scripts that write the rec lengths, and whether to the folder this server reads. */
  recLengthWriters: RecLengthWriter[];
}

export interface RecLengthWriter {
  script: string;
  /** null: its VIEWER_REC_LEN_DIR line was not found. */
  dir: string | null;
  isOurs: boolean;
}

export type ServerMessage =
  | ServerInfoMessage
  | StateMessage
  | TracksMessage
  | TimeMessage
  | SettingsMessage
  | NoticeMessage
  | RecLengthsMessage
  | RecTakesMessage
  | ControlsMessage;

/** Only what this phone changed, so two people editing at once never overwrite each other's other fields. */
export type DisplaySettingsPatch = Partial<DisplaySettings>;

export interface UpdateSettingsMessage {
  type: "updateSettings";
  settings: DisplaySettingsPatch;
}

/** Touches only the named tracks, so two people editing icons at once never overwrite each other. */
export interface SetTrackIconMessage {
  type: "setTrackIcon";
  trackNames: string[];
  icon: string | null;
}

/** source null = the track shows its own fader again. */
export interface SetVolumeSourceMessage {
  type: "setVolumeSource";
  trackName: string;
  source: string | null;
}

/** rack null = no chain label on that track any more. */
export interface SetChainLabelMessage {
  type: "setChainLabel";
  trackName: string;
  rack: string | null;
}

/** flag null = no effect marker on that track any more. */
export interface SetMacroFlagMessage {
  type: "setMacroFlag";
  trackName: string;
  flag: MacroFlag | null;
}

export type ClientMessage =
  | UpdateSettingsMessage
  | SetTrackIconMessage
  | SetVolumeSourceMessage
  | SetChainLabelMessage
  | SetMacroFlagMessage;
