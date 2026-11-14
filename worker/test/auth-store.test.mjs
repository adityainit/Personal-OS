import assert from "node:assert/strict";
import { test } from "node:test";

// config.mjs reads these at import time.
Object.assign(process.env, {
  SUPABASE_URL: "https://example.invalid",
  SUPABASE_PUBLISHABLE_KEY: "test",
  PERSONAL_OS_EMAIL: "test@example.com",
  PERSONAL_OS_PASSWORD: "test",
  WA_AUTH_SECRET: "a-test-secret-that-is-long-enough",
  LOG_LEVEL: "error",
});
const { makeCipher, useDatabaseAuthState } = await import("../src/auth-store.mjs");

/** In-memory stand-in for the whatsapp_auth table. */
function memoryStore() {
  const rows = new Map();
  return {
    rows,
    load: async () => [...rows].map(([key, value]) => ({ key, value })),
    upsert: async (list) => list.forEach((r) => rows.set(r.key, r.value)),
    remove: async (keys) => keys.forEach((k) => rows.delete(k)),
    clear: async () => rows.clear(),
  };
}

test("cipher round-trips and never stores plaintext", () => {
  const c = makeCipher("secret-one-secret-one");
  const token = c.encrypt('{"hello":"world"}');
  assert.ok(!token.includes("hello"));
  assert.equal(c.decrypt(token), '{"hello":"world"}');
  assert.notEqual(c.encrypt("same"), c.encrypt("same")); // random IV
  assert.throws(() => makeCipher("another-secret-value").decrypt(token));
});

test("login survives a restart: creds and keys come back from the store", async () => {
  const store = memoryStore();
  const secret = "a-test-secret-that-is-long-enough";

  const first = await useDatabaseAuthState(store, secret);
  first.state.creds.me = { id: "919876543210@s.whatsapp.net" };
  await first.saveCreds();
  await first.state.keys.set({ "pre-key": { 1: { public: Buffer.from([1, 2, 3]), private: Buffer.from([4, 5, 6]) } } });

  for (const v of store.rows.values()) assert.ok(v.startsWith("v1."), "values are encrypted");

  const second = await useDatabaseAuthState(store, secret);
  assert.equal(second.state.creds.me.id, "919876543210@s.whatsapp.net");
  const { 1: key } = await second.state.keys.get("pre-key", ["1"]);
  assert.deepEqual([...key.public], [1, 2, 3]);
  assert.ok(Buffer.isBuffer(key.private));

  // Deleting a key removes it from the store.
  await second.state.keys.set({ "pre-key": { 1: null } });
  assert.equal(store.rows.has("pre-key-1"), false);
});

test("a changed secret starts a fresh link instead of crashing", async () => {
  const store = memoryStore();
  const a = await useDatabaseAuthState(store, "first-secret-value-123");
  a.state.creds.me = { id: "x@s.whatsapp.net" };
  await a.saveCreds();

  const b = await useDatabaseAuthState(store, "second-secret-value-456");
  assert.equal(b.state.creds.me, undefined);
  assert.equal(store.rows.size, 0);
});

test("clear() wipes the saved login", async () => {
  const store = memoryStore();
  const a = await useDatabaseAuthState(store, "first-secret-value-123");
  await a.saveCreds();
  await a.clear();
  assert.equal(store.rows.size, 0);
});
