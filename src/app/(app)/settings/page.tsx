import { BriefcaseBusiness, Database, Download, UserRound } from "lucide-react";
import { saveCreatorProfileAction, saveFollowUpRulesAction } from "@/actions";
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
  ["follow_ups", "Follow-ups"],
  ["activities", "Activity log"],
];

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const s = await getSettings(supabase);
  const p = s.creator_profile ?? {};
  const rules = followUpRules(s);

  return (
    <>
      <PageHeader title="Settings" description={`Signed in as ${user.email}`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="h-fit lg:col-span-2">
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><UserRound className="size-4" /> Freelance profile</span>}
            description="Claude reads this to pick clients that fit you and to write your messages. Keep it current."
          />
          <ActionForm action={saveCreatorProfileAction} reset={false} closeDialog={false} className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Services you offer" hint="What you build for clients" className="sm:col-span-2">
              <Textarea
                name="freelance_services"
                rows={3}
                defaultValue={p.freelance_services ?? ""}
                placeholder="Websites, landing pages, WhatsApp automations, AI chatbots…"
              />
            </Field>
            <Field label="Rates" hint="Rough prices Claude can mention">
              <Input name="rates" defaultValue={p.rates ?? ""} placeholder="Websites from ₹X, landing pages from ₹Y" />
            </Field>
            <Field label="Portfolio / website">
              <Input name="portfolio_url" defaultValue={p.portfolio_url ?? ""} placeholder="https://…" />
            </Field>
            <Field label="Short bio" hint="Who you are, in a few lines" className="sm:col-span-2">
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
              title={<span className="inline-flex items-center gap-2"><BriefcaseBusiness className="size-4" /> Follow-ups</span>}
              description="Applied when you mark a WhatsApp message or email to a client as sent."
            />
            <ActionForm action={saveFollowUpRulesAction} reset={false} closeDialog={false} className="flex flex-col gap-4 p-4">
              <div className="grid grid-cols-3 gap-2">
                <Field label="First after (days)">
                  <Input name="freelance_first_follow_up_days" type="number" min={0} max={90} defaultValue={rules.first} />
                </Field>
                <Field label="Then every (days)">
                  <Input name="freelance_follow_up_gap_days" type="number" min={1} max={90} defaultValue={rules.gap} />
                </Field>
                <Field label="Max follow-ups">
                  <Input name="freelance_max_follow_ups" type="number" min={0} max={20} defaultValue={rules.max} />
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
