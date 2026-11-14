import { describe, expect, it } from "vitest";
import { firstError, contactSchema } from "@/lib/domain/schemas";
import { countryName, countryOptions } from "@/lib/domain/phone";
import { COUNTRY_NAMES } from "@/lib/domain/country-names";
import { relative } from "@/lib/utils";

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
