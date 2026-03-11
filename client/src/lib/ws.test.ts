// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Minimal WebSocket mock ─────────────────────────────────────────────────────

class MockWebSocket {
  static CONNECTING = 0 as const;
  static OPEN = 1 as const;
  static CLOSING = 2 as const;
  static CLOSED = 3 as const;

  readyState: 0 | 1 | 2 | 3 = 0;
  sent: string[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  receiveMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

// ── Test setup ────────────────────────────────────────────────────────────────

let mockWs: MockWebSocket;
let wsSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockWs = new MockWebSocket();
  wsSpy = vi.fn(() => mockWs);
  // Static constants must be on the constructor itself for `WebSocket.OPEN` etc.
  Object.assign(wsSpy, {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  });
  vi.stubGlobal("WebSocket", wsSpy);
  vi.stubGlobal("location", { protocol: "http:", host: "localhost" });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});

async function freshClient() {
  const mod = await import("./ws");
  return mod.wsClient;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WsClient — ping heartbeat", () => {
  it("sends ping every 25 seconds after authentication", async () => {
    const client = await freshClient();
    client.connect("test-token");
    mockWs.open();
    mockWs.receiveMessage({ type: "authenticated", userId: 1 });

    expect(mockWs.sent.some((s) => JSON.parse(s).type === "ping")).toBe(false);

    vi.advanceTimersByTime(25000);
    expect(mockWs.sent.some((s) => JSON.parse(s).type === "ping")).toBe(true);
  });

  it("sends ping repeatedly on each 25-second interval", async () => {
    const client = await freshClient();
    client.connect("test-token");
    mockWs.open();
    mockWs.receiveMessage({ type: "authenticated", userId: 1 });

    vi.advanceTimersByTime(75000);
    const pings = mockWs.sent.filter((s) => JSON.parse(s).type === "ping");
    expect(pings.length).toBe(3);
  });

  it("stops sending ping after disconnect", async () => {
    const client = await freshClient();
    client.connect("test-token");
    mockWs.open();
    mockWs.receiveMessage({ type: "authenticated", userId: 1 });

    client.disconnect();
    vi.advanceTimersByTime(25000);

    const pings = mockWs.sent.filter((s) => JSON.parse(s).type === "ping");
    expect(pings.length).toBe(0);
  });
});

describe("WsClient — visibility reconnect", () => {
  it("reconnects when tab becomes visible and WS is closed", async () => {
    const client = await freshClient();
    client.connect("test-token");
    mockWs.open();
    mockWs.receiveMessage({ type: "authenticated", userId: 1 });

    mockWs.close(1006, "");

    // Set up new WS for the reconnect
    const mockWs2 = new MockWebSocket();
    wsSpy.mockReturnValue(mockWs2);

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(wsSpy).toHaveBeenCalledTimes(2);
  });

  it("does not reconnect when tab becomes visible and WS is still open", async () => {
    const client = await freshClient();
    client.connect("test-token");
    mockWs.open();
    mockWs.receiveMessage({ type: "authenticated", userId: 1 });

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(wsSpy).toHaveBeenCalledTimes(1);
  });
});
