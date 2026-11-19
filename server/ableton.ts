import { Ableton } from "ableton-js";
import { Generation } from "./live-generation.ts";
import { type TimingSnapshot, TimingWatcher } from "./live-time.ts";
import { type WatchContext, watchSession } from "./live-watch.ts";
import { EMPTY_SESSION, type SessionModel } from "./session-state.ts";

export type OnChange = (model: SessionModel, liveConnected: boolean) => void;

const RELOAD_DEBOUNCE_MS = 100;
const RELOAD_RETRY_MS = 1000;
// Live has no event for Save As: the set's path is read again this often.
const SET_PATH_POLL_MS = 2000;

export interface LiveWatch {
  timing(): TimingSnapshot;
  /** Clip positions and song time are only followed while someone is looking. */
  setViewers(count: number): void;
  /** Reads the set again, e.g. once the cue sends to follow have changed. */
  reload(): void;
}

function bindConnectionEvents(
  ableton: Ableton,
  { onConnect, onDisconnect }: { onConnect: () => void; onDisconnect: () => void },
): void {
  ableton.on("connect", () => {
    console.log("[live] connected");
    onConnect();
  });
  ableton.on("disconnect", () => {
    console.log("[live] disconnected");
    onDisconnect();
  });
  ableton.on("error", (err) => console.error("[live] error:", err.message));
}

function viewerSwitch(
  timing: TimingWatcher,
  model: () => SessionModel,
  generation: () => Generation | null,
): (count: number) => void {
  const followPlayingClips = () =>
    Promise.all(
      model().tracks.map((t, ti) => {
        const g = generation();
        const slot = g?.slots[ti]?.[t.playingSlot];
        return g && slot ? timing.watchPlaying(ti, slot, g.isLive) : undefined;
      }),
    );
  return (count) => {
    void timing.setActive(count > 0, followPlayingClips).catch((err) => console.warn("[live] timing:", err.message));
    timing.setSongTimeNeeded(count > 0);
  };
}

/** What the watchers read from the settings and where the rack panels go. */
export type SettingsHooks = Pick<WatchContext, "cueSends" | "signalSend" | "racks" | "chainMacro" | "controls">;

// ableton-js reports a plugin/library version mismatch only through its logger; its other warnings repeat while Live is closed.
const logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: (message: string, ...rest: unknown[]) => {
    if (message.includes("AbletonJS plugin")) console.warn(`[live] ${message}`, ...rest);
  },
  error: (message: string) => console.error(`[live] ${message}`),
};

/** onSetPath: the open set's .als, "" while it was never saved; called at each connection and when it changes. */
export function watchLive(onChange: OnChange, hooks: SettingsHooks, onSetPath: (path: string) => Promise<void>): LiveWatch {
  const ableton = new Ableton({ logger });
  const timing = new TimingWatcher(ableton);
  let model = EMPTY_SESSION;
  let currentId = 0;
  let active: Generation | null = null;
  let reloadTimer: NodeJS.Timeout | undefined;

  const apply = (update: (m: SessionModel) => SessionModel) => {
    model = update(model);
    timing.setSongTimeNeeded(true);
    onChange(model, true);
  };

  const scheduleReload = (delayMs = RELOAD_DEBOUNCE_MS) => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => void reload(), delayMs);
  };

  const failLoad = (g: Generation) => (err: unknown) => {
    if (!g.isLive()) return;
    console.error("[live] load failed, retrying:", (err as Error).message);
    scheduleReload(RELOAD_RETRY_MS);
  };

  const ctx: WatchContext = { ableton, timing, model: () => model, scheduleReload, failLoad, ...hooks };
  async function reload() {
    clearTimeout(reloadTimer);
    const stale = [...(active?.allRemovers() ?? []), ...timing.reset()];
    const g = new Generation(++currentId, () => currentId, apply);
    active = g;
    // Old subscriptions must be gone before new ones are added, or Live drops the new ones (same object+prop key).
    await Promise.all(stale.map((remove) => remove().catch(() => undefined)));
    if (g.isLive()) await watchSession(g, ctx).catch(failLoad(g));
  }
  let setPath: string | null = null;
  let pathTimer: NodeJS.Timeout | undefined;
  let reading: Promise<boolean> | null = null;
  let lastPathError = "";
  // Bumped at each connect and disconnect: a read that outlives its connection must not start a load.
  let connection = 0;

  /** True when the set's path changed and its settings were swapped. */
  const readSetPath = (): Promise<boolean> =>
    (reading ??= ableton.song
      .get("file_path")
      .then(async (path) => {
        lastPathError = "";
        if (path === setPath) return false;
        setPath = path;
        // The set on screen may already be another one: its events must not reach the new project's settings.
        currentId += 1;
        await onSetPath(path);
        return true;
      })
      .catch((err: Error) => {
        // Older Lives may not know the property: once is enough, not every poll.
        if (err.message !== lastPathError) console.warn("[live] cannot read the set's path:", err.message);
        lastPathError = err.message;
        return false;
      })
      .finally(() => {
        reading = null;
      }));

  bindConnectionEvents(ableton, {
    onConnect: () => {
      // Opening another set reconnects: its path is new even when the text is the same as before.
      setPath = null;
      const current = ++connection;
      const isCurrent = () => current === connection;
      void readSetPath().finally(() => isCurrent() && void reload());
      clearInterval(pathTimer);
      // A Save As to another project brings other settings: the set is read again with them.
      pathTimer = setInterval(
        () => void readSetPath().then((moved) => moved && isCurrent() && scheduleReload()),
        SET_PATH_POLL_MS,
      );
    },
    onDisconnect: () => {
      connection += 1;
      clearInterval(pathTimer);
      currentId += 1;
      active = null;
      clearTimeout(reloadTimer);
      timing.reset();
      onChange(model, false);
    },
  });

  onChange(model, false);
  ableton.start().catch((err) => console.error("[live] start failed:", err));
  const setViewers = viewerSwitch(timing, () => model, () => active);
  return { timing: () => timing.snapshot(), setViewers, reload: () => scheduleReload() };
}
