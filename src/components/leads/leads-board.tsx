import { Bot } from "lucide-react";
import Link from "next/link";
import { FitScore } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/domain/constants";
import type { Lead, LeadStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const BOARD: LeadStatus[] = ["new", "researched", "drafted", "contacted", "replied", "interested", "negotiating", "won", "lost"];

/** Kanban-style card view grouped by pipeline status. */
export function LeadsBoard({ leads }: { leads: Lead[] }) {
  const groups = BOARD.map((s) => ({ status: s, items: leads.filter((l) => l.status === s) }));
  return (
    <div className="flex gap-3 overflow-x-auto p-3 pb-4 scrollbar-thin">
      {groups.map(({ status, items }) => (
        <section key={status} className="flex w-64 shrink-0 flex-col rounded-xl bg-surface-2/60 p-2">
          <header className="mb-2 flex items-center justify-between px-1.5 pt-1">
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[status])}>
              {STATUS_LABEL[status]}
            </span>
            <span className="text-xs tabular-nums text-muted">{items.length}</span>
          </header>
          <div className="flex flex-col gap-2">
            {items.map((l) => (
              <Link
                key={l.id}
                href={`/leads/${l.id}`}
                className="rounded-lg border border-border bg-surface p-3 shadow-xs transition hover:border-ring/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug">{l.name}</p>
                  {l.source === "claude" ? <Bot className="size-3.5 shrink-0 text-accent" aria-label="Found by Claude" /> : null}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{l.suggested_service ?? l.opportunity ?? l.industry ?? "—"}</p>
                <div className="mt-2">
                  <FitScore score={l.fit_score} />
                </div>
              </Link>
            ))}
            {items.length === 0 ? <p className="px-2 py-4 text-center text-[11px] text-muted">Empty</p> : null}
          </div>
        </section>
      ))}
    </div>
  );
}
