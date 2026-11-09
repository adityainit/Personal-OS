import { CalendarPlus, Check, Clock, ExternalLink, Mail, MessageCircle, MessageSquarePlus, Pencil, Phone, Plus, Send, Trash2, X } from "lucide-react";
import {
  addContactAction,
  cancelFollowUpAction,
  completeFollowUpAction,
  deleteContactAction,
  deleteDraftAction,
  deleteInteractionAction,
  markSentAction,
  recordInteractionAction,
  saveDraftAction,
  setFollowUpAction,
  snoozeFollowUpAction,
  updateContactAction,
  updateDraftAction,
} from "@/actions";
import { LinkedinIcon, InstagramIcon } from "@/components/icons";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DateTimeField } from "@/components/ui/datetime-field";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ActionButton, CopyButton } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/page-header";
import { CHANNELS, CHANNELS_FOR, CHANNEL_LABEL, INTERACTION_LABEL, INTERACTION_TYPES } from "@/lib/domain/constants";
import { formatPhone } from "@/lib/domain/phone";
import { describeRules, followUpRules, type Contact, type FollowUp, type Interaction, type Lead, type LeadKind, type Outreach, type Settings } from "@/lib/domain/types";
import { buttonClass } from "@/components/ui/button";
import { cn, dueLabel, externalUrl, fmtDateTime, instagramUrl, relative, whatsappUrl } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
function Block({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <h4 className="mb-1 text-xs font-medium text-muted">{title}</h4>
      <p className="prose-text text-sm">{text}</p>
    </div>
  );
}

export function Overview({ lead }: { lead: Lead }) {
  const hasAny = lead.description || lead.opportunity || lead.why_fit || lead.suggested_service || lead.research;
  const freelance = lead.kind === "freelance";
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Research & opportunity" description={lead.source === "claude" ? "Researched by Claude — edit anything." : undefined} />
        <div className="flex flex-col gap-5 p-4">
          {hasAny ? (
            <>
              <Block title="What they do" text={lead.description} />
              <Block title={freelance ? "What they need" : "Collaboration opportunity"} text={lead.opportunity} />
              <Block title={freelance ? "Why I'm a good fit" : "Why they'd work with me"} text={lead.why_fit} />
              <Block title={freelance ? "Service to offer" : "Suggested collaboration"} text={lead.suggested_service} />
              <Block title="Research notes" text={lead.research} />
            </>
          ) : (
            <EmptyState title="No research yet">
              Ask Claude to research {lead.name}, or use Edit to add notes yourself.
            </EmptyState>
          )}
        </div>
      </Card>
      <Card className="h-fit">
        <CardHeader title="Details" />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 p-4 text-sm">
          <dt className="text-muted">Website</dt>
          <dd className="truncate">
            {lead.website ? (
              <a href={externalUrl(lead.website)!} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                {lead.domain_normalized ?? lead.website}
              </a>
            ) : (
              "—"
            )}
          </dd>
          <dt className="text-muted">Phone</dt>
          <dd>
            {lead.phone_e164 ? (
              <span className="flex flex-wrap items-center gap-x-3">
                <a href={`tel:${lead.phone_e164}`} className="text-accent hover:underline">
                  {formatPhone(lead.phone_e164)}
                </a>
                {freelance ? (
                  <a href={whatsappUrl(lead.phone_e164)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                    <MessageCircle className="size-3" /> WhatsApp
                  </a>
                ) : null}
              </span>
            ) : freelance ? (
              <span className="font-medium text-warning">Missing</span>
            ) : (
              "—"
            )}
          </dd>
          <dt className="text-muted">LinkedIn</dt>
          <dd className="truncate">
            {lead.linkedin_url ? (
              <a href={externalUrl(lead.linkedin_url)!} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                Profile
              </a>
            ) : (
              "—"
            )}
          </dd>
          <dt className="text-muted">Instagram</dt>
          <dd className="truncate">
            {lead.instagram_handle ? (
              <a href={instagramUrl(lead.instagram_handle)!} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                @{lead.instagram_handle_normalized}
              </a>
            ) : (
              "—"
            )}
          </dd>
          <dt className="text-muted">Industry</dt>
          <dd>{lead.industry ?? "—"}</dd>
          <dt className="text-muted">Location</dt>
          <dd>{lead.location ?? "—"}</dd>
          <dt className="text-muted">Size</dt>
          <dd>{lead.company_size ?? "—"}</dd>
          <dt className="text-muted">Last contact</dt>
          <dd>{lead.last_contacted_at ? relative(lead.last_contacted_at) : "Never"}</dd>
          <dt className="text-muted">Added</dt>
          <dd>{relative(lead.created_at)}</dd>
          {lead.tags.length ? (
            <>
              <dt className="text-muted">Tags</dt>
              <dd className="flex flex-wrap gap-1">
                {lead.tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </dd>
            </>
          ) : null}
        </dl>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------
function ContactFields({ c }: { c?: Contact }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name">
        <Input name="name" defaultValue={c?.name ?? ""} />
      </Field>
      <Field label="Role">
        <Input name="role" defaultValue={c?.role ?? ""} placeholder="Marketing lead, Founder…" />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" defaultValue={c?.email ?? ""} />
      </Field>
      <Field label="Instagram">
        <Input name="instagram" defaultValue={c?.instagram ?? ""} placeholder="@handle" />
      </Field>
      <Field label="LinkedIn">
        <Input name="linkedin" defaultValue={c?.linkedin ?? ""} />
      </Field>
      <Field label="Phone">
        <Input name="phone" defaultValue={c?.phone ?? ""} />
      </Field>
      <Field label="Source URL" hint="Where this public contact info was found" className="sm:col-span-2">
        <Input name="source_url" defaultValue={c?.source_url ?? ""} />
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <Textarea name="notes" rows={2} defaultValue={c?.notes ?? ""} />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton>{c ? "Save contact" : "Add contact"}</SubmitButton>
      </div>
    </div>
  );
}

export function Contacts({ lead, contacts }: { lead: Lead; contacts: Contact[] }) {
  return (
    <Card>
      <CardHeader
        title="Contacts"
        description="Publicly available business contacts."
        action={
          <Dialog trigger={<><Plus /> Add contact</>} title="Add contact" size="sm" wide>
            <ActionForm action={addContactAction.bind(null, lead.id)}>
              <ContactFields />
            </ActionForm>
          </Dialog>
        }
      />
      {contacts.length === 0 ? (
        <EmptyState title="No contacts yet">Claude saves public emails and profiles here when it researches a lead.</EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {contacts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {c.name ?? "Unnamed"} {c.role ? <span className="font-normal text-muted">· {c.role}</span> : null}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                      <Mail className="size-3" /> {c.email}
                    </a>
                  ) : null}
                  {c.instagram ? (
                    <a href={instagramUrl(c.instagram)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                      <InstagramIcon className="size-3" /> {c.instagram}
                    </a>
                  ) : null}
                  {c.linkedin ? (
                    <a href={externalUrl(c.linkedin)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                      <LinkedinIcon className="size-3" /> LinkedIn
                    </a>
                  ) : null}
                  {c.phone ? (
                    <span className="inline-flex items-center gap-1 text-muted">
                      <Phone className="size-3" /> {c.phone}
                    </span>
                  ) : null}
                </div>
                {c.source_url ? (
                  <a href={externalUrl(c.source_url)!} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted hover:text-fg">
                    <ExternalLink className="size-3" /> Source
                  </a>
                ) : null}
                {c.notes ? <p className="mt-1 text-xs text-muted">{c.notes}</p> : null}
              </div>
              <div className="flex gap-1">
                <Dialog trigger={<Pencil />} triggerTitle="Edit contact" title="Edit contact" variant="ghost" size="icon-sm" wide>
                  <ActionForm action={updateContactAction.bind(null, c.id)} reset={false}>
                    <ContactFields c={c} />
                  </ActionForm>
                </Dialog>
                <ActionButton action={deleteContactAction.bind(null, c.id)} confirm="Remove?" variant="ghost" size="icon-sm" title="Remove contact">
                  <Trash2 />
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Outreach
// ---------------------------------------------------------------------------
function DraftFields({ o, kind }: { o?: Outreach; kind: LeadKind }) {
  const channels = CHANNELS_FOR[kind];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Channel">
          <Select name="channel" defaultValue={o?.channel ?? channels[0]}>
            {channels.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Subject (email)">
          <Input name="subject" defaultValue={o?.subject ?? ""} />
        </Field>
      </div>
      <Field label="Message">
        <Textarea name="body" rows={10} required defaultValue={o?.body ?? ""} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton>{o ? "Save draft" : "Save draft"}</SubmitButton>
      </div>
    </div>
  );
}

export function OutreachSection({ lead, outreach, settings }: { lead: Lead; outreach: Outreach[]; settings: Settings }) {
  const drafts = outreach.filter((o) => o.status === "draft");
  const sent = outreach.filter((o) => o.status === "sent");
  const closed = ["won", "lost", "do_not_contact"].includes(lead.status);
  const sentCount = sent.length;
  const rules = followUpRules(settings, lead.kind);
  const defaultDays = sentCount === 0 ? rules.first : rules.gap;
  const freelance = lead.kind === "freelance";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-accent/30 bg-accent-soft/50 px-4 py-3 text-xs text-fg/80">
        You send every message yourself. Copy a draft, send it on {freelance ? "WhatsApp" : "Instagram"} or email, then click{" "}
        <span className="font-medium">Mark as sent</span> — a follow-up is scheduled automatically.
      </div>
      <Card>
        <CardHeader
          title="Drafts"
          description="Prepared by Claude or by you. Edit freely."
          action={
            <Dialog trigger={<><Plus /> New draft</>} title="New outreach draft" size="sm" wide>
              <ActionForm action={saveDraftAction.bind(null, lead.id)}>
                <DraftFields kind={lead.kind} />
              </ActionForm>
            </Dialog>
          }
        />
        {drafts.length === 0 ? (
          <EmptyState title="No drafts">
            Ask Claude to prepare a personalised {freelance ? "WhatsApp message" : "DM"} and email for {lead.name}.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {drafts.map((o) => (
              <li key={o.id} className="p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge>{CHANNEL_LABEL[o.channel]}</Badge>
                    <span className="text-[11px] text-muted">Updated {relative(o.updated_at)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <CopyButton text={o.subject ? `Subject: ${o.subject}\n\n${o.body}` : o.body} />
                    {o.channel === "whatsapp" && lead.phone_e164 ? (
                      <a
                        href={whatsappUrl(lead.phone_e164, o.body)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Opens WhatsApp with this message filled in. You press send."
                        className={buttonClass("secondary", "sm")}
                      >
                        <MessageCircle /> Open in WhatsApp
                      </a>
                    ) : null}
                    <Dialog trigger={<Pencil />} triggerTitle="Edit draft" title="Edit draft" variant="ghost" size="icon-sm" wide>
                      <ActionForm action={updateDraftAction.bind(null, o.id)} reset={false}>
                        <DraftFields o={o} kind={lead.kind} />
                      </ActionForm>
                    </Dialog>
                    <ActionButton action={deleteDraftAction.bind(null, o.id)} confirm="Delete?" variant="ghost" size="icon-sm" title="Delete draft">
                      <Trash2 />
                    </ActionButton>
                    {!closed ? (
                      <Dialog trigger={<><Send /> Mark as sent</>} title="Mark as sent" description="Only do this after you've sent it yourself." size="sm">
                        <ActionForm action={markSentAction.bind(null, o.id)}>
                          <div className="flex flex-col gap-4">
                            <Field label="Follow up after (days)" hint="0 = no follow-up. Defaults come from Settings → Follow-up rules.">
                              <Input name="follow_up_days" type="number" min={0} max={90} defaultValue={defaultDays} />
                            </Field>
                            <Field label="Sent at" hint="Leave as is if you just sent it">
                              <DateTimeField name="sent_at" defaultValue={new Date().toISOString()} />
                            </Field>
                            <label className="flex items-center gap-2 text-xs text-muted">
                              <input type="checkbox" name="force" className="accent-[var(--accent)]" />
                              I really sent another message on this channel today
                            </label>
                            <div className="flex justify-end">
                              <SubmitButton>
                                <Check /> Confirm sent
                              </SubmitButton>
                            </div>
                          </div>
                        </ActionForm>
                      </Dialog>
                    ) : null}
                  </div>
                </div>
                {o.subject ? <p className="mb-1 text-sm font-medium">{o.subject}</p> : null}
                <p className="prose-text rounded-lg bg-surface-2 p-3 text-sm">{o.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Sent" description={`${sentCount} message${sentCount === 1 ? "" : "s"} marked as sent`} />
        {sent.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted">Nothing sent yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {sent.map((o) => (
              <li key={o.id} className="p-4">
                <div className="mb-1 flex items-center gap-2">
                  <Badge>{CHANNEL_LABEL[o.channel]}</Badge>
                  <span className="text-[11px] text-muted">Sent {fmtDateTime(o.sent_at)}</span>
                </div>
                <details>
                  <summary className="cursor-pointer text-xs text-muted hover:text-fg">
                    {o.subject ?? o.body.slice(0, 80)}
                    {o.body.length > 80 ? "…" : ""}
                  </summary>
                  <p className="prose-text mt-2 rounded-lg bg-surface-2 p-3 text-sm">{o.body}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------
export function InteractionForm({ leadId, defaultType = "reply" }: { leadId: string; defaultType?: string }) {
  return (
    <ActionForm action={recordInteractionAction.bind(null, leadId)}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select name="type" defaultValue={defaultType}>
              {INTERACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INTERACTION_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Channel">
            <Select name="channel" defaultValue="">
              <option value="">—</option>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="What happened" hint="Replies cancel pending follow-ups. Declines close the lead.">
          <Textarea name="content" rows={5} placeholder="Paste their reply or summarise the conversation…" />
        </Field>
        <Field label="When">
          <DateTimeField name="occurred_at" defaultValue={new Date().toISOString()} />
        </Field>
        <div className="flex justify-end">
          <SubmitButton>Save</SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}

export function Conversation({ lead, interactions }: { lead: Lead; interactions: Interaction[] }) {
  const tone: Record<string, string> = {
    reply: "border-l-cyan-500",
    decline: "border-l-rose-500",
    negotiation: "border-l-orange-500",
    note: "border-l-border",
    call: "border-l-violet-500",
    meeting: "border-l-violet-500",
  };
  return (
    <Card>
      <CardHeader
        title="Conversation"
        description="Replies, notes, calls and negotiation updates you record."
        action={
          <Dialog trigger={<><MessageSquarePlus /> Record update</>} title="Record conversation update" size="sm">
            <InteractionForm leadId={lead.id} />
          </Dialog>
        }
      />
      {interactions.length === 0 ? (
        <EmptyState title="No conversation yet">When {lead.name} replies, record it here — follow-ups stop automatically.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3 p-4">
          {interactions.map((i) => (
            <li key={i.id} className={cn("rounded-lg border border-border border-l-4 bg-surface p-3", tone[i.type])}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{INTERACTION_LABEL[i.type]}</span>
                  {i.channel ? <Badge>{CHANNEL_LABEL[i.channel]}</Badge> : null}
                  <span className="text-[11px] text-muted">{fmtDateTime(i.occurred_at)}</span>
                </div>
                <ActionButton action={deleteInteractionAction.bind(null, i.id)} confirm="Remove?" variant="ghost" size="icon-sm" title="Remove">
                  <Trash2 />
                </ActionButton>
              </div>
              {i.content ? <p className="prose-text text-sm">{i.content}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------
export function FollowUpRow({ f, showActions = true }: { f: FollowUp; showActions?: boolean }) {
  const overdue = f.status === "pending" && new Date(f.due_at) < new Date();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Clock className={cn("size-4", overdue ? "text-danger" : "text-muted")} />
        <div>
          <p className={cn("text-sm", overdue && "font-medium text-danger")}>
            {dueLabel(f.due_at)} <span className="text-xs font-normal text-muted">· #{f.attempt}</span>
          </p>
          {f.reason ? <p className="text-[11px] text-muted">{f.reason}</p> : null}
        </div>
      </div>
      {showActions && f.status === "pending" ? (
        <div className="flex flex-wrap gap-1">
          <ActionButton action={completeFollowUpAction.bind(null, f.id)} variant="subtle">
            <Check /> Done
          </ActionButton>
          <ActionButton action={snoozeFollowUpAction.bind(null, f.id, 1)} title="Snooze 1 day">
            +1d
          </ActionButton>
          <ActionButton action={snoozeFollowUpAction.bind(null, f.id, 3)} title="Snooze 3 days">
            +3d
          </ActionButton>
          <ActionButton action={cancelFollowUpAction.bind(null, f.id)} variant="ghost" size="icon-sm" title="Cancel follow-up">
            <X />
          </ActionButton>
        </div>
      ) : (
        <Badge className="capitalize">{f.status}</Badge>
      )}
    </div>
  );
}

export function FollowUps({ lead, followUps, settings }: { lead: Lead; followUps: FollowUp[]; settings: Settings }) {
  const pending = followUps.filter((f) => f.status === "pending");
  const past = followUps.filter((f) => f.status !== "pending");
  const closed = ["won", "lost", "do_not_contact"].includes(lead.status);
  return (
    <Card>
      <CardHeader
        title="Follow-ups"
        description={
          closed
            ? "This lead is closed — follow-ups are stopped."
            : `${lead.kind === "freelance" ? "Freelance" : "Brand"} follow-up rules: ${describeRules(followUpRules(settings, lead.kind))}.`
        }
        action={
          !closed ? (
            <Dialog trigger={<><CalendarPlus /> Schedule</>} title="Schedule follow-up" size="sm" description="Replaces any pending follow-up for this lead.">
              <ActionForm action={setFollowUpAction.bind(null, lead.id)}>
                <div className="flex flex-col gap-4">
                  <Field label="Due">
                    <DateTimeField name="due_at" defaultDaysFromNow={followUpRules(settings, lead.kind).gap} required />
                  </Field>
                  <Field label="Reason">
                    <Input name="reason" placeholder="Check in about proposal" />
                  </Field>
                  <div className="flex justify-end">
                    <SubmitButton>Schedule</SubmitButton>
                  </div>
                </div>
              </ActionForm>
            </Dialog>
          ) : null
        }
      />
      <div className="flex flex-col gap-3 p-4">
        {pending.length === 0 ? <p className="text-xs text-muted">No pending follow-up.</p> : null}
        {pending.map((f) => (
          <FollowUpRow key={f.id} f={f} />
        ))}
        {past.length ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted hover:text-fg">History ({past.length})</summary>
            <div className="mt-3 flex flex-col gap-3">
              {past.map((f) => (
                <FollowUpRow key={f.id} f={f} showActions={false} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </Card>
  );
}
