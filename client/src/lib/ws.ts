import { createSignal } from "solid-js";

export const [wsConnected, setWsConnected] = createSignal(false);

type MessageHandler = (data: any) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token: string | null = null;
  private retryDelay = 1000;
  private readonly MAX_DELAY = 30000;
  private pendingMessages = new Map<string, string>(); // clientId → serialized payload
  private replayed = false;

  connect(token: string) {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.token = token;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    this.ws = new WebSocket(`${proto}//${location.host}/ws`);

    this.ws.onopen = () => {
      console.log("[ws] connected, authenticating...");
      this.retryDelay = 1000;
      this.ws!.send(JSON.stringify({ type: "auth", token }));
      setWsConnected(true);
    };

    this.ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      console.log("[ws] received:", data.type, data);
      if (data.type === "authenticated") {
        this.replayPending();
      }
      const handlers = this.handlers.get(data.type);
      if (handlers) handlers.forEach((h) => h(data));
    };

    this.ws.onclose = (e) => {
      console.log("[ws] closed:", e.code, e.reason);
      setWsConnected(false);
      this.replayed = false;
      const delay = this.retryDelay;
      this.retryDelay = Math.min(this.retryDelay * 2, this.MAX_DELAY);
      this.reconnectTimer = setTimeout(() => {
        if (this.token) this.connect(this.token);
      }, delay);
    };

    this.ws.onerror = (e) => {
      console.error("[ws] error:", e);
    };
  }

  disconnect() {
    this.token = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.pendingMessages.clear();
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  queueMessage(clientId: string, payload: object) {
    this.pendingMessages.set(clientId, JSON.stringify(payload));
    this.send(payload);
  }

  ackMessage(clientId: string) {
    this.pendingMessages.delete(clientId);
  }

  private replayPending() {
    if (this.replayed) return;
    this.replayed = true;
    for (const serialized of this.pendingMessages.values()) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(serialized);
      }
    }
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }
}

export const wsClient = new WsClient();
