-- Personal OS: core schema (freelance clients)
-- Every business table is owner-scoped and protected by Row Level Security.

create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.lead_status as enum (
  'new', 'researched', 'drafted', 'contacted', 'replied',
  'interested', 'negotiating', 'won', 'lost', 'do_not_contact'
);
create type public.lead_source as enum ('claude', 'manual');
create type public.outreach_channel as enum ('whatsapp', 'email');
create type public.outreach_status as enum ('draft', 'sent');
create type public.interaction_type as enum ('reply', 'note', 'call', 'meeting', 'negotiation', 'decline');
create type public.follow_up_status as enum ('pending', 'done', 'cancelled');
create type public.actor_type as enum ('me', 'claude', 'system');

-- ---------------------------------------------------------------------------
-- Normalisation helpers (used for duplicate detection)
-- ---------------------------------------------------------------------------
create or replace function private.normalize_domain(url text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(btrim(coalesce(url, ''))), '^([a-z]+://)?(www\.)?', ''),
      '[/?#:].*$', ''),
    '')
$$;

create or replace function private.normalize_handle(handle text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(btrim(coalesce(handle, ''))), '^([a-z]+://)?(www\.)?instagram\.com/', ''),
      '(^@)|([/?#].*$)', '', 'g'),
    '')
$$;

grant execute on function private.normalize_domain(text) to authenticated;
grant execute on function private.normalize_handle(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Settings (one row per user)
-- ---------------------------------------------------------------------------
create table public.settings (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  creator_profile jsonb not null default '{}'::jsonb,
  -- Follow-up rules: first after N days, then every N days, up to a maximum.
  freelance_first_follow_up_days integer not null default 3
    check (freelance_first_follow_up_days between 0 and 90),
  freelance_follow_up_gap_days integer not null default 4
    check (freelance_follow_up_gap_days between 1 and 90),
  freelance_max_follow_ups integer not null default 2
    check (freelance_max_follow_ups between 0 and 20),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Leads (freelance clients)
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  website text,
  domain_normalized text generated always as (private.normalize_domain(website)) stored,
  instagram_handle text,
  instagram_handle_normalized text generated always as (private.normalize_handle(instagram_handle)) stored,
  linkedin_url text,
  phone_e164 text,
  phone_country text,
  industry text,
  location text,
  company_size text,
  description text,
  research text,
  opportunity text,
  why_fit text,
  suggested_service text,
  fit_score integer check (fit_score between 0 and 100),
  status public.lead_status not null default 'new',
  tags text[] not null default '{}',
  source public.lead_source not null default 'manual',
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create unique index leads_unique_domain on public.leads (owner_id, domain_normalized)
  where domain_normalized is not null;
create unique index leads_unique_handle on public.leads (owner_id, instagram_handle_normalized)
  where instagram_handle_normalized is not null;
create unique index leads_unique_phone on public.leads (owner_id, phone_e164)
  where phone_e164 is not null;
create index leads_owner_status on public.leads (owner_id, status);
create index leads_name_trgm on public.leads using gin (name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Contacts
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lead_id uuid not null,
  name text,
  role text,
  email text,
  instagram text,
  linkedin text,
  phone text,
  source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lead_id, owner_id) references public.leads (id, owner_id) on delete cascade
);
create index contacts_lead on public.contacts (lead_id);

-- ---------------------------------------------------------------------------
-- Outreach (drafts + manually-marked sent messages)
-- ---------------------------------------------------------------------------
create table public.outreach (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lead_id uuid not null,
  contact_id uuid references public.contacts (id) on delete set null,
  channel public.outreach_channel not null,
  subject text,
  body text not null default '',
  status public.outreach_status not null default 'draft',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lead_id, owner_id) references public.leads (id, owner_id) on delete cascade,
  check ((status = 'sent') = (sent_at is not null))
);
create index outreach_lead on public.outreach (lead_id);

-- ---------------------------------------------------------------------------
-- Interactions (replies, notes, calls, negotiations - all recorded manually)
-- ---------------------------------------------------------------------------
create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lead_id uuid not null,
  type public.interaction_type not null,
  channel public.outreach_channel,
  content text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (lead_id, owner_id) references public.leads (id, owner_id) on delete cascade
);
create index interactions_lead on public.interactions (lead_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Follow-ups
-- ---------------------------------------------------------------------------
create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lead_id uuid not null,
  outreach_id uuid references public.outreach (id) on delete set null,
  due_at timestamptz not null,
  status public.follow_up_status not null default 'pending',
  attempt integer not null default 1,
  reason text,
  flagged_due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lead_id, owner_id) references public.leads (id, owner_id) on delete cascade
);
create index follow_ups_pending on public.follow_ups (owner_id, due_at) where status = 'pending';
create index follow_ups_lead on public.follow_ups (lead_id);

-- ---------------------------------------------------------------------------
-- Activity log (append-only, written by triggers only) + notifications
-- ---------------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  lead_id uuid,
  type text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  actor public.actor_type not null default 'me',
  created_at timestamptz not null default now(),
  foreign key (lead_id, owner_id) references public.leads (id, owner_id) on delete set null (lead_id)
);
create index activities_owner_created on public.activities (owner_id, created_at desc);
create index activities_lead on public.activities (lead_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_unread on public.notifications (owner_id, created_at desc) where read_at is null;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.leads enable row level security;
alter table public.contacts enable row level security;
alter table public.outreach enable row level security;
alter table public.interactions enable row level security;
alter table public.follow_ups enable row level security;
alter table public.activities enable row level security;
alter table public.notifications enable row level security;

do $$
declare t text;
begin
  foreach t in array array['settings','leads','contacts','outreach','interactions','follow_ups']
  loop
    execute format(
      'create policy "owner full access" on public.%I for all to authenticated
         using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Activities: read-only for the owner (rows are inserted by security-definer triggers).
create policy "owner read" on public.activities for select to authenticated
  using (owner_id = (select auth.uid()));

-- Notifications: owner may read, mark read, and dismiss.
create policy "owner read" on public.notifications for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner update" on public.notifications for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner delete" on public.notifications for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Nothing is reachable anonymously.
revoke all on all tables in schema public from anon;
