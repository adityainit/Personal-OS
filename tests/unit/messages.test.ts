import { describe, expect, it } from "vitest";
import { dayLabel, lastNDays, messagesByDay, messagesByLead, type SentMessage } from "@/lib/domain/messages";

const rows: SentMessage[] = [
  // 9 Nov 01:00 IST is still 8 Nov in UTC: must count as 9 Nov.
  { lead_id: "a", sent_at: "2026-11-08T19:30:00.000Z", channel: "instagram_dm", kind: "brand" },
  { lead_id: "a", sent_at: "2026-11-09T05:00:00.000Z", channel: "email", kind: "brand" },
  { lead_id: "b", sent_at: "2026-11-09T06:00:00.000Z", channel: "whatsapp", kind: "freelance" },
  { lead_id: "c", sent_at: "2026-11-07T06:00:00.000Z", channel: "instagram_dm", kind: "brand" },
];

describe("messages sent per day", () => {
  it("groups by day in IST, newest first, with per-pipeline counts and distinct leads", () => {
    const days = messagesByDay(rows);
    expect(days.map((d) => d.day)).toEqual(["2026-11-09", "2026-11-07"]);
    expect(days[0]).toMatchObject({ total: 3, brand: 2, freelance: 1 });
    expect(days[0].leadIds.sort()).toEqual(["a", "b"]);
  });

  it("tracks count, first and last message per lead", () => {
    expect(messagesByLead(rows).a).toEqual({ count: 2, first: "2026-11-08T19:30:00.000Z", last: "2026-11-09T05:00:00.000Z" });
    expect(messagesByLead(rows).c.count).toBe(1);
  });

  it("fills empty days for the recent strip", () => {
    const strip = lastNDays(messagesByDay(rows), 4, "2026-11-09");
    expect(strip.map((d) => [d.day, d.total])).toEqual([
      ["2026-11-09", 3],
      ["2026-11-08", 0],
      ["2026-11-07", 1],
      ["2026-11-06", 0],
    ]);
  });

  it("labels days", () => {
    expect(dayLabel("2026-11-09", "2026-11-09")).toBe("Today");
    expect(dayLabel("2026-11-08", "2026-11-09")).toBe("Yesterday");
    expect(dayLabel("2026-11-07", "2026-11-09")).toMatch(/7 Nov/);
    expect(dayLabel("2025-12-31", "2026-11-09")).toMatch(/2025/);
  });
});
