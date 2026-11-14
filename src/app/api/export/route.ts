import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/csv";
import { messagesByDay } from "@/lib/domain/messages";
import { listSentMessages, pipelineFunnel } from "@/lib/domain/repo";
import { isAllowedEmail } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { ymd } from "@/lib/utils";

const TABLES = ["leads", "contacts", "outreach", "interactions", "follow_ups", "activities", "settings"] as const;

function file(body: string, name: string, type: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function all(supabase: Awaited<ReturnType<typeof createClient>>, table: string, select = "*") {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < 1000) return rows;
  }
}

/** CSV exports and a full JSON backup of the signed-in user's data (RLS-scoped). */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !isAllowedEmail(data.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "leads";
  const stamp = ymd();

  try {
    switch (type) {
      case "backup": {
        const backup: Record<string, unknown> = { exported_at: new Date().toISOString(), version: 1 };
        for (const t of TABLES) backup[t] = await all(supabase, t);
        return file(JSON.stringify(backup, null, 2), `personal-os-backup-${stamp}.json`, "application/json");
      }
      case "leads": {
        const rows = await all(supabase, "leads");
        const contacts = await all(supabase, "contacts");
        const byLead = new Map<string, string[]>();
        for (const c of contacts) {
          const v = [c.name, c.email, c.instagram].filter(Boolean).join(" / ");
          if (v) byLead.set(c.lead_id as string, [...(byLead.get(c.lead_id as string) ?? []), v]);
        }
        const out = rows.map((r) => ({ ...r, contacts: byLead.get(r.id as string)?.join("; ") ?? "" }));
        const cols = [
          "name", "status", "fit_score", "phone_e164", "website", "instagram_handle", "linkedin_url", "industry", "location", "company_size",
          "suggested_service", "opportunity", "why_fit", "description", "research", "contacts", "tags", "source",
          "last_contacted_at", "created_at", "updated_at", "id",
        ];
        return file(toCsv(out, cols), `freelance-clients-${stamp}.csv`, "text/csv");
      }
      case "follow_ups": {
        const rows = await all(supabase, "follow_ups", "*, lead:leads(name)");
        const out = rows.map((f) => ({ ...f, lead: (f.lead as { name: string } | null)?.name }));
        return file(toCsv(out), `follow-ups-${stamp}.csv`, "text/csv");
      }
      case "activities": {
        const rows = await all(supabase, "activities");
        return file(toCsv(rows, ["created_at", "type", "actor", "summary", "lead_id", "metadata", "id"]), `activity-${stamp}.csv`, "text/csv");
      }
      case "report": {
        const from = sp.get("from") ?? undefined;
        const to = sp.get("to") ?? undefined;
        const [funnel, sent] = await Promise.all([pipelineFunnel(supabase, from, to), listSentMessages(supabase, { from, to })]);
        const rows = [
          ...Object.entries(funnel).map(([k, v]) => ({ section: "pipeline", metric: k, value: v })),
          ...messagesByDay(sent).map((d) => ({ section: "messages_sent", metric: d.day, value: d.total })),
        ];
        const label = `${sp.get("dfrom") ?? "start"}_to_${sp.get("dto") ?? stamp}`;
        return file(toCsv(rows, ["section", "metric", "value"]), `report-${label}.csv`, "text/csv");
      }
      default:
        return NextResponse.json({ error: "Unknown export type" }, { status: 400 });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
