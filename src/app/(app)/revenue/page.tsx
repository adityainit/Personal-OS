import { Download, IndianRupee, Plus, Target, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { createDealAction } from "@/actions";
import { HBarChart, MonthlyRevenueChart } from "@/components/charts/charts";
import { RangeFilter } from "@/components/charts/range-filter";
import { DealCard } from "@/components/revenue/deal-card";
import { DealFields } from "@/components/revenue/deal-forms";
import { ActionForm } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, StatTile } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { listDeals, listLeads, revenueSummary } from "@/lib/domain/repo";
import type { DealStatus } from "@/lib/domain/types";
import { resolveRange } from "@/lib/ranges";
import { requireUser } from "@/lib/supabase/server";
import { cn, money } from "@/lib/utils";

export default async function RevenuePage({ searchParams }: PageProps<"/revenue">) {
  const sp = await searchParams;
  const range = resolveRange(sp, "year");
  const dealStatus = (["active", "won", "lost"] as const).find((s) => s === sp.deals) as DealStatus | undefined;
  const { supabase } = await requireUser();
  const [summary, deals, leads] = await Promise.all([
    revenueSummary(supabase, range.from ?? undefined, range.to ?? undefined),
    listDeals(supabase, { status: dealStatus }),
    listLeads(supabase, { sort: "name", limit: 1000 }),
  ]);
  const leadOptions = leads.map((l) => ({ id: l.id, name: l.name }));
  const rangeParams: Record<string, string> =
    range.key === "custom" ? { from: range.from ?? "", to: range.to ?? "" } : { range: range.key };

  return (
    <>
      <PageHeader
        title="Revenue"
        description="Record deals and payments. Totals update automatically."
        actions={
          <>
            <a href="/api/export?type=deals" className={buttonClass("secondary")}>
              <Download /> Deals CSV
            </a>
            <a href="/api/export?type=payments" className={buttonClass("secondary")}>
              <Download /> Payments CSV
            </a>
            <Dialog trigger={<><Plus /> Add deal</>} title="Add deal / income" wide description="A brand collaboration or sponsorship.">
              <ActionForm action={createDealAction}>
                <DealFields leads={leadOptions} />
              </ActionForm>
            </Dialog>
          </>
        }
      />
      <RangeFilter base="/revenue" range={range} extra={dealStatus ? { deals: dealStatus } : {}} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Received" hint={range.label} value={money(summary.total_received, true)} icon={<IndianRupee />} tone="success" />
        <StatTile label="Pending payments" hint="Won deals, not fully paid" value={money(summary.pending_payments, true)} icon={<Wallet />} tone="warning" />
        <StatTile label="Expected" hint="From active deals" value={money(summary.expected_from_active, true)} icon={<Target />} tone="accent" />
        <StatTile label="Deals won" hint={`Value closed · ${range.label.toLowerCase()}`} value={money(summary.won_deal_value, true)} icon={<TrendingUp />} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Monthly revenue received" description={range.label} />
          <div className="p-4">
            <MonthlyRevenueChart data={summary.monthly} from={range.from} to={range.to} />
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue by client" description={`Top 8 · ${range.label}`} />
          <div className="p-4">
            <HBarChart
              label="Revenue received"
              format="money"
              data={summary.by_client.slice(0, 8).map((c) => ({
                name: c.client.length > 14 ? c.client.slice(0, 13) + "…" : c.client,
                value: Number(c.received),
              }))}
            />
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Deals"
          description="Edit amounts, mark won/lost and record payments."
          action={
            <div className="flex rounded-lg border border-border p-0.5 text-xs">
              {[
                ["", "All"],
                ["active", "Active"],
                ["won", "Won"],
                ["lost", "Lost"],
              ].map(([v, l]) => (
                <Link
                  key={v}
                  href={`/revenue?${new URLSearchParams({ ...rangeParams, ...(v ? { deals: v } : {}) })}`}
                  className={cn("rounded-md px-2.5 py-1", (dealStatus ?? "") === v ? "bg-surface-2 text-fg" : "text-muted")}
                >
                  {l}
                </Link>
              ))}
            </div>
          }
        />
        {deals.length === 0 ? (
          <EmptyState icon={<IndianRupee />} title="No deals yet">
            Add income here, or ask Claude: &quot;Record ₹15,000 revenue from my collaboration with X.&quot;
          </EmptyState>
        ) : (
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {deals.map((d) => (
              <DealCard key={d.id} deal={d} leads={leadOptions} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
