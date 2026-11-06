/**
 * Validation schemas shared by the web app (server actions) and the MCP server.
 */
import { z } from "zod";
import { CHANNELS, DEAL_STATUSES, INTERACTION_TYPES, LEAD_STATUSES } from "./constants";
import { validatePhone } from "./phone";

/** Optional text: trims, and turns "" into null. */
const optText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const longText = optText(50_000);

const optUrl = optText(500).refine(
  (v) => v === null || /^(https?:\/\/)?[^\s/$.?#][^\s]*\.[^\s]+$/i.test(v),
  "Enter a valid URL",
);

const optEmail = optText(320).refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email");

const optInt = (min: number, max: number) =>
  z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `Must be a whole number between ${min} and ${max}` });
        return z.NEVER;
      }
      return n;
    });

const money = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    const n = typeof v === "number" ? v : Number(String(v).replace(/[₹,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

const tags = z
  .union([z.array(z.string()), z.string()])
  .nullish()
  .transform((v) =>
    (Array.isArray(v) ? v : (v ?? "").split(","))
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20),
  );

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const optDate = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use YYYY-MM-DD");

export const leadKind = z.enum(["brand", "freelance"]);
export const leadStatus = z.enum(LEAD_STATUSES as [string, ...string[]]);
export const channel = z.enum(CHANNELS as [string, ...string[]]);

const leadDetailFields = {
  name: z.string().trim().min(1, "Name is required").max(200),
  website: optUrl,
  instagram_handle: optText(200),
  linkedin_url: optUrl,
  industry: optText(200),
  location: optText(200),
  company_size: optText(100),
  description: optText(5000),
  research: longText,
  opportunity: optText(5000),
  why_fit: optText(5000),
  suggested_service: optText(1000),
  fit_score: optInt(0, 100),
  tags,
  /** Optional primary contact, saved as a contact record when a lead is created. */
  contact_person: optText(200),
  email: optEmail,
};

const phoneFields = {
  phone_country: optText(10),
  phone_number: optText(40),
};

export const leadFields = { ...leadDetailFields, ...phoneFields };

export const NEEDS_PROFILE = "Add a website or a social profile (Instagram or LinkedIn)";
export const NEEDS_BRAND_PROFILE = "Add the brand's Instagram handle or website";

/**
 * New leads.
 *  - Freelance: name, a valid phone number with country code, and a website or profile.
 *  - Instagram brand deal: name and the brand's Instagram handle or website. No phone number
 *    (brand deals happen over DM / email); one that is given is still validated.
 */
export const leadCreateSchema = z
  .object({
    kind: leadKind,
    ...leadFields,
    status: leadStatus.optional(),
    source: z.enum(["claude", "manual"]).optional(),
  })
  .transform((d, ctx) => {
    const { phone_number, phone_country, ...rest } = d;
    if (d.kind === "brand") {
      if (!d.instagram_handle && !d.website) {
        ctx.addIssue({ code: "custom", path: ["instagram_handle"], message: NEEDS_BRAND_PROFILE });
        return z.NEVER;
      }
      if (!phone_number) return { ...rest, phone_e164: null, phone_country: null };
    } else if (!d.website && !d.instagram_handle && !d.linkedin_url) {
      ctx.addIssue({ code: "custom", path: ["website"], message: NEEDS_PROFILE });
      return z.NEVER;
    }
    const phone = validatePhone(phone_number, phone_country);
    if (!phone.ok) {
      ctx.addIssue({ code: "custom", path: ["phone_number"], message: phone.error });
      return z.NEVER;
    }
    return { ...rest, phone_e164: phone.e164 as string | null, phone_country: phone.country as string | null };
  });

/**
 * Edits: a phone number is validated whenever it is supplied. An empty phone becomes
 * `phone_e164: null`; the repository only allows that for brand leads.
 */
export const leadUpdateSchema = z
  .object(leadFields)
  .partial()
  .extend({ status: leadStatus.optional() })
  .transform((d, ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { phone_number, phone_country, contact_person, email, ...rest } = d;
    if (phone_number === undefined && phone_country === undefined) return rest;
    if (phone_number === undefined || phone_number === null) {
      return { ...rest, phone_e164: null as string | null, phone_country: null as string | null };
    }
    const phone = validatePhone(phone_number, phone_country);
    if (!phone.ok) {
      ctx.addIssue({ code: "custom", path: ["phone_number"], message: phone.error });
      return z.NEVER;
    }
    return { ...rest, phone_e164: phone.e164 as string | null, phone_country: phone.country as string | null };
  });

/** Researched businesses without a verified phone number. Never part of the pipeline. */
export const prospectSchema = z.object({
  kind: leadKind,
  ...leadDetailFields,
  missing: optText(300),
  source: z.enum(["claude", "manual"]).optional(),
});

export const contactSchema = z
  .object({
    name: optText(200),
    role: optText(200),
    email: optEmail,
    instagram: optText(200),
    linkedin: optText(500),
    phone: optText(50),
    source_url: optUrl,
    notes: optText(2000),
  })
  .refine((c) => c.name || c.email || c.instagram || c.linkedin || c.phone, {
    message: "Add at least a name, email, Instagram, LinkedIn or phone",
  });

export const outreachSchema = z.object({
  channel,
  subject: optText(300),
  body: z.string().trim().min(1, "Message is empty").max(20_000),
  contact_id: z.uuid().nullish(),
});

export const interactionSchema = z.object({
  type: z.enum(INTERACTION_TYPES as [string, ...string[]]),
  channel: channel.nullish(),
  content: z.string().trim().max(20_000).default(""),
  occurred_at: z.iso.datetime({ offset: true }).nullish(),
});

export const followUpSchema = z.object({
  due_at: z.iso.datetime({ offset: true }),
  reason: optText(500),
});

export const dealSchema = z.object({
  lead_id: z.uuid().nullish(),
  client_name: optText(200),
  kind: leadKind,
  title: z.string().trim().min(1, "Title is required").max(300),
  amount: money,
  status: z.enum(DEAL_STATUSES as [string, ...string[]]).default("active"),
  details: optText(5000),
  expected_date: optDate,
  payment_due_date: optDate,
});

export const paymentSchema = z.object({
  amount: money.refine((n) => n > 0, "Amount must be greater than 0"),
  paid_on: isoDate,
  method: optText(100),
  note: optText(1000),
});

export const creatorProfileSchema = z.object({
  instagram_handle: optText(100),
  niche: optText(500),
  followers: optInt(0, 1_000_000_000),
  avg_views: optInt(0, 1_000_000_000),
  engagement_rate: z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), "0–100"),
  audience: optText(2000),
  content_style: optText(2000),
  past_collaborations: optText(5000),
  rates: optText(2000),
  freelance_skills: optText(5000),
  portfolio_url: optUrl,
  bio: optText(5000),
});

/** Separate follow-up timing for Instagram brand deals and freelance clients. */
export const followUpRulesSchema = z.object({
  brand_first_follow_up_days: optInt(0, 90).transform((v) => v ?? 3),
  brand_follow_up_gap_days: optInt(1, 90).transform((v) => v ?? 4),
  brand_max_follow_ups: optInt(0, 20).transform((v) => v ?? 2),
  freelance_first_follow_up_days: optInt(0, 90).transform((v) => v ?? 2),
  freelance_follow_up_gap_days: optInt(1, 90).transform((v) => v ?? 3),
  freelance_max_follow_ups: optInt(0, 20).transform((v) => v ?? 3),
});

/** Strip null values so creator profile JSON stays tidy. */
export function compact<T extends Record<string, unknown>>(obj: T): { [K in keyof T]?: NonNullable<T[K]> } {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)) as {
    [K in keyof T]?: NonNullable<T[K]>;
  };
}

/** Turn FormData into a plain object (repeated keys become arrays). */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const val = typeof v === "string" ? v : v.name;
    if (k in out) out[k] = ([] as unknown[]).concat(out[k], val);
    else out[k] = val;
  }
  return out;
}

/** Human-readable first error message. */
export function firstError(err: z.ZodError) {
  const issue = err.issues[0];
  const path = issue?.path?.join(".");
  if (!issue) return "Invalid input";
  if (!path) return issue.message;
  const label = path.replace(/_e164$/, "").replace(/[._]/g, " ");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${issue.message}`;
}
