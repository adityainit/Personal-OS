import { ArrowLeft, Bot, ExternalLink, MessageCircle, MessageSquarePlus, Pencil, Phone, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteLeadAction, updateLeadAction } from "@/actions";
import { Timeline } from "@/components/activity/timeline";
import { InstagramIcon } from "@/components/icons";
import { LeadFields } from "@/components/leads/lead-form";
import { StatusPicker } from "@/components/leads/status-picker";
import { ActionForm } from "@/components/ui/action-form";
import { Badge, FitScore } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { ActionButton } from "@/components/ui/misc";
import { formatPhone } from "@/lib/domain/phone";
import { getLeadBundle, getSettings, RepoError } from "@/lib/domain/repo";
import { requireUser } from "@/lib/supabase/server";
import { cn, externalUrl, instagramUrl, whatsappUrl } from "@/lib/utils";
import { Contacts, Conversation, FollowUps, InteractionForm, OutreachSection, Overview } from "./sections";

const TABS = [
  ["overview", "Overview"],
  ["contacts", "Contacts"],
  ["outreach", "Outreach"],
  ["conversation", "Conversation"],
  ["follow-ups", "Follow-ups"],
  ["timeline", "Timeline"],
] as const;
type Tab = (typeof TABS)[number][0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string) {
  if (!UUID.test(id)) notFound();
  const { supabase } = await requireUser();
  try {
    const [bundle, settings] = await Promise.all([getLeadBundle(supabase, id), getSettings(supabase)]);
    return { ...bundle, settings };
  } catch (e) {
    if (e instanceof RepoError && e.code === "not_found") notFound();
    throw e;
  }
}

export default async function LeadPage({ params, searchParams }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.some(([t]) => t === sp.tab) ? (sp.tab as Tab) : "overview";
  const { lead, contacts, outreach, interactions, followUps, activities, settings } = await load(id);
  const pendingFU = followUps.filter((f) => f.status === "pending").length;
  const drafts = outreach.filter((o) => o.status === "draft").length;

  const counts: Partial<Record<Tab, number>> = {
    contacts: contacts.length,
    outreach: drafts,
    conversation: interactions.length,
    "follow-ups": pendingFU,
  };

  return (
    <>
      <Link href="/freelance" className="mb-4 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Freelancing
      </Link>

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{lead.name}</h1>
            {lead.source === "claude" ? (
              <Badge className="border-accent/30 text-accent">
                <Bot className="size-3" /> Found by Claude
              </Badge>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            {lead.website ? (
              <a href={externalUrl(lead.website)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                <ExternalLink className="size-3" /> {lead.domain_normalized}
              </a>
            ) : null}
            {lead.instagram_handle ? (
              <a href={instagramUrl(lead.instagram_handle)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                <InstagramIcon className="size-3" /> @{lead.instagram_handle_normalized}
              </a>
            ) : null}
            {lead.phone_e164 ? (
              <a href={`tel:${lead.phone_e164}`} className="inline-flex items-center gap-1 hover:text-accent">
                <Phone className="size-3" /> {formatPhone(lead.phone_e164)}
              </a>
            ) : null}
            {lead.phone_e164 ? (
              <a href={whatsappUrl(lead.phone_e164)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                <MessageCircle className="size-3" /> WhatsApp
              </a>
            ) : null}
            {lead.industry ? <span>{lead.industry}</span> : null}
            <span className="inline-flex items-center gap-1">
              Fit <FitScore score={lead.fit_score} />
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPicker id={lead.id} status={lead.status} />
          <Dialog trigger={<><MessageSquarePlus /> Record reply</>} title="Record conversation update" variant="secondary">
            <InteractionForm leadId={lead.id} />
          </Dialog>
          <Dialog trigger={<><Pencil /> Edit</>} title={`Edit ${lead.name}`} variant="secondary" wide>
            <ActionForm action={updateLeadAction.bind(null, lead.id)} reset={false}>
              <LeadFields lead={lead} />
            </ActionForm>
          </Dialog>
          <ActionButton
            action={deleteLeadAction.bind(null, lead.id)}
            confirm="Delete lead?"
            variant="ghost"
            size="icon"
            title="Delete lead"
          >
            <Trash2 />
          </ActionButton>
        </div>
      </div>

      <nav className="mb-5 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border scrollbar-thin" aria-label="Lead sections">
        {TABS.map(([t, label]) => (
          <Link
            key={t}
            href={t === "overview" ? `/leads/${lead.id}` : `/leads/${lead.id}?tab=${t}`}
            scroll={false}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition",
              tab === t ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {label}
            {counts[t] ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] leading-4",
                  t === "follow-ups" ? "bg-warning/15 text-warning" : "bg-surface-2 text-muted",
                )}
              >
                {counts[t]}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? <Overview lead={lead} /> : null}
      {tab === "contacts" ? <Contacts lead={lead} contacts={contacts} /> : null}
      {tab === "outreach" ? <OutreachSection lead={lead} outreach={outreach} settings={settings} /> : null}
      {tab === "conversation" ? <Conversation lead={lead} interactions={interactions} /> : null}
      {tab === "follow-ups" ? <FollowUps lead={lead} followUps={followUps} settings={settings} /> : null}
      {tab === "timeline" ? (
        <Card>
          <CardHeader title="Complete history" description="Every change, message, reply and follow-up." />
          <div className="py-2">
            <Timeline items={activities} />
          </div>
        </Card>
      ) : null}
    </>
  );
}
