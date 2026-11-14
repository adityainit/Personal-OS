import { dayLabel, type DayTotal } from "@/lib/domain/messages";
import { fmtDate, num } from "@/lib/utils";

/** Messages sent per day as bars, oldest on the left. Plain CSS bars, matching the dashboard's mini funnel. */
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
          <div key={d.day} className="group relative flex h-full flex-col justify-end" title={`${fmtDate(d.day)}: ${d.total} sent`}>
            {d.total > 0 ? (
              <span className="mb-0.5 text-center text-[10px] font-medium tabular-nums text-muted">{d.total}</span>
            ) : null}
            <div
              className="overflow-hidden rounded-t-sm bg-[var(--chart-1)]"
              style={{ height: `${(d.total / max) * 100}%` }}
            />
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
    </figure>
  );
}
