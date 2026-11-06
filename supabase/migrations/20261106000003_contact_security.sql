-- Personal OS: mandatory phone numbers, incomplete prospects, sign-up guard,
-- follow-up off-by-one fix, tighter function permissions.
-- Safe to run once on top of migrations 0001 and 0002. Does not modify or delete any existing record.

-- ---------------------------------------------------------------------------
-- 1. Sign-up guard: only allow-listed emails can ever become users.
--    Defence in depth in case "Allow new users to sign up" is switched on.
-- ---------------------------------------------------------------------------
create table if not exists private.allowed_emails (email text primary key check (email = lower(email)));
revoke all on private.allowed_emails from public, anon, authenticated;

-- Anyone who already has an account stays allowed. Create your user (Authentication → Users)
-- BEFORE running this migration, or add your email afterwards with:
--   insert into private.allowed_emails (email) values ('you@example.com');
insert into private.allowed_emails (email)
select lower(email) from auth.users where email is not null
on conflict do nothing;

create or replace function private.block_unlisted_signups()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null
     or not exists (select 1 from private.allowed_emails a where a.email = lower(new.email)) then
    raise exception 'Sign-ups are closed for this workspace' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.block_unlisted_signups() from public, anon, authenticated;

drop trigger if exists block_unlisted_signups on auth.users;
create trigger block_unlisted_signups before insert on auth.users
  for each row execute function private.block_unlisted_signups();

-- Users created before migration 0002 never got a settings row.
insert into public.settings (owner_id)
select id from auth.users
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Lead contact fields + mandatory phone number for every NEW lead.
--    Existing rows are left untouched (their phone stays empty and the UI flags them).
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists phone_e164 text,
  add column if not exists phone_country text,
  add column if not exists linkedin_url text;

create or replace function private.leads_validate_phone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.phone_e164 is distinct from old.phone_e164
     or new.phone_country is distinct from old.phone_country then
    if new.phone_e164 is null or new.phone_e164 !~ '^\+[1-9][0-9]{6,14}$' then
      raise exception 'A valid phone number (with country code) is required' using errcode = '23514';
    end if;
    if new.phone_country is null or new.phone_country !~ '^[A-Z]{2}$' then
      raise exception 'A valid phone country is required' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists leads_validate_phone on public.leads;
create trigger leads_validate_phone before insert or update on public.leads
  for each row execute function private.leads_validate_phone();

create index if not exists leads_phone on public.leads (owner_id, phone_e164) where phone_e164 is not null;

-- ---------------------------------------------------------------------------
-- 3. Incomplete prospects: researched businesses with no verified phone number.
--    They are NOT leads; they never enter the pipeline until a phone is added.
-- ---------------------------------------------------------------------------
create table if not exists public.incomplete_prospects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.lead_kind not null,
  name text not null check (length(btrim(name)) > 0),
  website text,
  domain_normalized text generated always as (private.normalize_domain(website)) stored,
  instagram_handle text,
  linkedin_url text,
  email text,
  contact_person text,
  industry text,
  location text,
  company_size text,
  description text,
  research text,
  opportunity text,
  why_fit text,
  suggested_service text,
  fit_score integer check (fit_score between 0 and 100),
  tags text[] not null default '{}',
  missing text not null default 'No verified phone number',
  source public.lead_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists prospects_unique_domain
  on public.incomplete_prospects (owner_id, kind, domain_normalized) where domain_normalized is not null;
create index if not exists prospects_owner on public.incomplete_prospects (owner_id, created_at desc);

alter table public.incomplete_prospects enable row level security;
drop policy if exists "owner full access" on public.incomplete_prospects;
create policy "owner full access" on public.incomplete_prospects for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop trigger if exists touch_updated_at on public.incomplete_prospects;
create trigger touch_updated_at before update on public.incomplete_prospects
  for each row execute function private.touch_updated_at();

create or replace function private.prospects_after_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform private.log_activity(new.owner_id, null, null, 'prospect_incomplete',
    format('Incomplete prospect saved (%s): %s', lower(new.missing), new.name),
    jsonb_build_object('prospect_id', new.id, 'kind', new.kind));
  return new;
end $$;
drop trigger if exists prospects_after_insert on public.incomplete_prospects;
create trigger prospects_after_insert after insert on public.incomplete_prospects
  for each row execute function private.prospects_after_insert();

-- ---------------------------------------------------------------------------
-- 4. Duplicate check now also matches phone numbers.
-- ---------------------------------------------------------------------------
drop function if exists public.check_duplicate(text, text, text, public.lead_kind);

create or replace function public.check_duplicate(
  p_name text default null, p_website text default null,
  p_instagram text default null, p_kind public.lead_kind default null,
  p_phone text default null
) returns table (id uuid, kind public.lead_kind, name text, status public.lead_status,
                 match_type text, score real)
language sql stable set search_path = '' as $$
  with q as (
    select private.normalize_domain(p_website) as dom,
           private.normalize_handle(p_instagram) as handle,
           nullif(btrim(coalesce(p_name, '')), '') as nm,
           nullif(btrim(coalesce(p_phone, '')), '') as ph
  )
  select l.id, l.kind, l.name, l.status,
         case when q.dom is not null and l.domain_normalized = q.dom then 'website'
              when q.handle is not null and l.instagram_handle_normalized = q.handle then 'instagram'
              when q.ph is not null and l.phone_e164 = q.ph then 'phone'
              else 'name' end,
         case when (q.dom is not null and l.domain_normalized = q.dom)
                or (q.handle is not null and l.instagram_handle_normalized = q.handle) then 1.0::real
              when q.ph is not null and l.phone_e164 = q.ph then 0.95::real
              else extensions.similarity(lower(l.name), lower(q.nm)) end
    from public.leads l, q
   where (p_kind is null or l.kind = p_kind)
     and ((q.dom is not null and l.domain_normalized = q.dom)
       or (q.handle is not null and l.instagram_handle_normalized = q.handle)
       or (q.ph is not null and l.phone_e164 = q.ph)
       or (q.nm is not null and extensions.similarity(lower(l.name), lower(q.nm)) > 0.45))
   order by 6 desc
   limit 10
$$;

-- ---------------------------------------------------------------------------
-- 5. Follow-up off-by-one: with max_follow_ups = N the user sends the first message
--    plus N follow-ups; no follow-up is scheduled after the last allowed one.
-- ---------------------------------------------------------------------------
create or replace function public.mark_outreach_sent(
  p_outreach_id uuid,
  p_follow_up_days integer default null,
  p_sent_at timestamptz default null,
  p_force boolean default false
) returns jsonb language plpgsql set search_path = '' as $$
declare
  o public.outreach%rowtype;
  l public.leads%rowtype;
  s public.settings%rowtype;
  v_sent_at timestamptz := coalesce(p_sent_at, now());
  v_attempt integer;
  v_days integer;
  v_follow_up public.follow_ups%rowtype;
begin
  select * into o from public.outreach where id = p_outreach_id for update;
  if not found then raise exception 'Outreach % not found', p_outreach_id; end if;
  if o.status = 'sent' then raise exception 'This message is already marked as sent'; end if;

  select * into l from public.leads where id = o.lead_id;
  if l.status = 'do_not_contact' then
    raise exception '% is marked "do not contact"', l.name;
  end if;

  if not p_force and exists (
    select 1 from public.outreach x
     where x.lead_id = o.lead_id and x.channel = o.channel and x.status = 'sent'
       and x.sent_at > v_sent_at - interval '20 hours'
  ) then
    raise exception 'DUPLICATE_OUTREACH: a % message to % was already marked sent in the last 20 hours',
      replace(o.channel::text, '_', ' '), l.name using hint = 'Pass p_force => true to override';
  end if;

  update public.outreach set status = 'sent', sent_at = v_sent_at where id = o.id;
  update public.leads
     set last_contacted_at = v_sent_at,
         status = case when status in ('new','researched','drafted','contacted') then 'contacted' else status end
   where id = l.id;

  select * into s from public.settings where owner_id = l.owner_id;
  select count(*) into v_attempt from public.outreach where lead_id = l.id and status = 'sent';

  update public.follow_ups set status = 'done', reason = 'Follow-up sent'
   where lead_id = l.id and status = 'pending';

  v_days := coalesce(p_follow_up_days,
                     case when v_attempt <= 1 then coalesce(s.default_follow_up_days, 1)
                          else coalesce(s.follow_up_gap_days, 3) end);

  if v_days > 0 and v_attempt <= coalesce(s.max_follow_ups, 3)
     and l.status not in ('won', 'lost', 'do_not_contact') then
    insert into public.follow_ups (owner_id, lead_id, outreach_id, due_at, attempt, reason)
    values (l.owner_id, l.id, o.id, v_sent_at + make_interval(days => v_days), v_attempt, 'No reply yet')
    returning * into v_follow_up;
  end if;

  return jsonb_build_object(
    'outreach_id', o.id, 'lead_id', l.id, 'sent_at', v_sent_at, 'attempt', v_attempt,
    'follow_up', case when v_follow_up.id is null then null
                      else jsonb_build_object('id', v_follow_up.id, 'due_at', v_follow_up.due_at) end);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Revenue: "deal value won" must use the user's calendar day (IST), not UTC.
-- ---------------------------------------------------------------------------
create or replace function public.revenue_summary(
  p_from date default '0001-01-01', p_to date default '9999-12-31'
) returns jsonb language sql stable set search_path = '' as $$
  with paid as (
    select p.amount, p.paid_on, d.kind, d.client_name, d.lead_id
      from public.payments p join public.deals d on d.id = p.deal_id
     where p.paid_on >= p_from and p.paid_on <= p_to
  ),
  deal_paid as (
    select d.*, coalesce((select sum(amount) from public.payments x where x.deal_id = d.id), 0) as received
      from public.deals d
  )
  select jsonb_build_object(
    'total_received', (select coalesce(sum(amount), 0) from paid),
    'brand_received', (select coalesce(sum(amount), 0) from paid where kind = 'brand'),
    'freelance_received', (select coalesce(sum(amount), 0) from paid where kind = 'freelance'),
    'pending_payments', (select coalesce(sum(greatest(amount - received, 0)), 0) from deal_paid where status = 'won'),
    'expected_from_active', (select coalesce(sum(greatest(amount - received, 0)), 0) from deal_paid where status = 'active'),
    'won_deal_value', (select coalesce(sum(amount), 0) from deal_paid
                        where status = 'won'
                          and (closed_at at time zone 'Asia/Kolkata')::date >= p_from
                          and (closed_at at time zone 'Asia/Kolkata')::date <= p_to),
    'monthly', coalesce((select jsonb_agg(m order by m ->> 'month') from (
                  select jsonb_build_object('month', to_char(date_trunc('month', paid_on), 'YYYY-MM'),
                           'brand', coalesce(sum(amount) filter (where kind = 'brand'), 0),
                           'freelance', coalesce(sum(amount) filter (where kind = 'freelance'), 0),
                           'total', sum(amount)) m
                    from paid group by date_trunc('month', paid_on)) s), '[]'::jsonb),
    'by_client', coalesce((select jsonb_agg(c order by (c ->> 'received')::numeric desc) from (
                  select jsonb_build_object('client', client_name, 'lead_id', lead_id, 'kind', kind,
                           'received', sum(amount)) c
                    from paid group by client_name, lead_id, kind) s), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------------
-- 7. Permissions: nothing is callable or readable anonymously.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
