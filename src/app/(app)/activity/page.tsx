import Link from "next/link";
import { Timeline } from "@/components/activity/timeline";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { listActivities } from "@/lib/domain/repo";
import type { LeadKind } from "@/lib/domain/types";
import { requireUser } from "@/lib/supabase/server";

const TYPES: [string, string][] = [
  ["", "All updates"],
  ["lead_created", "New leads"],
  ["research", "Research"],
  ["outreach", "Outreach"],
  ["reply_received", "Replies"],
  ["status_changed", "Status changes"],
  ["follow_up", "Follow-ups"],
  ["deal", "Deals"],
  ["payment", "Payments"],
  ["revenue", "Revenue updates"],
];

const PAGE = 50;

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const type = s("type");
  const actor = ["me", "claude", "system"].includes(s("actor")) ? s("actor") : "";
  const before = s("before");
  const kind = s("kind") === "brand" || s("kind") === "freelance" ? (s("kind") as LeadKind) : undefined;

  const { supabase } = await requireUser();
  const items = await listActivities(supabase, {
    type: type || undefined,
    actor: actor || undefined,
    kind,
    before: before || undefined,
    limit: PAGE,
  });
  const nextCursor = items.length === PAGE ? items[items.length - 1].created_at : null;
  const keep = new URLSearchParams(Object.entries({ type, actor, kind: kind ?? "" }).filter(([, v]) => v) as [string, string][]);

  return (
    <>
      <PageHeader title="Activity & Updates" description="Everything that happened in your brand deals and freelancing: by you, by Claude, or automatically." />
      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b border-border p-3" action="/activity">
          <Select name="type" defaultValue={type} className="w-auto" aria-label="Type">
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select name="kind" defaultValue={kind ?? ""} className="w-auto" aria-label="Pipeline">
            <option value="">All pipelines</option>
            <option value="brand">Brand deals</option>
            <option value="freelance">Freelancing</option>
          </Select>
          <Select name="actor" defaultValue={actor} className="w-auto" aria-label="Who">
            <option value="">Anyone</option>
            <option value="me">Me</option>
            <option value="claude">Claude</option>
            <option value="system">Automatic</option>
          </Select>
          <button type="submit" className={buttonClass("secondary")}>
            Filter
          </button>
          {type || actor || kind ? (
            <Link href="/activity" className="text-xs text-muted hover:text-fg">
              Clear
            </Link>
          ) : null}
        </form>
        <div className="py-2">
          <Timeline items={items} showLead />
        </div>
        {before || nextCursor ? (
          <div className="flex justify-between border-t border-border p-3">
            {before ? (
              <Link href={`/activity?${keep}`} className={buttonClass("ghost", "sm")}>
                Newest
              </Link>
            ) : (
              <span />
            )}
            {nextCursor ? (
              <Link href={`/activity?${new URLSearchParams([...keep, ["before", nextCursor]])}`} className={buttonClass("secondary", "sm")}>
                Older
              </Link>
            ) : null}
          </div>
        ) : null}
      </Card>
    </>
  );
}
