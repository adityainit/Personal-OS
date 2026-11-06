import type { Metadata } from "next";
import { AuthShell } from "@/components/brand/auth-shell";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  not_allowed: "This account isn't allowed to use this workspace.",
  auth: "That link is invalid or has expired. Please try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const error = typeof sp.error === "string" ? (ERRORS[sp.error] ?? ERRORS.auth) : null;

  return (
    <AuthShell title="Personal OS" subtitle="Sign in to your private workspace">
      {error ? (
        <p role="alert" className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      <LoginForm next={next} />
    </AuthShell>
  );
}
