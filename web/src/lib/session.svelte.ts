import {
  DEFAULT_SETTINGS,
  type ClientMessage,
  type ControlsMessage,
  type DisplaySettingsPatch,
  type MacroFlag,
  type RecLengths,
  type RecTakes,
  type RecLengthWriter,
  type ServerMessage,
  type Settings,
  type StateMessage,
  type TimeMessage,
  type Transport,
} from "../../../server/protocol.ts";
import { isOutdated } from "./build.ts";
import { t } from "./i18n.ts";
import { mergeControls } from "./controls.ts";
import { applyTrackUpdates } from "./messages.ts";
import { ReconnectingSocket } from "./reconnecting-socket.ts";


// $state.raw: messages are replaced, never mutated, and a deep proxy over thousands of slots is wasted work.
class Connection {
  serverConnected = $state(false);
  message = $state.raw<StateMessage | null>(null);
  time = $state.raw<TimeMessage["tracks"]>({});
  /** Beats per minute, absent while Live is unreachable. */
  tempo = $state<number | undefined>();
  transport = $state.raw<Transport | undefined>();
  settings = $state.raw<Settings | null>(null);
  /** Live project the settings belong to; null for the global ones. */
  project = $state<string | null>(null);
  recLengths = $state.raw<RecLengths>({});
  recTakes = $state.raw<RecTakes>({});
  controls = $state.raw<ControlsMessage | null>(null);
  notice = $state<string | null>(null);
  serverUrls = $state.raw<string[]>([]);
  recLengthWriters = $state.raw<RecLengthWriter[]>([]);
  /** Attempts since the last connection, shown while the server is unreachable. */
  attempt = $state(0);
  /** How the last attempt failed, shown with it. */
  lastFailure = $state<string | null>(null);
}

export const connection = new Connection();


const NOTICE_MS = 4000;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

export function showNotice(text: string) {
  connection.notice = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (connection.notice = null), NOTICE_MS);
}

function apply(message: ServerMessage) {
  if (message.type === "state") connection.message = message;
  else if (message.type === "tracks") {
    if (connection.message) connection.message = applyTrackUpdates(connection.message, message);
  }
  // Defaults first: a server older than this page sends no value for fields added since.
  else if (message.type === "settings") {
    connection.settings = { ...DEFAULT_SETTINGS, ...message.settings };
    connection.project = message.project ?? null;
  }
  else if (message.type === "notice") showNotice(t(`notice.${message.reason}`));
  else if (message.type === "recLengths") connection.recLengths = message.recLengths;
  else if (message.type === "recTakes") connection.recTakes = message.recTakes;
  else if (message.type === "controls") connection.controls = mergeControls(connection.controls, message);
  else if (message.type === "serverInfo") {
    connection.serverUrls = message.urls;
    connection.recLengthWriters = message.recLengthWriters ?? [];
    reloadIfOutdated(message.build);
  } else {
    connection.time = message.tracks;
    connection.tempo = message.tempo;
    connection.transport = message.transport;
  }
}

const RELOADED_FOR_KEY = "session-viewer:reloaded-for";

function reloadIfOutdated(build: string | null) {
  const own = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute("src") ?? null;
  try {
    if (!build || !isOutdated(own, build, sessionStorage.getItem(RELOADED_FOR_KEY))) return;
    sessionStorage.setItem(RELOADED_FOR_KEY, build);
  } catch {
    // Storage blocked: without the loop guard, no automatic reload.
    return;
  }
  location.reload();
}

function send(message: ClientMessage): boolean {
  return socket.send(JSON.stringify(message));
}

export const sendSettings = (settings: DisplaySettingsPatch): boolean => send({ type: "updateSettings", settings });

export const sendTrackIcon = (trackNames: string[], icon: string | null): boolean =>
  send({ type: "setTrackIcon", trackNames, icon });

export const sendVolumeSource = (trackName: string, source: string | null): boolean =>
  send({ type: "setVolumeSource", trackName, source });

export const sendMacroFlag = (trackName: string, flag: MacroFlag | null): boolean =>
  send({ type: "setMacroFlag", trackName, flag });

export const sendChainLabel = (trackName: string, rack: string | null): boolean =>
  send({ type: "setChainLabel", trackName, rack });

function socketUrl(): string {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}/ws`;
}

const socket = new ReconnectingSocket(
  socketUrl,
  {
    onMessage(data) {
      try {
        apply(JSON.parse(data) as ServerMessage);
      } catch (err) {
        console.error("Invalid message from server", err);
      }
    },
    onDrop: (reason) => {
      connection.time = {};
      connection.tempo = undefined;
      connection.transport = undefined;
      connection.controls = null;
      connection.lastFailure = reason;
    },
    onStatus: (connected) => (connection.serverConnected = connected),
    onAttempt: (attempt) => (connection.attempt = attempt),
  },
  (url) => new WebSocket(url),
);

export const connect = (): void => socket.connect();

// visibilitychange covers a locked phone; pageshow a page restored from the back-forward cache; online the Wi-Fi
// coming back while the page stayed open.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") socket.reopen();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) socket.reopen();
});
window.addEventListener("online", () => socket.reopen());
