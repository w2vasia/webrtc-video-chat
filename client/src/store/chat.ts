import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { wsClient } from "../lib/ws";
import { deriveSharedKey, encrypt, decrypt, importPublicKey, generateKeyPair, exportPublicKey, exportPrivateKey, importPrivateKey } from "../lib/crypto";
import { storeKey, getKey } from "../lib/keystore";
import { api } from "../lib/api";

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
}

const [state, setState] = createStore<ChatState>({
  conversations: {},
  activeFriend: null,
  sharedKeys: {},
  onlineUsers: new Set(),
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

    const { identityKey } = await api(`/api/keys/${friendId}`);
    const friendPub = await importPublicKey(identityKey);
    const shared = await deriveSharedKey(myKeyPair!.privateKey, friendPub);

    setState("sharedKeys", friendId, shared);
    return shared;
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
      } catch (err) {
        console.error("Failed to decrypt message", err);
      }
    });
  }

  return {
    state,
    setState,
    initKeys,
    sendMessage,
    setupListeners,
    setActiveFriend: (id: number | null) => setState("activeFriend", id),
  };
}
