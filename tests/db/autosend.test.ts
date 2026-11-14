import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, asSystem, createDb, USER_A, USER_B } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
}, 60_000);

let phoneSeq = 10;
const nextPhone = () => `+9197000000${String(phoneSeq++).padStart(2, "0")}`;

/** 2026-11-16 is a Monday. 11:00 IST = 05:30 UTC. */
const MON_11_IST = "2026-11-16T05:30:00Z";

type Claim = {
  status: string;
  outreach_id?: string;
  lead_id?: string;
  phone?: string;
  body?: string;
  step?: number;
  is_follow_up?: boolean;
  next_send_at?: string;
  sent_today?: number;
};

async function lead(name: string, extra: Record<string, unknown> = {}, user = USER_A) {
  const fields = { name, phone_e164: nextPhone(), phone_country: "IN", ...extra };
  const cols = Object.keys(fields);
  const [row] = await as<{ id: string; phone_e164: string }>(
    db,
    user,
    `insert into leads (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id, phone_e164`,
    Object.values(fields),
  );
  return row;
}

async function draft(leadId: string, opts: { step?: number; channel?: string; body?: string } = {}, user = USER_A) {
  const [row] = await as<{ id: string; auto_send: string }>(
    db,
    user,
    "insert into outreach (lead_id, channel, body, step) values ($1, $2, $3, $4) returning id, auto_send",
    [leadId, opts.channel ?? "whatsapp", opts.body ?? "Hi!", opts.step ?? 0],
  );
  return row;
}

const setState = (id: string, state: string) =>
  as(db, USER_A, "update outreach set auto_send = $2 where id = $1", [id, state]);

async function claim(now = MON_11_IST, user = USER_A) {
  const [{ claim_next_auto_send: r }] = await as<{ claim_next_auto_send: Claim }>(
    db,
    user,
    "select claim_next_auto_send($1)",
    [now],
  );
  return r;
}

async function complete(id: string, waId = "WAID") {
  const [{ complete_auto_send: r }] = await as<{
    complete_auto_send: { follow_up: { id: string; due_at: string } | null; next_send_at: string };
  }>(db, USER_A, "select complete_auto_send($1, $2)", [id, waId]);
  return r;
}

/** Simulate "time passing" for pacing: clear the gap so the next claim isn't held back. */
const clearGap = () => as(db, USER_A, "update whatsapp_status set next_send_at = null");

/** Take everything earlier tests left behind off the queue. */
const clearQueue = () =>
  as(db, USER_A, "update outreach set auto_send = 'off' where auto_send <> 'off'");

async function settings(patch: Record<string, unknown>) {
  const cols = Object.keys(patch);
  await as(
    db,
    USER_A,
    `update settings set ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")}`,
    Object.values(patch),
  );
}

beforeEach(async () => {
  await clearQueue();
  await clearGap();
  await settings({
    autosend_enabled: true,
    autosend_require_approval: true,
    autosend_daily_limit: 10,
    autosend_start_hour: 10,
    autosend_end_hour: 19,
    autosend_days: "{1,2,3,4,5,6}",
    autosend_full_sequence_only: false,
    freelance_max_follow_ups: 2,
  });
  await as(db, USER_A, "update whatsapp_status set consecutive_failures = 0");
  // Today's automatic sends from earlier tests shouldn't count against the limit.
  await asSystem(db, "update outreach set sent_automatically = false");
});

describe("new drafts", () => {
  it("wait for approval when auto-send is on with review", async () => {
    const l = await lead("Review Cafe");
    expect((await draft(l.id)).auto_send).toBe("review");
  });

  it("are queued straight away without review", async () => {
    await settings({ autosend_require_approval: false });
    const l = await lead("No Review Cafe");
    expect((await draft(l.id)).auto_send).toBe("queued");
  });

  it("stay manual when auto-send is off, and emails always stay manual", async () => {
    const l = await lead("Manual Cafe");
    expect((await draft(l.id, { channel: "email" })).auto_send).toBe("off");
    await settings({ autosend_enabled: false });
    expect((await draft(l.id)).auto_send).toBe("off");
  });

  it("emails can't be queued", async () => {
    const l = await lead("Email Only Cafe");
    const d = await draft(l.id, { channel: "email" });
    await setState(d.id, "queued");
    const [row] = await as<{ auto_send: string }>(db, USER_A, "select auto_send from outreach where id = $1", [d.id]);
    expect(row.auto_send).toBe("off");
  });
});

describe("claiming", () => {
  it("only claims approved drafts", async () => {
    const l = await lead("Approval Bakery");
    const d = await draft(l.id);
    expect((await claim()).status).toBe("idle");
    await setState(d.id, "queued");
    const c = await claim();
    expect(c).toMatchObject({ status: "claimed", outreach_id: d.id, phone: l.phone_e164, is_follow_up: false });
  });

  it("respects the off switch, sending days and hours", async () => {
    const l = await lead("Hours Bakery");
    const d = await draft(l.id);
    await setState(d.id, "queued");

    await settings({ autosend_enabled: false });
    expect((await claim()).status).toBe("disabled");
    await settings({ autosend_enabled: true });

    expect((await claim("2026-11-16T03:00:00Z")).status).toBe("outside_hours"); // 08:30 IST
    expect((await claim("2026-11-16T14:00:00Z")).status).toBe("outside_hours"); // 19:30 IST
    expect((await claim("2026-11-15T05:30:00Z")).status).toBe("outside_days"); // Sunday
    expect((await claim()).status).toBe("claimed");
  });

  it("claims one message at a time", async () => {
    const a = await lead("Busy One");
    const b = await lead("Busy Two");
    await setState((await draft(a.id)).id, "queued");
    await setState((await draft(b.id)).id, "queued");
    expect((await claim()).status).toBe("claimed");
    expect((await claim()).status).toBe("busy");
  });

  it("spaces messages out by a random gap within the settings", async () => {
    await settings({ autosend_start_hour: 0, autosend_end_hour: 24, autosend_days: "{1,2,3,4,5,6,7}", autosend_min_gap_minutes: 7, autosend_max_gap_minutes: 25 });
    const l = await lead("Pace Studio");
    await setState((await draft(l.id)).id, "queued");
    const c = await claim(new Date().toISOString());
    const done = await complete(c.outreach_id!);
    const gapMin = (new Date(done.next_send_at).getTime() - Date.now()) / 60_000;
    expect(gapMin).toBeGreaterThan(6.9);
    expect(gapMin).toBeLessThan(25.1);
  });

  it("stops at the daily limit", async () => {
    await settings({ autosend_daily_limit: 1, autosend_start_hour: 0, autosend_end_hour: 24, autosend_days: "{1,2,3,4,5,6,7}" });
    const a = await lead("Daily A");
    const b = await lead("Daily B");
    await setState((await draft(a.id)).id, "queued");
    await setState((await draft(b.id)).id, "queued");
    const now = new Date().toISOString();
    const c = await claim(now);
    expect(c.status).toBe("claimed");
    await complete(c.outreach_id!);
    await clearGap();
    expect((await claim(now)).status).toBe("daily_limit");
  });

  it("holds back while waiting for the gap", async () => {
    await settings({ autosend_start_hour: 0, autosend_end_hour: 24, autosend_days: "{1,2,3,4,5,6,7}" });
    const a = await lead("Gap A");
    const b = await lead("Gap B");
    await setState((await draft(a.id)).id, "queued");
    await setState((await draft(b.id)).id, "queued");
    const c = await claim(new Date().toISOString());
    await complete(c.outreach_id!);
    const w = await claim(new Date().toISOString());
    expect(w.status).toBe("waiting");
    expect(w.next_send_at).toBeTruthy();
  });

  it("respects 'don't send before'", async () => {
    const l = await lead("Later Studio");
    const d = await draft(l.id);
    await as(db, USER_A, "update outreach set auto_send = 'queued', send_after = $2 where id = $1", [
      d.id,
      "2026-11-16T08:00:00Z",
    ]);
    expect((await claim(MON_11_IST)).status).toBe("idle");
    expect((await claim("2026-11-16T08:30:00Z")).status).toBe("claimed");
  });

  it("skips clients who replied or are closed", async () => {
    for (const status of ["replied", "won", "do_not_contact"]) {
      const l = await lead(`Closed ${status}`);
      const d = await draft(l.id);
      await setState(d.id, "queued");
      await as(db, USER_A, "update leads set status = $2 where id = $1", [l.id, status]);
    }
    expect((await claim()).status).toBe("idle");
  });

  it("sends the first message before any follow-up, and waits while it's in review", async () => {
    const l = await lead("Order Agency");
    const first = await draft(l.id, { step: 0, body: "first" });
    const fu = await draft(l.id, { step: 1, body: "follow-up" });
    await setState(fu.id, "queued");
    expect((await claim()).status).toBe("idle"); // first message still in review
    await setState(first.id, "queued");
    const c = await claim();
    expect(c).toMatchObject({ outreach_id: first.id, body: "first" });
  });

  it("other users' drafts are invisible", async () => {
    const l = await lead("Other User Cafe", {}, USER_B);
    await as(db, USER_B, "update settings set autosend_enabled = true");
    const d = await draft(l.id, {}, USER_B);
    await as(db, USER_B, "update outreach set auto_send = 'queued' where id = $1", [d.id]);
    expect((await claim()).status).toBe("idle");
  });
});

describe("sending and follow-ups", () => {
  it("records the send like 'Mark as sent', then sends the follow-up only when due", async () => {
    await settings({ autosend_start_hour: 0, autosend_end_hour: 24, autosend_days: "{1,2,3,4,5,6,7}" });
    const l = await lead("Sequence Salon");
    const first = await draft(l.id, { step: 0 });
    const fu1 = await draft(l.id, { step: 1 });
    await setState(first.id, "queued");
    await setState(fu1.id, "queued");

    const c = await claim(new Date().toISOString());
    expect(c.outreach_id).toBe(first.id);
    const res = await complete(first.id, "ABC123");
    expect(res.follow_up).not.toBeNull();

    const [sent] = await as<Record<string, unknown>>(db, USER_A, "select * from outreach where id = $1", [first.id]);
    expect(sent).toMatchObject({ status: "sent", auto_send: "off", sent_automatically: true, wa_message_id: "ABC123" });
    const [ld] = await as<{ status: string }>(db, USER_A, "select status from leads where id = $1", [l.id]);
    expect(ld.status).toBe("contacted");

    const [act] = await as<{ summary: string; actor: string }>(
      db,
      USER_A,
      "select summary, actor from activities where lead_id = $1 and type = 'outreach_sent'",
      [l.id],
    );
    expect(act.summary).toMatch(/sent automatically/);
    expect(act.actor).toBe("system");

    // Follow-up isn't due yet.
    await clearGap();
    expect((await claim(new Date().toISOString())).status).toBe("idle");

    // Once it's due (and 20h have passed), it goes out.
    const due = new Date(res.follow_up!.due_at).getTime() + 60_000;
    const c2 = await claim(new Date(due).toISOString());
    expect(c2).toMatchObject({ status: "claimed", outreach_id: fu1.id, is_follow_up: true });
  });

  it("failed sends retry up to 3 times, then stop and notify", async () => {
    const l = await lead("Retry Garage");
    const d = await draft(l.id);
    await setState(d.id, "queued");

    let t = new Date(MON_11_IST).getTime();
    for (let i = 1; i <= 3; i++) {
      const c = await claim(new Date(t).toISOString());
      expect(c.outreach_id).toBe(d.id);
      const [{ fail_auto_send: f }] = await as<{ fail_auto_send: { retrying: boolean } }>(
        db,
        USER_A,
        "select fail_auto_send($1, 'Connection lost', true)",
        [d.id],
      );
      expect(f.retrying).toBe(i < 3);
      // The retry waits 30 minutes from real now(); move the clock past it.
      t = Math.max(t, Date.now()) + 31 * 60_000;
      await as(db, USER_A, "update outreach set send_after = null where id = $1 and auto_send = 'queued'", [d.id]);
    }
    const [row] = await as<{ auto_send: string; send_error: string }>(
      db,
      USER_A,
      "select auto_send, send_error from outreach where id = $1",
      [d.id],
    );
    expect(row).toMatchObject({ auto_send: "failed", send_error: "Connection lost" });
    const [n] = await as<{ n: number }>(
      db,
      USER_A,
      "select count(*)::int n from notifications nt join activities a on a.id = nt.activity_id where a.lead_id = $1 and a.type = 'auto_send_failed'",
      [l.id],
    );
    expect(n.n).toBe(1);

    // Retrying from the app starts fresh.
    await setState(d.id, "queued");
    const [again] = await as<{ send_attempts: number; send_error: string | null }>(
      db,
      USER_A,
      "select send_attempts, send_error from outreach where id = $1",
      [d.id],
    );
    expect(again).toEqual({ send_attempts: 0, send_error: null });
  });

  it("a send the worker never confirmed is not retried blindly", async () => {
    const l = await lead("Crash Clinic");
    const d = await draft(l.id);
    await setState(d.id, "queued");
    await claim();
    await as(db, USER_A, "update outreach set claimed_at = now() - interval '11 minutes' where id = $1", [d.id]);
    expect((await claim(new Date().toISOString())).status).not.toBe("busy");
    const [row] = await as<{ auto_send: string }>(db, USER_A, "select auto_send from outreach where id = $1", [d.id]);
    expect(row.auto_send).toBe("failed");
  });

  it("complete_auto_send refuses messages the worker didn't claim", async () => {
    const l = await lead("Unclaimed Cafe");
    const d = await draft(l.id);
    await expect(complete(d.id)).rejects.toThrow(/not being sent/);
  });
});

describe("replies", () => {
  async function reply(phone: string, text: string, id: string | null, at?: string) {
    const [{ record_whatsapp_reply: r }] = await as<{
      record_whatsapp_reply: { recorded: boolean; merged?: boolean; reason?: string };
    }>(db, USER_A, "select record_whatsapp_reply($1, $2, $3, $4)", [phone, text, id, at ?? null]);
    return r;
  }

  it("records a reply, cancels follow-ups, takes queued drafts off the queue and notifies once", async () => {
    const l = await lead("Reply Gym");
    const first = await draft(l.id);
    const fu = await draft(l.id, { step: 1 });
    await as(db, USER_A, "select mark_outreach_sent($1)", [first.id]);
    await setState(fu.id, "queued");

    const r = await reply(l.phone_e164, "Interested, call me", "M1");
    expect(r).toMatchObject({ recorded: true, merged: false });

    const [ld] = await as<{ status: string }>(db, USER_A, "select status from leads where id = $1", [l.id]);
    expect(ld.status).toBe("replied");
    const pending = await as(db, USER_A, "select 1 from follow_ups where lead_id = $1 and status = 'pending'", [l.id]);
    expect(pending).toHaveLength(0);
    const [d] = await as<{ auto_send: string }>(db, USER_A, "select auto_send from outreach where id = $1", [fu.id]);
    expect(d.auto_send).toBe("off");

    const [n] = await as<{ n: number }>(
      db,
      USER_A,
      "select count(*)::int n from notifications nt join activities a on a.id = nt.activity_id where a.lead_id = $1",
      [l.id],
    );
    expect(n.n).toBe(1);
  });

  it("ignores duplicates, merges quick follow-on messages, and ignores unknown numbers", async () => {
    const l = await lead("Merge Spa");
    const at = new Date().toISOString();
    await reply(l.phone_e164, "Hello", "X1", at);
    expect(await reply(l.phone_e164, "Hello", "X1", at)).toMatchObject({ recorded: false, reason: "duplicate" });
    expect(await reply(l.phone_e164, "What are your prices?", "X2", at)).toMatchObject({ recorded: true, merged: true });
    const rows = await as<{ content: string }>(db, USER_A, "select content from interactions where lead_id = $1", [l.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("Hello\nWhat are your prices?");

    expect(await reply("+15550000000", "spam", "X3")).toMatchObject({ recorded: false, reason: "unknown_number" });
  });

  it("can't record replies on another user's clients", async () => {
    const other = await lead("Private Cafe B", {}, USER_B);
    expect(await reply(other.phone_e164, "hi", "P1")).toMatchObject({ recorded: false, reason: "unknown_number" });
  });
});

describe("safe defaults", () => {
  it("new users get 8 a day, 12:00-14:00, 8-15 minute gaps, Claude's full sequences only, approval on", async () => {
    const [s] = await as<Record<string, unknown>>(db, USER_B, "select * from settings");
    expect(s).toMatchObject({
      autosend_require_approval: true,
      autosend_daily_limit: 8,
      autosend_start_hour: 12,
      autosend_end_hour: 14,
      autosend_min_gap_minutes: 8,
      autosend_max_gap_minutes: 15,
      autosend_full_sequence_only: true,
    });
  });
});

describe("full-sequence rule", () => {
  it("only auto-sends clients Claude researched once the first message and every follow-up are drafted", async () => {
    await settings({ autosend_full_sequence_only: true, freelance_max_follow_ups: 2 });

    const manual = await lead("Manual Seq Cafe", { source: "manual" });
    await setState((await draft(manual.id, { step: 0 })).id, "queued");
    await draft(manual.id, { step: 1 });
    await draft(manual.id, { step: 2 });
    expect((await claim()).status).toBe("idle");

    const partial = await lead("Partial Seq Cafe", { source: "claude", research: "Notes" });
    const first = await draft(partial.id, { step: 0 });
    await setState(first.id, "queued");
    await draft(partial.id, { step: 1 });
    expect((await claim()).status).toBe("idle"); // follow-up #2 missing

    await draft(partial.id, { step: 2 });
    expect(await claim()).toMatchObject({ status: "claimed", outreach_id: first.id });
  });

  it("with no follow-ups configured, the first message is enough", async () => {
    await settings({ autosend_full_sequence_only: true, freelance_max_follow_ups: 0 });
    const l = await lead("Single Msg Cafe", { source: "claude" });
    const d = await draft(l.id);
    await setState(d.id, "queued");
    expect(await claim()).toMatchObject({ status: "claimed", outreach_id: d.id });
  });
});

describe("follow-ups by due date", () => {
  it("go out on their due date (any time in the window), never the day before", async () => {
    await settings({ autosend_start_hour: 0, autosend_end_hour: 24, autosend_days: "{1,2,3,4,5,6,7}" });
    const l = await lead("Due Date Dental");
    const first = await draft(l.id, { step: 0 });
    const fu = await draft(l.id, { step: 1 });
    await setState(first.id, "queued");
    await setState(fu.id, "queued");
    const c = await claim(new Date().toISOString());
    const res = await complete(c.outreach_id!);
    await clearGap();

    const dueDay = new Date(res.follow_up!.due_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const at = (day: string, istHour: number) =>
      new Date(`${day}T${String(istHour).padStart(2, "0")}:00:00+05:30`).toISOString();
    const dayBefore = new Date(new Date(`${dueDay}T12:00:00+05:30`).getTime() - 86_400_000)
      .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    expect((await claim(at(dayBefore, 23))).status).toBe("idle");
    expect(await claim(at(dueDay, 0))).toMatchObject({ status: "claimed", outreach_id: fu.id, is_follow_up: true });
  });
});

describe("auto-pause", () => {
  it("3 connection failures in a row switch auto-send off and notify; a success resets the streak", async () => {
    const leads = [];
    for (const n of ["Streak A", "Streak B", "Streak C", "Streak D"]) {
      const l = await lead(n);
      const d = await draft(l.id);
      await setState(d.id, "queued");
      leads.push(d.id);
    }
    const failOnce = async () => {
      const c = await claim();
      const [{ fail_auto_send: f }] = await as<{ fail_auto_send: { paused: boolean } }>(
        db, USER_A, "select fail_auto_send($1, 'Connection Closed', true)", [c.outreach_id]);
      // Keep the retried draft from being picked again straight away.
      await as(db, USER_A, "update outreach set send_after = now() + interval '1 day' where id = $1", [c.outreach_id]);
      return f;
    };
    expect((await failOnce()).paused).toBe(false);
    expect((await failOnce()).paused).toBe(false);
    expect((await failOnce()).paused).toBe(true);

    const [s] = await as<{ autosend_enabled: boolean }>(db, USER_A, "select autosend_enabled from settings");
    expect(s.autosend_enabled).toBe(false);
    expect((await claim()).status).toBe("disabled");
    const [n] = await as<{ n: number }>(db, USER_A,
      "select count(*)::int n from notifications nt join activities a on a.id = nt.activity_id where a.type = 'auto_send_paused'");
    expect(n.n).toBeGreaterThanOrEqual(1);
  });

  it("permanent failures (e.g. number not on WhatsApp) don't count toward the streak", async () => {
    for (let i = 0; i < 3; i++) {
      const l = await lead(`No WA ${i}`);
      const d = await draft(l.id);
      await setState(d.id, "queued");
      const c = await claim();
      await as(db, USER_A, "select fail_auto_send($1, 'This number isn''t on WhatsApp', false)", [c.outreach_id]);
    }
    const [s] = await as<{ autosend_enabled: boolean }>(db, USER_A, "select autosend_enabled from settings");
    expect(s.autosend_enabled).toBe(true);
  });
});

describe("WhatsApp login storage", () => {
  it("is private to each user", async () => {
    await as(db, USER_A, "insert into whatsapp_auth (key, value) values ('creds', 'secret')");
    expect(await as(db, USER_B, "select * from whatsapp_auth")).toHaveLength(0);
    expect(await as(db, USER_A, "select * from whatsapp_auth")).toHaveLength(1);
  });
});

describe("due follow-up notifications", () => {
  it("aren't raised when the worker will send the follow-up", async () => {
    const auto = await lead("Auto FU Cafe");
    const manual = await lead("Manual FU Cafe");
    for (const l of [auto, manual]) {
      const first = await draft(l.id);
      await as(db, USER_A, "select mark_outreach_sent($1, p_sent_at => now() - interval '10 days')", [first.id]);
    }
    await setState((await draft(auto.id, { step: 1 })).id, "queued");
    await asSystem(db, "select private.flag_due_follow_ups()");
    const count = async (leadId: string) => {
      const [r] = await as<{ n: number }>(
        db,
        USER_A,
        "select count(*)::int n from notifications nt join activities a on a.id = nt.activity_id where a.lead_id = $1 and a.type = 'follow_up_due'",
        [leadId],
      );
      return r.n;
    };
    expect(await count(auto.id)).toBe(0);
    expect(await count(manual.id)).toBe(1);
  });
});

describe("worker status", () => {
  it("is private to each user", async () => {
    await as(db, USER_A, "insert into whatsapp_status (state, phone) values ('connected', '+919999999999') on conflict (owner_id) do update set state = excluded.state, phone = excluded.phone");
    const b = await as(db, USER_B, "select * from whatsapp_status");
    expect(b).toHaveLength(0);
  });
});
