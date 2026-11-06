import { ArrowDownRight, ArrowUpRight, Download, Minus } from "lucide-react";
import { HBarChart, MonthlyRevenueChart } from "@/components/charts/charts";
import { RangeFilter } from "@/components/charts/range-filter";
import { InstagramIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { pipelineFunnel, revenueSummary } from "@/lib/domain/repo";
import type { Funnel } from "@/lib/domain/types";
import { previousRange, rangeInstants, resolveRange } from "@/lib/ranges";
import { requireUser } from "@/lib/supabase/server";
import { cn, money, num, pct } from "@/lib/utils";

type Row = { label: string; cur: number; prev: number | null; kind?: "money" | "pct" | "num" };

function Delta({ cur, prev }: { cur: number; prev: number | null }) {
  if (prev === null) return <span className="text-muted">—</span>;
  const diff = cur - prev;
  if (diff === 0) return <span className="inline-flex items-center gap-0.5 text-muted"><Minus className="size-3" /> 0</span>;
  const up = diff > 0;
  const rel = prev === 0 ? null : (diff / prev) * 100;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-success" : "text-danger")}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {rel === null ? "new" : `${Math.abs(rel).toFixed(0)}%`}
    </span>
  );
}

function fmt(v: number, kind: Row["kind"]) {
  return kind === "money" ? money(v) : kind === "pct" ? pct(v) : num(v);
}

function CompareTable({ rows, hasPrev }: { rows: Row[]; hasPrev: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted">
          <th className="px-4 py-2 font-medium">Metric</th>
          <th className="px-4 py-2 text-right font-medium">This period</th>
          {hasPrev ? <th className="px-4 py-2 text-right font-medium">Previous</th> : null}
          {hasPrev ? <th className="px-4 py-2 text-right font-medium">Change</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-border last:border-0">
            <td className="px-4 py-2">{r.label}</td>
            <td className="px-4 py-2 text-right font-medium tabular-nums">{fmt(r.cur, r.kind)}</td>
            {hasPrev ? <td className="px-4 py-2 text-right tabular-nums text-muted">{r.prev === null ? "—" : fmt(r.prev, r.kind)}</td> : null}
            {hasPrev ? (
              <td className="px-4 py-2 text-right text-xs">
                <Delta cur={r.cur} prev={r.prev} />
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function funnelRows(f: Funnel, p: Funnel | null): Row[] {
  const r = (label: string, key: keyof Funnel, k: Row["kind"] = "num"): Row => ({
    label,
    cur: Number(f[key]),
    prev: p ? Number(p[key]) : null,
    kind: k,
  });
  return [
    r("Brands discovered", "discovered"),
    r("Brands contacted", "contacted"),
    r("Messages sent", "messages_sent"),
    r("Replies received", "replied"),
    r("Interested brands", "interested"),
    r("Collaborations confirmed", "won"),
    r("Reply rate", "reply_rate", "pct"),
    r("Conversion rate (won ÷ contacted)", "conversion_rate", "pct"),
  ];
}

function FunnelCard({ f, p, title, icon }: { f: Funnel; p: Funnel | null; title: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2">{icon} {title}</span>}
        description={`Conversion ${pct(f.conversion_rate)} · Reply rate ${pct(f.reply_rate)}`}
      />
      <div className="p-4">
        <HBarChart
          label={`${title} funnel`}
          data={[
            { name: "Discovered", value: f.discovered },
            { name: "Contacted", value: f.contacted },
            { name: "Replied", value: f.replied },
            { name: "Interested", value: f.interested },
            { name: "Confirmed", value: f.won },
          ]}
        />
      </div>
      <div className="border-t border-border">
        <CompareTable rows={funnelRows(f, p)} hasPrev={p !== null} />
      </div>
    </Card>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const sp = await searchParams;
  const range = resolveRange(sp, "90d");
  const prev = previousRange(range);
  const cur = rangeInstants(range);
  const old = prev ? rangeInstants(prev) : null;
  const { supabase } = await requireUser();

  const [bf, rev, pbf, prev_rev] = await Promise.all([
    pipelineFunnel(supabase, cur.from, cur.to),
    revenueSummary(supabase, range.from ?? undefined, range.to ?? undefined),
    old ? pipelineFunnel(supabase, old.from, old.to) : null,
    prev ? revenueSummary(supabase, prev.from!, prev.to!) : null,
  ]);

  const revRows: Row[] = [
    { label: "Total earnings", cur: Number(rev.total_received), prev: prev_rev ? Number(prev_rev.total_received) : null, kind: "money" },
    { label: "Deal value won", cur: Number(rev.won_deal_value), prev: prev_rev ? Number(prev_rev.won_deal_value) : null, kind: "money" },
    { label: "Pending payments (now)", cur: Number(rev.pending_payments), prev: null, kind: "money" },
    { label: "Expected from active deals (now)", cur: Number(rev.expected_from_active), prev: null, kind: "money" },
  ];

  const exportQs = new URLSearchParams({ type: "report", ...(cur.from ? { from: cur.from } : {}), ...(cur.to ? { to: cur.to } : {}), ...(range.from ? { dfrom: range.from } : {}), ...(range.to ? { dto: range.to } : {}) });

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        description={prev ? `${range.label}, compared with the previous ${range.key === "month" ? "period of equal length" : "period"}.` : `${range.label}.`}
        actions={
          <a href={`/api/export?${exportQs}`} className={buttonClass("secondary")}>
            <Download /> Export report CSV
          </a>
        }
      />
      <RangeFilter base="/reports" range={range} />

      <div className="grid gap-4 xl:grid-cols-2">
        <FunnelCard f={bf} p={pbf} title="Instagram brand deals" icon={<InstagramIcon className="size-4" />} />
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Monthly earnings" description={range.label} />
            <div className="p-4">
              <MonthlyRevenueChart data={rev.monthly} from={range.from} to={range.to} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Revenue" description={prev ? "vs previous period" : undefined} />
            <CompareTable rows={revRows} hasPrev={prev !== null} />
          </Card>
        </div>
      </div>
    </>
  );
}
