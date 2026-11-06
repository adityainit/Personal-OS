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
export type OutreachChannel = "instagram_dm" | "email" | "linkedin" | "other";
export type OutreachStatus = "draft" | "sent";
export type InteractionType = "reply" | "note" | "call" | "meeting" | "negotiation" | "decline";
export type FollowUpStatus = "pending" | "done" | "cancelled";
export type DealStatus = "active" | "won" | "lost";
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

export interface Deal {
  id: string;
  lead_id: string | null;
  client_name: string;
  title: string;
  amount: number;
  status: DealStatus;
  details: string | null;
  expected_date: string | null;
  payment_due_date: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  deal_id: string;
  amount: number;
  paid_on: string;
  method: string | null;
  note: string | null;
  created_at: string;
}

export interface Activity {
  id: string;
  lead_id: string | null;
  deal_id: string | null;
  type: string;
  summary: string;
  metadata: Record<string, unknown>;
  actor: Actor;
  created_at: string;
}

export interface CreatorProfile {
  instagram_handle?: string;
  niche?: string;
  followers?: number;
  avg_views?: number;
  engagement_rate?: number;
  audience?: string;
  content_style?: string;
  past_collaborations?: string;
  rates?: string;
  portfolio_url?: string;
  bio?: string;
}

export interface Settings {
  owner_id: string;
  creator_profile: CreatorProfile;
  default_follow_up_days: number;
  follow_up_gap_days: number;
  max_follow_ups: number;
  currency: string;
}

export interface FollowUpRules {
  first: number;
  gap: number;
  max: number;
}

/** The follow-up rules saved in Settings. */
export function followUpRules(s: Partial<Settings> | null | undefined): FollowUpRules {
  return {
    first: s?.default_follow_up_days ?? 3,
    gap: s?.follow_up_gap_days ?? 4,
    max: s?.max_follow_ups ?? 2,
  };
}

/** "after 3 days, then every 4 days, up to 2 follow-ups" */
export function describeRules(r: FollowUpRules) {
  if (r.first === 0 || r.max === 0) return "no automatic follow-ups";
  const d = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  return `first after ${d(r.first)}, then every ${d(r.gap)}, up to ${r.max} follow-up${r.max === 1 ? "" : "s"}`;
}

export interface DashboardStats {
  total_brands: number;
  new_leads_7d: number;
  messages_sent: number;
  replies_received: number;
  interested: number;
  follow_ups_due: number;
  follow_ups_pending: number;
  negotiating: number;
  won: number;
  lost: number;
  revenue_received: number;
  pending_payments: number;
  expected_revenue: number;
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

export interface RevenueSummary {
  total_received: number;
  pending_payments: number;
  expected_from_active: number;
  won_deal_value: number;
  monthly: { month: string; total: number }[];
  by_client: { client: string; lead_id: string | null; received: number }[];
}
