/**
 * Personal OS access. The worker signs in as you (no admin key), so the database's
 * Row Level Security still applies to everything it does.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.mjs";
import { log } from "./log.mjs";

const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
});

let userId = null;

export async function signIn() {
  const { data, error } = await supabase.auth.signInWithPassword({ email: config.email, password: config.password });
  if (error) throw new Error(`Couldn't sign in to Personal OS as ${config.email}: ${error.message}`);
  userId = data.user.id;
  return data.user;
}

const isAuthError = (e) => /jwt|token|not authenticated|401/i.test(`${e?.message ?? ""} ${e?.code ?? ""}`);

/** Runs a query; signs in again once if the session expired (e.g. after the machine slept). */
async function withAuth(fn) {
  let res = await fn();
  if (res.error && isAuthError(res.error)) {
    log.warn("Session expired, signing in again");
    await signIn();
    res = await fn();
  }
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

const rpc = (name, args) => withAuth(() => supabase.rpc(name, args));

export const db = {
  claimNext: () => rpc("claim_next_auto_send", {}),
  complete: (outreachId, waMessageId) =>
    rpc("complete_auto_send", { p_outreach_id: outreachId, p_wa_message_id: waMessageId ?? null }),
  fail: (outreachId, error, retry) =>
    rpc("fail_auto_send", { p_outreach_id: outreachId, p_error: String(error).slice(0, 500), p_retry: retry }),
  recordReply: (phone, text, messageId, at) =>
    rpc("record_whatsapp_reply", {
      p_phone: phone,
      p_text: text,
      p_message_id: messageId ?? null,
      p_at: at ? at.toISOString() : null,
    }),

  /** Heartbeat + connection state shown on the Auto-send page. */
  setStatus: (patch) =>
    withAuth(() =>
      supabase
        .from("whatsapp_status")
        .upsert({ owner_id: userId, ...patch, last_seen_at: new Date().toISOString() }, { onConflict: "owner_id" }),
    ),

  settings: () => withAuth(() => supabase.from("settings").select("*").maybeSingle()),

  /** Switch auto-send off and notify you (repeated failures, or WhatsApp restricted the number). */
  pause: (reason) => rpc("pause_auto_send", { p_reason: reason }),

  /** Encrypted WhatsApp login rows (see auth-store.mjs). */
  authStore: {
    load: async () => {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const page = await withAuth(() =>
          supabase.from("whatsapp_auth").select("key, value").order("key").range(from, from + 999),
        );
        rows.push(...page);
        if (page.length < 1000) return rows;
      }
    },
    upsert: async (rows) => {
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200).map((r) => ({ owner_id: userId, key: r.key, value: r.value }));
        await withAuth(() => supabase.from("whatsapp_auth").upsert(chunk, { onConflict: "owner_id,key" }));
      }
    },
    remove: async (keys) => {
      for (let i = 0; i < keys.length; i += 200) {
        await withAuth(() => supabase.from("whatsapp_auth").delete().in("key", keys.slice(i, i + 200)));
      }
    },
    clear: async () => {
      await withAuth(() => supabase.from("whatsapp_auth").delete().not("key", "is", null));
    },
  },
};
