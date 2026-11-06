import { Briefcase, CalendarClock, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { InstagramIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { getSettings, listFollowUps, type FollowUpWithLead } from "@/lib/domain/repo";
import { describeRules, rulesFor, type LeadKind } from "@/lib/domain/types";
import { requireUser } from "@/lib/supabase/server";
import { cn, instagramUrl } from "@/lib/utils";
import { FollowUpRow } from "../leads/[id]/sections";

const TABS: [LeadKind | "", string][] = [
  ["", "All"],
  ["brand", "Brand deals"],
  ["freelance", "Freelancing"],
];

/** Quick links to where you'd follow up yourself: Instagram for brands, phone/WhatsApp for clients. */
function ReachOut({ lead }: { lead: FollowUpWithLead["lead"] }) {
  const link = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-2 hover:text-fg";
  if (lead.kind === "brand") {
    const ig = instagramUrl(lead.instagram_handle);
    return ig ? (
      <a href={ig} target="_blank" rel="noopener noreferrer" className={link}>
        <InstagramIcon className="size-3" /> Open Instagram
      </a>
    ) : null;
  }
  if (!lead.phone_e164) return null;
  return (
    <span className="flex gap-1">
      <a href={`tel:${lead.phone_e164}`} className={link}>
        <Phone className="size-3" /> Call
      </a>
      <a href={`https://wa.me/${lead.phone_e164.replace(/^\+/, "")}`} target="_blank" rel="noopener noreferrer" className={link}>
        <MessageCircle className="size-3" /> WhatsApp
      </a>
    </span>
  );
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
                  {f.lead.kind === "brand" ? (
                    <InstagramIcon className="size-3.5 shrink-0 text-muted" />
                  ) : (
                    <Briefcase className="size-3.5 shrink-0 text-muted" />
                  )}
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

export default async function FollowUpsPage({ searchParams }: PageProps<"/follow-ups">) {
  const sp = await searchParams;
  const kind = sp.kind === "brand" || sp.kind === "freelance" ? (sp.kind as LeadKind) : undefined;
  const { supabase } = await requireUser();
  const [overdue, today, upcoming, settings] = await Promise.all([
    listFollowUps(supabase, { range: "overdue", kind }),
    listFollowUps(supabase, { range: "today", kind }),
    listFollowUps(supabase, { range: "upcoming", kind }),
    getSettings(supabase),
  ]);
  const total = overdue.length + today.length + upcoming.length;
  const brandRules = describeRules(rulesFor(settings, "brand"));
  const freelanceRules = describeRules(rulesFor(settings, "freelance"));

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description='Replies, declines, wins and "do not contact" stop follow-ups automatically.'
        actions={
          <ButtonLink href="/settings#follow-up-rules" variant="secondary">
            Edit rules
          </ButtonLink>
        }
      />

      <div className="mb-4 grid gap-2 text-xs sm:grid-cols-2">
        <p className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-muted">
          <InstagramIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span className="font-medium text-fg">Brand deals (Instagram DM):</span> {brandRules}.
          </span>
        </p>
        <p className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-muted">
          <Briefcase className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span className="font-medium text-fg">Freelancing:</span> {freelanceRules}.
          </span>
        </p>
      </div>

      <nav className="mb-4 flex w-fit rounded-lg border border-border p-0.5 text-sm" aria-label="Filter follow-ups">
        {TABS.map(([k, label]) => (
          <Link
            key={k || "all"}
            href={k ? `/follow-ups?kind=${k}` : "/follow-ups"}
            className={cn(
              "rounded-md px-3 py-1",
              (kind ?? "") === k ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

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
