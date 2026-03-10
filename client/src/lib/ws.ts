type MessageHandler = (data: any) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token: string | null = null;
  private reconnectDelay = 1000;

  connect(token: string) {
    this.token = token;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    this.ws = new WebSocket(`${proto}//${location.host}/ws`);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.ws!.send(JSON.stringify({ type: "auth", token }));
    };

    this.ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      console.log("[ws] received:", data.type, data);
      const handlers = this.handlers.get(data.type);
      if (handlers) handlers.forEach((h) => h(data));
    };

    this.ws.onclose = () => {
      const delay = this.reconnectDelay + Math.random() * 500;
      this.reconnectTimer = setTimeout(() => {
        if (this.token) this.connect(this.token);
      }, delay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
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
  }

  send(data: any): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }
}

export const wsClient = new WsClient();
