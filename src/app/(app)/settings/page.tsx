import { BriefcaseBusiness, Database, Download } from "lucide-react";
import { saveCreatorProfileAction, saveFollowUpRulesAction, saveFreelanceFollowUpRulesAction } from "@/actions";
import { InstagramIcon } from "@/components/icons";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { getSettings } from "@/lib/domain/repo";
import { followUpRules } from "@/lib/domain/types";
import { requireUser } from "@/lib/supabase/server";

const EXPORTS: [string, string][] = [
  ["leads", "All leads"],
  ["deals", "Deals"],
  ["payments", "Payments"],
  ["follow_ups", "Follow-ups"],
  ["activities", "Activity log"],
];

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const s = await getSettings(supabase);
  const p = s.creator_profile ?? {};
  const rules = followUpRules(s);
  const freelanceRules = followUpRules(s, "freelance");

  return (
    <>
      <PageHeader title="Settings" description={`Signed in as ${user.email}`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><InstagramIcon className="size-4" /> Creator profile</span>}
            description="Claude reads this to find brands and clients that fit you. Keep it current."
          />
          <ActionForm action={saveCreatorProfileAction} reset={false} closeDialog={false} className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Instagram handle">
              <Input name="instagram_handle" defaultValue={p.instagram_handle ?? ""} placeholder="@aditya" />
            </Field>
            <Field label="Niche">
              <Input name="niche" defaultValue={p.niche ?? ""} placeholder="AI, coding, developer tools, tech education" />
            </Field>
            <Field label="Followers">
              <Input name="followers" type="number" min={0} defaultValue={p.followers ?? ""} />
            </Field>
            <Field label="Average views per reel">
              <Input name="avg_views" type="number" min={0} defaultValue={p.avg_views ?? ""} />
            </Field>
            <Field label="Engagement rate (%)">
              <Input name="engagement_rate" inputMode="decimal" defaultValue={p.engagement_rate ?? ""} />
            </Field>
            <Field label="Portfolio / website">
              <Input name="portfolio_url" defaultValue={p.portfolio_url ?? ""} />
            </Field>
            <Field label="Audience" className="sm:col-span-2">
              <Textarea name="audience" rows={2} defaultValue={p.audience ?? ""} placeholder="Students & early-career developers in India, 18–30…" />
            </Field>
            <Field label="Content style" className="sm:col-span-2">
              <Textarea name="content_style" rows={2} defaultValue={p.content_style ?? ""} placeholder="Short tutorials, AI tool reviews, project builds…" />
            </Field>
            <Field label="Past collaborations" className="sm:col-span-2">
              <Textarea name="past_collaborations" rows={2} defaultValue={p.past_collaborations ?? ""} />
            </Field>
            <Field label="Rates" className="sm:col-span-2">
              <Textarea name="rates" rows={2} defaultValue={p.rates ?? ""} placeholder="Reel ₹X, story set ₹Y…" />
            </Field>
            <Field label="Freelance services" hint="What you offer freelance clients, and your prices" className="sm:col-span-2">
              <Textarea
                name="freelance_services"
                rows={2}
                defaultValue={p.freelance_services ?? ""}
                placeholder="Websites from ₹X, landing pages, automations, AI chatbots…"
              />
            </Field>
            <Field label="Short bio" className="sm:col-span-2">
              <Textarea name="bio" rows={3} defaultValue={p.bio ?? ""} />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <SubmitButton>Save profile</SubmitButton>
            </div>
          </ActionForm>
        </Card>

        <div className="flex flex-col gap-4">
          <Card id="follow-up-rules">
            <CardHeader
              title={<span className="inline-flex items-center gap-2"><InstagramIcon className="size-4" /> Brand deal follow-ups</span>}
              description="Applied when you mark a brand message as sent. Brands reply slowly to DMs, so wait a few days and don't over-nudge."
            />
            <ActionForm action={saveFollowUpRulesAction} reset={false} closeDialog={false} className="flex flex-col gap-4 p-4">
              <div className="grid grid-cols-3 gap-2">
                <Field label="First after (days)">
                  <Input name="default_follow_up_days" type="number" min={0} max={90} defaultValue={rules.first} />
                </Field>
                <Field label="Then every (days)">
                  <Input name="follow_up_gap_days" type="number" min={1} max={90} defaultValue={rules.gap} />
                </Field>
                <Field label="Max follow-ups">
                  <Input name="max_follow_ups" type="number" min={0} max={20} defaultValue={rules.max} />
                </Field>
              </div>
              <p className="text-[11px] text-muted">0 days or 0 follow-ups = don&apos;t schedule follow-ups automatically.</p>
              <div className="flex justify-end">
                <SubmitButton>Save rules</SubmitButton>
              </div>
            </ActionForm>
          </Card>

          <Card id="freelance-follow-up-rules">
            <CardHeader
              title={<span className="inline-flex items-center gap-2"><BriefcaseBusiness className="size-4" /> Freelance follow-ups</span>}
              description="Applied when you mark a WhatsApp message or email to a freelance client as sent."
            />
            <ActionForm action={saveFreelanceFollowUpRulesAction} reset={false} closeDialog={false} className="flex flex-col gap-4 p-4">
              <div className="grid grid-cols-3 gap-2">
                <Field label="First after (days)">
                  <Input name="freelance_first_follow_up_days" type="number" min={0} max={90} defaultValue={freelanceRules.first} />
                </Field>
                <Field label="Then every (days)">
                  <Input name="freelance_follow_up_gap_days" type="number" min={1} max={90} defaultValue={freelanceRules.gap} />
                </Field>
                <Field label="Max follow-ups">
                  <Input name="freelance_max_follow_ups" type="number" min={0} max={20} defaultValue={freelanceRules.max} />
                </Field>
              </div>
              <p className="text-[11px] text-muted">0 days or 0 follow-ups = don&apos;t schedule follow-ups automatically.</p>
              <div className="flex justify-end">
                <SubmitButton>Save rules</SubmitButton>
              </div>
            </ActionForm>
          </Card>

          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Database className="size-4" /> Export & backup</span>} />
            <div className="flex flex-col gap-3 p-4">
              <a href="/api/export?type=backup" className={buttonClass("primary", "md", "justify-center")}>
                <Download /> Full backup (JSON)
              </a>
              <div className="grid grid-cols-2 gap-2">
                {EXPORTS.map(([t, l]) => (
                  <a key={t} href={`/api/export?type=${t}`} className={buttonClass("secondary", "sm", "justify-center")}>
                    {l}
                  </a>
                ))}
              </div>
              <p className="text-[11px] text-muted">Download a backup regularly: the free Supabase plan has no downloadable backups.</p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
