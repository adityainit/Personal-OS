"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import type { ActionResult } from "@/actions/result";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/**
 * A form bound to a server action. Shows toasts, closes its parent dialog and
 * optionally resets or navigates on success.
 */
export function ActionForm({
  action,
  children,
  className,
  reset = true,
  closeDialog = true,
  onSuccess,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  reset?: boolean;
  closeDialog?: boolean;
  onSuccess?: (r: Extract<ActionResult, { ok: true }>) => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  // Errors are also shown inside the form: toasts render underneath an open modal dialog.
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInlineError(state.ok ? null : state.error);
    if (state.ok) {
      if (state.message) toast.success(state.message);
      if (reset) formRef.current?.reset();
      if (closeDialog) formRef.current?.closest("dialog")?.close();
      onSuccess?.(state);
      if (state.redirect) router.push(state.redirect);
    } else {
      toast.error(state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {inlineError ? (
        <div
          role="alert"
          className="col-span-full mb-4 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-fg"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>{inlineError}</span>
        </div>
      ) : null}
      {children}
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  name,
  value,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={buttonClass(variant, size, className)}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </button>
  );
}
