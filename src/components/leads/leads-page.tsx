import { Download, LayoutGrid, Plus, Search, Table2, Users } from "lucide-react";
import Link from "next/link";
import { createLeadAction } from "@/actions";
import { ActionForm } from "@/components/ui/action-form";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { KIND_PATH, LEAD_STATUSES, STATUS_LABEL } from "@/lib/domain/constants";
import { listLeads, type LeadFilters } from "@/lib/domain/repo";
import type { LeadKind, LeadStatus } from "@/lib/domain/types";
import { requireUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { LeadFields } from "./lead-form";
import { LeadsBoard } from "./leads-board";
import { LeadsTable } from "./leads-table";

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const COPY = {
  brand: {
    title: "Instagram Brand Deals",
    description: "Brands that could sponsor or collaborate with your content.",
    empty: "No brands yet",
    emptyHint: 'Ask Claude: "Find 10 brands that fit my Instagram profile and add them to my CRM."',
    add: "Add brand",
    dupes: "Duplicates are detected by Instagram handle and website.",
    filter: "Filter by name, @handle, domain",
  },
  freelance: {
    title: "Freelancing",
    description: "Businesses you could do freelance work for. You reach them on WhatsApp or by email.",
    empty: "No freelance clients yet",
    emptyHint: 'Ask Claude: "Find 10 local businesses that need a better website and add them to my freelancing pipeline."',
    add: "Add client",
    dupes: "Duplicates are detected by phone number, Instagram handle and website.",
    filter: "Filter by name, @handle, domain, phone",
  },
} as const;

export async function LeadsPage({ searchParams, kind = "brand" }: { searchParams: SP; kind?: LeadKind }) {
  const copy = COPY[kind];
  const { supabase } = await requireUser();
  const view = str(searchParams.view) === "board" ? "board" : "table";
  const status = str(searchParams.status);
  const filters: LeadFilters = {
    kind,
    q: str(searchParams.q),
    status: status === "open"
      ? ["new", "researched", "drafted", "contacted", "replied", "interested", "negotiating"]
      : (LEAD_STATUSES as string[]).includes(status ?? "") ? (status as LeadStatus) : undefined,
    minFit: str(searchParams.minFit) ? Number(str(searchParams.minFit)) : undefined,
    source: str(searchParams.source) === "claude" ? "claude" : str(searchParams.source) === "manual" ? "manual" : undefined,
    sort: (["updated", "created", "fit", "name"] as const).find((s) => s === str(searchParams.sort)) ?? "updated",
  };
  const leads = await listLeads(supabase, filters);
  const base = KIND_PATH[kind];
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...searchParams, ...patch })) if (typeof v === "string" && v) p.set(k, v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const filtered = Boolean(filters.q || status || filters.minFit || filters.source);

  return (
    <>
      <PageHeader
        title={copy.title}
        description={`${copy.description} ${leads.length} shown.`}
        actions={
          <>
            <a href={`/api/export?type=leads&kind=${kind}`} className={buttonClass("secondary", "md")}>
              <Download /> CSV
            </a>
            <Dialog
              trigger={<><Plus /> {copy.add}</>}
              title={copy.add}
              wide
              description={copy.dupes}
            >
              <ActionForm action={createLeadAction}>
                <LeadFields kind={kind} />
              </ActionForm>
            </Dialog>
          </>
        }
      />

      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b border-border p-3" action={base}>
          <input type="hidden" name="view" value={view} />
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
            <option value="updated">Recently updated</option>
            <option value="created">Newest</option>
            <option value="fit">Best fit</option>
            <option value="name">Name A–Z</option>
          </Select>
          <button type="submit" className={buttonClass("secondary", "md")}>
            Apply
          </button>
          {filtered ? (
            <Link href={qs({ q: undefined, status: undefined, minFit: undefined, source: undefined })} className="text-xs text-muted hover:text-fg">
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
          <LeadsTable leads={leads} kind={kind} />
        )}
      </Card>
    </>
  );
}
