import { ownValue, type ControlFocus, type ControlPanel, type ControlsMessage } from "../../../server/protocol.ts";

export interface MyControls {
  focus: ControlFocus;
  /** null while the focused rack is not found in the set (or Live is away): the panel keeps its place, empty. */
  panel: ControlPanel | null;
}

/** Only the musician's own panel: a phone never shows what another musician controls. null = they have no controls. */
export function myControls(message: ControlsMessage | null, musician: string | null): MyControls | null {
  if (!message || !musician || !Object.hasOwn(message.focus, musician)) return null;
  const focus = message.focus[musician];
  return { focus, panel: ownValue(message.panels, focus.track) ?? null };
}

/** A partial message only carries the panels that changed; before any full one there is nothing to merge into. */
export function mergeControls(current: ControlsMessage | null, message: ControlsMessage): ControlsMessage | null {
  if (message.full) return message;
  if (!current) return null;
  return { ...message, full: true, panels: { ...current.panels, ...message.panels } };
}
