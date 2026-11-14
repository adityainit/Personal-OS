/**
 * Where the WhatsApp login (linked-device keys) lives.
 *
 * - "supabase" (default): an encrypted copy in your Personal OS database, so a host without a
 *   persistent disk (Render's free plan) reconnects after a restart without a new QR.
 * - "file": a local folder (worker/auth), for running on your own computer or a VM.
 *
 * Values are encrypted with AES-256-GCM using WA_AUTH_SECRET before they leave the worker, so
 * the database only ever holds ciphertext.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { BufferJSON, initAuthCreds, proto, useMultiFileAuthState } from "baileys";
import { config } from "./config.mjs";
import { log } from "./log.mjs";

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------
export function makeCipher(secret) {
  const key = createHash("sha256").update(`personal-os-whatsapp:${secret}`).digest();
  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
      return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${data.toString("base64")}`;
    },
    decrypt(token) {
      const [v, iv, tag, data] = String(token).split(".");
      if (v !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised encrypted value");
      const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      d.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase-backed auth state (same shape as Baileys' useMultiFileAuthState)
// ---------------------------------------------------------------------------
/**
 * @param {{ load: () => Promise<{key: string, value: string}[]>,
 *           upsert: (rows: {key: string, value: string}[]) => Promise<void>,
 *           remove: (keys: string[]) => Promise<void>,
 *           clear: () => Promise<void> }} store
 * @param {string} secret
 */
export async function useDatabaseAuthState(store, secret) {
  const cipher = makeCipher(secret);
  const cache = new Map();

  let undecryptable = 0;
  for (const row of await store.load()) {
    try {
      cache.set(row.key, JSON.parse(cipher.decrypt(row.value), BufferJSON.reviver));
    } catch {
      undecryptable++;
    }
  }
  if (undecryptable > 0) {
    // Usually WA_AUTH_SECRET changed. Start fresh rather than run with half a login.
    log.warn(`${undecryptable} saved WhatsApp login entries couldn't be decrypted (did WA_AUTH_SECRET change?). Starting a fresh link.`);
    cache.clear();
    await store.clear();
  }

  const creds = cache.get("creds") ?? initAuthCreds();
  const encode = (value) => cipher.encrypt(JSON.stringify(value, BufferJSON.replacer));

  // Writes are serialised so a burst of key updates lands in order.
  let queue = Promise.resolve();
  const enqueue = (fn) => (queue = queue.then(fn, fn));

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            let value = cache.get(`${type}-${id}`) ?? null;
            if (type === "app-state-sync-key" && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
            data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          const upserts = [];
          const removals = [];
          for (const category in data) {
            for (const id in data[category]) {
              const key = `${category}-${id}`;
              const value = data[category][id];
              if (value) {
                cache.set(key, value);
                upserts.push({ key, value: encode(value) });
              } else {
                cache.delete(key);
                removals.push(key);
              }
            }
          }
          await enqueue(async () => {
            if (upserts.length) await store.upsert(upserts);
            if (removals.length) await store.remove(removals);
          });
        },
      },
    },
    saveCreds: () =>
      enqueue(async () => {
        cache.set("creds", creds);
        await store.upsert([{ key: "creds", value: encode(creds) }]);
      }),
    clear: () =>
      enqueue(async () => {
        cache.clear();
        await store.clear();
      }),
  };
}

/** The auth state for the configured store, plus a `clear()` used after WhatsApp logs the device out. */
export async function loadAuthState(dbStore) {
  if (config.authStore === "file") {
    const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
    return { state, saveCreds, clear: () => rm(config.authDir, { recursive: true, force: true }) };
  }
  return useDatabaseAuthState(dbStore, config.authSecret);
}
