-- ===========================================================================
-- Personal OS: migration 4, separate rules for Instagram brand deals and freelancing.
--   * Phone numbers are required for FREELANCE leads only. Brand deals happen over
--     Instagram DM / email, so a brand lead needs no phone number.
--   * Follow-up timing is configured separately for brands and for freelance clients.
-- Safe to run more than once. Never edits or deletes existing leads.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Follow-up rules per kind.
--    Freelance starts from your current rules; brands get DM-friendly defaults
--    (brands reply slower on Instagram, so wait longer and nudge less).
-- ---------------------------------------------------------------------------
alter table public.settings
  add column if not exists brand_first_follow_up_days integer not null default 3
    check (brand_first_follow_up_days between 0 and 90),
  add column if not exists brand_follow_up_gap_days integer not null default 4
    check (brand_follow_up_gap_days between 1 and 90),
  add column if not exists brand_max_follow_ups integer not null default 2
    check (brand_max_follow_ups between 0 and 20),
  add column if not exists freelance_first_follow_up_days integer not null default 2
    check (freelance_first_follow_up_days between 0 and 90),
  add column if not exists freelance_follow_up_gap_days integer not null default 3
    check (freelance_follow_up_gap_days between 1 and 90),
  add column if not exists freelance_max_follow_ups integer not null default 3
    check (freelance_max_follow_ups between 0 and 20),
  add column if not exists per_kind_rules_initialised boolean not null default false;

-- Carry the existing (shared) rules over to freelancing, once.
update public.settings
   set freelance_first_follow_up_days = default_follow_up_days,
       freelance_follow_up_gap_days   = follow_up_gap_days,
       freelance_max_follow_ups       = max_follow_ups,
       per_kind_rules_initialised     = true
 where not per_kind_rules_initialised;

-- ---------------------------------------------------------------------------
-- 2. Phone number: required for freelance leads, optional for brand leads.
--    A phone number that IS given is always validated.
-- ---------------------------------------------------------------------------
create or replace function private.leads_validate_phone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.phone_e164 is distinct from old.phone_e164
     or new.phone_country is distinct from old.phone_country
     or new.kind is distinct from old.kind then
    if new.phone_e164 is null then
      if new.kind = 'freelance' then
        raise exception 'A valid phone number (with country code) is required for freelance leads'
          using errcode = '23514';
      end if;
      new.phone_country := null;
    else
      if new.phone_e164 !~ '^\+[1-9][0-9]{6,14}$' then
        raise exception 'Phone number must be in international format, e.g. +919876543210'
          using errcode = '23514';
      end if;
      if new.phone_country is null or new.phone_country !~ '^[A-Z]{2}$' then
        raise exception 'A valid phone country is required' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Mark-as-sent uses the follow-up rules of the lead's kind.
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
  v_first integer;
  v_gap integer;
  v_max integer;
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
  if l.kind = 'brand' then
    v_first := coalesce(s.brand_first_follow_up_days, 3);
    v_gap   := coalesce(s.brand_follow_up_gap_days, 4);
    v_max   := coalesce(s.brand_max_follow_ups, 2);
  else
    v_first := coalesce(s.freelance_first_follow_up_days, 2);
    v_gap   := coalesce(s.freelance_follow_up_gap_days, 3);
    v_max   := coalesce(s.freelance_max_follow_ups, 3);
  end if;

  select count(*) into v_attempt from public.outreach where lead_id = l.id and status = 'sent';

  update public.follow_ups set status = 'done', reason = 'Follow-up sent'
   where lead_id = l.id and status = 'pending';

  v_days := coalesce(p_follow_up_days, case when v_attempt <= 1 then v_first else v_gap end);

  if v_days > 0 and v_attempt <= v_max
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

revoke execute on function public.mark_outreach_sent(uuid, integer, timestamptz, boolean) from public, anon;
grant execute on function public.mark_outreach_sent(uuid, integer, timestamptz, boolean) to authenticated;
