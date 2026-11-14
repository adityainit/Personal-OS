import { resolve } from "node:path";

const env = (...names) => {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return undefined;
};

function required(label, ...names) {
  const v = env(...names);
  if (!v) {
    console.error(`Missing ${label}. Set ${names[0]} (worker/.env locally, or Environment on Render). See .env.example.`);
    process.exit(1);
  }
  return v;
}

const authStore = (env("WA_AUTH_STORE") ?? "supabase").toLowerCase();
if (authStore !== "supabase" && authStore !== "file") {
  console.error('WA_AUTH_STORE must be "supabase" or "file".');
  process.exit(1);
}

export const config = {
  supabaseUrl: required("Supabase URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
  supabaseKey: required("Supabase publishable key", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  email: required("Personal OS login email", "PERSONAL_OS_EMAIL"),
  password: required("Personal OS password", "PERSONAL_OS_PASSWORD"),

  /** "supabase" (encrypted in your database; for Render) or "file" (a local folder). */
  authStore,
  /** Encrypts the WhatsApp login before it's saved in the database. Keep it secret; changing it means relinking. */
  authSecret: authStore === "supabase" ? required("WA_AUTH_SECRET (any long random string)", "WA_AUTH_SECRET") : undefined,
  /** Where the WhatsApp login is stored when WA_AUTH_STORE=file. */
  authDir: resolve(env("WA_AUTH_DIR") ?? "./auth"),

  /** Optional: your WhatsApp number (digits with country code) to also get an 8-character pairing code. */
  pairingPhone: env("WA_PAIRING_PHONE")?.replace(/\D/g, "") || undefined,
  pollSeconds: Math.max(20, Number(env("POLL_SECONDS") ?? 60) || 60),
  logLevel: env("LOG_LEVEL") ?? "info",

  /** Health-check server. Render sets PORT; locally it only starts if you set one. */
  port: env("PORT") ? Number(env("PORT")) : undefined,
  /** Render's public URL for this service; used to keep the free instance awake. */
  publicUrl: env("RENDER_EXTERNAL_URL", "PUBLIC_URL"),
};

if (config.authSecret && config.authSecret.length < 16) {
  console.error("WA_AUTH_SECRET is too short: use at least 16 random characters.");
  process.exit(1);
}
