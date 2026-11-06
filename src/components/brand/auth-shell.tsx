import type { ReactNode } from "react";
import { findLogoSrc } from "@/lib/brand";
import { APP_NAME, LogoMark } from "./logo";

/** Centered card layout shared by the login, forgot-password and reset-password pages. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark src={findLogoSrc()} size={72} className="mb-4" />
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">{children}</div>
        <p className="mt-6 text-center text-[11px] text-muted">{APP_NAME} · private workspace · sign-ups are disabled</p>
      </div>
    </main>
  );
}
