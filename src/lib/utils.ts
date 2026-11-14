import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNowStrict } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function num(n: number | string | null | undefined) {
  return new Intl.NumberFormat("en-IN").format(Number(n ?? 0));
}

/** All dates are shown in the user's timezone, regardless of where the server runs. */
export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";

function toDate(d: string | Date) {
  return typeof d === "string" ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + "T00:00:00Z" : d) : d;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function intl(opts: Intl.DateTimeFormatOptions, plainDate = false) {
  const key = JSON.stringify(opts) + plainDate;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: plainDate ? "UTC" : APP_TIMEZONE });
    fmtCache.set(key, f);
  }
  return f;
}

/** YYYY-MM-DD of a moment in the app timezone. */
export function ymd(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(d);
}

/** UTC instant at which the given app-timezone calendar day starts. */
export function startOfDayInTz(day: string = ymd()) {
  const [y, m, dd] = day.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, dd));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asTz = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess.getTime() - (asTz - guess.getTime()));
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const plain = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const date = plain ? new Date((d as string) + "T00:00:00Z") : toDate(d);
  return intl({ day: "numeric", month: "short", year: "numeric" }, plain).format(date);
}

export function fmtTime(d: string | Date) {
  return intl({ hour: "numeric", minute: "2-digit", hour12: true }).format(toDate(d));
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return `${fmtDate(d)}, ${fmtTime(d)}`;
}

export function relative(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = toDate(d);
  // Small clock differences between the database and this machine would otherwise show
  // a record saved a moment ago as "in 1 second".
  if (Math.abs(date.getTime() - Date.now()) < 60_000) return "just now";
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

export function dueLabel(d: string | Date) {
  const date = toDate(d);
  const day = ymd(date);
  const today = ymd();
  const tomorrow = ymd(new Date(Date.now() + 86_400_000));
  const yesterday = ymd(new Date(Date.now() - 86_400_000));
  const time = fmtTime(date);
  if (day === today) return `Today, ${time}`;
  if (day === tomorrow) return `Tomorrow, ${time}`;
  if (day === yesterday) return `Yesterday, ${time}`;
  return `${intl({ weekday: "short", day: "numeric", month: "short" }).format(date)}, ${time}`;
}

export function externalUrl(url: string | null | undefined) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function instagramUrl(handle: string | null | undefined) {
  if (!handle) return null;
  if (/instagram\.com/i.test(handle)) return externalUrl(handle);
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

/** wa.me chat link for an E.164 number, optionally with a prefilled message (you still press send). */
export function whatsappUrl(e164: string | null | undefined, text?: string) {
  if (!e164) return null;
  const digits = e164.replace(/\D/g, "");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function pct(n: number | null | undefined) {
  return `${Number(n ?? 0).toFixed(1).replace(/\.0$/, "")}%`;
}
