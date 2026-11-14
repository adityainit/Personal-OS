import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, asSystem, createDb, USER_A, USER_B } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);

const PHONE = { phone_e164: "+919876543210", phone_country: "IN" };

async function insertLead(user: string, fields: Record<string, unknown>) {
  const f = { ...fields };
  const cols = Object.keys(f);
  return as<{ id: string }>(
    db,
    user,
    `insert into leads (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
    Object.values(f),
  );
}

describe("phone numbers are required and validated", () => {
  it("rejects a lead without a phone number", async () => {
    await expect(insertLead(USER_A, { name: "No Phone", instagram_handle: "@nophone" })).rejects.toThrow(
      /need a phone number/,
    );
  });

  it("rejects malformed numbers and missing country", async () => {
    for (const bad of ["9876543210", "+0123456789", "+91 98765 43210", "+12", "+1234567890123456", "abc"]) {
      await expect(
        insertLead(USER_A, { name: "Bad " + bad, website: `bad${bad.length}.com`, phone_e164: bad, phone_country: "IN" }),
      ).rejects.toThrow(/international format/);
    }
    await expect(
      insertLead(USER_A, { name: "No Country", website: "nocountry.com", phone_e164: "+919876543210" }),
    ).rejects.toThrow(/phone country/);
  });

  it("accepts a valid E.164 number but doesn't let it be removed", async () => {
    const [{ id }] = await insertLead(USER_A, { name: "Has Phone", website: "hasphone.com", ...PHONE });
    await expect(as(db, USER_A, "update leads set phone_e164 = null where id = $1", [id])).rejects.toThrow(
      /need a phone number/,
    );
  });
});

describe("settings", () => {
  it("new accounts get follow-up defaults: first after 3 days, then 4 days later, max 2", async () => {
    const [s] = await as<Record<string, number>>(db, USER_B,
      "select freelance_first_follow_up_days, freelance_follow_up_gap_days, freelance_max_follow_ups from settings");
    expect(s).toEqual({ freelance_first_follow_up_days: 3, freelance_follow_up_gap_days: 4, freelance_max_follow_ups: 2 });
  });

  it("has no brand follow-up rules or currency any more", async () => {
    const cols = await asSystem<{ column_name: string }>(db,
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'settings'");
    const names = cols.map((c) => c.column_name);
    for (const gone of ["default_follow_up_days", "follow_up_gap_days", "max_follow_ups", "currency"]) {
      expect(names).not.toContain(gone);
    }
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
    await as(db, USER_A, "update settings set freelance_max_follow_ups = $1", [max]);
    const [{ id }] = await insertLead(USER_A, {
      name: `Limit ${n}-${max}`,
      website: `limit${n}x${max}.com`,
      phone_e164: `+91981000${n}${max}00`,
      phone_country: "IN",
    });
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
  it("deleting a lead removes its children and logs it", async () => {
    const [{ id }] = await insertLead(USER_A, { name: "Doomed", website: "doomed.com", phone_e164: "+919812345678", phone_country: "IN" });
    await as(db, USER_A, "insert into contacts (lead_id, email) values ($1,'a@doomed.com')", [id]);
    await as(db, USER_A, "insert into interactions (lead_id, type) values ($1,'note')", [id]);
    await as(db, USER_A, "insert into outreach (lead_id, channel, body) values ($1,'email','hi')", [id]);

    await as(db, USER_A, "delete from leads where id = $1", [id]);

    expect(await asSystem(db, "select 1 from contacts where lead_id = $1", [id])).toHaveLength(0);
    expect(await asSystem(db, "select 1 from interactions where lead_id = $1", [id])).toHaveLength(0);
    expect(await asSystem(db, "select 1 from outreach where lead_id = $1", [id])).toHaveLength(0);
    const log = await as<{ type: string }>(db, USER_A, "select type from activities where type = 'lead_deleted' and summary like '%Doomed%'");
    expect(log).toHaveLength(1);
  });
});
