import type { Chain } from "ableton-js/ns/chain";
import type { AutomationState, DeviceParameter } from "ableton-js/ns/device-parameter";
import type { AnyChain } from "ableton-js/ns/drum-chain";
import type { RackDevice } from "ableton-js/ns/rack-device";
import { type Generation, type Remover, keep } from "./live-generation.ts";
import { activeChain, innerRack, playedMacros } from "./live-racks.ts";
import { type TrackData, warnRead } from "./live-read.ts";
import type { ActiveChain, ControlPanel, MacroView } from "./protocol.ts";
import type { ControlsSink, MacroFlagTarget, RackTarget } from "./rack-controls.ts";
import { updateTrack } from "./session-state.ts";

// An X-Clip recalls its chain as it starts, and Live may report the chain before the launch or after it.
export const LAUNCH_GRACE_MS = 200;
// A turned knob overrides the macro's automation, but Live may report the value just before the override.
export const OVERRIDE_SETTLE_MS = 50;
// A macro switch is on at the top of its range.
export const MACRO_ON = 127;

export interface RackWatchContext {
  scheduleReload(): void;
  /** Rack macro, 1-16, that selects the chain. */
  chainMacro(): number;
  controls: ControlsSink;
}

const sameChain = (a: ActiveChain | null, b: ActiveChain | null) => a?.number === b?.number && a?.name === b?.name;

const toMacros = (params: readonly DeviceParameter[]): MacroView[] =>
  params.map((p) => ({ name: p.raw.name, value: Math.round(p.raw.value) }));

/**
 * Follows the names and values of a rack's macros 1-8. onTouch fires for a value change only, never for the
 * initial read, and shares the value listener: one subscription per parameter keeps Live's notifications simple.
 */
async function watchMacros(
  isLive: () => boolean,
  bucket: Remover[],
  rack: RackDevice,
  params: readonly DeviceParameter[],
  onChange: (macros: MacroView[]) => void,
  onTouch?: (macro: number) => void,
): Promise<void> {
  let macros = toMacros(params);
  const set = (k: number, patch: Partial<MacroView>) => {
    const { name, value } = { ...macros[k], ...patch };
    if (name === macros[k].name && value === macros[k].value) return;
    macros = macros.map((m, i) => (i === k ? { name, value } : m));
    if (isLive()) onChange(macros);
  };
  const label = `rack ${rack.raw.name} macro`;
  await Promise.all(
    params.flatMap((p, k) => [
      keep(
        isLive,
        p.addListener("value", (value) => {
          set(k, { value: Math.round(value) });
          if (isLive()) onTouch?.(k + 1);
        }),
        `${label} ${k + 1} value`,
        bucket,
      ),
      keep(isLive, p.addListener("name", (name) => set(k, { name })), `${label} ${k + 1} name`, bucket),
    ]),
  );
  // Listeners first: addListener sends no initial value, so a change between the read above and here would be lost.
  const fresh = playedMacros(await rack.get("parameters"));
  if (!isLive()) return;
  macros = toMacros(fresh);
  onChange(macros);
}

/** Touch-only listeners: in chain mode the panel shows the inner rack, the outer macros only say which knob moved. */
function watchTouches(g: Generation, rack: RackDevice, params: readonly DeviceParameter[], onTouch: (macro: number) => void) {
  return Promise.all(
    params.map((p, k) =>
      g.keep(
        p.addListener("value", () => onTouch(k + 1)),
        `rack ${rack.raw.name} touch ${k + 1}`,
      ),
    ),
  );
}

/**
 * A macro whose automation is playing moves without anyone touching it: only a value change once the automation
 * is overridden (or absent) counts as a touch.
 */
async function guardAutomation(
  g: Generation,
  rack: RackDevice,
  params: readonly DeviceParameter[],
  touch: (macro: number) => void,
  onOverridden: (overridden: boolean[]) => void,
): Promise<(macro: number) => void> {
  let states: AutomationState[] = params.map(() => "none");
  const set = (k: number, state: AutomationState) => {
    const was = states[k] === "overridden";
    states = states.map((s, i) => (i === k ? state : s));
    if (was !== (state === "overridden")) onOverridden(states.map((s) => s === "overridden"));
  };
  await Promise.all(
    params.map((p, k) =>
      g.keep(p.addListener("automation_state", (state) => set(k, state)), `rack ${rack.raw.name} automation ${k + 1}`),
    ),
  );
  (await Promise.all(params.map((p) => p.get("automation_state")))).forEach((state, k) => set(k, state));
  const isAutomated = (macro: number) => states[macro - 1] === "playing";
  // One check pending per macro: playing automation sends dozens of values a second.
  const pending = new Set<number>();
  return (macro) => {
    if (!isAutomated(macro)) return touch(macro);
    if (pending.has(macro)) return;
    pending.add(macro);
    setTimeout(() => {
      pending.delete(macro);
      if (!isAutomated(macro)) touch(macro);
    }, OVERRIDE_SETTLE_MS);
  };
}

/** Any of these changes what the watchers hold; rare enough that reading the set again is the simplest answer. */
function watchStructure(g: Generation, ctx: RackWatchContext, rack: RackDevice, chains: readonly AnyChain[]) {
  const reload = () => {
    if (g.isLive()) ctx.scheduleReload();
  };
  const label = `rack ${rack.raw.name}`;
  return Promise.all([
    g.keep(rack.addListener("name", reload), `${label} name`),
    g.keep(rack.addListener("chains", reload), `${label} chains`),
    ...chains.flatMap((chain, ci) => [
      g.keep((chain as Chain).addListener("name", reload), `${label} chain ${ci} name`),
      g.keep((chain as Chain).addListener("devices", reload), `${label} chain ${ci} devices`),
    ]),
  ]);
}

/** Lights the header of each flagged track while its macro sits at 127; a track or macro that is missing is skipped. */
function watchFlags(
  g: Generation,
  rack: RackDevice,
  params: readonly DeviceParameter[],
  flags: readonly MacroFlagTarget[],
  names: readonly string[],
): Promise<unknown> {
  return Promise.all(
    flags.map(async ({ track, macro }) => {
      const ti = names.indexOf(track);
      const param = params[macro];
      if (ti < 0 || !param) return;
      const label = `rack ${rack.raw.name} macro ${macro} flag on ${track}`;
      try {
        const set = (value: number) => g.commit((m) => updateTrack(m, ti, { fx: Math.round(value) >= MACRO_ON }));
        // Listener first: addListener sends no initial value, so a switch flipped between load and attach would be lost.
        await g.keep(param.addListener("value", set), label);
        if (g.isLive()) set(await param.get("value"));
      } catch (err) {
        warnRead(label)(err);
      }
    }),
  );
}

interface RackSession {
  g: Generation;
  ti: number;
  rack: RackDevice;
  target: RackTarget;
  publish(patch: Partial<ControlPanel>): void;
  touch(macro: number | null): void;
}

/** Macro 16 picks the chain: its label goes on the track, and in chain mode the panel follows its inner rack. */
async function watchChain({ g, ti, rack, target, publish, touch }: RackSession, chainParam: DeviceParameter, chains: AnyChain[]) {
  const { mode, label } = target;
  const key = `rack:${ti}:${rack.raw.id}`;
  const showInner = async (chain: ActiveChain | null) => {
    const { isLatest, bucket, previous } = g.claimBucket(key);
    await Promise.all(previous.map((remove) => remove().catch(() => undefined)));
    const inner = chain ? await innerRack(chains[chain.number - 1]) : null;
    if (!isLatest()) return;
    if (!inner) return publish({ chain, macros: [] });
    const innerParams = playedMacros(await inner.get("parameters"));
    if (!isLatest()) return;
    await watchMacros(isLatest, bucket, inner, innerParams, (macros) => publish({ chain, macros }));
  };

  // A chain change moves the focus only once no launch landed around it: that one was an X-Clip, not a button.
  const focusAfterGrace = () => {
    const at = Date.now();
    setTimeout(() => {
      const launch = g.launches.get(ti);
      if (launch === undefined || Math.abs(launch - at) > LAUNCH_GRACE_MS) touch(null);
    }, LAUNCH_GRACE_MS);
  };

  let current: ActiveChain | null | undefined;
  const showChain = async (value: number, fromLive: boolean) => {
    const chain = activeChain(value, chains);
    if (current !== undefined && sameChain(chain, current)) return;
    current = chain;
    if (label) g.commit((m) => updateTrack(m, ti, { chain }));
    if (fromLive && mode === "chain") focusAfterGrace();
    if (mode !== "chain") return;
    try {
      await showInner(chain);
    } catch (err) {
      // Forgotten, so the next macro 16 event retries this chain instead of being skipped as unchanged.
      current = undefined;
      throw err;
    }
  };

  const label16 = `rack ${rack.raw.name} chain macro`;
  await g.keep(
    chainParam.addListener("value", (value) => void showChain(value, true).catch(warnRead(label16))),
    label16,
  );
  if (g.isLive()) await showChain(await chainParam.get("value"), false);
}

async function watchRack(
  g: Generation,
  ctx: RackWatchContext,
  ti: number,
  rack: RackDevice,
  target: RackTarget,
  names: readonly string[],
) {
  const { track, mode, label, musicians, flags } = target;
  const params = await rack.get("parameters");
  const chainParam: DeviceParameter | undefined = params[ctx.chainMacro()];
  const needsChain = (label || mode === "chain") && chainParam !== undefined;
  const chains = needsChain ? await rack.get("chains") : [];
  if (!g.isLive()) return;

  let panel: ControlPanel = { track, rack: rack.raw.name, macros: [], ...(mode === "chain" && { chain: null }) };
  // Per knob, so in chain mode the flag of outer macro k lands on the inner macro k it drives.
  let overridden: boolean[] = [];
  const flagged = (): ControlPanel => ({
    ...panel,
    macros: panel.macros.map((m, k) => (overridden[k] ? { ...m, overridden: true } : m)),
  });
  const session: RackSession = {
    g,
    ti,
    rack,
    target,
    publish: (patch) => {
      panel = { ...panel, ...patch };
      if (g.isLive()) ctx.controls.setPanel(flagged());
    },
    touch: (macro) => {
      if (g.isLive()) ctx.controls.touch(musicians, track, macro);
    },
  };
  const played = playedMacros(params);
  const onOverridden = (flags: boolean[]) => {
    overridden = flags;
    session.publish({});
  };
  const touchKnob = mode ? await guardAutomation(g, rack, played, session.touch, onOverridden) : session.touch;
  await Promise.all([
    mode === "rack"
      ? watchMacros(g.isLive, g.removers, rack, played, (macros) => session.publish({ macros }), touchKnob)
      : undefined,
    mode === "chain" ? watchTouches(g, rack, played, touchKnob) : undefined,
    watchStructure(g, ctx, rack, chains),
    watchFlags(g, rack, params, flags, names),
  ]);
  if (needsChain && chainParam) await watchChain(session, chainParam, chains);
}

/** Racks are found by name, like ClyphX's DEV("…"): the first one of that name on the track. */
export function watchRacks(
  g: Generation,
  ctx: RackWatchContext,
  targets: readonly RackTarget[],
  trackData: readonly TrackData[],
): Promise<unknown> {
  if (!g.isLive()) return Promise.resolve();
  ctx.controls.reset();
  const names = trackData.map((t) => t.model.name);
  return Promise.all(
    targets.map((target) => {
      const ti = names.indexOf(target.track);
      const rack = ti >= 0 ? trackData[ti].racks.find((r) => r.raw.name === target.rack) : undefined;
      if (!rack) return undefined;
      return watchRack(g, ctx, ti, rack, target, names).catch(warnRead(`rack ${target.track} / ${target.rack}`));
    }),
  );
}
