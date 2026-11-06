import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env, isAllowedEmail } from "@/lib/env";

/** Supabase client bound to the signed-in user's cookie session (RLS applies). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** Supabase client acting as the holder of a bearer token (used by the MCP server). */
export function createTokenClient(accessToken: string) {
  return createJsClient(env.supabaseUrl(), env.supabaseKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Returns the signed-in, allow-listed user or redirects to /login. */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!isAllowedEmail(data.user.email)) {
    await supabase.auth.signOut();
    redirect("/login?error=not_allowed");
  }
  return { supabase, user: data.user };
}

export type Supabase = Awaited<ReturnType<typeof createClient>>;
