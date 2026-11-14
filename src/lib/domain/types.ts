export type LeadStatus =
  | "new"
  | "researched"
  | "drafted"
  | "contacted"
  | "replied"
  | "interested"
  | "negotiating"
  | "won"
  | "lost"
  | "do_not_contact";
export type LeadSource = "claude" | "manual";
export type OutreachChannel = "whatsapp" | "email";
export type OutreachStatus = "draft" | "sent";
export type InteractionType = "reply" | "note" | "call" | "meeting" | "negotiation" | "decline";
export type FollowUpStatus = "pending" | "done" | "cancelled";
/** WhatsApp auto-send state of a draft. */
export type AutoSendState = "off" | "review" | "queued" | "sending" | "failed";
export type Actor = "me" | "claude" | "system";

export interface Lead {
  id: string;
  name: string;
  website: string | null;
  domain_normalized: string | null;
  instagram_handle: string | null;
  instagram_handle_normalized: string | null;
  linkedin_url: string | null;
  phone_e164: string | null;
  phone_country: string | null;
  industry: string | null;
  location: string | null;
  company_size: string | null;
  description: string | null;
  research: string | null;
  opportunity: string | null;
  why_fit: string | null;
  suggested_service: string | null;
  fit_score: number | null;
  status: LeadStatus;
  tags: string[];
  source: LeadSource;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  lead_id: string;
  name: string | null;
  role: string | null;
  email: string | null;
  instagram: string | null;
  linkedin: string | null;
  phone: string | null;
  source_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface Outreach {
  id: string;
  lead_id: string;
  contact_id: string | null;
  channel: OutreachChannel;
  subject: string | null;
  body: string;
  status: OutreachStatus;
  sent_at: string | null;
  /** 0 = first message, 1 = follow-up #1, … */
  step: number;
  auto_send: AutoSendState;
  /** Don't auto-send before this time. */
  send_after: string | null;
  send_attempts: number;
  send_error: string | null;
  sent_automatically: boolean;
  created_at: string;
  updated_at: string;
}

export interface Interaction {
  id: string;
  lead_id: string;
  type: InteractionType;
  channel: OutreachChannel | null;
  content: string;
  occurred_at: string;
}

export interface FollowUp {
  id: string;
  lead_id: string;
  outreach_id: string | null;
  due_at: string;
  status: FollowUpStatus;
  attempt: number;
  reason: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  lead_id: string | null;
  type: string;
  summary: string;
  metadata: Record<string, unknown>;
  actor: Actor;
  created_at: string;
}

/** Your freelance profile (stored in settings.creator_profile). */
export interface CreatorProfile {
  freelance_services?: string;
  rates?: string;
  portfolio_url?: string;
  bio?: string;
}

export interface Settings {
  owner_id: string;
  creator_profile: CreatorProfile;
  freelance_first_follow_up_days: number;
  freelance_follow_up_gap_days: number;
  freelance_max_follow_ups: number;
  autosend_enabled: boolean;
  autosend_require_approval: boolean;
  autosend_daily_limit: number;
  autosend_start_hour: number;
  autosend_end_hour: number;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  autosend_days: number[];
  autosend_min_gap_minutes: number;
  autosend_max_gap_minutes: number;
  /** Only clients Claude researched, once the first message and every follow-up are drafted. */
  autosend_full_sequence_only: boolean;
}

export type WhatsAppState = "offline" | "starting" | "qr" | "connected" | "logged_out" | "error";

/** Written by the WhatsApp worker. */
export interface WhatsAppStatus {
  owner_id: string;
  state: WhatsAppState;
  qr: string | null;
  pairing_code: string | null;
  phone: string | null;
  last_error: string | null;
  last_seen_at: string | null;
  next_send_at: string | null;
  consecutive_failures: number;
  updated_at: string;
}

/** "First message", "Follow-up #1" … */
export function stepLabel(step: number) {
  return step === 0 ? "First message" : `Follow-up #${step}`;
}

export interface FollowUpRules {
  first: number;
  gap: number;
  max: number;
}

/** The follow-up rules saved in Settings. */
export function followUpRules(s: Partial<Settings> | null | undefined): FollowUpRules {
  return {
    first: s?.freelance_first_follow_up_days ?? 3,
    gap: s?.freelance_follow_up_gap_days ?? 4,
    max: s?.freelance_max_follow_ups ?? 2,
  };
}

/** "after 3 days, then every 4 days, up to 2 follow-ups" */
export function describeRules(r: FollowUpRules) {
  if (r.first === 0 || r.max === 0) return "no automatic follow-ups";
  const d = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  return `first after ${d(r.first)}, then every ${d(r.gap)}, up to ${r.max} follow-up${r.max === 1 ? "" : "s"}`;
}

export interface DashboardStats {
  total_leads: number;
  new_leads_7d: number;
  messages_sent: number;
  replies_received: number;
  interested: number;
  follow_ups_due: number;
  follow_ups_pending: number;
  negotiating: number;
  won: number;
  lost: number;
}

export interface Funnel {
  discovered: number;
  qualified: number;
  contacted: number;
  messages_sent: number;
  replied: number;
  interested: number;
  won: number;
  lost: number;
  reply_rate: number;
  conversion_rate: number;
}
