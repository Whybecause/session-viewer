import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CONNECT_TIMEOUT_MS, OFFLINE_GRACE_MS, ReconnectingSocket, type SocketLike } from "./reconnecting-socket.ts";

// Node only has a global CloseEvent from 23 on, and the code under test reads nothing but its code.
const closeEvent = (code: number) => ({ code }) as CloseEvent;

class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  fail(code = 1006) {
    this.readyState = 3;
    this.onclose?.(closeEvent(code));
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const status: boolean[] = [];
  const handlers = { onMessage: vi.fn(), onDrop: vi.fn(), onStatus: (c: boolean) => status.push(c) };
  const socket = new ReconnectingSocket(() => "ws://test/ws", handlers, () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  });
  return { socket, sockets, status, handlers, last: () => sockets[sockets.length - 1] };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("ReconnectingSocket", () => {
  test("gives up on a socket stuck connecting and opens another", () => {
    const { socket, sockets } = setup();
    socket.connect();
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS);
    expect(sockets[0].readyState).toBe(3);
    vi.advanceTimersByTime(250);
    expect(sockets).toHaveLength(2);
  });

  test("waits longer after each attempt that timed out, so a slow wake-up can still connect", () => {
    const { socket, sockets, last } = setup();
    socket.connect();
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS + 250);
    const second = last();
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS);
    expect(second.readyState).toBe(0);
    second.open();
    expect(sockets).toHaveLength(2);
  });

  test("counts attempts since the last connection", () => {
    const attempts: number[] = [];
    const socket = new ReconnectingSocket(
      () => "ws://test/ws",
      { onMessage: vi.fn(), onDrop: vi.fn(), onStatus: vi.fn(), onAttempt: (n) => attempts.push(n) },
      () => new FakeSocket(),
    );
    socket.connect();
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS + 250);
    socket.reopen();
    expect(attempts).toEqual([1, 2, 1]);
  });

  test("does not open a second socket while one is still connecting", () => {
    const { socket, sockets } = setup();
    socket.connect();
    socket.connect();
    expect(sockets).toHaveLength(1);
  });

  test("a quick reconnection after waking never reports the server offline", () => {
    const { socket, status, last } = setup();
    socket.connect();
    last().open();
    socket.reopen();
    vi.advanceTimersByTime(OFFLINE_GRACE_MS - 100);
    last().open();
    vi.advanceTimersByTime(OFFLINE_GRACE_MS);
    expect(status).toEqual([true, true]);
  });

  test("reports the server offline once the grace period passes without a connection", () => {
    const { socket, status, last, handlers } = setup();
    socket.connect();
    last().open();
    last().fail();
    expect(handlers.onDrop).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(OFFLINE_GRACE_MS);
    expect(status).toEqual([true, false]);
  });

  test("waking resets the backoff so the first retry is quick", () => {
    const { socket, sockets, last } = setup();
    socket.connect();
    for (let i = 0; i < 4; i++) {
      last().fail();
      vi.advanceTimersByTime(2000);
    }
    const before = sockets.length;
    socket.reopen();
    last().fail();
    vi.advanceTimersByTime(250);
    expect(sockets.length).toBe(before + 2);
  });

  test("ignores events from a socket it replaced", () => {
    const { socket, sockets, handlers } = setup();
    socket.connect();
    sockets[0].open();
    socket.reopen();
    sockets[0].onmessage?.(new MessageEvent("message", { data: "{}" }));
    sockets[0].onclose?.(closeEvent(1006));
    expect(handlers.onMessage).not.toHaveBeenCalled();
    expect(handlers.onDrop).not.toHaveBeenCalled();
  });

  test("says how the last attempt failed", () => {
    const { socket, last, handlers } = setup();
    socket.connect();
    last().fail(1006);
    expect(handlers.onDrop).toHaveBeenLastCalledWith("refused (code 1006)");
    vi.advanceTimersByTime(250);
    last().open();
    last().fail(1001);
    expect(handlers.onDrop).toHaveBeenLastCalledWith("closed (code 1001)");
    // A drop counts as a failure: the next attempt already gets twice the wait.
    vi.advanceTimersByTime(250 + 2 * CONNECT_TIMEOUT_MS);
    expect(handlers.onDrop).toHaveBeenLastCalledWith(`timeout of ${(2 * CONNECT_TIMEOUT_MS) / 1000}s exceeded`);
  });

  test("sends only while open", () => {
    const { socket, last } = setup();
    socket.connect();
    expect(socket.send("x")).toBe(false);
    last().open();
    expect(socket.send("x")).toBe(true);
    expect(last().sent).toEqual(["x"]);
  });
});
