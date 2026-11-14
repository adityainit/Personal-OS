/**
 * Groups sent messages by day (in the app timezone) and by lead, so the Freelancing
 * page can show "how many messages went out on which date" and
 * "when did I contact this lead".
 */
import { ymd } from "@/lib/utils";
import type { OutreachChannel } from "./types";

export interface SentMessage {
  lead_id: string;
  sent_at: string;
  channel: OutreachChannel;
}

export interface DayTotal {
  /** YYYY-MM-DD in the app timezone. */
  day: string;
  total: number;
  /** Distinct leads messaged that day. */
  leadIds: string[];
}

export interface LeadMessages {
  count: number;
  first: string;
  last: string;
}

/** Totals per day, newest day first. Days without messages are left out. */
export function messagesByDay(rows: SentMessage[]): DayTotal[] {
  const days = new Map<string, DayTotal & { ids: Set<string> }>();
  for (const r of rows) {
    const day = ymd(new Date(r.sent_at));
    let d = days.get(day);
    if (!d) {
      d = { day, total: 0, leadIds: [], ids: new Set() };
      days.set(day, d);
    }
    d.total += 1;
    d.ids.add(r.lead_id);
  }
  return [...days.values()]
    .map(({ ids, ...d }) => ({ ...d, leadIds: [...ids] }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

/** Message count and first/last send time per lead. */
export function messagesByLead(rows: SentMessage[]): Record<string, LeadMessages> {
  const out: Record<string, LeadMessages> = {};
  for (const r of rows) {
    const m = out[r.lead_id];
    if (!m) out[r.lead_id] = { count: 1, first: r.sent_at, last: r.sent_at };
    else {
      m.count += 1;
      if (r.sent_at < m.first) m.first = r.sent_at;
      if (r.sent_at > m.last) m.last = r.sent_at;
    }
  }
  return out;
}

/** The last `n` calendar days ending today (newest first), filling in zero days. */
export function lastNDays(byDay: DayTotal[], n: number, today = ymd()): DayTotal[] {
  const index = new Map(byDay.map((d) => [d.day, d]));
  const out: DayTotal[] = [];
  const base = new Date(today + "T12:00:00Z");
  for (let i = 0; i < n; i++) {
    const day = new Date(base.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    out.push(index.get(day) ?? { day, total: 0, leadIds: [] });
  }
  return out;
}

/** "Today", "Yesterday" or e.g. "Sat, 7 Nov" (adds the year when it isn't this year). */
export function dayLabel(day: string, today = ymd()): string {
  if (day === today) return "Today";
  const t = new Date(today + "T00:00:00Z");
  const d = new Date(day + "T00:00:00Z");
  if (t.getTime() - d.getTime() === 86_400_000) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(d);
}
