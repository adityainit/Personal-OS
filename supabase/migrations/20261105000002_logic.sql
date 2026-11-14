-- Personal OS: business rules, activity logging, reports, cron.
-- All behaviour lives in the database so the web UI and the MCP server act identically.

-- ---------------------------------------------------------------------------
-- Actor detection: requests made with an OAuth access token issued to an MCP
-- client (Claude) carry a `client_id` claim.
-- ---------------------------------------------------------------------------
create or replace function private.current_actor()
returns public.actor_type language sql stable set search_path = '' as $$
  select case
    when auth.uid() is null then 'system'::public.actor_type
    when coalesce(auth.jwt() ->> 'client_id', '') <> '' then 'claude'::public.actor_type
    else 'me'::public.actor_type
  end
$$;

create or replace function private.log_activity(
  p_owner uuid, p_lead uuid, p_type text, p_summary text,
  p_metadata jsonb default '{}'::jsonb, p_notify boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor public.actor_type := private.current_actor();
  v_id uuid;
begin
  -- Never allow writing into someone else's log.
  if auth.uid() is not null and auth.uid() <> p_owner then
    raise exception 'activity owner mismatch';
  end if;

  insert into public.activities (owner_id, lead_id, type, summary, metadata, actor)
  values (p_owner, p_lead, p_type, p_summary, coalesce(p_metadata, '{}'::jsonb), v_actor)
  returning id into v_id;

  -- Notify on system events (e.g. follow-up due) and on anything Claude did.
  if p_notify or v_actor = 'claude' then
    insert into public.notifications (owner_id, activity_id) values (p_owner, v_id);
  end if;
  return v_id;
end $$;

revoke all on function private.log_activity from public;
grant execute on function private.current_actor() to authenticated;
grant execute on function private.log_activity(uuid, uuid, text, text, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['settings','leads','contacts','outreach','follow_ups']
  loop
    execute format('create trigger touch_updated_at before update on public.%I
                    for each row execute function private.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Settings row is created automatically for every new user.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.settings (owner_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Follow-up cancellation helper
-- ---------------------------------------------------------------------------
create or replace function private.cancel_pending_follow_ups(p_lead uuid, p_reason text)
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  update public.follow_ups
     set status = 'cancelled', reason = p_reason, completed_at = now()
   where lead_id = p_lead and status = 'pending';
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function private.cancel_pending_follow_ups(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create or replace function private.leads_after_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.owner_id, new.id, 'lead_created',
      format('New freelance client added: %s', new.name),
      jsonb_build_object('source', new.source, 'fit_score', new.fit_score));
    if coalesce(btrim(new.research), '') <> '' then
      perform private.log_activity(new.owner_id, new.id, 'research_completed',
        format('Research saved for %s', new.name), '{}'::jsonb);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform private.log_activity(new.owner_id, new.id,
        case new.status when 'won' then 'lead_won' when 'lost' then 'lead_lost' else 'status_changed' end,
        format('%s: %s → %s', new.name, replace(old.status::text, '_', ' '), replace(new.status::text, '_', ' ')),
        jsonb_build_object('from', old.status, 'to', new.status));
      if new.status in ('won', 'lost', 'do_not_contact') then
        perform private.cancel_pending_follow_ups(new.id, 'Lead marked ' || replace(new.status::text, '_', ' '));
      end if;
    end if;

    if coalesce(btrim(new.research), '') <> '' and new.research is distinct from old.research then
      perform private.log_activity(new.owner_id, new.id,
        case when coalesce(btrim(old.research), '') = '' then 'research_completed' else 'research_updated' end,
        format('Research %s for %s',
          case when coalesce(btrim(old.research), '') = '' then 'completed' else 'updated' end, new.name),
        '{}'::jsonb);
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform private.log_activity(old.owner_id, null, 'lead_deleted',
      format('Deleted freelance client: %s', old.name),
      jsonb_build_object('lead_id', old.id));
    return old;
  end if;
  return null;
end $$;

create trigger leads_after_insert after insert on public.leads
  for each row execute function private.leads_after_change();
create trigger leads_after_update after update on public.leads
  for each row execute function private.leads_after_change();
create trigger leads_after_delete after delete on public.leads
  for each row execute function private.leads_after_change();

-- Every client needs a phone number (you reach them on WhatsApp), and it must be valid.
create or replace function private.leads_require_phone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.phone_e164 is null then
    raise exception 'Freelance clients need a phone number' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger leads_require_phone before insert or update on public.leads
  for each row execute function private.leads_require_phone();

create or replace function private.leads_validate_phone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.phone_e164 is distinct from old.phone_e164
     or new.phone_country is distinct from old.phone_country then
    if new.phone_e164 is null then
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

create trigger leads_validate_phone before insert or update on public.leads
  for each row execute function private.leads_validate_phone();

-- ---------------------------------------------------------------------------
-- Contacts
-- ---------------------------------------------------------------------------
create or replace function private.contacts_after_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform private.log_activity(new.owner_id, new.lead_id, 'contact_added',
    format('Contact added: %s', coalesce(nullif(new.name, ''), new.email, new.instagram, 'unnamed')),
    jsonb_build_object('contact_id', new.id, 'email', new.email, 'source_url', new.source_url));
  return new;
end $$;
create trigger contacts_after_insert after insert on public.contacts
  for each row execute function private.contacts_after_insert();

-- ---------------------------------------------------------------------------
-- Outreach
-- ---------------------------------------------------------------------------
create or replace function private.outreach_after_change()
returns trigger language plpgsql set search_path = '' as $$
declare v_name text;
begin
  select name into v_name from public.leads where id = new.lead_id;

  if tg_op = 'INSERT' and new.status = 'draft' then
    perform private.log_activity(new.owner_id, new.lead_id, 'outreach_drafted',
      format('%s draft prepared for %s', replace(new.channel::text, '_', ' '), v_name),
      jsonb_build_object('outreach_id', new.id, 'channel', new.channel));
    update public.leads set status = 'drafted'
     where id = new.lead_id and status in ('new', 'researched');
  elsif new.status = 'sent' and (tg_op = 'INSERT' or old.status = 'draft') then
    perform private.log_activity(new.owner_id, new.lead_id, 'outreach_sent',
      format('Marked %s as sent to %s', replace(new.channel::text, '_', ' '), v_name),
      jsonb_build_object('outreach_id', new.id, 'channel', new.channel, 'sent_at', new.sent_at));
  end if;
  return new;
end $$;
create trigger outreach_after_insert after insert on public.outreach
  for each row execute function private.outreach_after_change();
create trigger outreach_after_update after update on public.outreach
  for each row execute function private.outreach_after_change();

-- ---------------------------------------------------------------------------
-- Interactions: replies cancel follow-ups; declines close the lead.
-- ---------------------------------------------------------------------------
create or replace function private.interactions_after_insert()
returns trigger language plpgsql set search_path = '' as $$
declare v_name text;
begin
  select name into v_name from public.leads where id = new.lead_id;

  perform private.log_activity(new.owner_id, new.lead_id,
    case new.type when 'reply' then 'reply_received' when 'decline' then 'lead_declined'
                  else 'interaction_' || new.type::text end,
    case new.type
      when 'reply' then format('Reply recorded from %s', v_name)
      when 'decline' then format('%s declined', v_name)
      else format('%s logged for %s', initcap(new.type::text), v_name) end,
    jsonb_build_object('interaction_id', new.id, 'channel', new.channel,
                       'excerpt', left(new.content, 280)));

  if new.type = 'reply' then
    perform private.cancel_pending_follow_ups(new.lead_id, 'Reply received');
    update public.leads set status = 'replied'
     where id = new.lead_id and status in ('new', 'researched', 'drafted', 'contacted');
  elsif new.type = 'negotiation' then
    update public.leads set status = 'negotiating'
     where id = new.lead_id and status in ('new', 'researched', 'drafted', 'contacted', 'replied', 'interested');
  elsif new.type = 'decline' then
    perform private.cancel_pending_follow_ups(new.lead_id, 'Lead declined');
    update public.leads set status = 'lost'
     where id = new.lead_id and status not in ('won', 'lost', 'do_not_contact');
  end if;
  return new;
end $$;
create trigger interactions_after_insert after insert on public.interactions
  for each row execute function private.interactions_after_insert();

-- ---------------------------------------------------------------------------
-- Follow-ups
-- ---------------------------------------------------------------------------
create or replace function private.follow_ups_after_change()
returns trigger language plpgsql set search_path = '' as $$
declare v_name text;
begin
  select name into v_name from public.leads where id = new.lead_id;

  if tg_op = 'INSERT' then
    perform private.log_activity(new.owner_id, new.lead_id, 'follow_up_scheduled',
      format('Follow-up #%s scheduled for %s', new.attempt, v_name),
      jsonb_build_object('follow_up_id', new.id, 'due_at', new.due_at));
  elsif new.status is distinct from old.status then
    perform private.log_activity(new.owner_id, new.lead_id,
      case new.status when 'done' then 'follow_up_completed' when 'cancelled' then 'follow_up_cancelled'
                      else 'follow_up_reopened' end,
      format('Follow-up %s for %s%s',
        case new.status when 'done' then 'completed' when 'cancelled' then 'cancelled' else 'reopened' end,
        v_name, coalesce(' (' || new.reason || ')', '')),
      jsonb_build_object('follow_up_id', new.id, 'reason', new.reason));
  elsif new.due_at is distinct from old.due_at and new.status = 'pending' then
    perform private.log_activity(new.owner_id, new.lead_id, 'follow_up_rescheduled',
      format('Follow-up for %s moved', v_name),
      jsonb_build_object('follow_up_id', new.id, 'from', old.due_at, 'to', new.due_at));
  end if;
  return new;
end $$;

create or replace function private.follow_ups_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status <> 'pending' and old.status = 'pending' and new.completed_at is null then
    new.completed_at := now();
  end if;
  -- Re-arm the "due" flag when a follow-up is snoozed into the future.
  if new.due_at is distinct from old.due_at and new.due_at > now() then
    new.flagged_due_at := null;
  end if;
  return new;
end $$;

create trigger follow_ups_before_update before update on public.follow_ups
  for each row execute function private.follow_ups_before_update();
create trigger follow_ups_after_insert after insert on public.follow_ups
  for each row execute function private.follow_ups_after_change();
create trigger follow_ups_after_update after update on public.follow_ups
  for each row execute function private.follow_ups_after_change();

-- Called by pg_cron: flag follow-ups that have become due and notify.
create or replace function private.flag_due_follow_ups()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in
    update public.follow_ups f set flagged_due_at = now()
     where f.status = 'pending' and f.due_at <= now() and f.flagged_due_at is null
    returning f.id, f.owner_id, f.lead_id, f.attempt, f.due_at
  loop
    perform private.log_activity(r.owner_id, r.lead_id, 'follow_up_due',
      format('Follow-up #%s due: %s', r.attempt, (select name from public.leads where id = r.lead_id)),
      jsonb_build_object('follow_up_id', r.id, 'due_at', r.due_at), true);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.flag_due_follow_ups() from public, authenticated;

-- ===========================================================================
-- Public RPCs (exposed through PostgREST; run with caller's RLS)
-- ===========================================================================

-- Duplicate check by website domain, Instagram handle, phone and fuzzy name.
create or replace function public.check_duplicate(
  p_name text default null, p_website text default null,
  p_instagram text default null, p_phone text default null
) returns table (id uuid, name text, status public.lead_status, match_type text, score real)
language sql stable set search_path = '' as $$
  with q as (
    select private.normalize_domain(p_website) as dom,
           private.normalize_handle(p_instagram) as handle,
           nullif(btrim(coalesce(p_name, '')), '') as nm,
           nullif(btrim(coalesce(p_phone, '')), '') as ph
  )
  select l.id, l.name, l.status,
         case when q.dom is not null and l.domain_normalized = q.dom then 'website'
              when q.handle is not null and l.instagram_handle_normalized = q.handle then 'instagram'
              when q.ph is not null and l.phone_e164 = q.ph then 'phone'
              else 'name' end,
         case when (q.dom is not null and l.domain_normalized = q.dom)
                or (q.handle is not null and l.instagram_handle_normalized = q.handle) then 1.0::real
              when q.ph is not null and l.phone_e164 = q.ph then 0.95::real
              else extensions.similarity(lower(l.name), lower(q.nm)) end
    from public.leads l, q
   where (q.dom is not null and l.domain_normalized = q.dom)
      or (q.handle is not null and l.instagram_handle_normalized = q.handle)
      or (q.ph is not null and l.phone_e164 = q.ph)
      or (q.nm is not null and extensions.similarity(lower(l.name), lower(q.nm)) > 0.45)
   order by 5 desc
   limit 10
$$;

-- Mark an outreach draft as sent (only ever called after the user sent it themselves)
-- and schedule the follow-up according to the user's rules.
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
                     case when v_attempt <= 1 then coalesce(s.freelance_first_follow_up_days, 3)
                          else coalesce(s.freelance_follow_up_gap_days, 4) end);

  if v_days > 0 and v_attempt <= coalesce(s.freelance_max_follow_ups, 2)
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

-- Dashboard headline numbers.
create or replace function public.dashboard_stats()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'total_leads',        (select count(*) from public.leads),
    'new_leads_7d',       (select count(*) from public.leads where created_at > now() - interval '7 days'),
    'messages_sent',      (select count(*) from public.outreach where status = 'sent'),
    'replies_received',   (select count(*) from public.interactions where type = 'reply'),
    'interested',         (select count(*) from public.leads where status = 'interested'),
    'follow_ups_due',     (select count(*) from public.follow_ups where status = 'pending' and due_at <= now()),
    'follow_ups_pending', (select count(*) from public.follow_ups where status = 'pending'),
    'negotiating',        (select count(*) from public.leads where status = 'negotiating'),
    'won',                (select count(*) from public.leads where status = 'won'),
    'lost',               (select count(*) from public.leads where status = 'lost')
  )
$$;

-- Outreach funnel for a period (event-based so periods compare fairly).
create or replace function public.pipeline_funnel(
  p_from timestamptz default '-infinity', p_to timestamptz default 'infinity'
) returns jsonb language sql stable set search_path = '' as $$
  with l as (select id from public.leads),
  discovered as (select count(*) n from public.leads where created_at >= p_from and created_at < p_to),
  qualified as (select count(*) n from public.leads
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
           where a.type = 'lead_won' and a.created_at >= p_from and a.created_at < p_to),
  lost as (select count(distinct a.lead_id) n from public.activities a join l on l.id = a.lead_id
            where a.type = 'lead_lost' and a.created_at >= p_from and a.created_at < p_to)
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

-- Global search across leads and contacts.
create or replace function public.search_all(p_query text, p_limit integer default 20)
returns table (lead_id uuid, name text, status public.lead_status, matched_on text, score real)
language sql stable set search_path = '' as $$
  with q as (select lower(btrim(p_query)) as t),
  hits as (
  select distinct on (l.id) l.id, l.name, l.status, m.matched_on, m.score
    from q, public.leads l
    cross join lateral (
      select 'name'::text as matched_on,
             greatest(extensions.similarity(lower(l.name), q.t),
                      case when lower(l.name) like '%' || q.t || '%' then 0.9 else 0 end)::real as score
      union all
      select 'website', 1.0 where l.domain_normalized like '%' || q.t || '%'
      union all
      select 'instagram', 1.0 where l.instagram_handle_normalized like '%' || ltrim(q.t, '@') || '%'
      union all
      select 'tag', 0.8 where exists (select 1 from unnest(l.tags) tg where lower(tg) like '%' || q.t || '%')
      union all
      select 'industry', 0.6 where lower(coalesce(l.industry, '')) like '%' || q.t || '%'
      union all
      select 'contact', 0.85 where exists (
        select 1 from public.contacts c
         where c.lead_id = l.id
           and (lower(coalesce(c.email, '')) like '%' || q.t || '%'
             or lower(coalesce(c.name, '')) like '%' || q.t || '%'
             or lower(coalesce(c.instagram, '')) like '%' || q.t || '%'))
    ) m
   where length(q.t) > 0 and m.score > 0.3
   order by l.id, m.score desc
  )
  select * from hits order by score desc, name limit greatest(p_limit, 1)
$$;

revoke execute on function public.check_duplicate(text, text, text, text) from public, anon;
revoke execute on function public.pipeline_funnel(timestamptz, timestamptz) from public, anon;
revoke execute on function public.search_all(text, integer) from public, anon;
revoke execute on function public.mark_outreach_sent(uuid, integer, timestamptz, boolean) from public, anon;
revoke execute on function public.dashboard_stats() from public, anon;
grant execute on function public.check_duplicate(text, text, text, text) to authenticated;
grant execute on function public.pipeline_funnel(timestamptz, timestamptz) to authenticated;
grant execute on function public.search_all(text, integer) to authenticated;
grant execute on function public.mark_outreach_sent(uuid, integer, timestamptz, boolean) to authenticated;
grant execute on function public.dashboard_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduled job: flag due follow-ups every 15 minutes.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
select cron.schedule('flag-due-follow-ups', '*/15 * * * *', $$select private.flag_due_follow_ups()$$);
