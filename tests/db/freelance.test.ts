import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, createDb, USER_A, USER_B } from "./harness";

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

const client = (name: string, extra: Record<string, unknown> = {}) =>
  insertLead({ name, phone_e164: nextPhone(), phone_country: "IN", ...extra });

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

describe("clients", () => {
  it("needs a phone number; Instagram is optional", async () => {
    await expect(insertLead({ name: "No Phone Clinic" })).rejects.toThrow(/need a phone number/);
    await client("Phone Only Clinic");
    await client("Clinic With IG", { instagram_handle: "@clinicwithig" });
  });

  it("has no brand/freelance split any more", async () => {
    const [col] = await as(db, USER_A,
      "select 1 from information_schema.columns where table_name = 'leads' and column_name = 'kind'");
    expect(col).toBeUndefined();
    const [type] = await as(db, USER_A, "select 1 from pg_type where typname = 'lead_kind'");
    expect(type).toBeUndefined();
  });

  it("the same phone can't be added twice", async () => {
    await insertLead({ name: "Twin A", phone_e164: "+919811111111", phone_country: "IN" });
    await expect(insertLead({ name: "Twin B", phone_e164: "+919811111111", phone_country: "IN" })).rejects.toThrow();
  });

  it("check_duplicate matches phone numbers", async () => {
    await insertLead({ name: "Dial Dental", phone_e164: "+919822222222", phone_country: "IN" });
    const hits = await as<{ name: string; match_type: string }>(db, USER_A,
      "select name, match_type from check_duplicate(p_phone => '+919822222222')");
    expect(hits[0]).toMatchObject({ name: "Dial Dental", match_type: "phone" });
  });
});

describe("outreach channels", () => {
  it("allows WhatsApp and email, refuses Instagram DM", async () => {
    const id = await client("Channel Cafe");
    await draft(id, "whatsapp");
    await draft(id, "email");
    await expect(draft(id, "instagram_dm")).rejects.toThrow(/invalid input value for enum/);
    const wa = await draft(id, "whatsapp");
    await expect(as(db, USER_A, "update outreach set channel = 'instagram_dm' where id = $1", [wa])).rejects.toThrow(/invalid input value for enum/);
  });
});

describe("follow-up rules", () => {
  it("defaults to first after 3 days, then 4 days later, max 2 follow-ups", async () => {
    const [s] = await as<Record<string, number>>(db, USER_B,
      "select freelance_first_follow_up_days, freelance_follow_up_gap_days, freelance_max_follow_ups from settings");
    expect(s).toEqual({ freelance_first_follow_up_days: 3, freelance_follow_up_gap_days: 4, freelance_max_follow_ups: 2 });

    const id = await client("Rules Salon");
    const t0 = "2026-11-02T10:00:00.000Z";
    const f1 = await markSent(await draft(id, "whatsapp"), t0);
    expect(days(t0, f1!.due_at)).toBe(3);

    const t1 = "2026-11-05T10:00:00.000Z";
    const f2 = await markSent(await draft(id, "whatsapp"), t1);
    expect(days(t1, f2!.due_at)).toBe(4);

    const f3 = await markSent(await draft(id, "whatsapp"), "2026-11-09T10:00:00.000Z");
    expect(f3).toBeNull();
  });

  it("follows the saved rules", async () => {
    await as(db, USER_A, "update settings set freelance_first_follow_up_days = 1");
    const t0 = "2026-11-02T10:00:00.000Z";
    const id = await client("Custom Studio");
    expect(days(t0, (await markSent(await draft(id, "email"), t0))!.due_at)).toBe(1);
    await as(db, USER_A, "update settings set freelance_first_follow_up_days = 3");
  });
});

describe("reports", () => {
  it("dashboard counts clients; the funnel counts discovered leads", async () => {
    const [{ dashboard_stats: s }] = await as<{ dashboard_stats: Record<string, number> }>(db, USER_B, "select dashboard_stats()");
    expect(s.total_leads).toBe(0);

    await insertLead({ name: "B Client", phone_e164: "+919833333333", phone_country: "IN" }, USER_B);
    const [{ dashboard_stats: s2 }] = await as<{ dashboard_stats: Record<string, number> }>(db, USER_B, "select dashboard_stats()");
    expect(s2.total_leads).toBe(1);

    const [{ pipeline_funnel: f }] = await as<{ pipeline_funnel: { discovered: number } }>(db, USER_B, "select pipeline_funnel()");
    expect(f.discovered).toBe(1);
  });
});
