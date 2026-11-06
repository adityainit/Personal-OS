import { CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { getSettings, listFollowUps, type FollowUpWithLead } from "@/lib/domain/repo";
import { requireUser } from "@/lib/supabase/server";
import { FollowUpRow } from "../leads/[id]/sections";

export const metadata: Metadata = { title: "Follow-ups" };

function Group({ title, description, items, tone }: { title: string; description: string; items: FollowUpWithLead[]; tone?: string }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {title}
            <span className={`rounded-full px-1.5 text-[11px] ${tone ?? "bg-surface-2 text-muted"}`}>{items.length}</span>
          </span>
        }
        description={description}
      />
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">Nothing here.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((f) => (
            <li key={f.id} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/leads/${f.lead.id}?tab=outreach`} className="truncate text-sm font-medium hover:text-accent">
                  {f.lead.name}
                  <span className="ml-2 text-[11px] font-normal text-muted">{f.lead.kind === "brand" ? "Brand" : "Freelance"}</span>
                </Link>
                <StatusBadge status={f.lead.status} />
              </div>
              <FollowUpRow f={f} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function FollowUpsPage() {
  const { supabase } = await requireUser();
  const [overdue, today, upcoming, settings] = await Promise.all([
    listFollowUps(supabase, { range: "overdue" }),
    listFollowUps(supabase, { range: "today" }),
    listFollowUps(supabase, { range: "upcoming" }),
    getSettings(supabase),
  ]);
  const total = overdue.length + today.length + upcoming.length;

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description={`First follow-up ${settings.default_follow_up_days} day(s) after contact, then every ${settings.follow_up_gap_days} day(s), up to ${settings.max_follow_ups}. Replies, declines, wins and "do not contact" stop them automatically.`}
        actions={
          <ButtonLink href="/settings#follow-up-rules" variant="secondary">
            Edit rules
          </ButtonLink>
        }
      />
      {total === 0 ? (
        <Card>
          <EmptyState icon={<CalendarClock />} title="No pending follow-ups">
            When you mark a message as sent, a follow-up is scheduled here automatically.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Group title="Overdue" description="Past due — follow up or close the lead" items={overdue} tone="bg-danger/10 text-danger" />
          <Group title="Today" description="Due today" items={today} tone="bg-warning/15 text-warning" />
          <Group title="Upcoming" description="Scheduled" items={upcoming} />
        </div>
      )}
    </>
  );
}
