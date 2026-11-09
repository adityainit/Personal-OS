import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, asSystem, createDb, USER_A, USER_B } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);

let phoneSeq = 10;
const nextPhone = () => `+9198765432${String(phoneSeq++).padStart(2, "0")}`;

async function insertLead(fields: Record<string, unknown>, user = USER_A) {
  const cols = Object.keys(fields);
  const [row] = await as<{ id: string }>(
    db,
    user,
    `insert into leads (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
    Object.values(fields),
  );
  return row.id;
}

const freelance = (name: string, extra: Record<string, unknown> = {}) =>
  insertLead({ kind: "freelance", name, phone_e164: nextPhone(), phone_country: "IN", ...extra });

async function draft(leadId: string, channel: string) {
  const [row] = await as<{ id: string }>(db, USER_A,
    "insert into outreach (lead_id, channel, body) values ($1, $2, 'Hi!') returning id", [leadId, channel]);
  return row.id;
}

async function markSent(outreachId: string, sentAt: string) {
  const [{ mark_outreach_sent: r }] = await as<{ mark_outreach_sent: { follow_up: { due_at: string } | null } }>(
    db, USER_A, "select mark_outreach_sent($1, p_sent_at => $2, p_force => true)", [outreachId, sentAt]);
  return r.follow_up;
}

const days = (from: string, to: string) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);

describe("freelance leads", () => {
  it("existing and new leads default to brand deals", async () => {
    const id = await insertLead({ name: "Default Kind", instagram_handle: "@defaultkind" });
    const [row] = await asSystem<{ kind: string }>(db, "select kind from leads where id = $1", [id]);
    expect(row.kind).toBe("brand");
  });

  it("needs a phone number; Instagram is optional", async () => {
    await expect(insertLead({ kind: "freelance", name: "No Phone Clinic" })).rejects.toThrow(/need a phone number/);
    await freelance("Phone Only Clinic");
    await freelance("Clinic With IG", { instagram_handle: "@clinicwithig" });
  });

  it("can't drop the phone number or switch pipelines", async () => {
    const id = await freelance("Sticky Bakery");
    await expect(as(db, USER_A, "update leads set phone_e164 = null where id = $1", [id])).rejects.toThrow(/need a phone number/);
    await expect(as(db, USER_A, "update leads set kind = 'brand' where id = $1", [id])).rejects.toThrow(/cannot switch/);
  });

  it("the same phone can't be added twice as a freelance client", async () => {
    await insertLead({ kind: "freelance", name: "Twin A", phone_e164: "+919811111111", phone_country: "IN" });
    await expect(
      insertLead({ kind: "freelance", name: "Twin B", phone_e164: "+919811111111", phone_country: "IN" }),
    ).rejects.toThrow();
  });

  it("the same business can be a brand deal and a freelance client", async () => {
    await insertLead({ name: "Both Co", website: "both.co" });
    await freelance("Both Co", { website: "both.co" });
  });

  it("check_duplicate filters by pipeline and matches phone numbers", async () => {
    await insertLead({ kind: "freelance", name: "Dial Dental", phone_e164: "+919822222222", phone_country: "IN" });
    const hits = await as<{ name: string; kind: string; match_type: string }>(db, USER_A,
      "select name, kind, match_type from check_duplicate(p_phone => '+919822222222', p_kind => 'freelance')");
    expect(hits[0]).toMatchObject({ name: "Dial Dental", kind: "freelance", match_type: "phone" });
    const brandHits = await as(db, USER_A,
      "select * from check_duplicate(p_phone => '+919822222222', p_kind => 'brand')");
    expect(brandHits).toHaveLength(0);
  });
});

describe("freelance outreach channels", () => {
  it("allows WhatsApp and email, refuses Instagram DM", async () => {
    const id = await freelance("Channel Cafe");
    await draft(id, "whatsapp");
    await draft(id, "email");
    await expect(draft(id, "instagram_dm")).rejects.toThrow(/WhatsApp or email/);
    const wa = await draft(id, "whatsapp");
    await expect(as(db, USER_A, "update outreach set channel = 'instagram_dm' where id = $1", [wa])).rejects.toThrow(/WhatsApp or email/);
  });

  it("brand deals keep Instagram DM", async () => {
    const id = await insertLead({ name: "DM Still Works", instagram_handle: "@dmstillworks" });
    await draft(id, "instagram_dm");
  });
});

describe("freelance follow-up rules", () => {
  it("defaults to first after 3 days, then 4 days later, max 2 follow-ups", async () => {
    const [s] = await as<Record<string, number>>(db, USER_B,
      "select freelance_first_follow_up_days, freelance_follow_up_gap_days, freelance_max_follow_ups from settings");
    expect(s).toEqual({ freelance_first_follow_up_days: 3, freelance_follow_up_gap_days: 4, freelance_max_follow_ups: 2 });

    const id = await freelance("Rules Salon");
    const t0 = "2026-11-02T10:00:00.000Z";
    const f1 = await markSent(await draft(id, "whatsapp"), t0);
    expect(days(t0, f1!.due_at)).toBe(3);

    const t1 = "2026-11-05T10:00:00.000Z";
    const f2 = await markSent(await draft(id, "whatsapp"), t1);
    expect(days(t1, f2!.due_at)).toBe(4);

    const f3 = await markSent(await draft(id, "whatsapp"), "2026-11-09T10:00:00.000Z");
    expect(f3).toBeNull();
  });

  it("uses its own settings, separate from brand deals", async () => {
    await as(db, USER_A,
      "update settings set freelance_first_follow_up_days = 1, default_follow_up_days = 7");
    const t0 = "2026-11-02T10:00:00.000Z";

    const fl = await freelance("Separate Studio");
    expect(days(t0, (await markSent(await draft(fl, "email"), t0))!.due_at)).toBe(1);

    const br = await insertLead({ name: "Separate Brand", instagram_handle: "@separatebrand" });
    expect(days(t0, (await markSent(await draft(br, "instagram_dm"), t0))!.due_at)).toBe(7);

    await as(db, USER_A, "update settings set freelance_first_follow_up_days = 3, default_follow_up_days = 3");
  });
});

describe("reports by pipeline", () => {
  it("dashboard counts brands and freelance clients separately; funnels filter by kind", async () => {
    const [{ dashboard_stats: s }] = await as<{ dashboard_stats: Record<string, number> }>(db, USER_B, "select dashboard_stats()");
    expect(s.total_brands).toBe(0);
    expect(s.total_freelance).toBe(0);

    await insertLead({ kind: "freelance", name: "B Freelance", phone_e164: "+919833333333", phone_country: "IN" }, USER_B);
    await insertLead({ name: "B Brand", instagram_handle: "@bbrand" }, USER_B);
    const [{ dashboard_stats: s2 }] = await as<{ dashboard_stats: Record<string, number> }>(db, USER_B, "select dashboard_stats()");
    expect(s2.total_brands).toBe(1);
    expect(s2.total_freelance).toBe(1);

    const [{ pipeline_funnel: f }] = await as<{ pipeline_funnel: { discovered: number } }>(db, USER_B,
      "select pipeline_funnel(p_kind => 'freelance')");
    expect(f.discovered).toBe(1);
    const [{ pipeline_funnel: all }] = await as<{ pipeline_funnel: { discovered: number } }>(db, USER_B, "select pipeline_funnel()");
    expect(all.discovered).toBe(2);
  });
});
