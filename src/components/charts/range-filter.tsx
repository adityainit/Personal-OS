import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { RANGE_PRESETS, type Range } from "@/lib/ranges";
import { cn } from "@/lib/utils";

/** One row of date-range controls above the charts (server-rendered, works without JS). */
export function RangeFilter({ base, range, extra = {} }: { base: string; range: Range; extra?: Record<string, string> }) {
  const qs = (p: Record<string, string>) => `${base}?${new URLSearchParams({ ...extra, ...p })}`;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap rounded-lg border border-border bg-surface p-0.5">
        {RANGE_PRESETS.map(([k, label]) => (
          <Link
            key={k}
            href={qs({ range: k })}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium",
              range.key === k ? "bg-accent-soft text-accent" : "text-muted hover:text-fg",
            )}
          >
            {label}
          </Link>
        ))}
      </div>
      <form action={base} className="flex flex-wrap items-center gap-1.5">
        {Object.entries(extra).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <Input type="date" name="from" defaultValue={range.from ?? ""} className="h-8 w-auto text-xs" aria-label="From" />
        <span className="text-xs text-muted">to</span>
        <Input type="date" name="to" defaultValue={range.to ?? ""} className="h-8 w-auto text-xs" aria-label="To" />
        <button type="submit" className={buttonClass(range.key === "custom" ? "subtle" : "secondary", "sm")}>
          Apply
        </button>
      </form>
    </div>
  );
}
