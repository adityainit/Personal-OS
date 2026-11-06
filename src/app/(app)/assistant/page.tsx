import { Bot, Check, PlugZap, ShieldCheck, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { env } from "@/lib/env";
import { getSettings } from "@/lib/domain/repo";
import { requireUser } from "@/lib/supabase/server";

const PROMPTS: [string, string][] = [
  ["Brand discovery", "Read my creator profile, then find 10 new brands in AI, developer tools, coding education or startups that would be a good fit for my Instagram. Research each one properly and add the qualified ones to my CRM with their Instagram handle, any public contacts, and separate Instagram DM and email drafts. Brands don't need a phone number."],
  ["Freelance research", "Research five software development or web agencies that could hire me as a freelancer. Check what they do, who their clients are and where they might need frontend, backend, UI/UX or automation help. Add only the ones I'm a good fit for, with a verified phone number, the best service to offer and outreach drafts. If you can't verify a phone number, save it as an incomplete prospect instead."],
  ["Add a company", "Add Acme Labs (acmelabs.com) to my freelance leads — research them first."],
  ["Update status", "Update Notion's status to Interested."],
  ["Log outreach", "I just sent the Instagram DM to Notion. Record it."],
  ["Log a reply", "Vercel replied to my email — they want rates for a reel. Record the reply."],
  ["Revenue", "Record ₹15,000 revenue from my brand collaboration with Notion, received today."],
  ["Follow-ups", "Show all follow-ups due today."],
  ["Prioritise", "What are my most promising freelance opportunities right now, and what should I do next for each?"],
];

const TOOLS = [
  "get_creator_profile", "update_creator_profile", "dashboard_stats", "check_duplicate", "create_lead",
  "save_incomplete_prospect", "list_incomplete_prospects", "promote_prospect", "update_lead",
  "update_lead_status", "search_leads", "get_lead", "add_contact", "save_outreach_draft", "update_outreach_draft",
  "mark_outreach_sent", "record_interaction", "list_follow_ups", "set_follow_up", "complete_follow_up", "create_deal",
  "update_deal", "record_payment", "list_deals", "revenue_summary", "top_opportunities", "pipeline_report", "recent_activity",
];

export default async function AssistantPage() {
  const { supabase } = await requireUser();
  const settings = await getSettings(supabase);
  const url = `${env.siteUrl()}/api/mcp`;
  const profileEmpty = Object.keys(settings.creator_profile ?? {}).length === 0;

  return (
    <>
      <PageHeader
        title="Claude AI Assistant"
        description="Talk to Claude on claude.ai — it researches, organises and updates this CRM through MCP. It never contacts anyone."
      />

      {profileEmpty ? (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          Fill in your <a href="/settings" className="font-medium underline">creator profile</a> first, so Claude can match brands to your niche and audience.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title={<span className="inline-flex items-center gap-2"><PlugZap className="size-4" /> Connect Claude (one-time)</span>} />
          <ol className="flex flex-col gap-4 p-4 text-sm">
            <li>
              <p className="font-medium">1. Copy your MCP server URL</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs">{url}</code>
                <CopyButton text={url} />
              </div>
            </li>
            <li>
              <p className="font-medium">2. Add it as a custom connector</p>
              <p className="mt-1 text-muted">
                On claude.ai open <b>Settings → Connectors → Add custom connector</b>. Name it “Personal OS” and paste the URL. Leave the OAuth client fields empty.
              </p>
            </li>
            <li>
              <p className="font-medium">3. Approve access</p>
              <p className="mt-1 text-muted">
                Click <b>Connect</b>. You&apos;ll be sent to this site&apos;s login and an “Allow access” screen. Approve it, and you&apos;re done.
              </p>
            </li>
            <li>
              <p className="font-medium">4. Use it in any chat</p>
              <p className="mt-1 text-muted">
                Turn on <b>Personal OS</b> (and web search) from the tools menu in a chat, then ask in plain language. Everything Claude does shows up in{" "}
                <a href="/activity?actor=claude" className="text-accent hover:underline">Activity</a> and the notification bell.
              </p>
            </li>
          </ol>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={<span className="inline-flex items-center gap-2"><ShieldCheck className="size-4" /> Ground rules</span>} />
          <ul className="flex flex-col gap-2.5 p-4 text-sm">
            {[
              [true, "Researches brands & businesses on the web"],
              [true, "Saves brands with their Instagram handle, and freelance leads with a verified phone number, plus research and fit scores"],
              [true, "Keeps freelance businesses with no verified phone as incomplete prospects (never invents a number)"],
              [true, "Writes separate DM and email drafts for you to edit"],
              [true, "Updates statuses, follow-ups, deals and revenue when you ask"],
              [true, "Prevents duplicate leads and duplicate outreach"],
              [false, "Never sends DMs, emails or WhatsApp messages"],
              [false, "Cannot delete records — only you can, from this site"],
              [false, "Cannot see anything outside your account"],
            ].map(([okay, t]) => (
              <li key={t as string} className="flex gap-2">
                {okay ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : <X className="mt-0.5 size-4 shrink-0 text-danger" />}
                {t}
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-4 py-3 text-[11px] text-muted">
            Uses your Claude Pro subscription — no API key or paid API needed.
          </p>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={<span className="inline-flex items-center gap-2"><Bot className="size-4" /> Things to ask</span>} description="Copy a prompt into claude.ai." />
        <ul className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {PROMPTS.map(([title, text]) => (
            <li key={title} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-accent">{title}</p>
                <CopyButton text={text} label="" />
              </div>
              <p className="text-sm text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </Card>

      <details className="mt-4 rounded-xl border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-medium">Available MCP tools ({TOOLS.length})</summary>
        <p className="mt-3 flex flex-wrap gap-1.5">
          {TOOLS.map((t) => (
            <code key={t} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">{t}</code>
          ))}
        </p>
      </details>
    </>
  );
}
