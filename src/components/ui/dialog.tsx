"use client";

import { X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button";
import { cn } from "@/lib/utils";

/**
 * Modal built on the native <dialog> element (accessible, no dependencies).
 * Any <ActionForm> inside closes the dialog automatically on success.
 *
 * The content is mounted only while the dialog is open, and freshly on every open, so
 * forms always start from the current data (never stale values from an earlier render).
 */
export function Dialog({
  trigger,
  title,
  description,
  children,
  variant = "primary",
  size = "md",
  triggerClassName,
  wide,
  triggerTitle,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  triggerClassName?: string;
  wide?: boolean;
  triggerTitle?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [openCount, setOpenCount] = useState(0);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title={triggerTitle}
        aria-label={triggerTitle}
        className={buttonClass(variant, size, triggerClassName)}
        onClick={() => {
          setOpenCount((n) => n + 1);
          setOpen(true);
          ref.current?.showModal();
        }}
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        className={cn(
          "m-auto w-[calc(100%-1.5rem)] rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
            </div>
            <button
              type="button"
              aria-label="Close"
              className={buttonClass("ghost", "icon-sm")}
              onClick={() => ref.current?.close()}
            >
              <X />
            </button>
          </div>
          <div key={openCount} className="overflow-y-auto px-5 py-4 scrollbar-thin">
            {open ? children : null}
          </div>
        </div>
      </dialog>
    </>
  );
}
