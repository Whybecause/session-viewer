import type { ControlFocus, ControlMode, ControlPanel, ControlsMessage, Musician, Settings } from "./protocol.ts";

/** A rack to follow: for the chain label under its track, for a musician's panel, or both. */
export interface RackTarget {
  track: string;
  rack: string;
  label: boolean;
  mode: ControlMode | null;
  /** Whose focus a touch on this rack moves. */
  musicians: string[];
  /** Tracks whose header lights up while one of this rack's macros is at 127. */
  flags: MacroFlagTarget[];
}

export interface MacroFlagTarget {
  track: string;
  macro: number;
}

/** One panel per track: the first musician to claim a track sets its rack and mode. */
export function rackTargets({
  musicians,
  chainLabels,
  macroFlags,
}: Pick<Settings, "musicians" | "chainLabels" | "macroFlags">): RackTarget[] {
  const controlled = musicians.reduce<RackTarget[]>(
    (targets, musician) =>
      (musician.controls ?? []).reduce((acc, { track, rack, mode }) => {
        const owner = acc.find((t) => t.track === track);
        if (!owner) return [...acc, { track, rack, label: false, mode, musicians: [musician.name], flags: [] }];
        if (owner.rack !== rack) return acc;
        return acc.map((t) => (t === owner ? { ...t, musicians: [...t.musicians, musician.name] } : t));
      }, targets),
    [],
  );
  const labelled = Object.entries(chainLabels).reduce((acc, [track, rack]) => {
    const shared = acc.find((t) => t.track === track && t.rack === rack);
    if (!shared) return [...acc, { track, rack, label: true, mode: null, musicians: [], flags: [] }];
    return acc.map((t) => (t === shared ? { ...t, label: true } : t));
  }, controlled);
  return Object.entries(macroFlags).reduce((acc, [flagged, { track, rack, macro }]) => {
    const flag = { track: flagged, macro };
    const shared = acc.find((t) => t.track === track && t.rack === rack);
    if (!shared) return [...acc, { track, rack, label: false, mode: null, musicians: [], flags: [flag] }];
    return acc.map((t) => (t === shared ? { ...t, flags: [...t.flags, flag] } : t));
  }, labelled);
}

export interface ControlsSink {
  /** A new load of the set: panels of racks no longer followed must go. */
  reset(): void;
  setPanel(panel: ControlPanel): void;
  touch(musicians: readonly string[], track: string, macro: number | null): void;
}

/** Panels and focus; the focus outlives a reload of the set, so a phone keeps its track while the set is re-read. */
export class ControlsState implements ControlsSink {
  private panels: Record<string, ControlPanel> = {};
  private focus: Record<string, ControlFocus> = {};
  private touches = 0;
  // A knob or an automation moves one panel at a time: phones get that panel, not every musician's.
  private changed = new Set<string>();
  private isReplaced = true;

  constructor(private readonly onChange: () => void) {}

  reset(): void {
    this.panels = {};
    this.isReplaced = true;
    this.onChange();
  }

  /** The settings changed: the focus a phone shows may now start elsewhere. */
  refresh(): void {
    this.onChange();
  }

  setPanel(panel: ControlPanel): void {
    this.panels = { ...this.panels, [panel.track]: panel };
    this.changed.add(panel.track);
    this.onChange();
  }

  touch(musicians: readonly string[], track: string, macro: number | null): void {
    if (musicians.length === 0) return;
    this.touches += 1;
    const focus: ControlFocus = { track, macro, touch: this.touches };
    this.focus = { ...this.focus, ...Object.fromEntries(musicians.map((name) => [name, focus])) };
    this.onChange();
  }

  /** Everything, for a phone that just connected. */
  message(musicians: readonly Musician[]): ControlsMessage {
    return { type: "controls", full: true, panels: this.panels, focus: this.focusOf(musicians) };
  }

  /** What changed since the last call, for the phones already in sync. */
  takeChanges(musicians: readonly Musician[]): ControlsMessage {
    const full = this.isReplaced;
    const panels = full ? this.panels : Object.fromEntries([...this.changed].flatMap((t) => (this.panels[t] ? [[t, this.panels[t]]] : [])));
    this.changed = new Set();
    this.isReplaced = false;
    return { type: "controls", full, panels, focus: this.focusOf(musicians) };
  }

  /** A musician nobody has touched yet starts on their first control. */
  private focusOf(musicians: readonly Musician[]): Record<string, ControlFocus> {
    return Object.fromEntries(
      musicians.flatMap((m) => {
        const tracks = (m.controls ?? []).map((c) => c.track);
        if (tracks.length === 0) return [];
        const kept = this.focus[m.name];
        return [[m.name, kept && tracks.includes(kept.track) ? kept : { track: tracks[0], macro: null, touch: 0 }]];
      }),
    );
  }
}
