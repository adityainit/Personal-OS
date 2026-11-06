/**
 * Data access shared by server actions and the MCP server.
 * Every function takes a Supabase client that is already scoped to the user,
 * so Row Level Security enforces ownership on every call.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { startOfDayInTz, ymd } from "@/lib/utils";
import {
  contactSchema,
  dealSchema,
  firstError,
  followUpSchema,
  interactionSchema,
  leadCreateSchema,
  leadUpdateSchema,
  outreachSchema,
  paymentSchema,
} from "./schemas";
import type {
  Activity,
  Contact,
  DashboardStats,
  Deal,
  FollowUp,
  Funnel,
  Interaction,
  Lead,
  LeadStatus,
  Outreach,
  Payment,
  RevenueSummary,
  Settings,
} from "./types";

export type Db = SupabaseClient;

export class RepoError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "duplicate" | "invalid" | "db" = "db",
    public details?: unknown,
  ) {
    super(message);
  }
}

function check<T>(res: { data: T | null; error: { message: string; code?: string; hint?: string } | null }): T {
  if (res.error) {
    const msg = res.error.message.replace(/^DUPLICATE_OUTREACH:\s*/, "");
    if (res.error.code === "23505") throw new RepoError("A record with these details already exists.", "duplicate");
    if (res.error.message.startsWith("DUPLICATE_OUTREACH")) throw new RepoError(msg, "duplicate", res.error.hint);
    throw new RepoError(msg, "db");
  }
  return res.data as T;
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new RepoError(firstError(r.error), "invalid", r.error.issues);
  }
  return r.data;
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------
export interface LeadFilters {
  status?: LeadStatus | LeadStatus[];
  q?: string;
  minFit?: number;
  tag?: string;
  source?: "claude" | "manual";
  sort?: "updated" | "created" | "fit" | "name";
  limit?: number;
}

export async function listLeads(db: Db, f: LeadFilters = {}) {
  let q = db.from("leads").select("*");
  if (f.status) q = Array.isArray(f.status) ? q.in("status", f.status) : q.eq("status", f.status);
  if (f.minFit !== undefined) q = q.gte("fit_score", f.minFit);
  if (f.tag) q = q.contains("tags", [f.tag.toLowerCase()]);
  if (f.source) q = q.eq("source", f.source);
  if (f.q) {
    const term = f.q.replace(/[%,()"'\\*]/g, " ").trim();
    if (term)
      q = q.or(
        `name.ilike.%${term}%,domain_normalized.ilike.%${term}%,instagram_handle_normalized.ilike.%${term.replace(/^@/, "")}%,industry.ilike.%${term}%`,
      );
  }
  const sort = f.sort ?? "updated";
  q =
    sort === "fit"
      ? q.order("fit_score", { ascending: false, nullsFirst: false })
      : sort === "name"
        ? q.order("name")
        : q.order(sort === "created" ? "created_at" : "updated_at", { ascending: false });
  return check(await q.limit(f.limit ?? 500)) as Lead[];
}

export async function getLead(db: Db, id: string) {
  const lead = check(await db.from("leads").select("*").eq("id", id).maybeSingle()) as Lead | null;
  if (!lead) throw new RepoError("Lead not found", "not_found");
  return lead;
}

export async function getLeadBundle(db: Db, id: string) {
  const [lead, contacts, outreach, interactions, followUps, deals, activities] = await Promise.all([
    getLead(db, id),
    db.from("contacts").select("*").eq("lead_id", id).order("created_at"),
    db.from("outreach").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    db.from("interactions").select("*").eq("lead_id", id).order("occurred_at", { ascending: false }),
    db.from("follow_ups").select("*").eq("lead_id", id).order("due_at", { ascending: false }),
    db.from("deals").select("*, payments(*)").eq("lead_id", id).order("created_at", { ascending: false }),
    db.from("activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(300),
  ]);
  return {
    lead,
    contacts: check(contacts) as Contact[],
    outreach: check(outreach) as Outreach[],
    interactions: check(interactions) as Interaction[],
    followUps: check(followUps) as FollowUp[],
    deals: check(deals) as (Deal & { payments: Payment[] })[],
    activities: check(activities) as Activity[],
  };
}

export interface DuplicateMatch {
  id: string;
  name: string;
  status: LeadStatus;
  match_type: "website" | "instagram" | "phone" | "name";
  score: number;
}

export async function checkDuplicate(
  db: Db,
  p: {
    name?: string | null;
    website?: string | null;
    instagram?: string | null;
    phone?: string | null;
  },
) {
  return check(
    await db.rpc("check_duplicate", {
      p_name: p.name ?? null,
      p_website: p.website ?? null,
      p_instagram: p.instagram ?? null,
      p_phone: p.phone ?? null,
    }),
  ) as DuplicateMatch[];
}

/**
 * Creates a lead unless it already exists.
 * - Same website or Instagram handle: always the same business, so the existing lead is returned.
 * - Same phone number or a very similar name: probably the same business, so it is returned too
 *   unless `allowSimilar` is set (the user confirmed it is a different business).
 * A phone number is optional; one that is given is validated here and by a database trigger.
 */
export async function createLead(db: Db, input: unknown, opts: { allowSimilar?: boolean } = {}) {
  const data = parse(leadCreateSchema, input);
  const { contact_person, email, ...lead } = data;
  const dups = await checkDuplicate(db, {
    name: lead.name,
    website: lead.website,
    instagram: lead.instagram_handle,
    phone: lead.phone_e164,
  });
  const exact = dups.find((d) => d.match_type === "website" || d.match_type === "instagram");
  if (exact) return { lead: await getLead(db, exact.id), duplicate: true as const, similar: dups };
  const probable = dups.find((d) => d.match_type === "phone" || (d.match_type === "name" && d.score >= 0.8));
  if (probable && !opts.allowSimilar) {
    return { lead: await getLead(db, probable.id), duplicate: true as const, similar: dups };
  }
  const status = lead.status ?? (lead.research ? "researched" : "new");
  const created = check(await db.from("leads").insert({ ...lead, status }).select("*").single()) as Lead;
  if (contact_person || email) {
    // The lead is already saved; a problem with the optional contact must not undo it.
    await addContact(db, created.id, { name: contact_person, email }).catch(() => undefined);
  }
  return { lead: created, duplicate: false as const, similar: dups };
}

export async function updateLead(db: Db, id: string, input: unknown) {
  const data = parse(leadUpdateSchema, input);
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length === 0) return getLead(db, id);
  const lead = check(await db.from("leads").update(clean).eq("id", id).select("*").maybeSingle()) as Lead | null;
  if (!lead) throw new RepoError("Lead not found", "not_found");
  return lead;
}

export async function deleteLead(db: Db, id: string) {
  check(await db.from("leads").delete().eq("id", id));
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------
export async function addContact(db: Db, leadId: string, input: unknown) {
  const data = parse(contactSchema, input);
  return check(await db.from("contacts").insert({ ...data, lead_id: leadId }).select("*").single()) as Contact;
}

export async function updateContact(db: Db, id: string, input: unknown) {
  const data = parse(contactSchema, input);
  return check(await db.from("contacts").update(data).eq("id", id).select("*").single()) as Contact;
}

export async function deleteContact(db: Db, id: string) {
  check(await db.from("contacts").delete().eq("id", id));
}

// ---------------------------------------------------------------------------
// Outreach
// ---------------------------------------------------------------------------
export async function saveDraft(db: Db, leadId: string, input: unknown) {
  const data = parse(outreachSchema, input);
  return check(await db.from("outreach").insert({ ...data, lead_id: leadId }).select("*").single()) as Outreach;
}

export async function updateDraft(db: Db, id: string, input: unknown) {
  const data = parse(outreachSchema.partial(), input);
  const existing = check(await db.from("outreach").select("status").eq("id", id).maybeSingle()) as {
    status: string;
  } | null;
  if (!existing) throw new RepoError("Message not found", "not_found");
  if (existing.status === "sent") throw new RepoError("Sent messages can't be edited", "invalid");
  return check(await db.from("outreach").update(data).eq("id", id).select("*").single()) as Outreach;
}

export async function deleteDraft(db: Db, id: string) {
  check(await db.from("outreach").delete().eq("id", id).eq("status", "draft"));
}

/** Record that the user personally sent this message. Never sends anything. */
export async function markSent(
  db: Db,
  outreachId: string,
  opts: { followUpDays?: number | null; sentAt?: string | null; force?: boolean } = {},
) {
  return check(
    await db.rpc("mark_outreach_sent", {
      p_outreach_id: outreachId,
      p_follow_up_days: opts.followUpDays ?? null,
      p_sent_at: opts.sentAt ?? null,
      p_force: opts.force ?? false,
    }),
  ) as { outreach_id: string; lead_id: string; sent_at: string; attempt: number; follow_up: { id: string; due_at: string } | null };
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------
export async function recordInteraction(db: Db, leadId: string, input: unknown) {
  const data = parse(interactionSchema, input);
  const row = { ...data, lead_id: leadId, occurred_at: data.occurred_at ?? new Date().toISOString() };
  return check(await db.from("interactions").insert(row).select("*").single()) as Interaction;
}

export async function deleteInteraction(db: Db, id: string) {
  check(await db.from("interactions").delete().eq("id", id));
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------
export async function setFollowUp(db: Db, leadId: string, input: unknown) {
  const data = parse(followUpSchema, input);
  const lead = await getLead(db, leadId);
  if (["won", "lost", "do_not_contact"].includes(lead.status)) {
    throw new RepoError(`${lead.name} is closed (${lead.status.replace(/_/g, " ")}); reopen it before scheduling.`, "invalid");
  }
  // One pending follow-up per lead: the new one replaces the old.
  check(
    await db
      .from("follow_ups")
      .update({ status: "cancelled", reason: "Rescheduled" })
      .eq("lead_id", leadId)
      .eq("status", "pending"),
  );
  const { count } = await db.from("follow_ups").select("id", { count: "exact", head: true }).eq("lead_id", leadId);
  return check(
    await db
      .from("follow_ups")
      .insert({ lead_id: leadId, due_at: data.due_at, reason: data.reason, attempt: (count ?? 0) + 1 })
      .select("*")
      .single(),
  ) as FollowUp;
}

export async function updateFollowUp(
  db: Db,
  id: string,
  patch: { status?: "pending" | "done" | "cancelled"; due_at?: string; reason?: string | null },
) {
  return check(await db.from("follow_ups").update(patch).eq("id", id).select("*").single()) as FollowUp;
}

export type FollowUpWithLead = FollowUp & {
  lead: Pick<Lead, "id" | "name" | "status" | "instagram_handle">;
};

export async function listFollowUps(
  db: Db,
  opts: { range?: "overdue" | "today" | "upcoming" | "all"; limit?: number } = {},
) {
  // Day boundaries in the user's timezone (the server may run in UTC).
  const startOfToday = startOfDayInTz();
  const endOfToday = new Date(startOfDayInTz(ymd(new Date(startOfToday.getTime() + 36 * 3_600_000))).getTime() - 1);
  let q = db
    .from("follow_ups")
    .select("*, lead:leads(id, name, status, instagram_handle)")
    .eq("status", "pending")
    .order("due_at");
  if (opts.range === "overdue") q = q.lt("due_at", startOfToday.toISOString());
  if (opts.range === "today")
    q = q.gte("due_at", startOfToday.toISOString()).lte("due_at", endOfToday.toISOString());
  if (opts.range === "upcoming") q = q.gt("due_at", endOfToday.toISOString());
  return check(await q.limit(opts.limit ?? 500)) as FollowUpWithLead[];
}

// ---------------------------------------------------------------------------
// Deals & payments
// ---------------------------------------------------------------------------
export type DealWithPayments = Deal & { payments: Payment[] };

export async function listDeals(db: Db, opts: { status?: Deal["status"] } = {}) {
  let q = db.from("deals").select("*, payments(*)").order("created_at", { ascending: false });
  if (opts.status) q = q.eq("status", opts.status);
  return check(await q) as DealWithPayments[];
}

export async function createDeal(db: Db, input: unknown) {
  const data = parse(dealSchema, input);
  if (!data.lead_id && !data.client_name) throw new RepoError("Pick a lead or enter a client name", "invalid");
  return check(await db.from("deals").insert({ ...data, client_name: data.client_name ?? "" }).select("*").single()) as Deal;
}

export async function updateDeal(db: Db, id: string, input: unknown) {
  const data = parse(dealSchema.partial(), input);
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  return check(await db.from("deals").update(clean).eq("id", id).select("*").single()) as Deal;
}

export async function deleteDeal(db: Db, id: string) {
  check(await db.from("deals").delete().eq("id", id));
}

export async function recordPayment(db: Db, dealId: string, input: unknown) {
  const data = parse(paymentSchema, input);
  return check(await db.from("payments").insert({ ...data, deal_id: dealId }).select("*").single()) as Payment;
}

export async function updatePayment(db: Db, id: string, input: unknown) {
  const data = parse(paymentSchema, input);
  return check(await db.from("payments").update(data).eq("id", id).select("*").single()) as Payment;
}

export async function deletePayment(db: Db, id: string) {
  check(await db.from("payments").delete().eq("id", id));
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
export async function dashboardStats(db: Db) {
  return check(await db.rpc("dashboard_stats")) as DashboardStats;
}

export async function pipelineFunnel(db: Db, from?: string, to?: string) {
  return check(
    await db.rpc("pipeline_funnel", {
      p_from: from ?? "-infinity",
      p_to: to ?? "infinity",
    }),
  ) as Funnel;
}

export async function revenueSummary(db: Db, from?: string, to?: string) {
  return check(
    await db.rpc("revenue_summary", { p_from: from ?? "0001-01-01", p_to: to ?? "9999-12-31" }),
  ) as RevenueSummary;
}

export async function searchAll(db: Db, query: string, limit = 20) {
  return check(await db.rpc("search_all", { p_query: query, p_limit: limit })) as {
    lead_id: string;
    name: string;
    status: LeadStatus;
    matched_on: string;
    score: number;
  }[];
}

export async function listActivities(
  db: Db,
  opts: { leadId?: string; type?: string; actor?: string; limit?: number; before?: string } = {},
) {
  let q = db
    .from("activities")
    .select("*, lead:leads(id, name)")
    .order("created_at", { ascending: false });
  if (opts.leadId) q = q.eq("lead_id", opts.leadId);
  if (opts.type) q = q.like("type", `${opts.type}%`);
  if (opts.actor) q = q.eq("actor", opts.actor);
  if (opts.before) q = q.lt("created_at", opts.before);
  return check(await q.limit(opts.limit ?? 100)) as unknown as (Activity & {
    lead: Pick<Lead, "id" | "name"> | null;
  })[];
}

/** Rank open leads: fit score, pipeline momentum, and freshness. */
export async function topOpportunities(db: Db, limit = 10) {
  const leads = await listLeads(db, {
    status: ["new", "researched", "drafted", "contacted", "replied", "interested", "negotiating"],
    limit: 500,
  });
  const momentum: Partial<Record<LeadStatus, number>> = {
    negotiating: 30,
    interested: 25,
    replied: 20,
    contacted: 5,
    drafted: 8,
    researched: 6,
    new: 0,
  };
  const scored = leads.map((l) => {
    const ageDays = (Date.now() - new Date(l.updated_at).getTime()) / 86_400_000;
    const score = (l.fit_score ?? 40) + (momentum[l.status] ?? 0) - Math.min(ageDays, 30) * 0.5;
    return { ...l, opportunity_score: Math.round(score) };
  });
  return scored.sort((a, b) => b.opportunity_score - a.opportunity_score).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function getSettings(db: Db) {
  const s = check(await db.from("settings").select("*").maybeSingle()) as Settings | null;
  if (s) return s;
  // Safety net if the signup trigger didn't run (e.g. user created before migration).
  return check(await db.from("settings").insert({}).select("*").single()) as Settings;
}

export async function updateSettings(db: Db, patch: Partial<Omit<Settings, "owner_id">>) {
  await getSettings(db);
  return check(await db.from("settings").update(patch).not("owner_id", "is", null).select("*").single()) as Settings;
}
