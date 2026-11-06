"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await createClient().auth.signInWithPassword({
      email: String(fd.get("email")).trim(),
      password: String(fd.get("password")),
    });
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Incorrect email or password." : error.message);
      setPending(false);
      return;
    }
    // Full navigation so the server sees the fresh session cookie.
    window.location.assign(next);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={buttonClass("primary", "md", "w-full justify-center")}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Sign in
      </button>
      <Link href="/forgot-password" className="text-center text-xs text-muted underline-offset-2 hover:text-fg hover:underline">
        Forgot your password?
      </Link>
    </form>
  );
}
