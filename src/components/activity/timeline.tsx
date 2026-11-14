import {
  Bot,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CircleCheck,
  CircleX,
  FileText,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Send,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { ACTIVITY_LABEL } from "@/lib/domain/constants";
import type { Activity, Lead } from "@/lib/domain/types";
import { cn, fmtDateTime, relative } from "@/lib/utils";

const ICONS: Record<string, [LucideIcon, string]> = {
  lead_created: [Plus, "text-accent bg-accent-soft"],
  research_completed: [FileText, "text-sky-600 bg-sky-500/10 dark:text-sky-400"],
  research_updated: [FileText, "text-sky-600 bg-sky-500/10 dark:text-sky-400"],
  status_changed: [Pencil, "text-muted bg-surface-2"],
  contact_added: [UserRound, "text-muted bg-surface-2"],
  outreach_drafted: [Mail, "text-indigo-600 bg-indigo-500/10 dark:text-indigo-400"],
  outreach_sent: [Send, "text-violet-600 bg-violet-500/10 dark:text-violet-400"],
  reply_received: [MessageCircle, "text-cyan-600 bg-cyan-500/10 dark:text-cyan-400"],
  lead_declined: [CircleX, "text-danger bg-danger/10"],
  follow_up_scheduled: [CalendarClock, "text-muted bg-surface-2"],
  follow_up_due: [CalendarClock, "text-warning bg-warning/10"],
  follow_up_completed: [CalendarCheck, "text-success bg-success/10"],
  follow_up_cancelled: [CalendarX, "text-muted bg-surface-2"],
  follow_up_rescheduled: [CalendarClock, "text-muted bg-surface-2"],
  lead_won: [CircleCheck, "text-success bg-success/10"],
  lead_lost: [CircleX, "text-danger bg-danger/10"],
};

export type ActivityRow = Activity & { lead?: Pick<Lead, "id" | "name"> | null };

export function Timeline({ items, showLead = false }: { items: ActivityRow[]; showLead?: boolean }) {
  if (items.length === 0) return <p className="px-4 py-8 text-center text-xs text-muted">No activity yet.</p>;
  return (
    <ol className="relative flex flex-col">
      {items.map((a, i) => {
        const [Icon, tone] = ICONS[a.type] ?? (a.type.startsWith("interaction_") ? [MessageCircle, "text-muted bg-surface-2"] : [Pencil, "text-muted bg-surface-2"]);
        const excerpt = typeof a.metadata?.excerpt === "string" && a.metadata.excerpt ? a.metadata.excerpt : null;
        const body = (
          <div className="flex gap-3 px-4 py-3">
            <div className="relative flex flex-col items-center">
              <span className={cn("z-10 rounded-full p-1.5 [&_svg]:size-3.5", tone)}>
                <Icon />
              </span>
              {i < items.length - 1 ? <span className="absolute top-7 h-[calc(100%+0.25rem)] w-px bg-border" /> : null}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-sm">{a.summary}</p>
              {excerpt ? <p className="mt-1 line-clamp-2 text-xs text-muted">“{excerpt}”</p> : null}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                <span title={fmtDateTime(a.created_at)}>{relative(a.created_at)}</span>
                <span>· {ACTIVITY_LABEL[a.type] ?? a.type.replace(/_/g, " ")}</span>
                {a.actor === "claude" ? (
                  <span className="inline-flex items-center gap-0.5 text-accent">
                    · <Bot className="size-3" /> Claude
                  </span>
                ) : a.actor === "system" ? (
                  <span>· automatic</span>
                ) : null}
                {showLead && a.lead ? (
                  <span className="font-medium text-fg/80">· {a.lead.name}</span>
                ) : null}
              </p>
            </div>
          </div>
        );
        return (
          <li key={a.id}>
            {showLead && a.lead_id ? (
              <Link href={`/leads/${a.lead_id}`} className="block rounded-lg hover:bg-surface-2/60">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}
