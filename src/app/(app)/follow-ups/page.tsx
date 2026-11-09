import { BriefcaseBusiness, CalendarClock, MessageCircle } from "lucide-react";
import Link from "next/link";
import { InstagramIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { getSettings, listFollowUps, type FollowUpWithLead } from "@/lib/domain/repo";
import { describeRules, followUpRules, type LeadKind } from "@/lib/domain/types";
import { requireUser } from "@/lib/supabase/server";
import { cn, instagramUrl, whatsappUrl } from "@/lib/utils";
import { FollowUpRow } from "../leads/[id]/sections";

const linkClass =
  "inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-2 hover:text-fg";

/** Quick link to where you'd follow up yourself: Instagram for brands, WhatsApp for freelance clients. */
function ReachOut({ lead }: { lead: FollowUpWithLead["lead"] }) {
  if (lead.kind === "freelance") {
    const wa = whatsappUrl(lead.phone_e164);
    return wa ? (
      <a href={wa} target="_blank" rel="noopener noreferrer" className={linkClass}>
        <MessageCircle className="size-3" /> Open WhatsApp
      </a>
    ) : null;
  }
  const ig = instagramUrl(lead.instagram_handle);
  return ig ? (
    <a href={ig} target="_blank" rel="noopener noreferrer" className={linkClass}>
      <InstagramIcon className="size-3" /> Open Instagram
    </a>
  ) : null;
}

function KindIcon({ kind, className }: { kind: LeadKind; className?: string }) {
  return kind === "freelance" ? <BriefcaseBusiness className={className} /> : <InstagramIcon className={className} />;
}

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
                <Link href={`/leads/${f.lead.id}?tab=outreach`} className="flex min-w-0 items-center gap-1.5 text-sm font-medium hover:text-accent">
                  <KindIcon kind={f.lead.kind} className="size-3.5 shrink-0 text-muted" />
                  <span className="truncate">{f.lead.name}</span>
                </Link>
                <StatusBadge status={f.lead.status} />
              </div>
              <FollowUpRow f={f} />
              <ReachOut lead={f.lead} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const TABS: [LeadKind, string][] = [
  ["brand", "Brand deals"],
  ["freelance", "Freelancing"],
];

export default async function FollowUpsPage({ searchParams }: PageProps<"/follow-ups">) {
  const sp = await searchParams;
  const kind: LeadKind = sp.kind === "freelance" ? "freelance" : "brand";
  const { supabase } = await requireUser();
  const [allOverdue, allToday, upcoming, settings] = await Promise.all([
    listFollowUps(supabase, { range: "overdue" }),
    listFollowUps(supabase, { range: "today" }),
    listFollowUps(supabase, { range: "upcoming", kind }),
    getSettings(supabase),
  ]);
  const overdue = allOverdue.filter((f) => f.lead.kind === kind);
  const today = allToday.filter((f) => f.lead.kind === kind);
  const dueByKind: Record<LeadKind, number> = { brand: 0, freelance: 0 };
  for (const f of [...allOverdue, ...allToday]) dueByKind[f.lead.kind] += 1;
  const total = overdue.length + today.length + upcoming.length;
  const rules = describeRules(followUpRules(settings, kind));

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description='Replies, declines, wins and "do not contact" stop follow-ups automatically.'
        actions={
          <ButtonLink href={kind === "freelance" ? "/settings#freelance-follow-up-rules" : "/settings#follow-up-rules"} variant="secondary">
            Edit rules
          </ButtonLink>
        }
      />

      <nav className="mb-4 flex gap-1 border-b border-border" aria-label="Pipeline">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={k === "brand" ? "/follow-ups" : "/follow-ups?kind=freelance"}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition",
              kind === k ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            <KindIcon kind={k} className="size-3.5" />
            {label}
            {dueByKind[k] > 0 ? (
              <span className="rounded-full bg-danger px-1.5 text-[10px] font-semibold leading-4 text-danger-fg">{dueByKind[k]}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      <p className="mb-4 flex w-fit items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
        <KindIcon kind={kind} className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <span className="font-medium text-fg">{kind === "freelance" ? "Freelance" : "Brand deal"} follow-up rules:</span> {rules}.
        </span>
      </p>

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
