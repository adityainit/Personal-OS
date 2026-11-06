"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";

export const MIN_PASSWORD = 10;

export function ResetForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password"));
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== String(fd.get("confirm"))) return setError("The two passwords don't match.");

    setPending(true);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setPending(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="New password" hint={`At least ${MIN_PASSWORD} characters`}>
        <Input name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} autoFocus />
      </Field>
      <Field label="Confirm new password">
        <Input name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} />
      </Field>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={buttonClass("primary", "md", "w-full justify-center")}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Update password
      </button>
    </form>
  );
}
