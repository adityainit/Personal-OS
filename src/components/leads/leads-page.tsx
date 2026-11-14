import { Download, LayoutGrid, Plus, Search, Send, Table2, Users, X } from "lucide-react";
import Link from "next/link";
import { createLeadAction } from "@/actions";
import { ActionForm } from "@/components/ui/action-form";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { LEAD_STATUSES, STATUS_LABEL } from "@/lib/domain/constants";
import { dayLabel, lastNDays, messagesByDay, messagesByLead, type DayTotal } from "@/lib/domain/messages";
import { listLeads, listSentMessages, type LeadFilters } from "@/lib/domain/repo";
import type { LeadStatus } from "@/lib/domain/types";
import { requireUser } from "@/lib/supabase/server";
import { cn, fmtDate, ymd } from "@/lib/utils";
import { LeadFields } from "./lead-form";
import { LeadsBoard } from "./leads-board";
import { LeadsTable, type LeadRow } from "./leads-table";

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const copy = {
  title: "Freelancing",
  description: "Businesses you could do freelance work for. You reach them on WhatsApp or by email.",
  empty: "No clients yet",
  emptyHint: 'Ask Claude: "Find 10 local businesses that need a better website and add them to my CRM."',
  add: "Add client",
  dupes: "Duplicates are detected by phone number, Instagram handle and website.",
  filter: "Filter by name, @handle, domain, phone",
  noun: "client",
} as const;

export async function LeadsPage({ searchParams }: { searchParams: SP }) {
  const { supabase } = await requireUser();
  const view = str(searchParams.view) === "board" ? "board" : "table";
  const status = str(searchParams.status);
  const filters: LeadFilters = {
    q: str(searchParams.q),
    status: status === "open"
      ? ["new", "researched", "drafted", "contacted", "replied", "interested", "negotiating"]
      : (LEAD_STATUSES as string[]).includes(status ?? "") ? (status as LeadStatus) : undefined,
    minFit: str(searchParams.minFit) ? Number(str(searchParams.minFit)) : undefined,
    source: str(searchParams.source) === "claude" ? "claude" : str(searchParams.source) === "manual" ? "manual" : undefined,
    sort: (["updated", "created", "fit", "name"] as const).find((s) => s === str(searchParams.sort)) ?? "created",
  };
  const [allLeads, sent] = await Promise.all([listLeads(supabase, filters), listSentMessages(supabase)]);
  const byDay = messagesByDay(sent);
  const byLead = messagesByLead(sent);
  const sentDay = /^\d{4}-\d{2}-\d{2}$/.test(str(searchParams.sent) ?? "") ? str(searchParams.sent)! : undefined;
  const sentDayTotal = sentDay ? byDay.find((d) => d.day === sentDay) : undefined;
  const contactedThatDay = sentDay ? new Set(sentDayTotal?.leadIds ?? []) : null;
  const leads: LeadRow[] = allLeads
    .filter((l) => !contactedThatDay || contactedThatDay.has(l.id))
    .map((l) => ({ ...l, messages: byLead[l.id] ?? null }));
  const sentPerDay = Object.fromEntries(byDay.map((d) => [d.day, d.total]));
  const base = "/freelance";
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...searchParams, ...patch })) if (typeof v === "string" && v) p.set(k, v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const filtered = Boolean(filters.q || status || filters.minFit || filters.source || sentDay);

  return (
    <>
      <PageHeader
        title={copy.title}
        description={`${copy.description} ${leads.length} shown.`}
        actions={
          <>
            <a href="/api/export?type=leads" className={buttonClass("secondary", "md")}>
              <Download /> CSV
            </a>
            <Dialog
              trigger={<><Plus /> {copy.add}</>}
              title={copy.add}
              wide
              description={copy.dupes}
            >
              <ActionForm action={createLeadAction}>
                <LeadFields />
              </ActionForm>
            </Dialog>
          </>
        }
      />

      <SentByDay days={byDay} total={sent.length} active={sentDay} hrefFor={(day) => qs({ sent: day === sentDay ? undefined : day })} noun={copy.noun} />

      <Card>
        {sentDay ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent-soft/40 px-4 py-2 text-xs">
            <Send className="size-3.5 text-accent" />
            <span>
              Showing the {leads.length} {copy.noun}
              {leads.length === 1 ? "" : "s"} you messaged on <span className="font-semibold">{fmtDate(sentDay)}</span> (
              {sentDayTotal?.total ?? 0} message{sentDayTotal?.total === 1 ? "" : "s"})
            </span>
            <Link href={qs({ sent: undefined })} className="ml-auto inline-flex items-center gap-1 text-muted hover:text-fg">
              <X className="size-3" /> Show all
            </Link>
          </div>
        ) : null}
        <form className="flex flex-wrap items-center gap-2 border-b border-border p-3" action={base}>
          <input type="hidden" name="view" value={view} />
          {sentDay ? <input type="hidden" name="sent" value={sentDay} /> : null}
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input name="q" defaultValue={filters.q} placeholder={copy.filter} className="pl-8" />
          </div>
          <Select name="status" defaultValue={status ?? ""} className="w-auto" aria-label="Status">
            <option value="">All statuses</option>
            <option value="open">Open pipeline</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select name="minFit" defaultValue={str(searchParams.minFit) ?? ""} className="w-auto" aria-label="Minimum fit">
            <option value="">Any fit</option>
            <option value="50">Fit ≥ 50</option>
            <option value="70">Fit ≥ 70</option>
            <option value="85">Fit ≥ 85</option>
          </Select>
          <Select name="source" defaultValue={filters.source ?? ""} className="w-auto" aria-label="Source">
            <option value="">Any source</option>
            <option value="claude">Found by Claude</option>
            <option value="manual">Added manually</option>
          </Select>
          <Select name="sort" defaultValue={filters.sort} className="w-auto" aria-label="Sort">
            <option value="created">Newest first (by date)</option>
            <option value="updated">Recently updated</option>
            <option value="fit">Best fit</option>
            <option value="name">Name A–Z</option>
          </Select>
          <button type="submit" className={buttonClass("secondary", "md")}>
            Apply
          </button>
          {filtered ? (
            <Link href={qs({ q: undefined, status: undefined, minFit: undefined, source: undefined, sent: undefined })} className="text-xs text-muted hover:text-fg">
              Clear
            </Link>
          ) : null}
          <div className="ml-auto flex rounded-lg border border-border p-0.5">
            <Link
              href={qs({ view: "table" })}
              aria-label="Table view"
              className={cn("rounded-md p-1.5", view === "table" ? "bg-surface-2 text-fg" : "text-muted")}
            >
              <Table2 className="size-4" />
            </Link>
            <Link
              href={qs({ view: "board" })}
              aria-label="Board view"
              className={cn("rounded-md p-1.5", view === "board" ? "bg-surface-2 text-fg" : "text-muted")}
            >
              <LayoutGrid className="size-4" />
            </Link>
          </div>
        </form>

        {leads.length === 0 ? (
          <EmptyState icon={<Users />} title={filtered ? "No leads match these filters" : copy.empty}>
            {filtered ? (
              <ButtonLink href={base} variant="secondary" size="sm" className="mt-2">
                Clear filters
              </ButtonLink>
            ) : (
              copy.emptyHint
            )}
          </EmptyState>
        ) : view === "board" ? (
          <LeadsBoard leads={leads} />
        ) : (
          <LeadsTable leads={leads} groupByDate={filters.sort === "created"} sentPerDay={sentPerDay} />
        )}
      </Card>
    </>
  );
}

/**
 * Messages sent per day: the last two weeks (empty days included) plus any older day
 * with messages. Click a day to list the leads you messaged on it.
 */
function SentByDay({
  days,
  total,
  active,
  hrefFor,
  noun,
}: {
  days: DayTotal[];
  total: number;
  active?: string;
  hrefFor: (day: string) => string;
  noun: string;
}) {
  const today = ymd();
  const recent = lastNDays(days, 14, today);
  const cutoff = recent[recent.length - 1].day;
  const older = days.filter((d) => d.day < cutoff).slice(0, 46);
  const shown = [...recent, ...older];
  const todayCount = recent[0].total;
  const week = recent.slice(0, 7).reduce((n, d) => n + d.total, 0);
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-4 py-2.5">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Send className="size-3.5 text-accent" /> Messages sent
        </p>
        <p className="text-xs text-muted">
          <span className="font-medium text-fg tabular-nums">{todayCount}</span> today ·{" "}
          <span className="font-medium text-fg tabular-nums">{week}</span> last 7 days ·{" "}
          <span className="font-medium text-fg tabular-nums">{total}</span> all time
        </p>
        <p className="ml-auto hidden text-[11px] text-muted sm:block">Click a day to see who you messaged</p>
      </div>
      <ol className="flex gap-2 overflow-x-auto p-3 scrollbar-thin">
        {shown.map((d) => {
          const isActive = d.day === active;
          const body = (
            <>
              <span className="text-[11px] text-muted">{dayLabel(d.day, today)}</span>
              <span className={cn("text-lg font-semibold tabular-nums leading-tight", d.total === 0 && "text-muted/60")}>{d.total}</span>
              <span className="text-[10px] text-muted">
                {d.leadIds.length} {noun}
                {d.leadIds.length === 1 ? "" : "s"}
              </span>
            </>
          );
          const cls = cn(
            "flex w-20 shrink-0 flex-col items-center rounded-lg border px-2 py-1.5 text-center",
            isActive ? "border-accent bg-accent-soft" : "border-border",
          );
          return (
            <li key={d.day}>
              {d.total > 0 ? (
                <Link href={hrefFor(d.day)} title={fmtDate(d.day)} className={cn(cls, "transition-colors hover:border-accent/60 hover:bg-surface-2")}>
                  {body}
                </Link>
              ) : (
                <div title={fmtDate(d.day)} className={cn(cls, "opacity-70")}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
