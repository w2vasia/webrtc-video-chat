import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { wsClient } from "../lib/ws";
import { deriveSharedKey, encrypt, decrypt, importPublicKey, generateKeyPair, exportPublicKey, exportPrivateKey, importPrivateKey } from "../lib/crypto";
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
}

interface ChatState {
  conversations: Record<number, ChatMessage[]>;
  activeFriend: number | null;
  sharedKeys: Record<number, CryptoKey>;
  onlineUsers: Set<number>;
  unreadCounts: Record<number, number>;
  friendInfo: Record<number, { name: string; email: string }>;
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
});

let myKeyPair: CryptoKeyPair | null = null;

export function useChat() {
  async function initKeys() {
    const storedPrivate = await getKey("privateKey");
    const storedPublic = await getKey("publicKey");

    if (storedPrivate && storedPublic) {
      myKeyPair = {
        privateKey: await importPrivateKey(storedPrivate),
        publicKey: await importPublicKey(storedPublic),
      };
    } else {
      myKeyPair = await generateKeyPair();
      await storeKey("privateKey", await exportPrivateKey(myKeyPair.privateKey));
      const pub = await exportPublicKey(myKeyPair.publicKey);
      await storeKey("publicKey", pub);
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

  async function loadHistory(friendId: number) {
    if (state.conversations[friendId]?.length) return; // already loaded
    const { user } = useAuth();
    const myId = user()?.id;
    const sharedKey = await getSharedKey(friendId);
    const res = await api(`/api/messages/${friendId}`);
    const msgs: ChatMessage[] = [];
    for (const m of res.messages) {
      try {
        const text = await decrypt(sharedKey, m.ciphertext, m.nonce);
        msgs.push({ id: String(m.id), from: m.from === myId ? 0 : m.from, to: m.to, text, timestamp: m.timestamp });
      } catch {
        // skip messages that can't be decrypted
      }
    }
    if (msgs.length) {
      setState("conversations", friendId, (prev = []) => {
        // merge: history first, then any real-time messages already in state
        const existingIds = new Set(prev.map((p) => p.id));
        return [...msgs.filter((m) => !existingIds.has(m.id)), ...prev];
      });
    }
  }

  async function sendMessage(friendId: number, text: string) {
    const sharedKey = await getSharedKey(friendId);
    const { ciphertext, nonce } = await encrypt(sharedKey, text);

    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      from: 0,
      to: friendId,
      text,
      timestamp: Math.floor(Date.now() / 1000),
      pending: true,
    };

    setState("conversations", friendId, (prev = []) => [...prev, msg]);
    wsClient.send({ type: "chat", to: friendId, ciphertext, nonce });

    setState("conversations", friendId, (msgs) =>
      msgs.map((m) => (m.id === msg.id ? { ...m, pending: false } : m)),
    );
  }

  function setupListeners() {
    wsClient.on("presence", (data) => {
      setState("onlineUsers", (prev) => {
        const next = new Set(prev);
        data.online ? next.add(data.userId) : next.delete(data.userId);
        return next;
      });
    });

    wsClient.on("chat", async (data) => {
      try {
        const sharedKey = await getSharedKey(data.from);
        const text = await decrypt(sharedKey, data.ciphertext, data.nonce);

        const msg: ChatMessage = {
          id: crypto.randomUUID(),
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
          let title = "New message";
          try {
            const res = await api("/api/friends");
            registerFriendNames(res.friends);
            const friend = (res.friends as { id: number; displayName: string; email: string }[]).find((f) => f.id === data.from);
            if (friend) title = `${friend.displayName} (${friend.email})`;
          } catch {}
          if (Notification.permission === "granted" && navigator.serviceWorker?.controller) {
            const reg = await navigator.serviceWorker.ready;
            reg.showNotification(title, {
              body: text.length > 100 ? text.slice(0, 100) + "..." : text,
              tag: `chat-${data.from}`,
              data: { friendId: data.from },
            });
          }
        }
      } catch (err) {
        console.error("Failed to decrypt message", err);
      }
    });
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

  return {
    state,
    setState,
    initKeys,
    sendMessage,
    loadHistory,
    setupListeners,
    setActiveFriend,
    registerFriendNames,
  };
}
