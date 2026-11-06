import type { Metadata } from "next";
import { AuthShell } from "@/components/brand/auth-shell";
import { requireUser } from "@/lib/supabase/server";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

/** Reached from the emailed reset link (which signs the user in); also usable while signed in. */
export default async function ResetPasswordPage() {
  const { user } = await requireUser();
  return (
    <AuthShell title="Choose a new password" subtitle={user.email ?? undefined}>
      <ResetForm />
    </AuthShell>
  );
}
