import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/csv";
import { pipelineFunnel, revenueSummary } from "@/lib/domain/repo";
import { isAllowedEmail } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { ymd } from "@/lib/utils";

const TABLES = ["leads", "contacts", "outreach", "interactions", "follow_ups", "deals", "payments", "activities", "settings"] as const;

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
        const kind = sp.get("kind");
        let rows = await all(supabase, "leads");
        if (kind === "brand" || kind === "freelance") rows = rows.filter((r) => r.kind === kind);
        const contacts = await all(supabase, "contacts");
        const byLead = new Map<string, string[]>();
        for (const c of contacts) {
          const v = [c.name, c.email, c.instagram].filter(Boolean).join(" / ");
          if (v) byLead.set(c.lead_id as string, [...(byLead.get(c.lead_id as string) ?? []), v]);
        }
        const out = rows.map((r) => ({ ...r, contacts: byLead.get(r.id as string)?.join("; ") ?? "" }));
        const cols = [
          "name", "kind", "status", "phone_e164", "fit_score", "website", "instagram_handle", "linkedin_url", "industry", "location", "company_size",
          "suggested_service", "opportunity", "why_fit", "description", "research", "contacts", "tags", "source",
          "last_contacted_at", "created_at", "updated_at", "id",
        ];
        return file(toCsv(out, cols), `${kind ?? "all"}-leads-${stamp}.csv`, "text/csv");
      }
      case "deals": {
        const deals = await all(supabase, "deals", "*, payments(amount)");
        const out = deals.map((d) => {
          const received = ((d.payments as { amount: number }[]) ?? []).reduce((s, p) => s + Number(p.amount), 0);
          const { payments: _omit, ...rest } = d;
          void _omit;
          return { ...rest, received, pending: Math.max(Number(d.amount) - received, 0) };
        });
        const cols = ["client_name", "kind", "title", "amount", "received", "pending", "status", "expected_date", "payment_due_date", "closed_at", "details", "created_at", "id", "lead_id"];
        return file(toCsv(out, cols), `deals-${stamp}.csv`, "text/csv");
      }
      case "payments": {
        const rows = await all(supabase, "payments", "*, deal:deals(title, client_name, kind)");
        const out = rows.map((p) => {
          const deal = p.deal as { title: string; client_name: string; kind: string } | null;
          return { paid_on: p.paid_on, amount: p.amount, client: deal?.client_name, deal: deal?.title, source: deal?.kind, method: p.method, note: p.note, id: p.id };
        });
        return file(toCsv(out), `payments-${stamp}.csv`, "text/csv");
      }
      case "follow_ups": {
        const rows = await all(supabase, "follow_ups", "*, lead:leads(name, kind)");
        const out = rows.map((f) => ({ ...f, lead: (f.lead as { name: string } | null)?.name }));
        return file(toCsv(out), `follow-ups-${stamp}.csv`, "text/csv");
      }
      case "activities": {
        const rows = await all(supabase, "activities");
        return file(toCsv(rows, ["created_at", "type", "actor", "summary", "lead_id", "deal_id", "metadata", "id"]), `activity-${stamp}.csv`, "text/csv");
      }
      case "report": {
        const from = sp.get("from") ?? undefined;
        const to = sp.get("to") ?? undefined;
        const [b, f, r] = await Promise.all([
          pipelineFunnel(supabase, "brand", from, to),
          pipelineFunnel(supabase, "freelance", from, to),
          revenueSummary(supabase, sp.get("dfrom") ?? undefined, sp.get("dto") ?? undefined),
        ]);
        const rows = [
          ...Object.entries(b).map(([k, v]) => ({ section: "brand_deals", metric: k, value: v })),
          ...Object.entries(f).map(([k, v]) => ({ section: "freelancing", metric: k, value: v })),
          ...Object.entries(r)
            .filter(([, v]) => typeof v !== "object")
            .map(([k, v]) => ({ section: "revenue", metric: k, value: v })),
          ...r.monthly.map((m) => ({ section: "revenue_monthly", metric: m.month, value: m.total })),
          ...r.by_client.map((c) => ({ section: "revenue_by_client", metric: c.client, value: c.received })),
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
