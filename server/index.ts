import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { watchLive } from "./ableton.ts";
import { applyClientMessage } from "./client-messages.ts";
import { DEFAULT_SCRIPTS_DIR, recLengthWriters, withHomeHidden } from "./clyphx-scripts.ts";
import { cueSendIndexes, sendIndex } from "./cue.ts";
import { seedDemoData, watchDemo } from "./demo-live.ts";
import { cueSpan, rememberIndexes } from "./musicians.ts";
import { migrateRecSpans } from "./rec-migration.ts";
import { isAllowedUpgrade } from "./origin.ts";
import { ControlsState, rackTargets } from "./rack-controls.ts";
import type {
  NoticeMessage,
  RejectionReason,
  RecLengths,
  RecLengthsMessage,
  RecTakes,
  RecTakesMessage,
  ServerInfoMessage,
  Settings,
  SettingsMessage,
  StateMessage,
  TimeMessage,
  TracksMessage,
  Transport,
} from "./protocol.ts";
import { RateLimiter } from "./rate-limit.ts";
import { loadRecLengths, loadRecTakes, watchRecLengths } from "./rec-lengths.ts";
import { EMPTY_SESSION, type SessionModel, type VolumeSources, changedTracks, toSessionView, trackUpdates } from "./session-state.ts";
import { SettingsStore } from "./settings-store.ts";
import { loadSettings, settingsEqual } from "./settings.ts";
import { createStaticHandler, entryScript } from "./static.ts";
import { type SongTiming, type TakeBars, takeBars, trackTimes, transportPosition } from "./timing.ts";

// Settings of this machine (see .env.example); a variable already in the environment wins over the file.
const ENV_FILE = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const PORT = Number(process.env.PORT ?? 3000);
const HOST = "0.0.0.0";
const BROADCAST_COALESCE_MS = 30;
const TIME_TICK_MS = 100;
// `npm run demo`: a made-up set in its own folder, so the real settings are never touched.
const IS_DEMO = process.env.DEMO === "1" || process.argv.includes("--demo");
const DATA_DIR = fileURLToPath(new URL(IS_DEMO ? "../data/demo/" : "../data/", import.meta.url));
const SETTINGS_PATH = resolve(DATA_DIR, "settings.json");
// One NAME.json per musician, written by any outside tool (see docs/integrations.md).
const REC_LENGTH_DIR = process.env.REC_LENGTH_DIR && !IS_DEMO
  ? resolve(process.env.REC_LENGTH_DIR)
  : resolve(DATA_DIR, "rec-length");
// Scripts that write the rec lengths themselves, so the app can warn when one writes elsewhere (docs/integrations.md).
const REC_LENGTH_WRITERS = (process.env.REC_LENGTH_WRITERS ?? "").split(",").map((name) => name.trim()).filter(Boolean);
const SCRIPTS_DIR = process.env.USER_ACTIONS_DIR ? resolve(process.env.USER_ACTIONS_DIR) : DEFAULT_SCRIPTS_DIR;
const STATIC_DIR = resolve(fileURLToPath(new URL("../web/dist", import.meta.url)));
// Room for the largest valid icon update (200 track names of 200 characters).
const MAX_CLIENT_MESSAGE_BYTES = 64 * 1024;
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
const MAX_CLIENTS = 50;
const MAX_CLIENTS_PER_ADDRESS = 8;
const HEARTBEAT_MS = 30_000;
const CLIENT_MESSAGES_PER_SECOND = 10;
const LOG_THROTTLE_MS = 10_000;
const CLOSE_POLICY_VIOLATION = 1008;

const serveStatic = createStaticHandler(STATIC_DIR);
const server = createServer((req, res) => {
  // One line per page load: when a phone shows nothing, it tells whether its request ever reached this Mac.
  if (req.url === "/") console.log(`[http] page loaded by ${req.socket.remoteAddress ?? "?"}`);
  void serveStatic(req, res);
});
const clientsPerAddress = new Map<string, number>();
const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: MAX_CLIENT_MESSAGE_BYTES,
  perMessageDeflate: { threshold: 1024, serverNoContextTakeover: true },
  verifyClient: ({ req }, done) => {
    // Refused before the upgrade: one device opening sockets must not use up the places of the real phones.
    const address = req.socket.remoteAddress ?? "?";
    if (wss.clients.size >= MAX_CLIENTS || (clientsPerAddress.get(address) ?? 0) >= MAX_CLIENTS_PER_ADDRESS) {
      return done(false, 503, "Busy");
    }
    const allowed = isAllowedUpgrade({ host: req.headers.host, origin: req.headers.origin });
    if (!allowed) logThrottled(`[ws] refused a connection from origin ${req.headers.origin ?? "(none)"}`);
    done(allowed, 403, "Forbidden");
  },
});

if (IS_DEMO) await seedDemoData(DATA_DIR);
const store = new SettingsStore(SETTINGS_PATH, await loadSettings(SETTINGS_PATH));
let model: SessionModel = EMPTY_SESSION;
let liveConnected = false;
let sent: { model: SessionModel; liveConnected: boolean } | null = null;
let fullStateCache: { model: SessionModel; liveConnected: boolean; sources: VolumeSources; json: string } | null = null;
let flushTimer: NodeJS.Timeout | undefined;
let lastTime = "";
let lastTakeBars: TakeBars = new Map();
let lastLog = 0;
let controlsTimer: NodeJS.Timeout | undefined;
let lastFocus = "";
// A knob sweep changes a macro dozens of times a second: phones get at most one panel update per coalescing window.
const controls = new ControlsState(() => {
  controlsTimer ??= setTimeout(() => {
    controlsTimer = undefined;
    const message = controls.takeChanges(store.current.musicians);
    const focus = JSON.stringify(message.focus);
    if (!message.full && Object.keys(message.panels).length === 0 && focus === lastFocus) return;
    lastFocus = focus;
    broadcast(JSON.stringify(message));
  }, BROADCAST_COALESCE_MS);
});
const recLengthsMessage = (recLengths: RecLengths) =>
  JSON.stringify({ type: "recLengths", recLengths } satisfies RecLengthsMessage);
let recLengths = recLengthsMessage(await loadRecLengths(REC_LENGTH_DIR));
const recTakesMessage = (recTakes: RecTakes) => JSON.stringify({ type: "recTakes", recTakes } satisfies RecTakesMessage);
let recTakes = recTakesMessage(await loadRecTakes(REC_LENGTH_DIR));

function logThrottled(message: string) {
  const now = Date.now();
  if (now - lastLog < LOG_THROTTLE_MS) return;
  lastLog = now;
  console.warn(message);
}

const send = (socket: WebSocket, json: string) => {
  if (socket.readyState === WebSocket.OPEN) socket.send(json);
};

function broadcast(json: string) {
  for (const client of wss.clients) {
    // A phone that cannot keep up would grow an unbounded queue; it reconnects and gets a fresh full state.
    if (client.bufferedAmount > MAX_BUFFERED_BYTES) client.terminate();
    else send(client, json);
  }
}

function fullState(): string {
  const sources = store.current.volumeSources;
  if (fullStateCache?.model !== model || fullStateCache.liveConnected !== liveConnected || fullStateCache.sources !== sources) {
    const message: StateMessage = { type: "state", liveConnected, session: toSessionView(model, sources) };
    fullStateCache = { model, liveConnected, sources, json: JSON.stringify(message) };
  }
  return fullStateCache.json;
}

function flush() {
  flushTimer = undefined;
  const previous = sent;
  const diff = !previous || previous.liveConnected !== liveConnected ? "structure" : changedTracks(previous.model, model);
  sent = { model, liveConnected };
  if (diff === "structure") return broadcast(fullState());
  if (diff.length === 0) return;
  const updates = trackUpdates(previous!.model, model, diff, store.current.volumeSources);
  if (updates.length === 0) return;
  broadcast(JSON.stringify({ type: "tracks", updates } satisfies TracksMessage));
}

const settingsMessage = () => JSON.stringify({ type: "settings", settings: store.current } satisfies SettingsMessage);
const noticeMessage = (reason: RejectionReason) => JSON.stringify({ type: "notice", reason } satisfies NoticeMessage);
const liveTrackNames = (): ReadonlySet<string> => new Set(liveConnected ? model.tracks.map((t) => t.name) : []);

function handleClientMessage(socket: WebSocket, raw: string) {
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }
  const result = applyClientMessage(store.current, input, liveTrackNames());
  if (!result.ok) {
    logThrottled("[ws] rejected a client message");
    send(socket, noticeMessage(result.reason));
    return;
  }
  if (settingsEqual(store.current, result.settings)) return;
  const cuesChanged = cueSpans(store.current) !== cueSpans(result.settings);
  const racksChanged = followedRacks(store.current) !== followedRacks(result.settings);
  const sourcesChanged = store.current.volumeSources !== result.settings.volumeSources;
  const signalChanged = store.current.signalSend !== result.settings.signalSend;
  store.set(result.settings);
  broadcast(settingsMessage());
  if (sourcesChanged) broadcast(fullState());
  // A new musician or control changes whose focus starts where, even before the set is read again.
  controls.refresh();
  // Cue and rack listeners are chosen at load: a new cue span or rack only takes effect once the set is read again.
  if (cuesChanged || racksChanged || signalChanged) live.reload();
}

// The effective span: a cue that follows the view moves with it.
const cueSpans = (settings: Settings) =>
  JSON.stringify(settings.musicians.map((m) => [m.cue?.send, cueSpan(m)?.first, cueSpan(m)?.last]));
const followedRacks = (settings: Settings) => JSON.stringify([rackTargets(settings), settings.chainMacro]);

/** Concert mode freezes what people edit, not this: the positions only feed the "did you mean" of a renamed bound. */
function rememberViewPositions() {
  const names = model.tracks.map((t) => t.name);
  const migrated = migrateRecSpans(names, store.current) ?? store.current;
  const musicians = rememberIndexes(names, migrated.musicians);
  if (!musicians && migrated === store.current) return;
  store.set({ ...migrated, ...(musicians && { musicians }) });
  broadcast(settingsMessage());
}

const toTransport = (song: SongTiming): Transport => ({
  playing: song.isPlaying,
  ...transportPosition(song.songTime, song.signature),
  beatsPerBar: song.signature.numerator,
});

const alive = new WeakSet<WebSocket>();

wss.on("connection", (socket, req) => {
  const from = req.socket.remoteAddress ?? "?";
  clientsPerAddress.set(from, (clientsPerAddress.get(from) ?? 0) + 1);
  console.log(`[ws] viewer connected from ${from} (${wss.clients.size} connected)`);
  const limiter = new RateLimiter(CLIENT_MESSAGES_PER_SECOND, 1000);
  alive.add(socket);
  socket.on("pong", () => alive.add(socket));
  socket.on("error", () => socket.terminate());
  socket.on("message", (data) => {
    if (limiter.allow()) handleClientMessage(socket, data.toString());
    else socket.close(CLOSE_POLICY_VIOLATION, "rate limit");
  });
  socket.on("close", (code) => {
    const remaining = (clientsPerAddress.get(from) ?? 1) - 1;
    if (remaining > 0) clientsPerAddress.set(from, remaining);
    else clientsPerAddress.delete(from);
    console.log(`[ws] viewer left from ${from}, code ${code} (${wss.clients.size} connected)`);
    live.setViewers(wss.clients.size);
  });
  live.setViewers(wss.clients.size);
  // Read at each connection: a script edited mid-session shows up without restarting the server.
  void Promise.all([entryScript(STATIC_DIR), IS_DEMO ? [] : recLengthWriters(REC_LENGTH_DIR, SCRIPTS_DIR, REC_LENGTH_WRITERS)]).then(([build, writers]) =>
    send(
      socket,
      JSON.stringify({ type: "serverInfo", urls: lanUrls(), build, recLengthWriters: writers.map((writer) => withHomeHidden(writer)) } satisfies ServerInfoMessage),
    ),
  );
  send(socket, settingsMessage());
  send(socket, recLengths);
  send(socket, recTakes);
  send(socket, JSON.stringify(controls.message(store.current.musicians)));
  if (sent) send(socket, fullState());
  if (lastTime) send(socket, lastTime);
});
wss.on("error", (err) => console.error("[ws] server error:", err.message));

// Half-open sockets (a phone that left the Wi-Fi) never close by themselves.
setInterval(() => {
  for (const client of wss.clients) {
    if (!alive.has(client)) {
      client.terminate();
      continue;
    }
    alive.delete(client);
    client.ping();
  }
}, HEARTBEAT_MS);

server.on("error", (err) => {
  console.error(`Cannot start on port ${PORT}:`, err.message);
  process.exit(1);
});

const live = (IS_DEMO ? watchDemo : watchLive)(
  (nextModel, nextLiveConnected) => {
    model = nextModel;
    liveConnected = nextLiveConnected;
    if (liveConnected) rememberViewPositions();
    flushTimer ??= setTimeout(flush, BROADCAST_COALESCE_MS);
  },
  {
    cueSends: (trackNames) => cueSendIndexes(trackNames, store.current.musicians),
    signalSend: () => (store.current.signalSend === null ? null : sendIndex(store.current.signalSend)),
    racks: () => rackTargets(store.current),
    chainMacro: () => store.current.chainMacro,
    controls,
  },
);

live.setViewers(0);

const stopRecLengths = await watchRecLengths(REC_LENGTH_DIR, (nextLengths, nextTakes) => {
  const lengthsJson = recLengthsMessage(nextLengths);
  if (lengthsJson !== recLengths) {
    recLengths = lengthsJson;
    broadcast(lengthsJson);
  }
  const takesJson = recTakesMessage(nextTakes);
  if (takesJson !== recTakes) {
    recTakes = takesJson;
    broadcast(takesJson);
  }
});

setInterval(() => {
  if (wss.clients.size === 0) {
    // The next viewer must not be greeted with a frame from before everyone left.
    lastTime = "";
    lastTakeBars = new Map();
    return;
  }
  const { song, positions } = live.timing();
  const tracks = liveConnected ? trackTimes(model, song, positions, lastTakeBars) : {};
  lastTakeBars = takeBars(model, tracks);
  const tempo = liveConnected ? Math.round(song.tempo * 100) / 100 : undefined;
  const transport = liveConnected ? toTransport(song) : undefined;
  const json = JSON.stringify({ type: "time", tracks, tempo, transport } satisfies TimeMessage);
  if (json === lastTime) return;
  lastTime = json;
  broadcast(json);
}, TIME_TICK_MS);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopRecLengths();
    void store.flush().finally(() => process.exit(0));
  });
}

/**
 * IPs only. The router's name for this Mac (Mac.lan) is not listed: macOS keeps it after moving to another network,
 * where it resolves to nothing. A .local name is not either: macOS does not always answer for it.
 */
function lanUrls(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i!.address}:${PORT}`);
}

server.listen(PORT, HOST, () => {
  console.log(`Session viewer on http://localhost:${PORT}`);
  for (const url of lanUrls()) console.log(`  on your network: ${url}`);
});
