import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { contactSchema, dealSchema, leadCreateSchema, leadUpdateSchema, paymentSchema } from "@/lib/domain/schemas";
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

const OK_BRAND = { name: "Glow Labs", instagram_handle: "@glowlabs" };

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

describe("brand lead rules (forms and MCP share these)", () => {
  it("accepts a brand with an Instagram handle; phone, email and contact person stay optional", () => {
    const r = leadCreateSchema.parse({ ...OK_BRAND, fit_score: "80", tags: "AI, DevTools ," });
    expect(r).toMatchObject({ name: "Glow Labs", phone_e164: null, phone_country: null, fit_score: 80, tags: ["ai", "devtools"], email: null, contact_person: null });
    expect(r).not.toHaveProperty("phone_number");
    expect(r.kind).toBe("brand");
  });
  it("freelance clients need a valid phone number; Instagram and email stay optional", () => {
    const base = { kind: "freelance", name: "Sharma Dental" };
    const missing = leadCreateSchema.safeParse(base);
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.issues[0].path).toEqual(["phone_number"]);
    expect(leadCreateSchema.safeParse({ ...base, phone_number: "123", phone_country: "IN" }).success).toBe(false);
    const ok = leadCreateSchema.parse({ ...base, phone_number: "98765 43210", phone_country: "IN" });
    expect(ok).toMatchObject({ kind: "freelance", phone_e164: "+919876543210", phone_country: "IN", instagram_handle: null, email: null });
  });
  it("needs an Instagram handle or website", () => {
    expect(leadCreateSchema.safeParse({ ...OK_BRAND, instagram_handle: "", website: "glowlabs.com" }).success).toBe(true);
    const r = leadCreateSchema.safeParse({ ...OK_BRAND, instagram_handle: "", linkedin_url: "linkedin.com/company/glow" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["instagram_handle"]);
  });
  it("a phone number that is given is still validated", () => {
    expect(leadCreateSchema.safeParse({ ...OK_BRAND, phone_number: "123", phone_country: "IN" }).success).toBe(false);
    expect(leadCreateSchema.parse({ ...OK_BRAND, phone_number: "98765 43210", phone_country: "IN" }).phone_e164).toBe("+919876543210");
  });
  it("rejects a malformed email but allows none", () => {
    expect(leadCreateSchema.safeParse({ ...OK_BRAND, email: "not-an-email" }).success).toBe(false);
    expect(leadCreateSchema.safeParse({ ...OK_BRAND, email: "" }).success).toBe(true);
  });
  it("rejects bad fit score and bad urls", () => {
    expect(leadCreateSchema.safeParse({ ...OK_BRAND, fit_score: 150 }).success).toBe(false);
    expect(leadCreateSchema.safeParse({ ...OK_BRAND, website: "not a url" }).success).toBe(false);
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
  it("repo.createLead refuses an invalid brand before touching the database", async () => {
    await expect(createLead(explodingDb, { name: "No Profile", source: "claude" })).rejects.toThrow(RepoError);
    await expect(createLead(explodingDb, { ...OK_BRAND, phone_number: "000", phone_country: "IN", source: "claude" })).rejects.toThrow(/Phone number/);
  });
  it("repo.updateLead rejects an invalid phone before touching the database", async () => {
    await expect(updateLead(explodingDb, "id", { phone_number: "1", phone_country: "IN" })).rejects.toThrow(/Phone number/);
  });
  it("requires some contact detail", () => {
    expect(contactSchema.safeParse({ role: "CEO" }).success).toBe(false);
    expect(contactSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
    expect(contactSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
  it("parses rupee amounts", () => {
    expect(dealSchema.parse({ title: "Reel", amount: "₹15,000" }).amount).toBe(15000);
    expect(paymentSchema.safeParse({ amount: "0", paid_on: "2026-11-05" }).success).toBe(false);
  });
});
