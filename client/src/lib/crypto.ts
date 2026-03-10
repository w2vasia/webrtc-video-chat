// E2E encryption using X25519 key exchange + AES-256-GCM
// All via Web Crypto API — zero dependencies
//
// SECURITY NOTE: This is a simplified protocol without forward secrecy.
// A single static ECDH key pair is used per user. If a private key is
// compromised, all past and future messages with that key are decryptable.
// For production use, implement ephemeral key exchange (e.g. Double Ratchet).

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "X25519" }, false, ["deriveKey"]) as Promise<CryptoKeyPair>;
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return toBase64(raw);
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromBase64(b64), { name: "X25519" }, true, []);
}


export async function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "X25519", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(sharedKey: CryptoKey, plaintext: string): Promise<{ ciphertext: string; nonce: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, encoded);

  return {
    ciphertext: toBase64(encrypted),
    nonce: toBase64(iv),
  };
}

export async function decrypt(sharedKey: CryptoKey, ciphertext: string, nonce: string): Promise<string> {
  const iv = fromBase64(nonce);
  const data = fromBase64(ciphertext);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, sharedKey, data);
  return new TextDecoder().decode(decrypted);
}
