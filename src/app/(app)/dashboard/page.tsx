import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  CircleCheck,
  CircleX,
  Handshake,
  MessageCircle,
  Percent,
  Send,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";
import { Timeline } from "@/components/activity/timeline";
import { SentPerDayChart } from "@/components/charts/sent-per-day";
import { FitScore, StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, StatTile } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { FollowUpRow } from "../leads/[id]/sections";
import { lastNDays, messagesByDay } from "@/lib/domain/messages";
import { dashboardStats, listActivities, listFollowUps, listSentMessages, pipelineFunnel, topOpportunities } from "@/lib/domain/repo";
import type { Funnel } from "@/lib/domain/types";
import { requireUser } from "@/lib/supabase/server";
import { num, pct } from "@/lib/utils";

function MiniFunnel({ title, href, f }: { title: string; href: string; f: Funnel }) {
  const steps = [
    ["Discovered", f.discovered],
    ["Contacted", f.contacted],
    ["Replied", f.replied],
    ["Interested", f.interested],
    ["Won", f.won],
  ] as const;
  const max = Math.max(f.discovered, 1);
  return (
    <Card>
      <CardHeader
        title={title}
        description={`Reply rate ${pct(f.reply_rate)} · Conversion ${pct(f.conversion_rate)}`}
        action={
          <Link href={href} className="text-xs text-accent hover:underline">
            Open
          </Link>
        }
      />
      <div className="flex flex-col gap-2.5 p-4">
        {steps.map(([label, v]) => (
          <div key={label} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-3 text-xs">
            <span className="text-muted">{label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${(v / max) * 100}%` }} />
            </span>
            <span className="text-right font-medium tabular-nums">{num(v)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default async function DashboardPage() {
  const { supabase } = await requireUser();
  const [stats, funnel, overdue, today, activity, top, sent] = await Promise.all([
    dashboardStats(supabase),
    pipelineFunnel(supabase),
    listFollowUps(supabase, { range: "overdue", limit: 10 }),
    listFollowUps(supabase, { range: "today", limit: 10 }),
    listActivities(supabase, { limit: 12 }),
    topOpportunities(supabase, 5),
    listSentMessages(supabase),
  ]);
  const sentDays = lastNDays(messagesByDay(sent), 14);
  const sentToday = sentDays[0];
  const due = [...overdue, ...today];
  const hour = new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" });
  const greeting = Number(hour) < 12 ? "Good morning" : Number(hour) < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        title={`${greeting}, Aditya`}
        description={
          stats.follow_ups_due > 0
            ? `You have ${stats.follow_ups_due} follow-up${stats.follow_ups_due === 1 ? "" : "s"} due.`
            : "No follow-ups due right now."
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Clients" value={num(stats.total_leads)} icon={<BriefcaseBusiness />} href="/freelance" />
        <StatTile label="New (7 days)" value={num(stats.new_leads_7d)} icon={<Sparkles />} tone="accent" />
        <StatTile
          label="Messages sent"
          value={num(sent.length)}
          hint={`${num(sentToday.total)} today`}
          icon={<Send />}
        />
        <StatTile label="Replies" value={num(stats.replies_received)} icon={<MessageCircle />} />
        <StatTile label="Reply rate" value={pct(funnel.reply_rate)} hint="Leads that replied after you messaged" icon={<Percent />} />
        <StatTile label="Interested" value={num(stats.interested)} icon={<Target />} tone="warning" />
        <StatTile
          label="Follow-ups due"
          value={num(stats.follow_ups_due)}
          hint={`${num(stats.follow_ups_pending)} pending in total`}
          icon={<CalendarClock />}
          tone={stats.follow_ups_due > 0 ? "danger" : "default"}
          href="/follow-ups"
        />
        <StatTile label="Negotiating" value={num(stats.negotiating)} icon={<Handshake />} tone="warning" />
        <StatTile label="Won" value={num(stats.won)} icon={<CircleCheck />} tone="success" />
        <StatTile label="Lost" value={num(stats.lost)} icon={<CircleX />} tone="danger" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Due follow-ups"
            description="Overdue and due today. Marking a reply cancels these automatically."
            action={
              <Link href="/follow-ups" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                All <ArrowRight className="size-3" />
              </Link>
            }
          />
          {due.length === 0 ? (
            <EmptyState icon={<CalendarClock />} title="Nothing due">
              Follow-ups appear here when you mark outreach as sent and no reply comes in.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {due.map((f) => (
                <li key={f.id} className="flex flex-col gap-1 px-4 py-3">
                  <Link href={`/leads/${f.lead.id}?tab=outreach`} className="text-sm font-medium hover:text-accent">
                    {f.lead.name}
                  </Link>
                  <FollowUpRow f={f} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Most promising"
            description="Fit score + momentum"
            action={
              <Link href="/assistant" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                <Bot className="size-3" /> Ask Claude
              </Link>
            }
          />
          {top.length === 0 ? (
            <EmptyState title="No open leads" />
          ) : (
            <ul className="divide-y divide-border">
              {top.map((l) => (
                <li key={l.id}>
                  <Link href={`/leads/${l.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-surface-2/60">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="truncate text-[11px] text-muted">{l.suggested_service ?? l.industry ?? "—"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={l.status} />
                      <FitScore score={l.fit_score} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Messages sent per day"
          description={`Last 14 days · ${num(sentToday.total)} today`}
          action={
            <Link href="/freelance" className="text-xs text-accent hover:underline">
              Clients by date
            </Link>
          }
        />
        <div className="p-4">
          <SentPerDayChart days={sentDays} />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4">
          <MiniFunnel title="Pipeline" href="/freelance" f={funnel} />
        </div>
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent activity"
            action={
              <Link href="/activity" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                All <ArrowRight className="size-3" />
              </Link>
            }
          />
          <div className="max-h-96 overflow-y-auto py-1 scrollbar-thin">
            <Timeline items={activity} showLead />
          </div>
        </Card>
      </div>
    </>
  );
}
