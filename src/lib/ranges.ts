import { startOfDayInTz, ymd } from "./utils";

export const RANGE_PRESETS = [
  ["30d", "Last 30 days"],
  ["month", "This month"],
  ["90d", "Last 90 days"],
  ["year", "This year"],
  ["all", "All time"],
] as const;
export type RangeKey = (typeof RANGE_PRESETS)[number][0] | "custom";

export interface Range {
  key: RangeKey;
  label: string;
  from: string | null; // YYYY-MM-DD inclusive
  to: string | null; // YYYY-MM-DD inclusive
}

function addDays(day: string, n: number) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve the selected range from search params (dates in the app timezone). */
export function resolveRange(sp: Record<string, string | string[] | undefined>, fallback: RangeKey = "all"): Range {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const today = ymd();
  if (DATE.test(s("from")) || DATE.test(s("to"))) {
    return {
      key: "custom",
      label: "Custom range",
      from: DATE.test(s("from")) ? s("from") : null,
      to: DATE.test(s("to")) ? s("to") : null,
    };
  }
  const key = (RANGE_PRESETS.find(([k]) => k === s("range"))?.[0] ?? fallback) as RangeKey;
  const label = RANGE_PRESETS.find(([k]) => k === key)?.[1] ?? "All time";
  switch (key) {
    case "30d":
      return { key, label, from: addDays(today, -29), to: today };
    case "90d":
      return { key, label, from: addDays(today, -89), to: today };
    case "month":
      return { key, label, from: today.slice(0, 8) + "01", to: today };
    case "year":
      return { key, label, from: today.slice(0, 5) + "01-01", to: today };
    default:
      return { key: "all", label: "All time", from: null, to: null };
  }
}

/** The equally long period immediately before `r` (for comparisons). */
export function previousRange(r: Range): Range | null {
  if (!r.from || !r.to) return null;
  const days = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000) + 1;
  return { key: "custom", label: "Previous period", from: addDays(r.from, -days), to: addDays(r.from, -1) };
}

/** Timestamp bounds [from, to) for timestamptz queries. */
export function rangeInstants(r: Range) {
  return {
    from: r.from ? startOfDayInTz(r.from).toISOString() : undefined,
    to: r.to ? startOfDayInTz(addDays(r.to, 1)).toISOString() : undefined,
  };
}
