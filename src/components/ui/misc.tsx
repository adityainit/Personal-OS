"use client";

import { Check, Copy, Loader2, Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/actions/result";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button";
import { useRouter } from "next/navigation";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary", "sm")}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("Copied to clipboard");
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check /> : <Copy />}
      {label}
    </button>
  );
}

/**
 * Runs a server action from a button. With `confirm`, the first click arms the
 * button and the second click runs it (no blocking browser dialogs).
 */
export function ActionButton({
  action,
  children,
  confirm,
  variant = "secondary",
  size = "sm",
  className,
  title,
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  confirm?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  title?: string;
}) {
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={pending}
      // Icon-only buttons widen while armed so the confirmation text is readable.
      className={buttonClass(armed ? "danger" : variant, armed && size.startsWith("icon") ? "sm" : size, className)}
      onClick={() => {
        if (confirm && !armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        start(async () => {
          const r = await action();
          if (r.ok) {
            if (r.message) toast.success(r.message);
            if (r.redirect) router.push(r.redirect);
          } else toast.error(r.error);
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : null}
      {armed ? confirm : children}
    </button>
  );
}

export function ThemeToggle() {
  const { theme: stored, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  // The stored theme is only known in the browser, so render "system" until mounted
  // to keep the server HTML and the first client render identical.
  const theme = mounted ? (stored ?? "system") : "system";
  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <button
      type="button"
      aria-label={`Theme: ${theme}. Switch to ${next}`}
      title={`Theme: ${theme}`}
      className={buttonClass("ghost", "icon")}
      onClick={() => setTheme(next)}
    >
      <Icon />
    </button>
  );
}

export function Spinner() {
  return <Loader2 className="size-4 animate-spin text-muted" />;
}
