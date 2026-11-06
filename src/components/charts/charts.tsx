"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { money, num } from "@/lib/utils";

const AXIS = { fill: "var(--muted)", fontSize: 11 };

function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-fg">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-muted">
          {r.color ? <span className="size-2 rounded-sm" style={{ background: r.color }} /> : null}
          <span className="flex-1">{r.label}</span>
          <span className="font-medium tabular-nums text-fg">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monthly revenue: one series (brand collaborations), so no legend box
// ---------------------------------------------------------------------------
export interface MonthPoint {
  month: string;
  total: number;
}

/** Every month from `from` to `to` (YYYY-MM…), so empty months show as zero instead of disappearing. */
function fillMonths(data: MonthPoint[], from?: string | null, to?: string | null): MonthPoint[] {
  const byMonth = new Map(data.map((d) => [d.month.slice(0, 7), d]));
  const keys = [...byMonth.keys()].sort();
  const start = (from ?? keys[0])?.slice(0, 7);
  const end = (to ?? keys[keys.length - 1])?.slice(0, 7);
  if (!start || !end || start > end) return data;
  const out: MonthPoint[] = [];
  let [y, m] = start.split("-").map(Number);
  for (let i = 0; i < 120; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > end) break;
    out.push(byMonth.get(key) ?? { month: key, total: 0 });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function MonthlyRevenueChart({
  data,
  height = 260,
  from,
  to,
}: {
  data: MonthPoint[];
  height?: number;
  from?: string | null;
  to?: string | null;
}) {
  if (data.length === 0) return <p className="py-10 text-center text-xs text-muted">No payments in this period.</p>;
  const rows = fillMonths(data, from, to).map((d) => ({
    ...d,
    label: monthLabel(d.month),
    total: Number(d.total),
  }));
  return (
    <div>
      <div style={{ height }} role="img" aria-label="Monthly revenue received from brand collaborations">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => money(v, true)} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={(p: TooltipContentProps) =>
                p.active && p.payload?.length ? (
                  <TooltipBox
                    title={String(p.label)}
                    rows={[{ label: "Received", value: money(p.payload[0]?.payload.total), color: "var(--chart-1)" }]}
                  />
                ) : null
              }
            />
            <Bar dataKey="total" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted hover:text-fg">View as table</summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 font-medium">Month</th>
              <th className="py-1 text-right font-medium">Received</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className="border-t border-border">
                <td className="py-1">{r.label}</td>
                <td className="py-1 text-right font-medium tabular-nums">{money(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal single-series bars (funnel stages, revenue by client)
// ---------------------------------------------------------------------------
export function HBarChart({
  data,
  format = "number",
  label,
}: {
  data: { name: string; value: number; note?: string; color?: string }[];
  format?: "number" | "money";
  label: string;
}) {
  if (data.length === 0) return <p className="py-10 text-center text-xs text-muted">No data in this period.</p>;
  const fmt = (v: number) => (format === "money" ? money(v, true) : num(v));
  const height = Math.max(data.length * 38 + 16, 120);
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={96} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={(p: TooltipContentProps) =>
              p.active && p.payload?.length ? (
                <TooltipBox
                  title={String(p.label)}
                  rows={[
                    {
                      label: p.payload[0]?.payload.note ?? label,
                      value: format === "money" ? money(Number(p.payload[0]?.value)) : num(Number(p.payload[0]?.value)),
                      color: p.payload[0]?.payload.color ?? "var(--chart-1)",
                    },
                  ]}
                />
              ) : null
            }
          />
          <Bar
            dataKey="value"
            fill="var(--chart-1)"
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            label={{ position: "right", fill: "var(--fg)", fontSize: 11, formatter: (v: unknown) => fmt(Number(v)) }}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color ?? "var(--chart-1)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
