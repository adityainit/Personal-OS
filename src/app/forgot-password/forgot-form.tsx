"use client";

import { Loader2, MailCheck } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";

export function ForgotForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const email = String(new FormData(e.currentTarget).get("email")).trim();
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
    });
    setPending(false);
    if (error) {
      setError(
        /rate limit|too many|seconds/i.test(error.message)
          ? "Too many attempts. Wait a few minutes and try again."
          : error.message,
      );
      return;
    }
    // Supabase answers the same whether or not the address has an account.
    setSent(true);
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-2 text-center">
        <span className="rounded-full bg-success/15 p-3 text-success">
          <MailCheck className="size-5" />
        </span>
        <p className="text-sm font-medium">Check your email</p>
        <p className="text-xs text-muted">
          If an account exists for that address, a reset link is on its way. Open it in this same browser. The link expires after an hour.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={buttonClass("primary", "md", "w-full justify-center")}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Send reset link
      </button>
    </form>
  );
}
