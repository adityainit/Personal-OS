import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, asSystem, createDb, USER_A, USER_B } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);

const PHONE = { phone_e164: "+919876543210", phone_country: "IN" };

async function insertLead(user: string, fields: Record<string, unknown>) {
  const f = { kind: "brand", ...fields };
  const cols = Object.keys(f);
  return as<{ id: string }>(
    db,
    user,
    `insert into leads (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
    Object.values(f),
  );
}

describe("mandatory phone number", () => {
  it("rejects a new lead with no phone", async () => {
    await expect(insertLead(USER_A, { name: "No Phone", website: "nophone.com" })).rejects.toThrow(/valid phone number/);
  });

  it("rejects malformed numbers and missing country", async () => {
    for (const bad of ["9876543210", "+0123456789", "+91 98765 43210", "+12", "+1234567890123456", "abc"]) {
      await expect(
        insertLead(USER_A, { name: "Bad " + bad, website: `bad${bad.length}.com`, phone_e164: bad, phone_country: "IN" }),
      ).rejects.toThrow(/valid phone number/);
    }
    await expect(
      insertLead(USER_A, { name: "No Country", website: "nocountry.com", phone_e164: "+919876543210" }),
    ).rejects.toThrow(/phone country/);
  });

  it("accepts a valid E.164 number", async () => {
    const [{ id }] = await insertLead(USER_A, { name: "Has Phone", website: "hasphone.com", ...PHONE });
    expect(id).toBeTruthy();
  });

  it("does not let an update clear the phone", async () => {
    const [{ id }] = await insertLead(USER_A, { name: "Keeper", website: "keeper.com", ...PHONE });
    await expect(as(db, USER_A, "update leads set phone_e164 = null where id = $1", [id])).rejects.toThrow(/valid phone number/);
  });

  it("legacy leads without a phone stay editable by status and are left untouched", async () => {
    await db.exec("alter table leads disable trigger leads_validate_phone");
    const [{ id }] = await insertLead(USER_A, { name: "Legacy", website: "legacy.com" });
    await db.exec("alter table leads enable trigger leads_validate_phone");
    await as(db, USER_A, "update leads set status = 'researched' where id = $1", [id]);
    await as(db, USER_A, "update leads set description = 'edited' where id = $1", [id]);
    const [row] = await asSystem<{ phone_e164: string | null; status: string }>(db, "select phone_e164, status from leads where id = $1", [id]);
    expect(row).toEqual({ phone_e164: null, status: "researched" });
    await expect(as(db, USER_A, "update leads set phone_e164 = 'nope' where id = $1", [id])).rejects.toThrow();
  });

  it("check_duplicate finds a lead by phone", async () => {
    await insertLead(USER_A, { name: "Phone Match Co", website: "phonematch.com", phone_e164: "+14155550123", phone_country: "US" });
    const rows = await as<{ match_type: string; name: string }>(db, USER_A, "select * from check_duplicate(p_phone => '+14155550123')");
    expect(rows.map((r) => [r.name, r.match_type])).toContainEqual(["Phone Match Co", "phone"]);
  });
});

describe("incomplete prospects", () => {
  it("are private, separate from leads, and logged", async () => {
    const [{ id }] = await as<{ id: string }>(
      db,
      USER_A,
      "insert into incomplete_prospects (kind, name, website, research) values ('freelance','Maybe Agency','maybe.agency','notes') returning id",
    );
    expect(await as(db, USER_B, "select id from incomplete_prospects where id = $1", [id])).toHaveLength(0);
    expect(await as(db, USER_A, "select id from leads where name = 'Maybe Agency'")).toHaveLength(0);
    const acts = await as<{ type: string }>(db, USER_A, "select type from activities where type = 'prospect_incomplete'");
    expect(acts.length).toBeGreaterThan(0);
  });

  it("block duplicate domains", async () => {
    await expect(
      as(db, USER_A, "insert into incomplete_prospects (kind, name, website) values ('freelance','Maybe Again','https://www.maybe.agency/x')"),
    ).rejects.toThrow();
  });

  it("are not reachable anonymously", async () => {
    await db.exec("set role anon");
    await expect(db.query("select * from incomplete_prospects")).rejects.toThrow();
    await db.exec("reset role");
  });
});

describe("sign-up guard", () => {
  it("rejects emails that are not on the allow-list", async () => {
    await expect(
      asSystem(db, "insert into auth.users (id, email) values (gen_random_uuid(), 'stranger@evil.com')"),
    ).rejects.toThrow(/Sign-ups are closed/);
    await expect(asSystem(db, "insert into auth.users (id, email) values (gen_random_uuid(), null)")).rejects.toThrow(/Sign-ups are closed/);
  });

  it("allows listed emails regardless of case", async () => {
    await asSystem(db, "insert into private.allowed_emails values ('new@example.com')");
    await asSystem(db, "insert into auth.users (id, email) values (gen_random_uuid(), 'New@Example.com')");
  });

  it("the allow-list is not readable by app users", async () => {
    await expect(as(db, USER_A, "select * from private.allowed_emails")).rejects.toThrow();
  });
});

describe("function permissions", () => {
  it("anon cannot execute app functions", async () => {
    await db.exec("set role anon");
    await expect(db.query("select public.dashboard_stats()")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from public.check_duplicate('x')")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
});

describe("follow-up limit", () => {
  async function sendN(n: number, max: number) {
    await as(db, USER_A, "update settings set max_follow_ups = $1", [max]);
    const [{ id }] = await insertLead(USER_A, { name: `Limit ${n}-${max}`, website: `limit${n}x${max}.com`, ...PHONE });
    const out: (unknown | null)[] = [];
    for (let i = 0; i < n; i++) {
      const [{ id: o }] = await as<{ id: string }>(db, USER_A,
        "insert into outreach (lead_id, channel, body) values ($1,'email','hi') returning id", [id]);
      const [{ mark_outreach_sent: r }] = await as<{ mark_outreach_sent: { follow_up: unknown } }>(
        db, USER_A, "select mark_outreach_sent($1, p_force => true)", [o]);
      out.push(r.follow_up);
    }
    return out;
  }

  it("schedules follow-ups after the first message and each follow-up, up to the maximum", async () => {
    const r = await sendN(4, 3);
    expect(r.map((x) => x !== null)).toEqual([true, true, true, false]);
  });

  it("max 0 means no follow-ups at all", async () => {
    expect((await sendN(1, 0))[0]).toBeNull();
  });
});

describe("deleting records", () => {
  it("deleting a lead removes its children, keeps its deals and history, and logs it", async () => {
    const [{ id }] = await insertLead(USER_A, { name: "Doomed", website: "doomed.com", ...PHONE });
    await as(db, USER_A, "insert into contacts (lead_id, email) values ($1,'a@doomed.com')", [id]);
    await as(db, USER_A, "insert into interactions (lead_id, type) values ($1,'note')", [id]);
    const [{ id: deal }] = await as<{ id: string }>(db, USER_A,
      "insert into deals (lead_id, kind, title, amount) values ($1,'brand','Collab',1000) returning id", [id]);
    await as(db, USER_A, "insert into payments (deal_id, amount) values ($1, 400)", [deal]);

    await as(db, USER_A, "delete from leads where id = $1", [id]);

    expect(await asSystem(db, "select 1 from contacts where lead_id = $1", [id])).toHaveLength(0);
    const [d] = await asSystem<{ lead_id: string | null; client_name: string }>(db, "select lead_id, client_name from deals where id = $1", [deal]);
    expect(d).toEqual({ lead_id: null, client_name: "Doomed" });
    expect(Number((await asSystem<{ n: number }>(db, "select count(*) n from payments where deal_id = $1", [deal]))[0].n)).toBe(1);
    const log = await as<{ type: string }>(db, USER_A, "select type from activities where type = 'lead_deleted' and summary like '%Doomed%'");
    expect(log).toHaveLength(1);
  });

  it("deleting a deal removes its payments and fixes revenue totals", async () => {
    const [{ id: deal }] = await as<{ id: string }>(db, USER_A,
      "insert into deals (kind, client_name, title, amount, status) values ('freelance','Temp Client','Site',5000,'won') returning id");
    await as(db, USER_A, "insert into payments (deal_id, amount, paid_on) values ($1, 5000, '2026-01-15')", [deal]);
    const before = await as<{ revenue_summary: { total_received: number } }>(db, USER_A, "select revenue_summary('2026-01-01','2026-01-31')");
    expect(Number(before[0].revenue_summary.total_received)).toBe(5000);
    await as(db, USER_A, "delete from deals where id = $1", [deal]);
    const after = await as<{ revenue_summary: { total_received: number } }>(db, USER_A, "select revenue_summary('2026-01-01','2026-01-31')");
    expect(Number(after[0].revenue_summary.total_received)).toBe(0);
  });

  it("won deal value is bucketed by the IST calendar day", async () => {
    // 2026-03-10 20:00 UTC is 2026-03-11 01:30 in IST
    const [{ id }] = await as<{ id: string }>(db, USER_A,
      "insert into deals (kind, client_name, title, amount, status) values ('brand','Edge Co','Edge',700,'active') returning id");
    await asSystem(db, "update deals set status = 'won', closed_at = '2026-03-10T20:00:00Z' where id = $1", [id]);
    const day11 = await as<{ revenue_summary: { won_deal_value: number } }>(db, USER_A, "select revenue_summary('2026-03-11','2026-03-11')");
    const day10 = await as<{ revenue_summary: { won_deal_value: number } }>(db, USER_A, "select revenue_summary('2026-03-10','2026-03-10')");
    expect(Number(day11[0].revenue_summary.won_deal_value)).toBe(700);
    expect(Number(day10[0].revenue_summary.won_deal_value)).toBe(0);
  });
});
