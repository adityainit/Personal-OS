import Link from "next/link";
import { AuthShell } from "@/components/brand/auth-shell";
import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new one">
      <ForgotForm />
      <Link href="/login" className="mt-4 block text-center text-xs text-muted underline-offset-2 hover:text-fg hover:underline">
        Back to sign in
      </Link>
    </AuthShell>
  );
}
