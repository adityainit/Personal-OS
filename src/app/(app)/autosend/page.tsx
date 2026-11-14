import { AlertTriangle, CheckCheck, Clock, Pause, Play, Send, Smartphone, Zap } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { approveAutoSendAction, saveAutosendSettingsAction, toggleAutosendAction } from "@/actions";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, StatTile } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { ActionButton } from "@/components/ui/misc";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import {
  getSettings,
  getWhatsAppStatus,
  listAutoSendQueue,
  listAutoSent,
  whatsappStepsByLead,
  type QueueItem,
} from "@/lib/domain/repo";
import { formatPhone } from "@/lib/domain/phone";
import { followUpRules, stepLabel, type Settings, type WhatsAppStatus } from "@/lib/domain/types";
import { requireUser } from "@/lib/supabase/server";
import { cn, fmtDateTime, fmtTime, relative } from "@/lib/utils";
import { AutoSendControls } from "../leads/[id]/sections";

const DAYS: [number, string][] = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
];

/** The worker writes a heartbeat every minute; older than 3 minutes means it's not running. */
function connection(status: WhatsAppStatus | null) {
  if (!status || !status.last_seen_at) return { label: "Worker not started", tone: "danger" as const, live: false };
  const fresh = Date.now() - new Date(status.last_seen_at).getTime() < 3 * 60_000;
  if (!fresh) return { label: "Worker offline", tone: "danger" as const, live: false };
  switch (status.state) {
    case "connected":
      return { label: "Connected", tone: "success" as const, live: true };
    case "qr":
      return { label: "Waiting for you to link WhatsApp", tone: "warning" as const, live: true };
    case "starting":
      return { label: "Connecting…", tone: "warning" as const, live: true };
    case "logged_out":
      return { label: "Logged out: link again", tone: "danger" as const, live: true };
    default:
      return { label: "Error", tone: "danger" as const, live: true };
  }
}

const TONE = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

function byLead(items: QueueItem[]) {
  const groups = new Map<string, { lead: QueueItem["lead"]; items: QueueItem[] }>();
  for (const it of items) {
    const g = groups.get(it.lead.id) ?? { lead: it.lead, items: [] };
    g.items.push(it);
    groups.set(it.lead.id, g);
  }
  for (const g of groups.values()) g.items.sort((a, b) => a.step - b.step || a.created_at.localeCompare(b.created_at));
  return [...groups.values()].sort((a, b) => (b.lead.fit_score ?? 0) - (a.lead.fit_score ?? 0));
}

/** Why a client won't be auto-messaged yet under the full-sequence rule, or null if they're ready. */
function sequenceBlocker(lead: QueueItem["lead"], steps: Set<number> | undefined, settings: Settings) {
  if (!settings.autosend_full_sequence_only) return null;
  if (lead.source !== "claude") return "Won't auto-send: this client wasn't researched by Claude.";
  const max = followUpRules(settings).max;
  const missing = Array.from({ length: max + 1 }, (_, i) => i).filter((i) => !steps?.has(i));
  if (missing.length === 0) return null;
  return `Waiting for drafts: ${missing.map(stepLabel).join(", ")}. Ask Claude to write them, or add them yourself.`;
}

function Blocker({ text }: { text: string | null }) {
  return text ? (
    <p className="flex items-start gap-1.5 rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {text}
    </p>
  ) : null;
}

function LeadHeader({ lead }: { lead: QueueItem["lead"] }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Link href={`/leads/${lead.id}?tab=outreach`} className="truncate text-sm font-medium hover:text-accent">
        {lead.name}
      </Link>
      <StatusBadge status={lead.status} />
      {lead.fit_score !== null ? <Badge>Fit {lead.fit_score}</Badge> : null}
      {lead.phone_e164 ? <span className="text-[11px] text-muted">{formatPhone(lead.phone_e164)}</span> : null}
    </div>
  );
}

function Message({ item, note }: { item: QueueItem; note?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{stepLabel(item.step)}</Badge>
          {note ? <span className="text-[11px] text-muted">{note}</span> : null}
        </div>
        <div className="flex flex-wrap gap-1">
          <AutoSendControls o={item} />
        </div>
      </div>
      <p className="prose-text line-clamp-6 text-sm">{item.body}</p>
      {item.auto_send === "failed" && item.send_error ? <p className="mt-2 text-xs text-danger">{item.send_error}</p> : null}
    </div>
  );
}

function waitingFor(item: QueueItem) {
  if (item.auto_send === "sending") return "Sending now";
  if (item.send_after && new Date(item.send_after) > new Date()) return `Not before ${fmtDateTime(item.send_after)}`;
  return item.step === 0 ? "Next free slot in your sending window" : `On follow-up #${item.step}'s due date`;
}

async function Connection({ status, settings }: { status: WhatsAppStatus | null; settings: Settings }) {
  const c = connection(status);
  const qrSvg =
    c.live && status?.state === "qr" && status.qr
      ? await QRCode.toString(status.qr, { type: "svg", margin: 1, width: 240 })
      : null;
  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Smartphone className="size-4" /> WhatsApp connection
          </span>
        }
        action={<span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TONE[c.tone])}>{c.label}</span>}
      />
      <div className="flex flex-col gap-3 p-4 text-sm">
        {c.live && status?.state === "connected" ? (
          <p>
            Sending from <span className="font-medium">{status.phone ? formatPhone(status.phone) : "your WhatsApp"}</span>.{" "}
            <span className="text-muted">Last check-in {relative(status.last_seen_at)}.</span>
          </p>
        ) : null}

        {qrSvg ? (
          <div className="flex flex-col items-center gap-3">
            <div
              className="rounded-xl bg-white p-2"
              // SVG generated by the qrcode library from the worker's pairing string.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="text-center text-xs text-muted">
              On your phone: WhatsApp → Settings → <span className="font-medium text-fg">Linked devices</span> →{" "}
              <span className="font-medium text-fg">Link a device</span>, then scan. The code refreshes every ~20
              seconds.
            </p>
          </div>
        ) : null}

        {c.live && status?.state === "qr" && status.pairing_code ? (
          <p className="text-center text-xs text-muted">
            Or choose <span className="font-medium text-fg">Link with phone number instead</span> and enter{" "}
            <span className="font-mono text-base font-semibold tracking-widest text-fg">{status.pairing_code}</span>
          </p>
        ) : null}

        {!c.live ? (
          <div className="flex flex-col gap-2 text-xs text-muted">
            <p>
              The worker is a small program that keeps your WhatsApp linked and sends the queue. Deploy it free on
              Render (it runs with your laptop off), or run it on your computer with{" "}
              <span className="font-mono text-fg">cd worker &amp;&amp; npm start</span>.
            </p>
            <p>
              On Render, check the service&apos;s Logs and that cron-job.org is keeping it awake. Setup steps are in{" "}
              <span className="font-mono">worker/README.md</span>.
              {status?.last_seen_at ? ` Last seen ${relative(status.last_seen_at)}.` : ""}
            </p>
          </div>
        ) : null}

        {status?.last_error && c.tone !== "success" ? (
          <p className="flex items-start gap-1.5 text-xs text-danger">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {status.last_error}
          </p>
        ) : null}

        {!settings.autosend_enabled ? (
          <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            Auto-send is <span className="font-medium">paused</span>. The worker stays linked and still records
            replies, but sends nothing.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function SettingsForm({ s }: { s: Settings }) {
  return (
    <Card id="settings">
      <CardHeader title="Sending rules" description="Keeps your number safe: few messages, spread out, business hours only." />
      <ActionForm action={saveAutosendSettingsAction} reset={false} closeDialog={false} className="flex flex-col gap-4 p-4">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="autosend_enabled" defaultChecked={s.autosend_enabled} className="mt-0.5 accent-[var(--accent)]" />
          <span>
            <span className="font-medium">Auto-send on</span>
            <span className="block text-xs text-muted">Off = nothing is sent. Replies are still recorded.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="autosend_require_approval"
            defaultChecked={s.autosend_require_approval}
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span>
            <span className="font-medium">I approve each client first</span>
            <span className="block text-xs text-muted">
              New WhatsApp drafts wait under &quot;Needs approval&quot;. Untick to send Claude&apos;s drafts without review.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="autosend_full_sequence_only"
            defaultChecked={s.autosend_full_sequence_only}
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span>
            <span className="font-medium">Only Claude&apos;s complete sequences</span>
            <span className="block text-xs text-muted">
              Auto-send only clients Claude researched, once the first message and every follow-up are drafted.
            </span>
          </span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Per day (max)">
            <Input name="autosend_daily_limit" type="number" min={1} max={50} defaultValue={s.autosend_daily_limit} />
          </Field>
          <Field label="From (hour)">
            <Input name="autosend_start_hour" type="number" min={0} max={23} defaultValue={s.autosend_start_hour} />
          </Field>
          <Field label="Until (hour)">
            <Input name="autosend_end_hour" type="number" min={1} max={24} defaultValue={s.autosend_end_hour} />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Days</p>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map(([n, label]) => (
              <label
                key={n}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent"
              >
                <input type="checkbox" name="autosend_days" value={n} defaultChecked={s.autosend_days.includes(n)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Gap from (minutes)">
            <Input name="autosend_min_gap_minutes" type="number" min={1} max={240} defaultValue={s.autosend_min_gap_minutes} />
          </Field>
          <Field label="Gap up to (minutes)">
            <Input name="autosend_max_gap_minutes" type="number" min={1} max={480} defaultValue={s.autosend_max_gap_minutes} />
          </Field>
        </div>
        <p className="text-[11px] text-muted">
          India time. Each message waits a random gap after the previous one. The daily limit counts first messages
          and follow-ups together; follow-ups go out on their due date, before new clients.
        </p>
        <div className="flex justify-end">
          <SubmitButton>Save rules</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}

export default async function AutoSendPage() {
  const { supabase } = await requireUser();
  const [settings, status, queue, sentToday] = await Promise.all([
    getSettings(supabase),
    getWhatsAppStatus(supabase),
    listAutoSendQueue(supabase),
    listAutoSent(supabase),
  ]);
  const steps = await whatsappStepsByLead(supabase, [...new Set(queue.map((q) => q.lead.id))]);
  const blocker = (lead: QueueItem["lead"]) => sequenceBlocker(lead, steps.get(lead.id), settings);
  const review = byLead(queue.filter((q) => q.auto_send === "review"));
  const queued = byLead(queue.filter((q) => q.auto_send === "queued" || q.auto_send === "sending"));
  const failed = queue.filter((q) => q.auto_send === "failed");
  const reviewCount = queue.filter((q) => q.auto_send === "review").length;
  const c = connection(status);
  const nextAt = status?.next_send_at && new Date(status.next_send_at) > new Date() ? status.next_send_at : null;

  return (
    <>
      <AutoRefresh seconds={status?.state === "qr" || status?.state === "starting" ? 5 : 30} />
      <PageHeader
        title="WhatsApp auto-send"
        description="Approved drafts go out from your own WhatsApp within your sending rules. Replies are recorded and stop follow-ups."
        actions={
          settings.autosend_enabled ? (
            <ActionButton action={toggleAutosendAction.bind(null, false)}>
              <Pause /> Pause sending
            </ActionButton>
          ) : (
            <ActionButton action={toggleAutosendAction.bind(null, true)} variant="primary">
              <Play /> Turn on auto-send
            </ActionButton>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Sent today"
          value={`${sentToday.length} / ${settings.autosend_daily_limit}`}
          icon={<Send />}
          tone="accent"
        />
        <StatTile
          label="Next send"
          value={!settings.autosend_enabled ? "Paused" : !c.live ? "—" : nextAt ? fmtTime(nextAt) : "Ready"}
          hint={`${String(settings.autosend_start_hour).padStart(2, "0")}:00–${String(settings.autosend_end_hour).padStart(2, "0")}:00 IST`}
          icon={<Clock />}
        />
        <StatTile label="Needs approval" value={reviewCount} icon={<CheckCheck />} tone={reviewCount ? "warning" : "default"} />
        <StatTile label="Not sent" value={failed.length} icon={<AlertTriangle />} tone={failed.length ? "danger" : "default"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader
              title={`Needs approval (${reviewCount})`}
              description="Read Claude's drafts, then approve. Approving a client queues their first message and follow-ups."
              action={
                reviewCount ? (
                  <ActionButton action={approveAutoSendAction.bind(null, undefined)} variant="primary" confirm="Approve all?">
                    <CheckCheck /> Approve all
                  </ActionButton>
                ) : null
              }
            />
            {review.length === 0 ? (
              <EmptyState icon={<CheckCheck />} title="Nothing to review">
                {settings.autosend_require_approval
                  ? "New WhatsApp drafts from Claude appear here."
                  : "Approval is off: new drafts are queued straight away."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {review.map((g) => (
                  <li key={g.lead.id} className="flex flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <LeadHeader lead={g.lead} />
                      <ActionButton action={approveAutoSendAction.bind(null, g.lead.id)} variant="subtle">
                        <CheckCheck /> Approve {g.items.length > 1 ? `all ${g.items.length}` : ""}
                      </ActionButton>
                    </div>
                    {g.lead.industry || g.lead.location ? (
                      <p className="text-[11px] text-muted">{[g.lead.industry, g.lead.location].filter(Boolean).join(" · ")}</p>
                    ) : null}
                    <Blocker text={blocker(g.lead)} />
                    {g.items.map((it) => (
                      <Message key={it.id} item={it} />
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {failed.length ? (
            <Card>
              <CardHeader title={`Not sent (${failed.length})`} description="Retry, or send these yourself." />
              <ul className="divide-y divide-border">
                {failed.map((it) => (
                  <li key={it.id} className="flex flex-col gap-2 p-4">
                    <LeadHeader lead={it.lead} />
                    <Message item={it} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title={`Queue (${queued.reduce((n, g) => n + g.items.length, 0)})`}
              description="Approved. First messages go out at the next free slot; follow-ups when they're due."
            />
            {queued.length === 0 ? (
              <EmptyState icon={<Zap />} title="Queue is empty">
                Approve drafts above, or click Auto-send on any WhatsApp draft.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {queued.map((g) => (
                  <li key={g.lead.id} className="flex flex-col gap-2 p-4">
                    <LeadHeader lead={g.lead} />
                    <Blocker text={blocker(g.lead)} />
                    {g.items.map((it) => (
                      <Message key={it.id} item={it} note={waitingFor(it)} />
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Connection status={status} settings={settings} />
          <SettingsForm s={settings} />
          <Card>
            <CardHeader title={`Sent today (${sentToday.length})`} />
            {sentToday.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Nothing sent automatically today.</p>
            ) : (
              <ul className="divide-y divide-border">
                {sentToday.map((it) => (
                  <li key={it.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <Link href={`/leads/${it.lead.id}?tab=outreach`} className="min-w-0 truncate text-sm hover:text-accent">
                      {it.lead.name}
                    </Link>
                    <span className="shrink-0 text-[11px] text-muted">
                      {stepLabel(it.step)} · {fmtTime(it.sent_at!)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
