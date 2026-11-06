import { RepoError } from "@/lib/domain/repo";

export type ActionResult =
  | { ok: true; message?: string; redirect?: string; data?: Record<string, unknown> }
  | { ok: false; error: string };

export function ok(message?: string, extra: { redirect?: string; data?: Record<string, unknown> } = {}): ActionResult {
  return { ok: true, message, ...extra };
}

const OLD_PHONE_RULE = "A valid phone number (with country code) is required";

export function fail(e: unknown): ActionResult {
  // The database still has the old "phone for every lead" rule: migration 4 hasn't been run.
  if (e instanceof Error && e.message.trim().endsWith(OLD_PHONE_RULE)) {
    return {
      ok: false,
      error: "Brand deals no longer need a phone number, but your database hasn't been updated yet. Run migration 4 in the Supabase SQL Editor (see README), then try again.",
    };
  }
  if (e instanceof RepoError) return { ok: false, error: e.message };
  // Let Next.js redirects/not-found propagate.
  if (e && typeof e === "object" && "digest" in e) throw e;
  console.error(e);
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}
