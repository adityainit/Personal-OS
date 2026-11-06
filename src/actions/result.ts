import { RepoError } from "@/lib/domain/repo";

export type ActionResult =
  | { ok: true; message?: string; redirect?: string; data?: Record<string, unknown> }
  | { ok: false; error: string };

export function ok(message?: string, extra: { redirect?: string; data?: Record<string, unknown> } = {}): ActionResult {
  return { ok: true, message, ...extra };
}

export function fail(e: unknown): ActionResult {
  if (e instanceof RepoError) return { ok: false, error: e.message };
  // Let Next.js redirects/not-found propagate.
  if (e && typeof e === "object" && "digest" in e) throw e;
  console.error(e);
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}
