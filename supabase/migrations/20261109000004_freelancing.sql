-- Personal OS: freelancing pipeline, alongside Instagram brand deals.
-- Run after migrations 1–3. Existing leads stay brand deals.
--
--  - leads.kind: 'brand' (default) or 'freelance'
--  - Freelance clients need a business name and a valid phone number; Instagram is optional
--  - Freelance outreach is WhatsApp or email only (no Instagram DM)
--  - Separate follow-up rules for freelancing (default: first after 3 days, then 4 days later, max 2)
--
-- Note: the new 'whatsapp' enum value is only compared as text below, so this file can run in one
-- transaction (Postgres refuses to use a freshly added enum value before commit).

-- ---------------------------------------------------------------------------
-- Types & columns
-- ---------------------------------------------------------------------------
create type public.lead_kind as enum ('brand', 'freelance');
alter type public.outreach_channel add value if not exists 'whatsapp';

alter table public.leads add column kind public.lead_kind not null default 'brand';

alter table public.settings
  add column freelance_first_follow_up_days integer not null default 3
    check (freelance_first_follow_up_days between 0 and 90),
  add column freelance_follow_up_gap_days integer not null default 4
    check (freelance_follow_up_gap_days between 1 and 90),
  add column freelance_max_follow_ups integer not null default 2
    check (freelance_max_follow_ups between 0 and 20);

-- The same business can be both a brand-deal lead and a freelance client.
drop index if exists public.leads_unique_domain;
drop index if exists public.leads_unique_handle;
drop index if exists public.leads_owner_status;
create unique index leads_unique_domain on public.leads (owner_id, kind, domain_normalized)
  where domain_normalized is not null;
create unique index leads_unique_handle on public.leads (owner_id, kind, instagram_handle_normalized)
  where instagram_handle_normalized is not null;
create unique index leads_unique_freelance_phone on public.leads (owner_id, phone_e164)
  where kind = 'freelance' and phone_e164 is not null;
create index leads_owner_kind_status on public.leads (owner_id, kind, status);

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------
-- Freelance clients must have a phone number; a lead's kind never changes.
create or replace function private.leads_kind_rules()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
    raise exception 'A lead cannot switch between brand deals and freelancing' using errcode = '23514';
  end if;
  if new.kind = 'freelance' and new.phone_e164 is null then
    raise exception 'Freelance clients need a phone number' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger leads_kind_rules before insert or update on public.leads
  for each row execute function private.leads_kind_rules();

-- Freelance outreach goes over WhatsApp or email only.
create or replace function private.outreach_channel_rules()
returns trigger language plpgsql set search_path = '' as $$
declare v_kind public.lead_kind;
begin
  select kind into v_kind from public.leads where id = new.lead_id;
  if v_kind = 'freelance' and new.channel::text not in ('whatsapp', 'email') then
    raise exception 'Freelance outreach must be WhatsApp or email' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger outreach_channel_rules before insert or update of channel on public.outreach
  for each row execute function private.outreach_channel_rules();

-- Activity wording names the pipeline.
create or replace function private.kind_label(k public.lead_kind)
returns text language sql immutable set search_path = '' as $$
  select case k when 'freelance' then 'freelance client' else 'brand' end
$$;
grant execute on function private.kind_label(public.lead_kind) to authenticated;

create or replace function private.leads_after_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.owner_id, new.id, null, 'lead_created',
      format('New %s added: %s', private.kind_label(new.kind), new.name),
      jsonb_build_object('kind', new.kind, 'source', new.source, 'fit_score', new.fit_score));
    if coalesce(btrim(new.research), '') <> '' then
      perform private.log_activity(new.owner_id, new.id, null, 'research_completed',
        format('Research saved for %s', new.name), '{}'::jsonb);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform private.log_activity(new.owner_id, new.id, null,
        case new.status when 'won' then 'deal_won' when 'lost' then 'deal_lost' else 'status_changed' end,
        format('%s: %s → %s', new.name, replace(old.status::text, '_', ' '), replace(new.status::text, '_', ' ')),
        jsonb_build_object('from', old.status, 'to', new.status));
      if new.status in ('won', 'lost', 'do_not_contact') then
        perform private.cancel_pending_follow_ups(new.id, 'Lead marked ' || replace(new.status::text, '_', ' '));
      end if;
    end if;

    if coalesce(btrim(new.research), '') <> '' and new.research is distinct from old.research then
      perform private.log_activity(new.owner_id, new.id, null,
        case when coalesce(btrim(old.research), '') = '' then 'research_completed' else 'research_updated' end,
        format('Research %s for %s',
          case when coalesce(btrim(old.research), '') = '' then 'completed' else 'updated' end, new.name),
        '{}'::jsonb);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform private.log_activity(old.owner_id, null, null, 'lead_deleted',
      format('Deleted %s: %s', private.kind_label(old.kind), old.name),
      jsonb_build_object('lead_id', old.id, 'kind', old.kind));
    return old;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
drop function if exists public.check_duplicate(text, text, text, text);
create function public.check_duplicate(
  p_name text default null, p_website text default null,
  p_instagram text default null, p_phone text default null,
  p_kind public.lead_kind default null
) returns table (id uuid, kind public.lead_kind, name text, status public.lead_status, match_type text, score real)
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

-- Same as before, but follow-up timing comes from the rules for the lead's kind.
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
  if l.kind = 'freelance' then
    v_first := coalesce(s.freelance_first_follow_up_days, 3);
    v_gap   := coalesce(s.freelance_follow_up_gap_days, 4);
    v_max   := coalesce(s.freelance_max_follow_ups, 2);
  else
    v_first := coalesce(s.default_follow_up_days, 3);
    v_gap   := coalesce(s.follow_up_gap_days, 4);
    v_max   := coalesce(s.max_follow_ups, 2);
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

-- Dashboard numbers: total_brands now counts brand deals only; total_freelance is new.
create or replace function public.dashboard_stats()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'total_brands',       (select count(*) from public.leads where kind = 'brand'),
    'total_freelance',    (select count(*) from public.leads where kind = 'freelance'),
    'new_leads_7d',       (select count(*) from public.leads where created_at > now() - interval '7 days'),
    'messages_sent',      (select count(*) from public.outreach where status = 'sent'),
    'replies_received',   (select count(*) from public.interactions where type = 'reply'),
    'interested',         (select count(*) from public.leads where status = 'interested'),
    'follow_ups_due',     (select count(*) from public.follow_ups where status = 'pending' and due_at <= now()),
    'follow_ups_pending', (select count(*) from public.follow_ups where status = 'pending'),
    'negotiating',        (select count(*) from public.leads where status = 'negotiating'),
    'won',                (select count(*) from public.leads where status = 'won'),
    'lost',               (select count(*) from public.leads where status = 'lost'),
    'revenue_received',   (select coalesce(sum(amount), 0) from public.payments),
    'pending_payments',   (select coalesce(sum(greatest(d.amount - coalesce(p.paid, 0), 0)), 0)
                             from public.deals d
                             left join (select deal_id, sum(amount) paid from public.payments group by deal_id) p
                               on p.deal_id = d.id
                            where d.status = 'won'),
    'expected_revenue',   (select coalesce(sum(amount), 0) from public.deals where status = 'active')
  )
$$;

-- Funnel, optionally for one pipeline (p_kind null = everything).
drop function if exists public.pipeline_funnel(timestamptz, timestamptz);
create function public.pipeline_funnel(
  p_from timestamptz default '-infinity', p_to timestamptz default 'infinity',
  p_kind public.lead_kind default null
) returns jsonb language sql stable set search_path = '' as $$
  with l as (select id, created_at, fit_score, research from public.leads where p_kind is null or kind = p_kind),
  discovered as (select count(*) n from l where created_at >= p_from and created_at < p_to),
  qualified as (select count(*) n from l
                 where created_at >= p_from and created_at < p_to
                   and (coalesce(fit_score, 0) >= 60 or coalesce(btrim(research), '') <> '')),
  contacted as (select count(distinct o.lead_id) n from public.outreach o join l on l.id = o.lead_id
                 where o.status = 'sent' and o.sent_at >= p_from and o.sent_at < p_to),
  sent as (select count(*) n from public.outreach o join l on l.id = o.lead_id
            where o.status = 'sent' and o.sent_at >= p_from and o.sent_at < p_to),
  replied as (select count(distinct i.lead_id) n from public.interactions i join l on l.id = i.lead_id
               where i.type = 'reply' and i.occurred_at >= p_from and i.occurred_at < p_to),
  interested as (select count(distinct a.lead_id) n from public.activities a join l on l.id = a.lead_id
                  where a.type = 'status_changed' and a.metadata ->> 'to' in ('interested', 'negotiating')
                    and a.created_at >= p_from and a.created_at < p_to),
  won as (select count(distinct a.lead_id) n from public.activities a join l on l.id = a.lead_id
           where a.type = 'deal_won' and a.created_at >= p_from and a.created_at < p_to),
  lost as (select count(distinct a.lead_id) n from public.activities a join l on l.id = a.lead_id
            where a.type = 'deal_lost' and a.created_at >= p_from and a.created_at < p_to)
  select jsonb_build_object(
    'discovered', (select n from discovered), 'qualified', (select n from qualified),
    'contacted', (select n from contacted), 'messages_sent', (select n from sent),
    'replied', (select n from replied), 'interested', (select n from interested),
    'won', (select n from won), 'lost', (select n from lost),
    'reply_rate', case when (select n from contacted) = 0 then 0
                       else round((select n from replied)::numeric / (select n from contacted) * 100, 1) end,
    'conversion_rate', case when (select n from contacted) = 0 then 0
                            else round((select n from won)::numeric / (select n from contacted) * 100, 1) end
  )
$$;

-- ---------------------------------------------------------------------------
-- Permissions (new function signatures)
-- ---------------------------------------------------------------------------
revoke execute on function public.check_duplicate(text, text, text, text, public.lead_kind) from public, anon;
revoke execute on function public.pipeline_funnel(timestamptz, timestamptz, public.lead_kind) from public, anon;
grant execute on function public.check_duplicate(text, text, text, text, public.lead_kind) to authenticated;
grant execute on function public.pipeline_funnel(timestamptz, timestamptz, public.lead_kind) to authenticated;
