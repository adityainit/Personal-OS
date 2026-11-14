"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as repo from "@/lib/domain/repo";
import {
  compact,
  creatorProfileSchema,
  firstError,
  followUpRulesSchema,
  formToObject,
} from "@/lib/domain/schemas";
import type { LeadStatus } from "@/lib/domain/types";
import { createClient, requireUser } from "@/lib/supabase/server";
import { fail, ok, type ActionResult } from "./result";

const refresh = () => revalidatePath("/", "layout");

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------
export async function createLeadAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    const input = formToObject(fd);
    const res = await repo.createLead(supabase, { ...input, source: "manual" }, {
      allowSimilar: input.allow_similar === "on",
    });
    refresh();
    if (res.duplicate) {
      return ok(`${res.lead.name} is already in your CRM (same website, profile, phone or name) — opened the existing record.`, {
        redirect: `/leads/${res.lead.id}`,
      });
    }
    return ok(`${res.lead.name} added`, { redirect: `/leads/${res.lead.id}` });
  } catch (e) {
    return fail(e);
  }
}

export async function updateLeadAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    await repo.updateLead(supabase, id, formToObject(fd));
    refresh();
    return ok("Saved");
  } catch (e) {
    return fail(e);
  }
}

export async function setLeadStatusAction(id: string, status: LeadStatus): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    const lead = await repo.getLead(supabase, id);
    // "Contacted" from an earlier stage means you just messaged them: record the message
    // so it counts per day and the follow-ups are scheduled.
    if (status === "contacted" && ["new", "researched", "drafted"].includes(lead.status)) {
      const r = await repo.markContacted(supabase, id);
      refresh();
      return ok(r.marked?.follow_up ? "Marked as messaged · follow-up scheduled" : "Marked as messaged");
    }
    await repo.updateLead(supabase, id, { status });
    refresh();
    return ok("Status updated");
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLeadAction(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    await repo.deleteLead(supabase, id);
    refresh();
    return ok("Lead deleted", { redirect: "/freelance" });
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------
export async function addContactAction(leadId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    await repo.addContact(supabase, leadId, formToObject(fd));
    refresh();
    return ok("Contact added");
  } catch (e) {
    return fail(e);
  }
}

export async function updateContactAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    await repo.updateContact(supabase, id, formToObject(fd));
    refresh();
    return ok("Contact saved");
  } catch (e) {
    return fail(e);
  }
}

export async function deleteContactAction(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    await repo.deleteContact(supabase, id);
    refresh();
    return ok("Contact removed");
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Outreach
// ---------------------------------------------------------------------------
export async function saveDraftAction(leadId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    await repo.saveDraft(supabase, leadId, formToObject(fd));
    refresh();
    return ok("Draft saved");
  } catch (e) {
    return fail(e);
  }
}

export async function updateDraftAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    await repo.updateDraft(supabase, id, formToObject(fd));
    refresh();
    return ok("Draft updated");
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDraftAction(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    await repo.deleteDraft(supabase, id);
    refresh();
    return ok("Draft deleted");
  } catch (e) {
    return fail(e);
  }
}

/** Records that the user sent this message themselves. The app never sends anything. */
export async function markSentAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    const raw = formToObject(fd);
    const days = raw.follow_up_days === "" || raw.follow_up_days === undefined ? null : Number(raw.follow_up_days);
    const res = await repo.markSent(supabase, id, {
      followUpDays: Number.isFinite(days) ? days : null,
      sentAt: (raw.sent_at as string) || null,
      force: raw.force === "on",
    });
    refresh();
    return ok(
      res.follow_up
        ? `Marked as sent. Follow-up due ${new Date(res.follow_up.due_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`
        : "Marked as sent. No follow-up scheduled.",
    );
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------
export async function recordInteractionAction(
  leadId: string,
  _: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    const raw = formToObject(fd);
    await repo.recordInteraction(supabase, leadId, { ...raw, channel: raw.channel || null, occurred_at: raw.occurred_at || null });
    refresh();
    return ok(raw.type === "reply" ? "Reply recorded — pending follow-ups cancelled" : "Saved");
  } catch (e) {
    return fail(e);
  }
}

export async function deleteInteractionAction(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    await repo.deleteInteraction(supabase, id);
    refresh();
    return ok("Removed");
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------
export async function setFollowUpAction(leadId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    await repo.setFollowUp(supabase, leadId, formToObject(fd));
    refresh();
    return ok("Follow-up scheduled");
  } catch (e) {
    return fail(e);
  }
}

export async function completeFollowUpAction(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    await repo.updateFollowUp(supabase, id, { status: "done", reason: "Completed manually" });
    refresh();
    return ok("Follow-up done");
  } catch (e) {
    return fail(e);
  }
}

export async function cancelFollowUpAction(id: string): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    await repo.updateFollowUp(supabase, id, { status: "cancelled", reason: "Cancelled manually" });
    refresh();
    return ok("Follow-up cancelled");
  } catch (e) {
    return fail(e);
  }
}

export async function snoozeFollowUpAction(id: string, days: number): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    const due = new Date(Date.now() + days * 86_400_000).toISOString();
    await repo.updateFollowUp(supabase, id, { due_at: due });
    refresh();
    return ok(`Snoozed ${days} day${days === 1 ? "" : "s"}`);
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function saveCreatorProfileAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    const parsed = creatorProfileSchema.safeParse(formToObject(fd));
    if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
    await repo.updateSettings(supabase, { creator_profile: compact(parsed.data) });
    refresh();
    return ok("Creator profile saved");
  } catch (e) {
    return fail(e);
  }
}

export async function saveFollowUpRulesAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    const parsed = followUpRulesSchema.safeParse(formToObject(fd));
    if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
    await repo.updateSettings(supabase, parsed.data);
    refresh();
    return ok("Follow-up rules saved");
  } catch (e) {
    return fail(e);
  }
}

export async function markNotificationsReadAction(): Promise<ActionResult> {
  try {
    const { supabase } = await requireUser();
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    refresh();
    return ok();
  } catch (e) {
    return fail(e);
  }
}
