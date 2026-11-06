import { describe, expect, it } from "vitest";
import { firstError, contactSchema } from "@/lib/domain/schemas";
import { countryName, countryOptions } from "@/lib/domain/phone";
import { COUNTRY_NAMES } from "@/lib/domain/country-names";
import { prettySummary, relative } from "@/lib/utils";

describe("activity summaries", () => {
  it("formats database amounts as rupees", () => {
    expect(prettySummary("Payment received: 2000.00 for Logo (Acme)")).toBe("Payment received: ₹2,000 for Logo (Acme)");
    expect(prettySummary("Deal created: Site (Acme) — 150000.00")).toBe("Deal created: Site (Acme) — ₹1,50,000");
    expect(prettySummary("Deal amount updated: Site (5000.00 → 7500.50)")).toContain("→ ₹7,501");
  });
  it("leaves other text alone", () => {
    expect(prettySummary("Acme v2.10: new → contacted")).toBe("Acme v2.10: new → contacted");
    expect(prettySummary(null)).toBe("");
  });
});

describe("relative time", () => {
  it("shows 'just now' for tiny clock differences in both directions", () => {
    expect(relative(new Date(Date.now() + 1500))).toBe("just now");
    expect(relative(new Date(Date.now() - 1500))).toBe("just now");
  });
  it("still shows real future dates", () => {
    expect(relative(new Date(Date.now() + 3 * 86_400_000))).toMatch(/^in /);
  });
});

describe("country list is deterministic (no hydration mismatch)", () => {
  it("uses static names, India first", () => {
    const list = countryOptions();
    expect(list[0].code).toBe("IN");
    expect(countryName("FK")).toBe(COUNTRY_NAMES.FK);
    expect(list.length).toBe(Object.keys(COUNTRY_NAMES).length);
    // Accented names sort with their base letter.
    const names = list.slice(1).map((c) => c.name);
    expect(names.indexOf("Åland Islands")).toBeLessThan(names.indexOf("Belgium"));
  });
});

describe("error messages", () => {
  it("has no technical 'input:' prefix", () => {
    const r = contactSchema.safeParse({ lead_id: "00000000-0000-4000-8000-000000000000" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstError(r.error)).not.toMatch(/^input:/);
  });
});
