"use client";

import { Bell, Bot, BriefcaseBusiness, CalendarClock } from "lucide-react";
import { InstagramIcon } from "@/components/icons";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { markNotificationsReadAction } from "@/actions";
import { cn, relative, prettySummary } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  read_at: string | null;
  created_at: string;
  activity: { type: string; summary: string; lead_id: string | null; actor: string; lead?: { kind: "brand" | "freelance" } | null } | null;
}

export function NotificationBell({ items }: { items: NotificationItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read_at).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        aria-expanded={open}
        className="relative inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface-2"
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unread > 0) void markNotificationsReadAction();
        }}
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-danger-fg">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            <Link href="/activity" onClick={() => setOpen(false)} className="text-xs text-accent hover:underline">
              View all activity
            </Link>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-xs text-muted">You&apos;re all caught up.</li>
            ) : (
              items.map((n) => {
                const a = n.activity;
                const Icon = a?.type === "follow_up_due" ? CalendarClock : Bot;
                const body = (
                  <div className="flex gap-3 px-4 py-3">
                    <span
                      className={cn(
                        "mt-0.5 rounded-md p-1.5 [&_svg]:size-3.5",
                        a?.type === "follow_up_due" ? "bg-warning/10 text-warning" : "bg-accent-soft text-accent",
                      )}
                    >
                      <Icon />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", !n.read_at && "font-medium")}>{a?.summary ? prettySummary(a.summary) : "Update"}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted" suppressHydrationWarning>
                        {a?.lead?.kind === "freelance" ? (
                          <><BriefcaseBusiness className="size-3" /> Freelancing ·</>
                        ) : a?.lead?.kind === "brand" ? (
                          <><InstagramIcon className="size-3" /> Brand deal ·</>
                        ) : null}
                        {a?.actor === "claude" ? "Claude · " : ""}
                        {relative(n.created_at)}
                      </p>
                    </div>
                    {!n.read_at ? <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" /> : null}
                  </div>
                );
                return (
                  <li key={n.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                    {a?.lead_id ? (
                      <Link href={`/leads/${a.lead_id}`} onClick={() => setOpen(false)}>
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
