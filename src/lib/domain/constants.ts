import type { DealStatus, InteractionType, LeadKind, LeadStatus, OutreachChannel } from "./types";

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "researched",
  "drafted",
  "contacted",
  "replied",
  "interested",
  "negotiating",
  "won",
  "lost",
  "do_not_contact",
];

export const OPEN_STATUSES: LeadStatus[] = [
  "new",
  "researched",
  "drafted",
  "contacted",
  "replied",
  "interested",
  "negotiating",
];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  researched: "Researched",
  drafted: "Drafted",
  contacted: "Contacted",
  replied: "Replied",
  interested: "Interested",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
  do_not_contact: "Do not contact",
};

/** Tailwind classes for status pills (light + dark). */
export const STATUS_TONE: Record<LeadStatus, string> = {
  new: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  researched: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  drafted: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  contacted: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  replied: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  interested: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  negotiating: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  won: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  lost: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  do_not_contact: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
};

export const CHANNELS: OutreachChannel[] = ["instagram_dm", "whatsapp", "email", "linkedin", "other"];
export const CHANNEL_LABEL: Record<OutreachChannel, string> = {
  instagram_dm: "Instagram DM",
  whatsapp: "WhatsApp",
  email: "Email",
  linkedin: "LinkedIn",
  other: "Other",
};

/** Outreach channels allowed per pipeline; the first one is the default for new drafts. */
export const CHANNELS_FOR: Record<LeadKind, OutreachChannel[]> = {
  brand: ["instagram_dm", "email", "linkedin", "other"],
  freelance: ["whatsapp", "email"],
};

export const KIND_LABEL: Record<LeadKind, string> = { brand: "Brand deal", freelance: "Freelance" };
/** Where each pipeline's list lives. */
export const KIND_PATH: Record<LeadKind, string> = { brand: "/brands", freelance: "/freelance" };

export const INTERACTION_TYPES: InteractionType[] = ["reply", "note", "call", "meeting", "negotiation", "decline"];
export const INTERACTION_LABEL: Record<InteractionType, string> = {
  reply: "Reply received",
  note: "Note",
  call: "Call",
  meeting: "Meeting",
  negotiation: "Negotiation update",
  decline: "Declined",
};

export const DEAL_STATUSES: DealStatus[] = ["active", "won", "lost"];
export const DEAL_STATUS_LABEL: Record<DealStatus, string> = { active: "Active", won: "Won", lost: "Lost" };

export const ACTIVITY_LABEL: Record<string, string> = {
  lead_created: "Lead added",
  lead_deleted: "Lead deleted",
  research_completed: "Research completed",
  research_updated: "Research updated",
  status_changed: "Status changed",
  contact_added: "Contact added",
  outreach_drafted: "Draft prepared",
  outreach_sent: "Outreach sent",
  reply_received: "Reply received",
  lead_declined: "Declined",
  follow_up_scheduled: "Follow-up scheduled",
  follow_up_due: "Follow-up due",
  follow_up_completed: "Follow-up completed",
  follow_up_cancelled: "Follow-up cancelled",
  follow_up_rescheduled: "Follow-up rescheduled",
  deal_created: "Deal created",
  deal_won: "Deal won",
  deal_lost: "Deal lost",
  deal_reopened: "Deal reopened",
  revenue_updated: "Revenue updated",
  payment_received: "Payment received",
};
