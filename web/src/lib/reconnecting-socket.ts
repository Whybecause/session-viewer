import { t } from "./i18n.ts";

// WebSocket.readyState values, spelled out: tests run where no WebSocket global may exist.
const CONNECTING = 0;
const OPEN = 1;

const FIRST_RETRY_MS = 250;
const MAX_RETRY_MS = 2000;
// An iPhone waking up hands the page back before its Wi-Fi: a socket opened then can hang in CONNECTING for a
// minute instead of failing, so it is given up on and retried. The wait doubles after each failure: resolving a
// .local name on a waking phone can take longer than the first one, and a fixed wait would cut every attempt short.
export const CONNECT_TIMEOUT_MS = 4000;
const MAX_CONNECT_TIMEOUT_MS = 16_000;
// A reconnection this quick is not worth a banner: waking the phone always drops the socket.
export const OFFLINE_GRACE_MS = 1500;

export interface SocketLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface SocketHandlers {
  onMessage(data: string): void;
  /** Called at once when the socket drops, before any retry; `reason` says how, for the offline banner. */
  onDrop(reason: string): void;
  /** true once open, false only when no reconnection succeeded within the grace period. */
  onStatus(connected: boolean): void;
  /** Each new attempt, counted since the last successful connection. */
  onAttempt?(attempt: number): void;
}

export class ReconnectingSocket {
  private socket: SocketLike | undefined;
  private retryMs = FIRST_RETRY_MS;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private connectTimer: ReturnType<typeof setTimeout> | undefined;
  private offlineTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly url: () => string,
    private readonly handlers: SocketHandlers,
    private readonly create: (url: string) => SocketLike,
  ) {}

  connect(): void {
    clearTimeout(this.retryTimer);
    if (this.socket && this.socket.readyState <= OPEN) return;
    const ws = this.create(this.url());
    this.socket = ws;
    this.handlers.onAttempt?.(this.failures + 1);
    const timeoutMs = Math.min(CONNECT_TIMEOUT_MS * 2 ** this.failures, MAX_CONNECT_TIMEOUT_MS);
    this.connectTimer = setTimeout(() => {
      if (this.socket === ws && ws.readyState === CONNECTING) this.drop(ws, t("grid.connectTimeoutError", { seconds: timeoutMs / 1000 }));
    }, timeoutMs);
    let wasOpen = false;
    ws.onopen = () => {
      if (this.socket !== ws) return;
      wasOpen = true;
      clearTimeout(this.connectTimer);
      clearTimeout(this.offlineTimer);
      this.offlineTimer = undefined;
      this.retryMs = FIRST_RETRY_MS;
      this.failures = 0;
      this.handlers.onStatus(true);
    };
    ws.onmessage = (event) => {
      if (this.socket === ws && typeof event.data === "string") this.handlers.onMessage(event.data);
    };
    ws.onclose = (event) => {
      if (this.socket === ws) this.drop(ws, `${wasOpen ? t("grid.socketClosed") : t("grid.socketRefused")} ${t("grid.socketCode", { code: event.code })}`);
    };
  }

  /** After the page comes back: a socket frozen while the phone was locked can still report OPEN although dead. */
  reopen(): void {
    const stale = this.socket;
    this.socket = undefined;
    this.retryMs = FIRST_RETRY_MS;
    this.failures = 0;
    clearTimeout(this.connectTimer);
    stale?.close();
    if (stale) this.startOfflineGrace();
    this.connect();
  }

  send(data: string): boolean {
    if (this.socket?.readyState !== OPEN) return false;
    this.socket.send(data);
    return true;
  }

  private drop(ws: SocketLike, reason: string): void {
    this.socket = undefined;
    this.failures += 1;
    clearTimeout(this.connectTimer);
    ws.close();
    this.startOfflineGrace();
    this.handlers.onDrop(reason);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
  }

  private startOfflineGrace(): void {
    this.offlineTimer ??= setTimeout(() => this.handlers.onStatus(false), OFFLINE_GRACE_MS);
  }
}
