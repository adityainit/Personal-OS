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
import { num } from "@/lib/utils";

const AXIS = { fill: "var(--muted)", fontSize: 11 };

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
// Horizontal single-series bars (funnel stages)
// ---------------------------------------------------------------------------
export function HBarChart({
  data,
  label,
}: {
  data: { name: string; value: number; note?: string; color?: string }[];
  label: string;
}) {
  if (data.length === 0) return <p className="py-10 text-center text-xs text-muted">No data in this period.</p>;
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
                      value: num(Number(p.payload[0]?.value)),
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
            label={{ position: "right", fill: "var(--fg)", fontSize: 11, formatter: (v: unknown) => num(Number(v)) }}
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
