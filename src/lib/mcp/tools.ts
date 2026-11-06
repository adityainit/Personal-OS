import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import * as repo from "@/lib/domain/repo";
import { CHANNELS, INTERACTION_TYPES, LEAD_STATUSES } from "@/lib/domain/constants";
import { compact, creatorProfileSchema } from "@/lib/domain/schemas";
import { followUpRules } from "@/lib/domain/types";
import type { Db } from "@/lib/domain/repo";
import type { Lead } from "@/lib/domain/types";
import { createTokenClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const SERVER_INSTRUCTIONS = `
You are connected to Aditya's private Personal OS CRM for Instagram brand deals and the revenue they bring in.

Your role: research assistant and CRM operator. Aditya personally handles ALL communication.
- NEVER contact brands, and never claim a message was sent unless Aditya says he sent it.
  This server has no tool that sends anything; drafts are only saved for Aditya to copy.
- Read get_creator_profile first and tailor every proposal to Aditya's niche, audience and content.
- Before adding a brand, call check_duplicate (create_lead also refuses exact duplicates and returns the existing record).
- Do real research (use web search) before saving a brand: what it sells, its audience, its marketing and past creator
  collaborations, why it fits Aditya, the best collaboration to offer, and a fit_score 0-100. Only save qualified brands.
- A brand lead needs its name and its Instagram handle (or website). No phone number: Aditya reaches brands by
  Instagram DM or email.
- Only use contact details you actually found on an official/public source; always include source_url for each.
  NEVER guess or invent an email or handle. Email is optional: if you can't find one, leave it out.
- Prepare SEPARATE drafts per channel (instagram_dm short and casual; email with subject, more detailed).
- Use mark_outreach_sent / record_interaction only when Aditya explicitly tells you he sent something or got a reply.
  Follow-ups are then scheduled by his rules (see get_creator_profile, follow_up_rules).
- Leads can be referenced by id or exact name. Amounts are in INR.
`.trim();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accept a lead id or a (unique) name. */
async function resolveLead(db: Db, ref: string) {
  const r = ref.trim();
  if (UUID.test(r)) return repo.getLead(db, r);
  const { data, error } = await db.from("leads").select("*").ilike("name", r.replace(/[%_]/g, "\\$&")).limit(5);
  if (error) throw new repo.RepoError(error.message);
  if (data?.length === 1) return data[0] as Lead;
  if (data && data.length > 1) {
    throw new repo.RepoError(
      `Several leads are named "${r}": ${data.map((l) => `${l.name} (id ${l.id})`).join("; ")}. Use the id.`,
      "invalid",
    );
  }
  const hits = await repo.searchAll(db, r, 5);
  throw new repo.RepoError(
    hits.length
      ? `No lead named exactly "${r}". Did you mean: ${hits.map((h) => `${h.name} (id ${h.lead_id})`).join("; ")}?`
      : `No lead found for "${r}". Use search_leads or create_lead.`,
    "not_found",
  );
}

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 1) }] };
}

function errorResult(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

type Ctx = { http?: { authInfo?: { token: string } } };

/** Wraps a tool body: builds an RLS-scoped DB client from the caller's token and formats output. */
function run<A>(fn: (db: Db, args: A) => Promise<unknown>) {
  return async (args: A, ctx: Ctx) => {
    const token = ctx?.http?.authInfo?.token;
    if (!token) return errorResult(new Error("Not authenticated"));
    try {
      return json(await fn(createTokenClient(token), args));
    } catch (e) {
      return errorResult(e);
    }
  };
}

const link = (id: string) => `${env.siteUrl()}/leads/${id}`;

const leadRef = z.string().min(1).describe("Lead id (uuid) or exact lead name");
const status = z.enum(LEAD_STATUSES as [string, ...string[]]);
const channel = z.enum(CHANNELS as [string, ...string[]]);

const contactInput = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  email: z.string().optional(),
  instagram: z.string().optional(),
  linkedin: z.string().optional(),
  phone: z.string().optional(),
  source_url: z.string().optional().describe("Public page where this contact was found"),
  notes: z.string().optional(),
});

const draftInput = z.object({
  channel,
  subject: z.string().optional().describe("Email subject (email only)"),
  body: z.string().min(1),
});

const leadInputShape = {
  name: z.string().min(1),
  website: z.string().optional(),
  instagram_handle: z.string().optional(),
  linkedin_url: z.string().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  company_size: z.string().optional(),
  description: z.string().optional().describe("What the business does / products & services"),
  research: z
    .string()
    .optional()
    .describe("Full research notes in markdown: products, audience, marketing, past creator collabs, what they might need"),
  opportunity: z.string().optional().describe("The collaboration opportunity"),
  why_fit: z.string().optional().describe("Why they would want to work with Aditya"),
  suggested_service: z.string().optional().describe("Best collaboration format to offer, e.g. reel + story set"),
  fit_score: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string()).optional(),
};

const RO = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

export function registerTools(server: McpServer) {
  // ---------------------------------------------------------------- context
  server.registerTool(
    "get_creator_profile",
    {
      title: "Get creator profile",
      description:
        "Aditya's Instagram creator profile (niche, audience, followers, engagement, past collaborations, rates). Read this before finding brands.",
      inputSchema: z.object({}),
      annotations: RO,
    },
    run(async (db) => {
      const s = await repo.getSettings(db);
      return {
        creator_profile: s.creator_profile,
        follow_up_rules: {
          ...followUpRules(s),
          meaning: "first = days after the first message, gap = days between later follow-ups, max = follow-ups before stopping",
        },
        note: Object.keys(s.creator_profile ?? {}).length
          ? undefined
          : "Profile is empty — ask Aditya for his Instagram handle/niche, or research it and save with update_creator_profile after he confirms.",
      };
    }),
  );

  server.registerTool(
    "update_creator_profile",
    {
      title: "Update creator profile",
      description: "Merge fields into Aditya's creator profile. Only use with information Aditya confirmed.",
      inputSchema: z.object({
        instagram_handle: z.string().optional(),
        niche: z.string().optional(),
        followers: z.number().int().optional(),
        avg_views: z.number().int().optional(),
        engagement_rate: z.number().optional(),
        audience: z.string().optional(),
        content_style: z.string().optional(),
        past_collaborations: z.string().optional(),
        rates: z.string().optional(),
        portfolio_url: z.string().optional(),
        bio: z.string().optional(),
      }),
      annotations: WRITE,
    },
    run(async (db, args: Record<string, unknown>) => {
      const s = await repo.getSettings(db);
      const parsed = creatorProfileSchema.partial().parse(args);
      const merged = { ...s.creator_profile, ...compact(parsed) };
      return (await repo.updateSettings(db, { creator_profile: merged })).creator_profile;
    }),
  );

  server.registerTool(
    "dashboard_stats",
    {
      title: "Dashboard stats",
      description: "Headline CRM numbers: brands, messages sent, replies, follow-ups due, negotiations, wins, revenue, pending payments.",
      inputSchema: z.object({}),
      annotations: RO,
    },
    run(async (db) => repo.dashboardStats(db)),
  );

  // ---------------------------------------------------------------- leads
  server.registerTool(
    "check_duplicate",
    {
      title: "Check for duplicate lead",
      description: "Check whether a brand already exists (by website domain, Instagram handle, or similar name). Call before create_lead.",
      inputSchema: z.object({
        name: z.string().optional(),
        website: z.string().optional(),
        instagram_handle: z.string().optional(),
      }),
      annotations: RO,
    },
    run(async (db, a: { name?: string; website?: string; instagram_handle?: string }) => {
      const matches = await repo.checkDuplicate(db, { name: a.name, website: a.website, instagram: a.instagram_handle });
      return { is_duplicate: matches.some((m) => m.match_type !== "name" || m.score >= 0.8), matches };
    }),
  );

  server.registerTool(
    "create_lead",
    {
      title: "Add brand to CRM",
      description:
        "Save a researched, QUALIFIED brand with research, opportunity, fit score, public contacts and outreach drafts. Needs the brand's instagram_handle or website. No phone number. Email is optional. Refuses duplicates and returns the existing lead instead.",
      inputSchema: z.object({
        ...leadInputShape,
        contact_person: z.string().optional().describe("Name of the person to contact, if publicly listed"),
        email: z.string().optional().describe("Public email address; omit if none was found — never guess"),
        contacts: z.array(contactInput).optional(),
        drafts: z.array(draftInput).optional().describe("Outreach drafts — saved only, never sent"),
        allow_similar: z.boolean().optional().describe("Set true only if a brand with a similar name is genuinely a different brand"),
      }),
      annotations: WRITE,
    },
    run(async (db, a: Record<string, unknown> & { contacts?: unknown[]; drafts?: unknown[]; allow_similar?: boolean }) => {
      const { contacts = [], drafts = [], allow_similar, ...lead } = a;
      const res = await repo.createLead(db, { ...lead, source: "claude" }, { allowSimilar: allow_similar });
      if (res.duplicate) {
        return {
          duplicate: true,
          message: `Not added: "${res.lead.name}" already exists (status ${res.lead.status}) — same website, Instagram handle or name. Update it instead if needed.`,
          existing: { id: res.lead.id, name: res.lead.name, status: res.lead.status, url: link(res.lead.id) },
        };
      }
      const savedContacts = [];
      const warnings: string[] = [];
      for (const c of contacts) {
        try {
          savedContacts.push(await repo.addContact(db, res.lead.id, c));
        } catch (e) {
          warnings.push(`contact skipped: ${(e as Error).message}`);
        }
      }
      const savedDrafts = [];
      for (const d of drafts) {
        try {
          savedDrafts.push(await repo.saveDraft(db, res.lead.id, d));
        } catch (e) {
          warnings.push(`draft skipped: ${(e as Error).message}`);
        }
      }
      return {
        created: true,
        lead: { id: res.lead.id, name: res.lead.name, status: savedDrafts.length ? "drafted" : res.lead.status, url: link(res.lead.id) },
        contacts_saved: savedContacts.length,
        drafts_saved: savedDrafts.map((d) => ({ id: d.id, channel: d.channel })),
        similar_existing: res.similar.length ? res.similar : undefined,
        warnings: warnings.length ? warnings : undefined,
      };
    }),
  );

  server.registerTool(
    "update_lead",
    {
      title: "Update lead",
      description: "Edit a brand's details or research. Only provided fields change.",
      inputSchema: z.object({ lead: leadRef, ...Object.fromEntries(Object.entries(leadInputShape).map(([k, v]) => [k, v.optional()])), status: status.optional() }),
      annotations: WRITE,
    },
    run(async (db, a: Record<string, unknown> & { lead: string }) => {
      const { lead: ref, ...patch } = a;
      const l = await resolveLead(db, ref);
      const updated = await repo.updateLead(db, l.id, patch);
      return { id: updated.id, name: updated.name, status: updated.status, url: link(updated.id) };
    }),
  );

  server.registerTool(
    "update_lead_status",
    {
      title: "Update lead status",
      description:
        "Move a lead through the pipeline: new, researched, drafted, contacted, replied, interested, negotiating, won, lost, do_not_contact. won/lost/do_not_contact stop all follow-ups.",
      inputSchema: z.object({ lead: leadRef, status }),
      annotations: WRITE,
    },
    run(async (db, a: { lead: string; status: string }) => {
      const l = await resolveLead(db, a.lead);
      const u = await repo.updateLead(db, l.id, { status: a.status });
      return { id: u.id, name: u.name, from: l.status, to: u.status };
    }),
  );

  server.registerTool(
    "search_leads",
    {
      title: "Search leads",
      description: "List/search leads with filters. Returns compact rows; use get_lead for full details.",
      inputSchema: z.object({
        query: z.string().optional().describe("Text in name, domain, handle or industry"),
        status: z.array(status).optional(),
        min_fit_score: z.number().int().min(0).max(100).optional(),
        source: z.enum(["claude", "manual"]).optional(),
        sort: z.enum(["updated", "created", "fit", "name"]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: RO,
    },
    run(async (db, a: { query?: string; status?: string[]; min_fit_score?: number; source?: "claude" | "manual"; sort?: "updated" | "created" | "fit" | "name"; limit?: number }) => {
      const leads = await repo.listLeads(db, {
        q: a.query,
        status: a.status as never,
        minFit: a.min_fit_score,
        source: a.source,
        sort: a.sort,
        limit: a.limit ?? 50,
      });
      return {
        count: leads.length,
        leads: leads.map((l) => ({
          id: l.id,
          name: l.name,
          status: l.status,
          fit_score: l.fit_score,
          website: l.domain_normalized,
          instagram: l.instagram_handle_normalized,
          industry: l.industry,
          suggested_service: l.suggested_service,
          last_contacted_at: l.last_contacted_at,
          updated_at: l.updated_at,
        })),
      };
    }),
  );

  server.registerTool(
    "get_lead",
    {
      title: "Get lead with full history",
      description: "Full record: research, contacts, outreach drafts & sent messages, conversation, follow-ups, deals & payments, activity history.",
      inputSchema: z.object({ lead: leadRef }),
      annotations: RO,
    },
    run(async (db, a: { lead: string }) => {
      const l = await resolveLead(db, a.lead);
      const b = await repo.getLeadBundle(db, l.id);
      return { ...b, activities: b.activities.slice(0, 60), url: link(l.id) };
    }),
  );

  server.registerTool(
    "add_contact",
    {
      title: "Add contact",
      description: "Add a publicly available business contact to a lead. Include source_url.",
      inputSchema: z.object({ lead: leadRef, ...contactInput.shape }),
      annotations: WRITE,
    },
    run(async (db, a: Record<string, unknown> & { lead: string }) => {
      const { lead: ref, ...c } = a;
      const l = await resolveLead(db, ref);
      return repo.addContact(db, l.id, c);
    }),
  );

  // ---------------------------------------------------------------- outreach
  server.registerTool(
    "save_outreach_draft",
    {
      title: "Save outreach draft",
      description: "Save a personalised DM or email draft for Aditya to review and send himself. Never sends anything.",
      inputSchema: z.object({ lead: leadRef, ...draftInput.shape }),
      annotations: WRITE,
    },
    run(async (db, a: { lead: string; channel: string; subject?: string; body: string }) => {
      const l = await resolveLead(db, a.lead);
      const d = await repo.saveDraft(db, l.id, { channel: a.channel, subject: a.subject, body: a.body });
      return { draft_id: d.id, lead: l.name, channel: d.channel, url: `${link(l.id)}?tab=outreach` };
    }),
  );

  server.registerTool(
    "update_outreach_draft",
    {
      title: "Update outreach draft",
      description: "Edit an unsent draft.",
      inputSchema: z.object({ draft_id: z.uuid(), channel: channel.optional(), subject: z.string().optional(), body: z.string().optional() }),
      annotations: WRITE,
    },
    run(async (db, a: { draft_id: string; channel?: string; subject?: string; body?: string }) => {
      const { draft_id, ...patch } = a;
      return repo.updateDraft(db, draft_id, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    }),
  );

  server.registerTool(
    "mark_outreach_sent",
    {
      title: "Record that Aditya sent a message",
      description:
        "ONLY when Aditya says he personally sent it. Marks a draft as sent (or logs a message he wrote himself), sets the lead to contacted and schedules a follow-up per his rules. Blocks duplicate outreach on the same channel within 20h unless force=true.",
      inputSchema: z.object({
        lead: leadRef,
        draft_id: z.uuid().optional().describe("Draft that was sent. Omit to log a message that wasn't drafted here."),
        channel: channel.optional().describe("Required when draft_id is omitted"),
        message: z.string().optional().describe("What he sent, when draft_id is omitted"),
        follow_up_days: z.number().int().min(0).max(90).optional().describe("Override follow-up interval; 0 = none"),
        sent_at: z.iso.datetime({ offset: true }).optional(),
        force: z.boolean().optional(),
      }),
      annotations: WRITE,
    },
    run(async (db, a: { lead: string; draft_id?: string; channel?: string; message?: string; follow_up_days?: number; sent_at?: string; force?: boolean }) => {
      const l = await resolveLead(db, a.lead);
      let draftId = a.draft_id;
      if (!draftId) {
        if (!a.channel) throw new repo.RepoError("Provide draft_id, or channel (+ optional message)", "invalid");
        const d = await repo.saveDraft(db, l.id, { channel: a.channel, body: a.message || "(sent outside the CRM)" });
        draftId = d.id;
      }
      const res = await repo.markSent(db, draftId, { followUpDays: a.follow_up_days, sentAt: a.sent_at, force: a.force });
      return { lead: l.name, ...res };
    }),
  );

  // ---------------------------------------------------------------- conversation
  server.registerTool(
    "record_interaction",
    {
      title: "Record reply / note / negotiation",
      description:
        "Log something that happened, as told by Aditya. type=reply cancels pending follow-ups and sets status replied; negotiation sets negotiating; decline marks the lead lost and stops follow-ups.",
      inputSchema: z.object({
        lead: leadRef,
        type: z.enum(INTERACTION_TYPES as [string, ...string[]]),
        content: z.string().optional(),
        channel: channel.optional(),
        occurred_at: z.iso.datetime({ offset: true }).optional(),
      }),
      annotations: WRITE,
    },
    run(async (db, a: { lead: string; type: string; content?: string; channel?: string; occurred_at?: string }) => {
      const l = await resolveLead(db, a.lead);
      const i = await repo.recordInteraction(db, l.id, { type: a.type, content: a.content ?? "", channel: a.channel ?? null, occurred_at: a.occurred_at ?? null });
      const after = await repo.getLead(db, l.id);
      return { recorded: i.type, lead: l.name, status: after.status };
    }),
  );

  // ---------------------------------------------------------------- follow-ups
  server.registerTool(
    "list_follow_ups",
    {
      title: "List follow-ups",
      description: "Pending follow-ups: overdue, due today (India time), upcoming, or all.",
      inputSchema: z.object({
        range: z.enum(["overdue", "today", "upcoming", "all", "due"]).optional().describe("'due' = overdue + today (default)"),
      }),
      annotations: RO,
    },
    run(async (db, a: { range?: "overdue" | "today" | "upcoming" | "all" | "due" }) => {
      const r = a.range ?? "due";
      const items =
        r === "due"
          ? [
              ...(await repo.listFollowUps(db, { range: "overdue" })),
              ...(await repo.listFollowUps(db, { range: "today" })),
            ]
          : await repo.listFollowUps(db, { range: r });
      return {
        count: items.length,
        follow_ups: items.map((f) => ({ id: f.id, lead: f.lead.name, lead_id: f.lead.id, due_at: f.due_at, attempt: f.attempt, reason: f.reason })),
      };
    }),
  );

  server.registerTool(
    "set_follow_up",
    {
      title: "Schedule follow-up",
      description: "Schedule (or reschedule) the next follow-up for a lead. Replaces any pending one.",
      inputSchema: z.object({
        lead: leadRef,
        due_at: z.iso.datetime({ offset: true }).optional(),
        in_days: z.number().int().min(0).max(365).optional().describe("Alternative to due_at"),
        reason: z.string().optional(),
      }),
      annotations: WRITE,
    },
    run(async (db, a: { lead: string; due_at?: string; in_days?: number; reason?: string }) => {
      const l = await resolveLead(db, a.lead);
      const due = a.due_at ?? new Date(Date.now() + (a.in_days ?? 1) * 86_400_000).toISOString();
      return repo.setFollowUp(db, l.id, { due_at: due, reason: a.reason });
    }),
  );

  server.registerTool(
    "complete_follow_up",
    {
      title: "Complete or cancel follow-up",
      description: "Mark a follow-up done (Aditya followed up) or cancelled.",
      inputSchema: z.object({ follow_up_id: z.uuid(), outcome: z.enum(["done", "cancelled"]).optional(), note: z.string().optional() }),
      annotations: WRITE,
    },
    run(async (db, a: { follow_up_id: string; outcome?: "done" | "cancelled"; note?: string }) =>
      repo.updateFollowUp(db, a.follow_up_id, { status: a.outcome ?? "done", reason: a.note ?? null }),
    ),
  );

  // ---------------------------------------------------------------- money
  server.registerTool(
    "create_deal",
    {
      title: "Create deal / record income",
      description:
        "Record a brand collaboration with its amount (INR). Set status won when confirmed. Pass received_amount to also log a payment (e.g. 'record ₹15,000 from X').",
      inputSchema: z.object({
        lead: leadRef.optional().describe("Linked brand; omit and give client_name for brands not in the CRM"),
        client_name: z.string().optional(),
        title: z.string().min(1),
        amount: z.number().min(0),
        status: z.enum(["active", "won", "lost"]).optional(),
        details: z.string().optional(),
        expected_date: z.string().optional().describe("YYYY-MM-DD"),
        payment_due_date: z.string().optional().describe("YYYY-MM-DD"),
        received_amount: z.number().positive().optional(),
        received_on: z.string().optional().describe("YYYY-MM-DD, default today"),
      }),
      annotations: WRITE,
    },
    run(async (db, a: { lead?: string; client_name?: string; title: string; amount: number; status?: string; details?: string; expected_date?: string; payment_due_date?: string; received_amount?: number; received_on?: string }) => {
      const l = a.lead ? await resolveLead(db, a.lead) : null;
      const deal = await repo.createDeal(db, {
        lead_id: l?.id ?? null,
        client_name: a.client_name ?? null,
        title: a.title,
        amount: a.amount,
        status: a.status ?? "active",
        details: a.details,
        expected_date: a.expected_date,
        payment_due_date: a.payment_due_date,
      });
      const payment = a.received_amount
        ? await repo.recordPayment(db, deal.id, { amount: a.received_amount, paid_on: a.received_on ?? new Date().toISOString().slice(0, 10) })
        : null;
      return { deal, payment };
    }),
  );

  server.registerTool(
    "update_deal",
    {
      title: "Update deal",
      description: "Change a deal's amount, status (active/won/lost), dates or details.",
      inputSchema: z.object({
        deal_id: z.uuid(),
        title: z.string().optional(),
        amount: z.number().min(0).optional(),
        status: z.enum(["active", "won", "lost"]).optional(),
        details: z.string().optional(),
        expected_date: z.string().optional(),
        payment_due_date: z.string().optional(),
      }),
      annotations: WRITE,
    },
    run(async (db, a: Record<string, unknown> & { deal_id: string }) => {
      const { deal_id, ...patch } = a;
      return repo.updateDeal(db, deal_id, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    }),
  );

  server.registerTool(
    "record_payment",
    {
      title: "Record payment received",
      description: "Log money received against a deal. Use list_deals (or get_lead) to find the deal id.",
      inputSchema: z.object({
        deal_id: z.uuid(),
        amount: z.number().positive(),
        paid_on: z.string().optional().describe("YYYY-MM-DD, default today"),
        method: z.string().optional(),
        note: z.string().optional(),
      }),
      annotations: WRITE,
    },
    run(async (db, a: { deal_id: string; amount: number; paid_on?: string; method?: string; note?: string }) =>
      repo.recordPayment(db, a.deal_id, { ...a, paid_on: a.paid_on ?? new Date().toISOString().slice(0, 10) }),
    ),
  );

  server.registerTool(
    "list_deals",
    {
      title: "List deals",
      description: "Deals with amounts, payments received and pending balance.",
      inputSchema: z.object({ status: z.enum(["active", "won", "lost"]).optional() }),
      annotations: RO,
    },
    run(async (db, a: { status?: "active" | "won" | "lost" }) => {
      const deals = await repo.listDeals(db, a);
      return deals.map((d) => {
        const received = d.payments.reduce((s, p) => s + Number(p.amount), 0);
        return { id: d.id, client: d.client_name, lead_id: d.lead_id, title: d.title, amount: Number(d.amount), received, pending: Math.max(Number(d.amount) - received, 0), status: d.status };
      });
    }),
  );

  server.registerTool(
    "revenue_summary",
    {
      title: "Revenue summary",
      description: "Total, monthly and by brand revenue, pending payments and expected revenue. Dates YYYY-MM-DD.",
      inputSchema: z.object({ from: z.string().optional(), to: z.string().optional() }),
      annotations: RO,
    },
    run(async (db, a: { from?: string; to?: string }) => repo.revenueSummary(db, a.from, a.to)),
  );

  // ---------------------------------------------------------------- insights
  server.registerTool(
    "top_opportunities",
    {
      title: "Most promising opportunities",
      description: "Open brand deals ranked by fit score, pipeline momentum and freshness.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
      annotations: RO,
    },
    run(async (db, a: { limit?: number }) =>
      (await repo.topOpportunities(db, a.limit ?? 10)).map((l) => ({
        id: l.id,
        name: l.name,
        status: l.status,
        fit_score: l.fit_score,
        opportunity_score: l.opportunity_score,
        suggested_service: l.suggested_service,
        why_fit: l.why_fit,
        url: link(l.id),
      })),
    ),
  );

  server.registerTool(
    "pipeline_report",
    {
      title: "Pipeline report",
      description: "Brand outreach funnel counts and conversion in a period (ISO timestamps).",
      inputSchema: z.object({ from: z.string().optional(), to: z.string().optional() }),
      annotations: RO,
    },
    run(async (db, a: { from?: string; to?: string }) => repo.pipelineFunnel(db, a.from, a.to)),
  );

  server.registerTool(
    "recent_activity",
    {
      title: "Recent activity",
      description: "Latest CRM activity, optionally for one lead.",
      inputSchema: z.object({ lead: leadRef.optional(), limit: z.number().int().min(1).max(100).optional() }),
      annotations: RO,
    },
    run(async (db, a: { lead?: string; limit?: number }) => {
      const leadId = a.lead ? (await resolveLead(db, a.lead)).id : undefined;
      const rows = await repo.listActivities(db, { leadId, limit: a.limit ?? 25 });
      return rows.map((r) => ({ at: r.created_at, type: r.type, summary: r.summary, actor: r.actor, lead: r.lead?.name }));
    }),
  );
}
