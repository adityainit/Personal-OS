"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Bot, CalendarPlus, Send } from "lucide-react";
import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { toast } from "sonner";
import { setLeadStatusAction } from "@/actions";
import { FitScore, StatusBadge } from "@/components/ui/badge";
import { LEAD_STATUSES, STATUS_LABEL, STATUS_TONE } from "@/lib/domain/constants";
import { dayLabel, type LeadMessages } from "@/lib/domain/messages";
import { formatPhone } from "@/lib/domain/phone";
import type { Lead, LeadKind, LeadStatus } from "@/lib/domain/types";
import { cn, fmtDate, fmtDateTime, instagramUrl, whatsappUrl, ymd } from "@/lib/utils";

/** A lead plus how many messages you've sent it and when. */
export type LeadRow = Lead & { messages: LeadMessages | null };

const col = createColumnHelper<LeadRow>();

function StatusSelect({ lead }: { lead: LeadRow }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label={`Status for ${lead.name}`}
      value={lead.status}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          const r = await setLeadStatusAction(lead.id, e.target.value as LeadStatus);
          if (r.ok) toast.success(`${lead.name}: ${STATUS_LABEL[e.target.value as LeadStatus]}`);
          else toast.error(r.error);
        })
      }
      className={cn(
        "cursor-pointer appearance-none rounded-full border-0 px-2 py-0.5 text-[11px] font-medium outline-none",
        STATUS_TONE[lead.status],
      )}
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

const instagramColumn = col.accessor("instagram_handle_normalized", {
  header: "Instagram",
  cell: (c) =>
    c.getValue() ? (
      <a
        href={instagramUrl(c.getValue()) ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="whitespace-nowrap text-xs hover:text-accent hover:underline"
      >
        @{c.getValue()}
      </a>
    ) : (
      <span className="text-xs text-muted">—</span>
    ),
  sortUndefined: "last",
});

const phoneColumn = col.accessor("phone_e164", {
  header: "WhatsApp",
  cell: (c) =>
    c.getValue() ? (
      <a
        href={whatsappUrl(c.getValue()) ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="whitespace-nowrap text-xs hover:text-accent hover:underline"
      >
        {formatPhone(c.getValue())}
      </a>
    ) : (
      <span className="text-xs text-muted">—</span>
    ),
  sortUndefined: "last",
});

const brandColumns = [
  col.accessor("name", {
    header: "Name",
    cell: (c) => (
      <div className="min-w-0">
        <Link href={`/leads/${c.row.original.id}`} className="font-medium hover:text-accent hover:underline">
          {c.getValue()}
        </Link>
        <p className="truncate text-[11px] text-muted">
          {[c.row.original.domain_normalized, c.row.original.instagram_handle_normalized && `@${c.row.original.instagram_handle_normalized}`]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
      </div>
    ),
  }),
  instagramColumn,
  col.accessor("industry", { header: "Industry", cell: (c) => <span className="text-muted">{c.getValue() ?? "—"}</span> }),
  col.accessor("status", {
    header: "Status",
    cell: (c) => <StatusSelect lead={c.row.original} />,
    sortingFn: (a, b) => LEAD_STATUSES.indexOf(a.original.status) - LEAD_STATUSES.indexOf(b.original.status),
  }),
  col.accessor("fit_score", {
    header: "Fit",
    cell: (c) => <FitScore score={c.getValue()} />,
    sortUndefined: "last",
  }),
  col.accessor("suggested_service", {
    header: "Opportunity",
    enableSorting: false,
    cell: (c) => <span className="line-clamp-1 max-w-64 text-muted">{c.getValue() ?? c.row.original.opportunity ?? "—"}</span>,
  }),
  col.accessor("source", {
    header: "Source",
    cell: (c) =>
      c.getValue() === "claude" ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-accent">
          <Bot className="size-3" /> Claude
        </span>
      ) : (
        <span className="text-[11px] text-muted">Manual</span>
      ),
  }),
  col.accessor("created_at", {
    header: "Added",
    cell: (c) => (
      <span className="whitespace-nowrap text-xs text-muted" title={fmtDateTime(c.getValue())} suppressHydrationWarning>
        {fmtDate(c.getValue())}
      </span>
    ),
  }),
  col.accessor((l) => l.messages?.count ?? 0, {
    id: "messages",
    header: "Messages sent",
    cell: (c) => <MessagesCell m={c.row.original.messages} />,
  }),
];

function MessagesCell({ m }: { m: LeadMessages | null }) {
  if (!m) return <span className="whitespace-nowrap text-xs text-muted">Not contacted</span>;
  return (
    <div className="whitespace-nowrap text-xs leading-tight" suppressHydrationWarning>
      <span className="font-medium tabular-nums">{m.count}</span>
      <span className="text-muted"> · first {fmtDate(m.first)}</span>
      {m.count > 1 ? <p className="text-[11px] text-muted">last {fmtDate(m.last)}</p> : null}
    </div>
  );
}

// Freelance: phone (WhatsApp) right after the name, then Instagram.
const freelanceColumns = [brandColumns[0], phoneColumn, ...brandColumns.slice(1)];

interface Props {
  leads: LeadRow[];
  kind?: LeadKind;
  /** Group rows under a heading per day added (rows must already be newest first). */
  groupByDate?: boolean;
  /** Messages sent per day (YYYY-MM-DD → count), shown in each day heading. */
  sentPerDay?: Record<string, number>;
}

/** Splits items into consecutive runs that share the same day. */
function groupRuns<T extends { day: string }>(items: T[]) {
  const runs: { day: string; items: T[] }[] = [];
  for (const it of items) {
    const last = runs[runs.length - 1];
    if (last && last.day === it.day) last.items.push(it);
    else runs.push({ day: it.day, items: [it] });
  }
  return runs;
}

function DayHeading({ day, added, sent, noun }: { day: string; added: number; sent: number; noun: string }) {
  const label = dayLabel(day);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" suppressHydrationWarning>
      <span className="font-semibold text-fg">{label}</span>
      {label === "Today" || label === "Yesterday" ? <span className="text-muted">{fmtDate(day)}</span> : null}
      <span className="inline-flex items-center gap-1 text-muted">
        <CalendarPlus className="size-3" /> {added} {noun}
        {added === 1 ? "" : "s"} added
      </span>
      <span className={cn("inline-flex items-center gap-1", sent ? "text-accent" : "text-muted")}>
        <Send className="size-3" /> {sent} message{sent === 1 ? "" : "s"} sent that day
      </span>
    </div>
  );
}

export function LeadsTable({ leads, kind = "brand", groupByDate = false, sentPerDay = {} }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const columns = kind === "freelance" ? freelanceColumns : brandColumns;
  const noun = kind === "freelance" ? "client" : "brand";
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: leads,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  // Clicking a column header re-sorts the table, which turns the date groups off.
  const grouped = groupByDate && sorting.length === 0;
  const rows = table.getRowModel().rows.map((r) => ({ r, day: grouped ? ymd(new Date(r.original.created_at)) : "" }));
  const runs = groupRuns(rows);
  const mobileRuns = groupRuns(leads.map((l) => ({ l, day: groupByDate ? ymd(new Date(l.created_at)) : "" })));

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border text-left text-xs text-muted">
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-4 py-2.5 font-medium">
                    {h.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 whitespace-nowrap hover:text-fg"
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.column.getIsSorted() === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : h.column.getIsSorted() === "desc" ? (
                          <ArrowDown className="size-3" />
                        ) : null}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {runs.map((run, i) => (
              <Fragment key={run.day || `run-${i}`}>
                {grouped ? (
                  <tr className="border-b border-border bg-surface-2/50">
                    <td colSpan={columns.length} className="px-4 py-2">
                      <DayHeading day={run.day} added={run.items.length} sent={sentPerDay[run.day] ?? 0} noun={noun} />
                    </td>
                  </tr>
                ) : null}
                {run.items.map(({ r }) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                    {r.getVisibleCells().map((c) => (
                      <td key={c.id} className="px-4 py-2.5 align-middle">
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile cards */}
      <ul className="divide-y divide-border md:hidden">
        {mobileRuns.map((run, i) => (
          <Fragment key={run.day || `run-${i}`}>
            {groupByDate ? (
              <li className="bg-surface-2/50 px-4 py-2">
                <DayHeading day={run.day} added={run.items.length} sent={sentPerDay[run.day] ?? 0} noun={noun} />
              </li>
            ) : null}
            {run.items.map(({ l }) => (
              <li key={l.id}>
                <Link href={`/leads/${l.id}`} className="flex flex-col gap-1.5 px-4 py-3 active:bg-surface-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{l.name}</span>
                    <StatusBadge status={l.status} />
                  </div>
                  <p className="line-clamp-1 text-xs text-muted">{l.suggested_service ?? l.industry ?? l.domain_normalized ?? "—"}</p>
                  {kind === "freelance" && l.phone_e164 ? <p className="text-xs text-muted">{formatPhone(l.phone_e164)}</p> : null}
                  {l.instagram_handle_normalized ? <p className="text-xs text-muted">@{l.instagram_handle_normalized}</p> : null}
                  <div className="flex items-center justify-between gap-2">
                    <FitScore score={l.fit_score} />
                    <span className="text-[11px] text-muted" suppressHydrationWarning>
                      {l.messages ? `${l.messages.count} sent · first ${fmtDate(l.messages.first)}` : `Added ${fmtDate(l.created_at)}`}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </Fragment>
        ))}
      </ul>
    </>
  );
}
