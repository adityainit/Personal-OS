import "server-only";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { env, isAllowedEmail } from "@/lib/env";

let verifier: ReturnType<typeof createJsClient> | null = null;
function client() {
  verifier ??= createJsClient(env.supabaseUrl(), env.supabaseKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return verifier;
}

/**
 * Verifies a Supabase-issued access token (from the OAuth 2.1 flow Claude.ai
 * runs against Supabase Auth). Signature, issuer and expiry are checked by
 * supabase-js `getClaims` (locally via JWKS for asymmetric keys).
 */
export async function verifyMcpToken(_req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined;
  const { data, error } = await client().auth.getClaims(bearer);
  if (error || !data?.claims) return undefined;
  const c = data.claims as Record<string, unknown>;

  if (c.iss !== `${env.supabaseUrl()}/auth/v1`) return undefined;
  if (c.role !== "authenticated" || typeof c.sub !== "string") return undefined;
  let email = typeof c.email === "string" && c.email ? c.email : null;
  if (!email) {
    // Some token types omit the email claim: ask Auth who this is.
    const { data: u } = await client().auth.getUser(bearer);
    email = u.user?.email ?? null;
  }
  if (!isAllowedEmail(email)) return undefined;

  return {
    token: bearer,
    clientId: typeof c.client_id === "string" ? c.client_id : "supabase-session",
    scopes: typeof c.scope === "string" ? c.scope.split(" ").filter(Boolean) : [],
    expiresAt: typeof c.exp === "number" ? c.exp : undefined,
    extra: { userId: c.sub, email },
  };
}

export function authServerIssuer() {
  return `${env.supabaseUrl()}/auth/v1`;
}
