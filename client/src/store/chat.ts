import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { wsClient } from "../lib/ws";
import { deriveSharedKey, encrypt, decrypt, importPublicKey, generateKeyPair, exportPublicKey } from "../lib/crypto";
import { storeKey, getKey } from "../lib/keystore";
import { api } from "../lib/api";
import { useAuth } from "./auth";

export interface ChatMessage {
  id: string;
  from: number;
  to: number;
  text: string;
  timestamp: number;
  pending?: boolean;
  failed?: boolean;
}

interface ChatState {
  conversations: Record<number, ChatMessage[]>;
  activeFriend: number | null;
  sharedKeys: Record<number, CryptoKey>;
  onlineUsers: Set<number>;
  unreadCounts: Record<number, number>;
  friendInfo: Record<number, { name: string; email: string }>;
  hasMore: Record<number, boolean>;
}

function loadUnreadCounts(): Record<number, number> {
  try { return JSON.parse(localStorage.getItem("unreadCounts") || "{}"); } catch { return {}; }
}
function saveUnreadCounts(counts: Record<number, number>) {
  localStorage.setItem("unreadCounts", JSON.stringify(counts));
}

const [state, setState] = createStore<ChatState>({
  conversations: {},
  activeFriend: null,
  sharedKeys: {},
  onlineUsers: new Set(),
  unreadCounts: loadUnreadCounts(),
  friendInfo: {},
  hasMore: {},
});

let myKeyPair: CryptoKeyPair | null = null;
const loadingSet = new Set<string>();
const historyLoaded = new Set<number>();

let _resetFn: (() => void) | null = null;
export function resetChat() { _resetFn?.(); }

export function useChat() {
  async function initKeys() {
    const storedPrivate = await getKey("privateKey");
    const storedPublic = await getKey("publicKey");

    if (storedPrivate instanceof CryptoKey && storedPublic instanceof CryptoKey) {
      myKeyPair = { privateKey: storedPrivate, publicKey: storedPublic };
    } else {
      myKeyPair = await generateKeyPair();
      await storeKey("privateKey", myKeyPair.privateKey);
      await storeKey("publicKey", myKeyPair.publicKey);
    }

    const pub = await exportPublicKey(myKeyPair!.publicKey);
    await api("/api/keys", { method: "POST", body: { identityKey: pub, signedPreKey: pub } });
  }

  async function getSharedKey(friendId: number): Promise<CryptoKey> {
    if (state.sharedKeys[friendId]) return state.sharedKeys[friendId];

    let res;
    try {
      res = await api(`/api/keys/${friendId}`);
    } catch {
      throw new Error("Friend hasn't logged in yet — keys not available");
    }
    const friendPub = await importPublicKey(res.identityKey);
    const shared = await deriveSharedKey(myKeyPair!.privateKey, friendPub);

    setState("sharedKeys", friendId, shared);
    return shared;
  }

  async function loadHistory(friendId: number, beforeId?: string) {
    const key = `${friendId}-${beforeId ?? "init"}`;
    if (loadingSet.has(key)) return;
    if (!beforeId && historyLoaded.has(friendId)) return;
    if (beforeId && state.hasMore[friendId] === false) return;

    loadingSet.add(key);
    try {
      const { user } = useAuth();
      const myId = user()?.id;
      const sharedKey = await getSharedKey(friendId);
      const url = beforeId
        ? `/api/messages/${friendId}?limit=50&before_id=${beforeId}`
        : `/api/messages/${friendId}?limit=50`;
      const res = await api(url);
      const msgs: ChatMessage[] = [];
      for (const m of res.messages) {
        try {
          const text = await decrypt(sharedKey, m.ciphertext, m.nonce);
          msgs.push({ id: String(m.id), from: m.from === myId ? 0 : m.from, to: m.to, text, timestamp: m.timestamp });
        } catch {
          msgs.push({ id: String(m.id), from: m.from === myId ? 0 : m.from, to: m.to, text: "[Unable to decrypt]", timestamp: m.timestamp });
        }
      }
      if (!beforeId) historyLoaded.add(friendId);
      setState("hasMore", friendId, res.messages.length >= 50);
      if (msgs.length) {
        setState("conversations", friendId, (prev = []) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newMsgs = msgs.filter((m) => !existingIds.has(m.id));
          return [...newMsgs, ...prev];
        });
      }
    } finally {
      loadingSet.delete(key);
    }
  }

  async function sendMessage(friendId: number, text: string) {
    const sharedKey = await getSharedKey(friendId);
    const { ciphertext, nonce } = await encrypt(sharedKey, text);

    const clientId = crypto.randomUUID();
    const msg: ChatMessage = {
      id: clientId,
      from: 0,
      to: friendId,
      text,
      timestamp: Math.floor(Date.now() / 1000),
      pending: true,
    };

    setState("conversations", friendId, (prev = []) => [...prev, msg]);

    const sent = wsClient.send({ type: "chat", to: friendId, ciphertext, nonce, clientId });
    if (!sent) {
      setState("conversations", friendId, (msgs) =>
        msgs.map((m) => (m.id === clientId ? { ...m, pending: false, failed: true } : m)),
      );
    }
  }

  function setupListeners(): () => void {
    const unsubs: (() => void)[] = [];
    unsubs.push(wsClient.on("presence", (data) => {
      setState("onlineUsers", (prev) => {
        const next = new Set(prev);
        data.online ? next.add(data.userId) : next.delete(data.userId);
        return next;
      });
    }));

    unsubs.push(wsClient.on("chat", async (data) => {
      try {
        const sharedKey = await getSharedKey(data.from);
        const text = await decrypt(sharedKey, data.ciphertext, data.nonce);

        const msg: ChatMessage = {
          id: data.id ? String(data.id) : crypto.randomUUID(),
          from: data.from,
          to: 0,
          text,
          timestamp: data.timestamp,
        };

        setState("conversations", data.from, (prev = []) => [...prev, msg]);

        const isActiveChat = state.activeFriend === data.from && !document.hidden;
        if (!isActiveChat) {
          if (state.activeFriend !== data.from) {
            setState("unreadCounts", data.from, (c = 0) => c + 1);
            saveUnreadCounts(state.unreadCounts);
          }
          const info = state.friendInfo[data.from];
          const title = info ? `${info.name} (${info.email})` : "New message";
          if (Notification.permission === "granted" && navigator.serviceWorker?.controller) {
            const reg = await navigator.serviceWorker.ready;
            reg.showNotification(title, {
              body: "New message",
              tag: `chat-${data.from}`,
              data: { friendId: data.from },
            });
          }
        }
      } catch {
        const msg: ChatMessage = {
          id: data.id ? String(data.id) : crypto.randomUUID(),
          from: data.from, to: 0, text: "[Unable to decrypt]", timestamp: data.timestamp,
        };
        setState("conversations", data.from, (prev = []) => [...prev, msg]);
      }
    }));

    unsubs.push(wsClient.on("chat-ack", (data) => {
      // Find conversation containing this clientId and mark delivered
      for (const [fid, msgs] of Object.entries(state.conversations)) {
        const idx = msgs.findIndex((m) => m.id === data.clientId);
        if (idx !== -1) {
          setState("conversations", Number(fid), idx, { pending: false, id: String(data.serverId) });
          break;
        }
      }
    }));

    return () => unsubs.forEach((fn) => fn());
  }

  function setActiveFriend(id: number | null) {
    setState("activeFriend", id);
    if (id !== null) {
      setState("unreadCounts", id, 0);
      saveUnreadCounts(state.unreadCounts);
    }
  }

  function registerFriendNames(friends: { id: number; displayName: string; email: string }[]) {
    for (const f of friends) setState("friendInfo", f.id, { name: f.displayName, email: f.email });
  }

  function reset() {
    myKeyPair = null;
    loadingSet.clear();
    historyLoaded.clear();
    setState({
      conversations: {},
      activeFriend: null,
      sharedKeys: {},
      onlineUsers: new Set(),
      unreadCounts: {},
      friendInfo: {},
      hasMore: {},
    });
    localStorage.removeItem("unreadCounts");
  }
  _resetFn = reset;

  return {
    state,
    setState,
    initKeys,
    sendMessage,
    loadHistory,
    setupListeners,
    setActiveFriend,
    registerFriendNames,
    reset,
  };
}
