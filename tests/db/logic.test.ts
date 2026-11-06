import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDb, as, asSystem, USER_A, USER_B } from "./harness";

let db: PGlite;

async function newLead(user = USER_A, fields: Record<string, unknown> = {}, claude = false) {
  const f = { name: "Acme AI", website: "https://www.acme.ai/about", ...fields };
  const cols = Object.keys(f);
  const rows = await as<{ id: string }>(
    db,
    user,
    `insert into leads (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
    Object.values(f),
    { claude },
  );
  return rows[0].id;
}

async function lead(id: string) {
  return (await asSystem<{ status: string; last_contacted_at: string | null }>(
    db, "select * from leads where id = $1", [id]))[0];
}

async function followUps(leadId: string) {
  return asSystem<{ status: string; due_at: string; attempt: number; reason: string }>(
    db, "select * from follow_ups where lead_id = $1 order by created_at", [leadId]);
}

async function draft(leadId: string, channel = "instagram_dm") {
  const rows = await as<{ id: string }>(db, USER_A,
    "insert into outreach (lead_id, channel, body) values ($1, $2, 'Hi!') returning id", [leadId, channel]);
  return rows[0].id;
}

beforeAll(async () => {
  db = await createDb();
}, 60_000);

describe("settings", () => {
  it("creates a settings row for each new user", async () => {
    const rows = await as(db, USER_A, "select default_follow_up_days from settings");
    expect(rows).toEqual([{ default_follow_up_days: 3 }]);
  });
});

describe("row level security", () => {
  it("hides one user's leads from another", async () => {
    const id = await newLead(USER_A, { name: "Private Co", website: "private.co" });
    expect(await as(db, USER_B, "select id from leads where id = $1", [id])).toHaveLength(0);
    expect(await as(db, USER_A, "select id from leads where id = $1", [id])).toHaveLength(1);
  });

  it("blocks attaching records to someone else's lead", async () => {
    const id = await newLead(USER_A, { name: "Guarded", website: "guarded.io" });
    await expect(
      as(db, USER_B, "insert into contacts (lead_id, email) values ($1, 'x@y.z')", [id]),
    ).rejects.toThrow();
  });

  it("does not let users write activities directly", async () => {
    await expect(
      as(db, USER_A, `insert into activities (owner_id, type, summary) values ('${USER_A}', 'x', 'y')`),
    ).rejects.toThrow();
  });

  it("denies anon everything", async () => {
    await db.exec("set role anon");
    await expect(db.query("select * from leads")).rejects.toThrow();
    await db.exec("reset role");
  });
});

describe("duplicates", () => {
  it("rejects the same domain", async () => {
    await newLead(USER_A, { name: "Dup One", website: "https://dupe.dev" });
    await expect(newLead(USER_A, { name: "Dup Two", website: "http://www.DUPE.dev/pricing" })).rejects.toThrow(
      /leads_unique_domain/,
    );
  });

  it("rejects the same instagram handle", async () => {
    await newLead(USER_A, { name: "Gram", website: null, instagram_handle: "@gram.ai" });
    await expect(
      newLead(USER_A, { name: "Gram 2", website: null, instagram_handle: "https://instagram.com/Gram.AI/" }),
    ).rejects.toThrow(/leads_unique_handle/);
  });

  it("check_duplicate finds exact and fuzzy matches", async () => {
    await newLead(USER_A, { name: "Vercel Labs", website: "vercel-labs.com" });
    const exact = await as<{ match_type: string }>(db, USER_A,
      "select * from check_duplicate(p_website => 'https://vercel-labs.com/x')");
    expect(exact[0].match_type).toBe("website");
    const fuzzy = await as<{ name: string }>(db, USER_A, "select * from check_duplicate(p_name => 'Vercel Lab')");
    expect(fuzzy.map((r) => r.name)).toContain("Vercel Labs");
  });
});

describe("outreach & follow-ups", () => {
  it("drafting moves a new lead to drafted", async () => {
    const id = await newLead(USER_A, { name: "Draftee", website: "draftee.com" });
    await draft(id);
    expect((await lead(id)).status).toBe("drafted");
  });

  it("marking sent sets contacted and schedules a follow-up after the default 3 days", async () => {
    const id = await newLead(USER_A, { name: "Sendee", website: "sendee.com" });
    const o = await draft(id);
    const [{ mark_outreach_sent: res }] = await as<{ mark_outreach_sent: { follow_up: { due_at: string } } }>(
      db, USER_A, "select mark_outreach_sent($1)", [o]);
    expect(res.follow_up).not.toBeNull();
    expect((await lead(id)).status).toBe("contacted");
    const fu = await followUps(id);
    expect(fu).toHaveLength(1);
    const hours = (new Date(fu[0].due_at).getTime() - Date.now()) / 3.6e6;
    expect(hours).toBeGreaterThan(3 * 24 - 1);
    expect(hours).toBeLessThan(3 * 24 + 1);
  });

  it("blocks duplicate outreach on the same channel within 20h unless forced", async () => {
    const id = await newLead(USER_A, { name: "Twice", website: "twice.com" });
    await as(db, USER_A, "select mark_outreach_sent($1)", [await draft(id)]);
    const second = await draft(id);
    await expect(as(db, USER_A, "select mark_outreach_sent($1)", [second])).rejects.toThrow(/DUPLICATE_OUTREACH/);
    await as(db, USER_A, "select mark_outreach_sent($1, p_force => true)", [second]);
    const fu = await followUps(id);
    expect(fu.map((f) => f.status)).toEqual(["done", "pending"]);
    expect(fu[1].attempt).toBe(2);
  });

  it("a reply cancels pending follow-ups and sets replied", async () => {
    const id = await newLead(USER_A, { name: "Replier", website: "replier.com" });
    await as(db, USER_A, "select mark_outreach_sent($1)", [await draft(id)]);
    await as(db, USER_A, "insert into interactions (lead_id, type, content) values ($1, 'reply', 'Sounds good')", [id]);
    expect((await lead(id)).status).toBe("replied");
    expect((await followUps(id)).map((f) => f.status)).toEqual(["cancelled"]);
  });

  it("a decline marks lost and stops follow-ups", async () => {
    const id = await newLead(USER_A, { name: "Decliner", website: "decliner.com" });
    await as(db, USER_A, "select mark_outreach_sent($1)", [await draft(id)]);
    await as(db, USER_A, "insert into interactions (lead_id, type) values ($1, 'decline')", [id]);
    expect((await lead(id)).status).toBe("lost");
    expect((await followUps(id))[0].status).toBe("cancelled");
  });

  it("do_not_contact cancels follow-ups and blocks new outreach", async () => {
    const id = await newLead(USER_A, { name: "Stopper", website: "stopper.com" });
    await as(db, USER_A, "select mark_outreach_sent($1)", [await draft(id)]);
    await as(db, USER_A, "update leads set status = 'do_not_contact' where id = $1", [id]);
    expect((await followUps(id))[0].status).toBe("cancelled");
    const o = await draft(id, "email");
    await expect(as(db, USER_A, "select mark_outreach_sent($1)", [o])).rejects.toThrow(/do not contact/);
  });

  it("follow-up days = 0 schedules nothing", async () => {
    const id = await newLead(USER_A, { name: "NoFU", website: "nofu.com" });
    await as(db, USER_A, "select mark_outreach_sent($1, 0)", [await draft(id)]);
    expect(await followUps(id)).toHaveLength(0);
  });

  it("cron flags due follow-ups once and creates a notification", async () => {
    const id = await newLead(USER_A, { name: "Overdue", website: "overdue.com" });
    await as(db, USER_A, "select mark_outreach_sent($1)", [await draft(id)]);
    await asSystem(db, "update follow_ups set due_at = now() - interval '1 minute' where lead_id = $1", [id]);
    const [{ flag_due_follow_ups: n1 }] = await asSystem<{ flag_due_follow_ups: number }>(
      db, "select private.flag_due_follow_ups()");
    const [{ flag_due_follow_ups: n2 }] = await asSystem<{ flag_due_follow_ups: number }>(
      db, "select private.flag_due_follow_ups()");
    expect(n1).toBeGreaterThanOrEqual(1);
    expect(n2).toBe(0);
    const notes = await as<{ type: string }>(db, USER_A,
      `select a.type from notifications n join activities a on a.id = n.activity_id where a.lead_id = $1`, [id]);
    expect(notes.map((n) => n.type)).toContain("follow_up_due");
  });

  it("cron job is registered", async () => {
    const jobs = await asSystem<{ name: string }>(db, "select name from cron.jobs");
    expect(jobs.map((j) => j.name)).toContain("flag-due-follow-ups");
  });
});

describe("activity log", () => {
  it("records actor = claude for OAuth client tokens and notifies", async () => {
    const id = await newLead(USER_A, { name: "Claude Find", website: "claudefind.com", source: "claude" }, true);
    const acts = await as<{ type: string; actor: string }>(db, USER_A,
      "select type, actor from activities where lead_id = $1", [id]);
    expect(acts).toEqual([{ type: "lead_created", actor: "claude" }]);
    const n = await as(db, USER_A,
      "select n.id from notifications n join activities a on a.id = n.activity_id where a.lead_id = $1", [id]);
    expect(n).toHaveLength(1);
  });

  it("logs a full history for a lead", async () => {
    const id = await newLead(USER_A, { name: "Historic", website: "historic.com" });
    await as(db, USER_A, "update leads set research = 'Deep research' where id = $1", [id]);
    await as(db, USER_A, "insert into contacts (lead_id, email) values ($1, 'hi@historic.com')", [id]);
    await as(db, USER_A, "select mark_outreach_sent($1)", [await draft(id)]);
    await as(db, USER_A, "insert into interactions (lead_id, type) values ($1, 'reply')", [id]);
    const acts = await as<{ type: string }>(db, USER_A,
      "select type from activities where lead_id = $1 order by created_at, type", [id]);
    const types = acts.map((a) => a.type);
    for (const t of ["lead_created", "research_completed", "contact_added", "outreach_drafted",
      "outreach_sent", "follow_up_scheduled", "reply_received", "follow_up_cancelled", "status_changed"]) {
      expect(types).toContain(t);
    }
  });
});

describe("revenue", () => {
  it("computes received, pending and expected; winning a deal wins the lead", async () => {
    const id = await newLead(USER_A, { name: "Payer", website: "payer.com" });
    const [{ id: won }] = await as<{ id: string }>(db, USER_A,
      "insert into deals (lead_id, title, amount) values ($1, 'Reel collab', 15000) returning id", [id]);
    expect((await lead(id)).status).toBe("negotiating");
    await as(db, USER_A, "update deals set status = 'won' where id = $1", [won]);
    expect((await lead(id)).status).toBe("won");
    await as(db, USER_A, "insert into payments (deal_id, amount) values ($1, 10000)", [won]);
    await as(db, USER_A,
      "insert into deals (client_name, title, amount) values ('Brand X', 'Story set', 40000)");

    const [{ revenue_summary: r }] = await as<{ revenue_summary: Record<string, unknown> }>(
      db, USER_A, "select revenue_summary()");
    expect(Number(r.total_received)).toBe(10000);
    expect(Number(r.pending_payments)).toBe(5000);
    expect(Number(r.expected_from_active)).toBe(40000);
    expect(r.by_client).toEqual([expect.objectContaining({ client: "Payer" })]);

    const [{ dashboard_stats: d }] = await as<{ dashboard_stats: Record<string, unknown> }>(
      db, USER_A, "select dashboard_stats()");
    expect(Number(d.revenue_received)).toBe(10000);
    expect(Number(d.pending_payments)).toBe(5000);
  });
});

describe("reports & search", () => {
  it("pipeline_funnel counts contacted, replied and won", async () => {
    const [{ pipeline_funnel: f }] = await as<{ pipeline_funnel: Record<string, number> }>(
      db, USER_A, "select pipeline_funnel()");
    expect(f.contacted).toBeGreaterThan(0);
    expect(f.replied).toBeGreaterThan(0);
    expect(f.won).toBeGreaterThanOrEqual(1);
    expect(f.conversion_rate).toBeGreaterThan(0);
  });

  it("search_all matches names, domains and contact emails", async () => {
    const byName = await as<{ name: string }>(db, USER_A, "select * from search_all('histor')");
    expect(byName[0].name).toBe("Historic");
    const byEmail = await as<{ name: string; matched_on: string }>(db, USER_A,
      "select * from search_all('hi@historic')");
    expect(byEmail.map((r) => r.name)).toContain("Historic");
    expect(await as(db, USER_B, "select * from search_all('histor')")).toHaveLength(0);
  });
});
