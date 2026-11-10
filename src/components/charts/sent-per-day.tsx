import { dayLabel, type DayTotal } from "@/lib/domain/messages";
import { fmtDate, num } from "@/lib/utils";

/**
 * Messages sent per day as stacked bars (brand deals + freelancing), oldest on the left.
 * Plain CSS bars, matching the dashboard's mini funnels.
 */
export function SentPerDayChart({ days, height = 120 }: { days: DayTotal[]; height?: number }) {
  const ordered = [...days].reverse();
  const max = Math.max(1, ...ordered.map((d) => d.total));
  const total = ordered.reduce((n, d) => n + d.total, 0);
  return (
    <figure>
      <div
        className="grid items-end gap-1"
        style={{ gridTemplateColumns: `repeat(${ordered.length}, minmax(0, 1fr))`, height }}
        role="img"
        aria-label={`Messages sent per day: ${num(total)} in ${ordered.length} days`}
      >
        {ordered.map((d) => (
          <div
            key={d.day}
            className="group relative flex h-full flex-col justify-end"
            title={`${fmtDate(d.day)}: ${d.total} sent (${d.brand} brand deals, ${d.freelance} freelancing)`}
          >
            {d.total > 0 ? (
              <span className="mb-0.5 text-center text-[10px] font-medium tabular-nums text-muted">{d.total}</span>
            ) : null}
            <div className="flex flex-col overflow-hidden rounded-t-sm" style={{ height: `${(d.total / max) * 100}%` }}>
              <span className="block bg-[var(--chart-2)]" style={{ flexGrow: d.freelance }} />
              <span className="block bg-[var(--chart-1)]" style={{ flexGrow: d.brand }} />
            </div>
            {d.total === 0 ? <span className="block h-px bg-border" /> : null}
          </div>
        ))}
      </div>
      <div
        className="mt-1.5 grid gap-1 text-center text-[10px] text-muted"
        style={{ gridTemplateColumns: `repeat(${ordered.length}, minmax(0, 1fr))` }}
        aria-hidden
      >
        {ordered.map((d, i) => (
          <span key={d.day} className="truncate">
            {(ordered.length - 1 - i) % 2 === 0 || ordered.length <= 7 ? (dayLabel(d.day) === "Today" ? "Today" : d.day.slice(8).replace(/^0/, "")) : ""}
          </span>
        ))}
      </div>
      <figcaption className="mt-2 flex items-center gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-[var(--chart-1)]" /> Brand deals
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-[var(--chart-2)]" /> Freelancing
        </span>
      </figcaption>
    </figure>
  );
}
