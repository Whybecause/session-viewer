import type { RejectionReason, Settings } from "./protocol.ts";
import {
  applyDisplaySettingsPatch,
  isUnlockOnly,
  applyTrackIconUpdate,
  applyVolumeSourceUpdate,
  applyChainLabelUpdate,
  applyMacroFlagUpdate,
  parseChainLabelUpdate,
  parseMacroFlagUpdate,
  parseDisplaySettingsPatch,
  parseTrackIconUpdate,
  parseVolumeSourceUpdate,
} from "./settings.ts";

export type ClientResult = { ok: true; settings: Settings } | { ok: false; reason: RejectionReason };

/** Applies one untrusted client message to the settings; never throws. */
export function applyClientMessage(
  settings: Settings,
  input: unknown,
  liveNames: ReadonlySet<string>,
): ClientResult {
  if (typeof input !== "object" || input === null) return { ok: false, reason: "invalid" };
  const message = input as Record<string, unknown>;
  if (message.type === "updateSettings") {
    const patch = parseDisplaySettingsPatch(message.settings);
    if (!patch) return { ok: false, reason: "invalid" };
    if (settings.locked && !isUnlockOnly(patch)) return { ok: false, reason: "locked" };
    return { ok: true, settings: applyDisplaySettingsPatch(settings, patch) };
  }
  if (message.type === "setTrackIcon") {
    if (settings.locked) return { ok: false, reason: "locked" };
    const update = parseTrackIconUpdate(message);
    if (!update) return { ok: false, reason: "invalid" };
    const next = applyTrackIconUpdate(settings, update, liveNames);
    return next ? { ok: true, settings: next } : { ok: false, reason: "full" };
  }
  if (message.type === "setVolumeSource") {
    if (settings.locked) return { ok: false, reason: "locked" };
    const update = parseVolumeSourceUpdate(message);
    const next = update && applyVolumeSourceUpdate(settings, update);
    return next ? { ok: true, settings: next } : { ok: false, reason: "invalid" };
  }
  if (message.type === "setChainLabel") {
    if (settings.locked) return { ok: false, reason: "locked" };
    const update = parseChainLabelUpdate(message);
    const next = update && applyChainLabelUpdate(settings, update);
    return next ? { ok: true, settings: next } : { ok: false, reason: "invalid" };
  }
  if (message.type === "setMacroFlag") {
    if (settings.locked) return { ok: false, reason: "locked" };
    const update = parseMacroFlagUpdate(message);
    const next = update && applyMacroFlagUpdate(settings, update);
    return next ? { ok: true, settings: next } : { ok: false, reason: "invalid" };
  }
  return { ok: false, reason: "invalid" };
}
