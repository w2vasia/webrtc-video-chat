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
  serverId?: string;
  readAt?: number;
}

interface ChatState {
  conversations: Record<number, ChatMessage[]>;
  activeFriend: number | null;
  sharedKeys: Record<number, CryptoKey>;
  onlineUsers: Record<number, boolean>;
  unreadCounts: Record<number, number>;
  friendInfo: Record<number, { name: string; email: string }>;
  hasMore: Record<number, boolean>;
  typingUsers: Record<number, boolean>;
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
  onlineUsers: {},
  unreadCounts: loadUnreadCounts(),
  friendInfo: {},
  hasMore: {},
  typingUsers: {},
});

let myKeyPair: CryptoKeyPair | null = null;
const loadingSet = new Set<string>();
const historyLoaded = new Set<number>();
const pendingMsgMap = new Map<string, number>(); // clientId → friendId

let _resetFn: (() => void) | null = null;
export function resetChat() { _resetFn?.(); }

export function useChat() {
  const { user } = useAuth();

  async function initKeys() {
    const userId = user()?.id;
    if (!userId) throw new Error("Not logged in");

    const privKey = `privateKey-${userId}`;
    const pubKey = `publicKey-${userId}`;

    let storedPrivate = await getKey(privKey);
    let storedPublic = await getKey(pubKey);

    // Migrate from legacy unscoped keys if user-scoped not yet stored
    if (!(storedPrivate instanceof CryptoKey) || !(storedPublic instanceof CryptoKey)) {
      const oldPrivate = await getKey("privateKey");
      const oldPublic = await getKey("publicKey");
      if (oldPrivate instanceof CryptoKey && oldPublic instanceof CryptoKey) {
        await storeKey(privKey, oldPrivate);
        await storeKey(pubKey, oldPublic);
        storedPrivate = oldPrivate;
        storedPublic = oldPublic;
      }
    }

    if (storedPrivate instanceof CryptoKey && storedPublic instanceof CryptoKey) {
      myKeyPair = { privateKey: storedPrivate, publicKey: storedPublic };
    } else {
      myKeyPair = await generateKeyPair();
      await storeKey(privKey, myKeyPair.privateKey);
      await storeKey(pubKey, myKeyPair.publicKey);
    }

    if (!myKeyPair) throw new Error("Key pair generation failed");
    const pub = await exportPublicKey(myKeyPair.publicKey);
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
    if (!myKeyPair) throw new Error("Keys not initialized — call initKeys() first");
    const shared = await deriveSharedKey(myKeyPair.privateKey, friendPub);

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
          msgs.push({ id: String(m.id), serverId: String(m.id), from: m.from === myId ? 0 : m.from, to: m.to, text, timestamp: m.timestamp, readAt: m.readAt ?? undefined });
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
    pendingMsgMap.set(clientId, friendId);

    const msg: ChatMessage = {
      id: clientId,
      from: 0,
      to: friendId,
      text,
      timestamp: Math.floor(Date.now() / 1000),
      pending: true,
    };

    setState("conversations", friendId, (prev = []) => [...prev, msg]);
    wsClient.queueMessage(clientId, { type: "chat", to: friendId, ciphertext, nonce, clientId });
  }

  function sendTyping(friendId: number, isTyping: boolean) {
    wsClient.send({ type: "typing", to: friendId, isTyping });
  }

  function setupListeners(): () => void {
    const unsubs: (() => void)[] = [];

    unsubs.push(wsClient.on("presence", (data) => {
      setState("onlineUsers", data.userId, !!data.online);
    }));

    unsubs.push(wsClient.on("typing", (data) => {
      setState("typingUsers", data.from, !!data.isTyping);
    }));

    // eslint-disable-next-line solid/reactivity -- WS event handler
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
          serverId: data.id ? String(data.id) : undefined,
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

    // eslint-disable-next-line solid/reactivity -- WS event handler
    unsubs.push(wsClient.on("chat-ack", (data) => {
      wsClient.ackMessage(data.clientId);
      const fid = pendingMsgMap.get(data.clientId);
      if (fid === undefined) return;
      pendingMsgMap.delete(data.clientId);
      const msgs = state.conversations[fid];
      if (!msgs) return;
      const idx = msgs.findIndex((m) => m.id === data.clientId);
      if (idx !== -1) {
        setState("conversations", fid, idx, { pending: false, id: String(data.serverId), timestamp: data.timestamp });
      }
    }));

    // eslint-disable-next-line solid/reactivity -- WS event handler
    unsubs.push(wsClient.on("read", (data) => {
      for (const friendId of Object.keys(state.conversations)) {
        setState("conversations", Number(friendId), (msgs) =>
          msgs.map((m) => m.serverId === String(data.messageId) ? { ...m, readAt: Date.now() } : m)
        );
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
    pendingMsgMap.clear();
    setState({
      conversations: {},
      activeFriend: null,
      sharedKeys: {},
      onlineUsers: {},
      unreadCounts: {},
      friendInfo: {},
      hasMore: {},
      typingUsers: {},
    });
    localStorage.removeItem("unreadCounts");
  }
  _resetFn = reset;

  return {
    state,
    setState,
    initKeys,
    sendMessage,
    sendTyping,
    loadHistory,
    setupListeners,
    setActiveFriend,
    registerFriendNames,
    reset,
  };
}
