"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Bot } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setLeadStatusAction } from "@/actions";
import { FitScore, StatusBadge } from "@/components/ui/badge";
import { LEAD_STATUSES, STATUS_LABEL, STATUS_TONE } from "@/lib/domain/constants";
import { formatPhone } from "@/lib/domain/phone";
import type { Lead, LeadKind, LeadStatus } from "@/lib/domain/types";
import { cn, instagramUrl, relative } from "@/lib/utils";

const col = createColumnHelper<Lead>();

function StatusSelect({ lead }: { lead: Lead }) {
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

const phoneColumn = col.accessor("phone_e164", {
  header: "Phone",
  cell: (c) =>
    c.getValue() ? (
      <a href={`tel:${c.getValue()}`} className="whitespace-nowrap text-xs tabular-nums hover:text-accent hover:underline">
        {formatPhone(c.getValue())}
      </a>
    ) : (
      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">Missing</span>
    ),
  sortUndefined: "last",
});

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

const baseColumns = [
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
  "CONTACT",
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
  col.accessor("updated_at", {
    header: "Updated",
    cell: (c) => (
      <span className="whitespace-nowrap text-xs text-muted" suppressHydrationWarning>
        {relative(c.getValue())}
      </span>
    ),
  }),
];

// Brand deals are reached on Instagram; freelance clients by phone.
const COLUMNS = {
  brand: baseColumns.map((c) => (c === "CONTACT" ? instagramColumn : c)),
  freelance: baseColumns.map((c) => (c === "CONTACT" ? phoneColumn : c)),
} as unknown as Record<LeadKind, typeof phoneColumn[]>;

export function LeadsTable({ leads, kind }: { leads: Lead[]; kind: LeadKind }) {
  const columns = COLUMNS[kind];
  const [sorting, setSorting] = useState<SortingState>([]);
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: leads,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

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
                        className="inline-flex items-center gap-1 hover:text-fg"
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
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} className="px-4 py-2.5 align-middle">
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile cards */}
      <ul className="divide-y divide-border md:hidden">
        {leads.map((l) => (
          <li key={l.id}>
            <Link href={`/leads/${l.id}`} className="flex flex-col gap-1.5 px-4 py-3 active:bg-surface-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{l.name}</span>
                <StatusBadge status={l.status} />
              </div>
              <p className="line-clamp-1 text-xs text-muted">{l.suggested_service ?? l.industry ?? l.domain_normalized ?? "—"}</p>
              {kind === "freelance" ? (
                <p className="text-xs text-muted">{formatPhone(l.phone_e164) ?? <span className="font-medium text-warning">No phone number</span>}</p>
              ) : l.instagram_handle_normalized ? (
                <p className="text-xs text-muted">@{l.instagram_handle_normalized}</p>
              ) : null}
              <div className="flex items-center justify-between">
                <FitScore score={l.fit_score} />
                <span className="text-[11px] text-muted" suppressHydrationWarning>
                  {relative(l.updated_at)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
