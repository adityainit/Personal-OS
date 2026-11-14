import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { contactSchema, leadCreateSchema, leadUpdateSchema, outreachSchema } from "@/lib/domain/schemas";
import { formatPhone, splitPhone, validatePhone } from "@/lib/domain/phone";
import { createLead, RepoError, updateLead, type Db } from "@/lib/domain/repo";
import { previousRange, rangeInstants, resolveRange } from "@/lib/ranges";
import { safeNext } from "@/lib/safe-next";
import { startOfDayInTz, ymd, fmtDate } from "@/lib/utils";

describe("timezone helpers (Asia/Kolkata)", () => {
  it("day starts at 18:30 UTC the previous day", () => {
    expect(startOfDayInTz("2026-11-05").toISOString()).toBe("2026-11-04T18:30:00.000Z");
  });
  it("ymd uses IST, not UTC", () => {
    expect(ymd(new Date("2026-11-04T20:00:00Z"))).toBe("2026-11-05");
  });
  it("formats plain dates without shifting", () => {
    expect(fmtDate("2026-01-01")).toBe("1 Jan 2026");
  });
});

describe("ranges", () => {
  it("builds previous period of equal length", () => {
    const r = resolveRange({ from: "2026-10-01", to: "2026-10-31" });
    expect(previousRange(r)).toMatchObject({ from: "2026-08-31", to: "2026-09-30" });
    expect(rangeInstants(r)).toEqual({ from: "2026-09-30T18:30:00.000Z", to: "2026-10-31T18:30:00.000Z" });
  });
  it("all time has no bounds", () => {
    expect(resolveRange({ range: "all" })).toMatchObject({ from: null, to: null });
  });
});

describe("csv", () => {
  it("escapes quotes, commas, newlines and formula injection", () => {
    const csv = toCsv([{ a: 'He said "hi", ok', b: "=HYPERLINK()", c: -500, d: ["x", "y"] }]);
    expect(csv).toBe('a,b,c,d\r\n"He said ""hi"", ok",\'=HYPERLINK(),-500,x; y');
  });
});

describe("safeNext", () => {
  it("blocks open redirects", () => {
    expect(safeNext("//evil.com")).toBe("/dashboard");
    expect(safeNext("https://evil.com")).toBe("/dashboard");
    expect(safeNext("/\\evil.com")).toBe("/dashboard");
    expect(safeNext("/oauth/consent?authorization_id=1")).toBe("/oauth/consent?authorization_id=1");
  });
});

const OK_CLIENT = { name: "Sharma Dental", phone_number: "98765 43210", phone_country: "IN" };

describe("phone validation", () => {
  it("accepts real numbers and returns E.164", () => {
    expect(validatePhone("98765 43210", "IN")).toMatchObject({ ok: true, e164: "+919876543210", country: "IN" });
    expect(validatePhone("(415) 555-2671", "US")).toMatchObject({ ok: true, e164: "+14155552671" });
    expect(validatePhone("020 7946 0958", "GB")).toMatchObject({ ok: true, e164: "+442079460958" });
  });
  it("a leading + overrides the selected country", () => {
    expect(validatePhone("+44 20 7946 0958", "IN")).toMatchObject({ ok: true, e164: "+442079460958", country: "GB" });
  });
  it("rejects empty, malformed and impossible numbers with a clear message", () => {
    expect(validatePhone("", "IN")).toMatchObject({ ok: false, error: "Phone number is required" });
    expect(validatePhone("   ", "IN")).toMatchObject({ ok: false });
    expect(validatePhone("12345", "IN")).toMatchObject({ ok: false, error: expect.stringContaining("India") });
    expect(validatePhone("0000000000", "IN")).toMatchObject({ ok: false });
    expect(validatePhone("call me", "IN")).toMatchObject({ ok: false });
    expect(validatePhone("98765 43210", "")).toMatchObject({ ok: false, error: "Select a country code" });
    expect(validatePhone("98765 43210", "ZZ")).toMatchObject({ ok: false, error: expect.stringContaining("Unknown country") });
  });
  it("splits and formats stored numbers", () => {
    expect(splitPhone("+919876543210")).toEqual({ country: "IN", national: "9876543210" });
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
    expect(formatPhone(null)).toBeNull();
  });
});

describe("lead rules (forms and MCP share these)", () => {
  it("accepts a client with a valid phone number; Instagram, email and contact person stay optional", () => {
    const r = leadCreateSchema.parse({ ...OK_CLIENT, fit_score: "80", tags: "Web, Local ," });
    expect(r).toMatchObject({
      name: "Sharma Dental",
      phone_e164: "+919876543210",
      phone_country: "IN",
      fit_score: 80,
      tags: ["web", "local"],
      instagram_handle: null,
      email: null,
      contact_person: null,
    });
    expect(r).not.toHaveProperty("phone_number");
    expect(r).not.toHaveProperty("kind");
  });
  it("needs a valid phone number", () => {
    const base = { name: "Sharma Dental" };
    const missing = leadCreateSchema.safeParse(base);
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.issues[0].path).toEqual(["phone_number"]);
    expect(leadCreateSchema.safeParse({ ...base, phone_number: "123", phone_country: "IN" }).success).toBe(false);
  });
  it("rejects a malformed email but allows none", () => {
    expect(leadCreateSchema.safeParse({ ...OK_CLIENT, email: "not-an-email" }).success).toBe(false);
    expect(leadCreateSchema.safeParse({ ...OK_CLIENT, email: "" }).success).toBe(true);
  });
  it("rejects bad fit score and bad urls", () => {
    expect(leadCreateSchema.safeParse({ ...OK_CLIENT, fit_score: 150 }).success).toBe(false);
    expect(leadCreateSchema.safeParse({ ...OK_CLIENT, website: "not a url" }).success).toBe(false);
  });
  it("edits validate the phone only when supplied; an empty one means 'remove'", () => {
    expect(leadUpdateSchema.parse({ status: "won" })).toEqual({ status: "won" });
    expect(leadUpdateSchema.safeParse({ phone_number: "98765 43210", phone_country: "IN" }).data).toMatchObject({ phone_e164: "+919876543210" });
    expect(leadUpdateSchema.parse({ phone_number: "", phone_country: "IN" })).toMatchObject({ phone_e164: null });
    expect(leadUpdateSchema.safeParse({ phone_number: "12", phone_country: "IN" }).success).toBe(false);
  });

  // The MCP create_lead tool calls repo.createLead. A db that throws proves validation
  // happens first: nothing is read or written for an invalid lead.
  const explodingDb = new Proxy({}, { get: () => { throw new Error("database was touched"); } }) as unknown as Db;
  it("repo.createLead refuses an invalid lead before touching the database", async () => {
    await expect(createLead(explodingDb, { name: "No Phone", source: "claude" })).rejects.toThrow(RepoError);
    await expect(createLead(explodingDb, { ...OK_CLIENT, phone_number: "000", source: "claude" })).rejects.toThrow(/Phone number/);
  });
  it("repo.updateLead rejects an invalid phone before touching the database", async () => {
    await expect(updateLead(explodingDb, "id", { phone_number: "1", phone_country: "IN" })).rejects.toThrow(/Phone number/);
  });
  it("requires some contact detail", () => {
    expect(contactSchema.safeParse({ role: "CEO" }).success).toBe(false);
    expect(contactSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
    expect(contactSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
  it("outreach is WhatsApp or email only", () => {
    expect(outreachSchema.safeParse({ channel: "whatsapp", body: "Hi" }).success).toBe(true);
    expect(outreachSchema.safeParse({ channel: "email", body: "Hi" }).success).toBe(true);
    expect(outreachSchema.safeParse({ channel: "instagram_dm", body: "Hi" }).success).toBe(false);
  });
});
