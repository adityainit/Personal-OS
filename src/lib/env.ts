function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseKey: () =>
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  siteUrl: () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  allowedEmail: () => process.env.ALLOWED_EMAIL?.trim().toLowerCase() || null,
};

/** True when the given email may use the app. */
export function isAllowedEmail(email: string | null | undefined) {
  const allowed = env.allowedEmail();
  if (!allowed) return true;
  return !!email && email.toLowerCase() === allowed;
}
