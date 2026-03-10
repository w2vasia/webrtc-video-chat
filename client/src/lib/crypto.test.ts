import { describe, it, expect } from "vitest";
import { generateKeyPair, deriveSharedKey, encrypt, decrypt, exportPublicKey, importPublicKey } from "./crypto";

describe("crypto", () => {
  it("generates a key pair", async () => {
    const kp = await generateKeyPair();
    expect(kp.publicKey).toBeDefined();
    expect(kp.privateKey).toBeDefined();
  });

  it("exports and imports public key", async () => {
    const kp = await generateKeyPair();
    const exported = await exportPublicKey(kp.publicKey);
    expect(typeof exported).toBe("string");
    const imported = await importPublicKey(exported);
    expect(imported).toBeDefined();
  });

  it("derives shared key and encrypts/decrypts", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();

    const aliceShared = await deriveSharedKey(alice.privateKey, bob.publicKey);
    const bobShared = await deriveSharedKey(bob.privateKey, alice.publicKey);

    const plaintext = "hello encrypted world";
    const { ciphertext, nonce } = await encrypt(aliceShared, plaintext);

    expect(ciphertext).not.toBe(plaintext);

    const decrypted = await decrypt(bobShared, ciphertext, nonce);
    expect(decrypted).toBe(plaintext);
  });

  it("fails to decrypt with wrong key", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();
    const eve = await generateKeyPair();

    const aliceShared = await deriveSharedKey(alice.privateKey, bob.publicKey);
    const eveShared = await deriveSharedKey(eve.privateKey, bob.publicKey);

    const { ciphertext, nonce } = await encrypt(aliceShared, "secret");

    await expect(decrypt(eveShared, ciphertext, nonce)).rejects.toThrow();
  });
});
