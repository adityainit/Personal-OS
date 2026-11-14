-- Personal OS: WhatsApp auto-send.
--
-- Drafts can be queued for the WhatsApp worker (worker/), which sends them from your own
-- WhatsApp within your sending hours and daily limit, records each send exactly like
-- "Mark as sent" (so follow-ups are scheduled by your rules), sends follow-up drafts when
-- they fall due, and records client replies (which cancel follow-ups).
--
-- Draft states (outreach.auto_send):
--   off      sent by hand (default, and always for email)
--   review   waiting for your approval
--   queued   approved: the worker sends it when it's this lead's turn
--   sending  claimed by the worker right now
--   failed   not sent; see send_error

create type public.auto_send_state as enum ('off', 'review', 'queued', 'sending', 'failed');

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
alter table public.settings
  add column autosend_enabled boolean not null default false,
  add column autosend_require_approval boolean not null default true,
  add column autosend_daily_limit integer not null default 8
    check (autosend_daily_limit between 1 and 50),
  add column autosend_start_hour integer not null default 12
    check (autosend_start_hour between 0 and 23),
  add column autosend_end_hour integer not null default 14
    check (autosend_end_hour between 1 and 24),
  -- ISO weekdays: 1 = Monday … 7 = Sunday.
  add column autosend_days integer[] not null default '{1,2,3,4,5,6}'
    check (cardinality(autosend_days) > 0 and autosend_days <@ '{1,2,3,4,5,6,7}'::integer[]),
  add column autosend_min_gap_minutes integer not null default 8
    check (autosend_min_gap_minutes between 1 and 240),
  add column autosend_max_gap_minutes integer not null default 15
    check (autosend_max_gap_minutes between 1 and 480),
  -- Only auto-message clients Claude researched, once their whole WhatsApp sequence is drafted
  -- (first message + every follow-up up to your follow-up limit).
  add column autosend_full_sequence_only boolean not null default true,
  add constraint autosend_hours check (autosend_start_hour < autosend_end_hour),
  add constraint autosend_gaps check (autosend_min_gap_minutes <= autosend_max_gap_minutes);

-- ---------------------------------------------------------------------------
-- Outreach: sequence step + auto-send state
-- ---------------------------------------------------------------------------
alter table public.outreach
  -- 0 = first message, 1 = follow-up #1, 2 = follow-up #2 …
  add column step smallint not null default 0 check (step between 0 and 20),
  -- Left null on insert so the trigger below can pick the default from your settings.
  add column auto_send public.auto_send_state,
  add column send_after timestamptz,
  add column send_attempts integer not null default 0,
  add column send_error text,
  add column claimed_at timestamptz,
  add column sent_automatically boolean not null default false,
  add column wa_message_id text;

update public.outreach set auto_send = 'off' where auto_send is null;
alter table public.outreach alter column auto_send set not null;
alter table public.outreach
  add constraint outreach_auto_send_whatsapp_drafts
    check (auto_send = 'off' or (channel = 'whatsapp' and status = 'draft'));

create index outreach_auto_send on public.outreach (owner_id, auto_send)
  where auto_send in ('review', 'queued', 'sending', 'failed');

-- Interactions: WhatsApp message ids, so a redelivered message is never recorded twice.
alter table public.interactions add column wa_message_ids text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- WhatsApp worker status (one row per user, written by the worker)
-- ---------------------------------------------------------------------------
create table public.whatsapp_status (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  state text not null default 'offline'
    check (state in ('offline', 'starting', 'qr', 'connected', 'logged_out', 'error')),
  qr text,
  pairing_code text,
  phone text,
  last_error text,
  last_seen_at timestamptz,
  next_send_at timestamptz,
  -- Connection-type failures in a row; 3 pauses auto-send (your number may be restricted).
  consecutive_failures integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_status enable row level security;
create policy "owner full access" on public.whatsapp_status for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create trigger touch_updated_at before update on public.whatsapp_status
  for each row execute function private.touch_updated_at();
revoke all on public.whatsapp_status from anon;

-- The worker's WhatsApp login (linked-device keys), so a restart on a host without a disk
-- reconnects without a new QR. Values are encrypted by the worker (WA_AUTH_SECRET) before
-- they reach the database; RLS keeps them to you.
create table public.whatsapp_auth (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, key)
);
alter table public.whatsapp_auth enable row level security;
create policy "owner full access" on public.whatsapp_auth for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke all on public.whatsapp_auth from anon;

-- ---------------------------------------------------------------------------
-- Actor for automatic actions. The worker signs in as you; its RPCs set
-- `personal_os.actor = system` for the transaction so the activity log shows "automatic".
-- ---------------------------------------------------------------------------
create or replace function private.current_actor()
returns public.actor_type language sql stable set search_path = '' as $$
  select case
    when auth.uid() is null then 'system'::public.actor_type
    when current_setting('personal_os.actor', true) = 'system' then 'system'::public.actor_type
    when coalesce(auth.jwt() ->> 'client_id', '') <> '' then 'claude'::public.actor_type
    else 'me'::public.actor_type
  end
$$;

-- Raise a notification for one of your own activities (used for replies the worker records).
create or replace function private.notify_activity(p_activity uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (owner_id, activity_id)
  select a.owner_id, a.id from public.activities a
   where a.id = p_activity and a.owner_id = auth.uid()
     and not exists (select 1 from public.notifications n where n.activity_id = a.id);
end $$;
revoke all on function private.notify_activity(uuid) from public, anon;
grant execute on function private.notify_activity(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Draft guard: pick the default state, keep states valid, reset on re-queue.
-- ---------------------------------------------------------------------------
create or replace function private.outreach_auto_send_guard()
returns trigger language plpgsql set search_path = '' as $$
declare s public.settings%rowtype;
begin
  if tg_op = 'INSERT' and new.auto_send is null then
    new.auto_send := 'off';
    if new.channel = 'whatsapp' and new.status = 'draft' then
      select * into s from public.settings where owner_id = new.owner_id;
      if found and s.autosend_enabled then
        new.auto_send := case when s.autosend_require_approval then 'review' else 'queued' end;
      end if;
    end if;
  end if;

  -- Sent messages and emails are never auto-sent.
  if new.status = 'sent' or new.channel <> 'whatsapp' then
    new.auto_send := 'off';
    new.claimed_at := null;
  end if;

  if new.auto_send <> 'sending' then
    new.claimed_at := null;
  end if;

  -- Approving or retrying starts with a clean slate.
  if tg_op = 'UPDATE' and new.auto_send = 'queued' and old.auto_send in ('off', 'review', 'failed') then
    new.send_error := null;
    new.send_attempts := 0;
  end if;
  return new;
end $$;

create trigger outreach_auto_send_guard before insert or update on public.outreach
  for each row execute function private.outreach_auto_send_guard();

-- Activity wording for automatic sends.
create or replace function private.outreach_after_change()
returns trigger language plpgsql set search_path = '' as $$
declare v_name text;
begin
  select name into v_name from public.leads where id = new.lead_id;

  if tg_op = 'INSERT' and new.status = 'draft' then
    perform private.log_activity(new.owner_id, new.lead_id, 'outreach_drafted',
      format('%s draft prepared for %s', replace(new.channel::text, '_', ' '), v_name),
      jsonb_build_object('outreach_id', new.id, 'channel', new.channel, 'step', new.step));
    update public.leads set status = 'drafted'
     where id = new.lead_id and status in ('new', 'researched');
  elsif new.status = 'sent' and (tg_op = 'INSERT' or old.status = 'draft') then
    perform private.log_activity(new.owner_id, new.lead_id, 'outreach_sent',
      case when new.sent_automatically
           then format('WhatsApp %s sent automatically to %s',
                       case when new.step = 0 then 'message' else 'follow-up #' || new.step end, v_name)
           else format('Marked %s as sent to %s', replace(new.channel::text, '_', ' '), v_name) end,
      jsonb_build_object('outreach_id', new.id, 'channel', new.channel, 'sent_at', new.sent_at,
                         'automatic', new.sent_automatically, 'step', new.step));
  elsif tg_op = 'UPDATE' and new.auto_send is distinct from old.auto_send
        and new.auto_send in ('review', 'queued') and old.auto_send in ('off', 'review', 'failed') then
    perform private.log_activity(new.owner_id, new.lead_id,
      case new.auto_send when 'queued' then 'auto_send_queued' else 'auto_send_review' end,
      format('WhatsApp %s for %s %s',
             case when new.step = 0 then 'message' else 'follow-up #' || new.step end, v_name,
             case new.auto_send when 'queued' then 'queued for automatic sending' else 'waiting for approval' end),
      jsonb_build_object('outreach_id', new.id, 'step', new.step));
  end if;
  return new;
end $$;

-- Replies, declines, wins and "do not contact" also take queued drafts off the queue.
create or replace function private.cancel_pending_follow_ups(p_lead uuid, p_reason text)
returns integer language plpgsql set search_path = '' as $$
declare n integer;
begin
  update public.follow_ups
     set status = 'cancelled', reason = p_reason, completed_at = now()
   where lead_id = p_lead and status = 'pending';
  get diagnostics n = row_count;

  update public.outreach
     set auto_send = 'off', send_error = p_reason
   where lead_id = p_lead and status = 'draft' and auto_send in ('review', 'queued', 'failed');
  return n;
end $$;

-- ===========================================================================
-- Worker RPCs (run with the caller's RLS; the worker signs in as you)
-- ===========================================================================

-- Pick the next message to send now, or explain why nothing is due.
create or replace function public.claim_next_auto_send(p_now timestamptz default now())
returns jsonb language plpgsql set search_path = '' as $$
declare
  s public.settings%rowtype;
  v_tz constant text := 'Asia/Kolkata';
  v_local timestamp := p_now at time zone v_tz;
  v_day_start timestamptz := date_trunc('day', p_now at time zone v_tz) at time zone v_tz;
  v_sent_today integer;
  v_next timestamptz;
  r record;
begin
  select * into s from public.settings where owner_id = auth.uid();
  if not found or not s.autosend_enabled then
    return jsonb_build_object('status', 'disabled');
  end if;

  -- A claim that was never confirmed may or may not have gone out: never resend it blindly.
  update public.outreach
     set auto_send = 'failed',
         send_error = 'The worker stopped while sending. Check WhatsApp: if it went out, mark it as sent; otherwise retry.'
   where auto_send = 'sending' and claimed_at < p_now - interval '10 minutes';

  if exists (select 1 from public.outreach where auto_send = 'sending') then
    return jsonb_build_object('status', 'busy');
  end if;

  select count(*) into v_sent_today
    from public.outreach where sent_automatically and sent_at >= v_day_start;

  if not (extract(isodow from v_local)::integer = any (s.autosend_days)) then
    return jsonb_build_object('status', 'outside_days', 'sent_today', v_sent_today);
  end if;
  if extract(hour from v_local) < s.autosend_start_hour or extract(hour from v_local) >= s.autosend_end_hour then
    return jsonb_build_object('status', 'outside_hours', 'sent_today', v_sent_today);
  end if;
  if v_sent_today >= s.autosend_daily_limit then
    return jsonb_build_object('status', 'daily_limit', 'sent_today', v_sent_today);
  end if;

  select next_send_at into v_next from public.whatsapp_status where owner_id = auth.uid();
  if v_next is not null and v_next > p_now then
    return jsonb_build_object('status', 'waiting', 'next_send_at', v_next, 'sent_today', v_sent_today);
  end if;

  select o.id, o.body, o.step, l.id as lead_id, l.name as lead_name, l.phone_e164,
         exists (select 1 from public.outreach z where z.lead_id = l.id and z.status = 'sent') as is_follow_up
    into r
    from public.outreach o
    join public.leads l on l.id = o.lead_id
   where o.auto_send = 'queued'
     and (o.send_after is null or o.send_after <= p_now)
     and l.status in ('new', 'researched', 'drafted', 'contacted')
     and l.phone_e164 is not null
     -- Only clients Claude researched, with the first message and every follow-up drafted.
     and (not s.autosend_full_sequence_only or (
       l.source = 'claude'
       and (select count(distinct w.step) from public.outreach w
             where w.lead_id = l.id and w.channel = 'whatsapp'
               and w.step between 0 and greatest(s.freelance_max_follow_ups, 0))
           >= greatest(s.freelance_max_follow_ups, 0) + 1))
     -- Never two WhatsApp messages to the same client within 20 hours.
     and not exists (
       select 1 from public.outreach x
        where x.lead_id = l.id and x.channel = 'whatsapp' and x.status = 'sent'
          and x.sent_at > p_now - interval '20 hours')
     -- Only the next message in this client's sequence (a draft still in review or failed blocks the later ones).
     and o.id = (
       select y.id from public.outreach y
        where y.lead_id = l.id and y.status = 'draft' and y.channel = 'whatsapp'
          and y.auto_send in ('review', 'queued', 'failed')
        order by y.step, y.created_at
        limit 1)
     and (
       -- First message: nothing sent to this client yet.
       not exists (select 1 from public.outreach z where z.lead_id = l.id and z.status = 'sent')
       -- Follow-up: only from its due date (India time), never earlier.
       or exists (
         select 1 from public.follow_ups f
          where f.lead_id = l.id and f.status = 'pending'
            and (f.due_at at time zone v_tz)::date <= v_local::date)
     )
   order by 7 desc,                          -- due follow-ups first
            l.fit_score desc nulls last,
            o.created_at
   limit 1
   for update of o skip locked;

  if r.id is null then
    return jsonb_build_object('status', 'idle', 'sent_today', v_sent_today);
  end if;

  update public.outreach
     set auto_send = 'sending', claimed_at = p_now, send_attempts = send_attempts + 1
   where id = r.id;

  return jsonb_build_object(
    'status', 'claimed', 'outreach_id', r.id, 'lead_id', r.lead_id, 'lead_name', r.lead_name,
    'phone', r.phone_e164, 'body', r.body, 'step', r.step, 'is_follow_up', r.is_follow_up,
    'sent_today', v_sent_today);
end $$;

-- The worker sent it: record it like "Mark as sent" and space out the next send.
create or replace function public.complete_auto_send(p_outreach_id uuid, p_wa_message_id text default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  o public.outreach%rowtype;
  s public.settings%rowtype;
  v_result jsonb;
  v_next timestamptz;
begin
  perform set_config('personal_os.actor', 'system', true);

  select * into o from public.outreach where id = p_outreach_id for update;
  if not found then raise exception 'Outreach % not found', p_outreach_id; end if;
  if o.auto_send <> 'sending' then
    raise exception 'This message is not being sent by the worker (state: %)', o.auto_send;
  end if;

  update public.outreach
     set sent_automatically = true, wa_message_id = p_wa_message_id, send_error = null
   where id = o.id;

  -- It really went out, so record it even if a rule would normally block it.
  v_result := public.mark_outreach_sent(o.id, null, now(), true);

  select * into s from public.settings where owner_id = o.owner_id;
  v_next := now() + make_interval(secs =>
    (s.autosend_min_gap_minutes + random() * (s.autosend_max_gap_minutes - s.autosend_min_gap_minutes)) * 60);
  insert into public.whatsapp_status (owner_id, next_send_at, consecutive_failures) values (o.owner_id, v_next, 0)
  on conflict (owner_id) do update set next_send_at = excluded.next_send_at, consecutive_failures = 0;

  return v_result || jsonb_build_object('next_send_at', v_next);
end $$;

-- Switch auto-send off and tell you why (used on repeated failures or a WhatsApp restriction).
create or replace function public.pause_auto_send(p_reason text)
returns void language plpgsql set search_path = '' as $$
begin
  perform set_config('personal_os.actor', 'system', true);
  update public.settings set autosend_enabled = false where owner_id = auth.uid() and autosend_enabled;
  if found then
    perform private.log_activity(auth.uid(), null, 'auto_send_paused',
      format('Auto-send paused: %s', left(coalesce(p_reason, 'no reason given'), 300)),
      jsonb_build_object('reason', p_reason), true);
  end if;
end $$;

-- The worker couldn't send it. Transient errors are retried up to 3 times, 30 minutes apart.
-- Three connection failures in a row pause auto-send.
create or replace function public.fail_auto_send(p_outreach_id uuid, p_error text, p_retry boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
declare
  o public.outreach%rowtype;
  v_name text;
  v_retry boolean;
  v_streak integer := 0;
begin
  perform set_config('personal_os.actor', 'system', true);

  select * into o from public.outreach where id = p_outreach_id for update;
  if not found or o.auto_send <> 'sending' then
    return jsonb_build_object('updated', false);
  end if;

  v_retry := p_retry and o.send_attempts < 3;

  if p_retry then
    insert into public.whatsapp_status (owner_id, consecutive_failures) values (o.owner_id, 1)
    on conflict (owner_id) do update set consecutive_failures = public.whatsapp_status.consecutive_failures + 1
    returning consecutive_failures into v_streak;
  end if;
  update public.outreach
     set auto_send = case when v_retry then 'queued'::public.auto_send_state else 'failed'::public.auto_send_state end,
         send_error = left(coalesce(p_error, 'Unknown error'), 500),
         send_after = case when v_retry then now() + interval '30 minutes' else send_after end
   where id = o.id;

  if not v_retry then
    select name into v_name from public.leads where id = o.lead_id;
    perform private.log_activity(o.owner_id, o.lead_id, 'auto_send_failed',
      format('WhatsApp to %s not sent: %s', v_name, left(coalesce(p_error, 'Unknown error'), 200)),
      jsonb_build_object('outreach_id', o.id, 'error', p_error), true);
  end if;

  if v_streak >= 3 then
    perform public.pause_auto_send('3 sends in a row failed. Check that WhatsApp works on your phone, then turn auto-send back on.');
  end if;
  return jsonb_build_object('updated', true, 'retrying', v_retry, 'paused', v_streak >= 3);
end $$;

-- A WhatsApp message arrived from a client's number: record it as a reply.
-- Messages within 30 minutes of each other are kept together as one conversation entry.
create or replace function public.record_whatsapp_reply(
  p_phone text, p_text text, p_message_id text default null, p_at timestamptz default null
) returns jsonb language plpgsql set search_path = '' as $$
declare
  l public.leads%rowtype;
  v_at timestamptz := coalesce(p_at, now());
  v_text text := left(coalesce(nullif(btrim(p_text), ''), '(media message)'), 5000);
  v_existing public.interactions%rowtype;
  v_id uuid;
begin
  select * into l from public.leads where phone_e164 = p_phone limit 1;
  if not found then
    return jsonb_build_object('recorded', false, 'reason', 'unknown_number');
  end if;

  if p_message_id is not null and exists (
    select 1 from public.interactions where lead_id = l.id and p_message_id = any (wa_message_ids)
  ) then
    return jsonb_build_object('recorded', false, 'reason', 'duplicate', 'lead_id', l.id);
  end if;

  perform set_config('personal_os.actor', 'system', true);

  select * into v_existing from public.interactions
   where lead_id = l.id and type = 'reply' and channel = 'whatsapp'
     and occurred_at between v_at - interval '30 minutes' and v_at
   order by occurred_at desc limit 1;

  if found then
    update public.interactions
       set content = content || E'\n' || v_text,
           occurred_at = v_at,
           wa_message_ids = case when p_message_id is null then wa_message_ids
                                 else array_append(wa_message_ids, p_message_id) end
     where id = v_existing.id;
    return jsonb_build_object('recorded', true, 'merged', true, 'lead_id', l.id, 'lead_name', l.name);
  end if;

  insert into public.interactions (owner_id, lead_id, type, channel, content, occurred_at, wa_message_ids)
  values (l.owner_id, l.id, 'reply', 'whatsapp', v_text, v_at,
          case when p_message_id is null then '{}'::text[] else array[p_message_id] end)
  returning id into v_id;

  perform private.notify_activity(a.id) from public.activities a
   where a.lead_id = l.id and a.type = 'reply_received' and a.metadata ->> 'interaction_id' = v_id::text;

  return jsonb_build_object('recorded', true, 'merged', false, 'lead_id', l.id, 'lead_name', l.name,
                            'interaction_id', v_id);
end $$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
revoke execute on function public.pause_auto_send(text) from public, anon;
grant execute on function public.pause_auto_send(text) to authenticated;
revoke execute on function public.claim_next_auto_send(timestamptz) from public, anon;
revoke execute on function public.complete_auto_send(uuid, text) from public, anon;
revoke execute on function public.fail_auto_send(uuid, text, boolean) from public, anon;
revoke execute on function public.record_whatsapp_reply(text, text, text, timestamptz) from public, anon;
grant execute on function public.claim_next_auto_send(timestamptz) to authenticated;
grant execute on function public.complete_auto_send(uuid, text) to authenticated;
grant execute on function public.fail_auto_send(uuid, text, boolean) to authenticated;
grant execute on function public.record_whatsapp_reply(text, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Due follow-ups: don't ping you about ones the worker is about to send.
-- ---------------------------------------------------------------------------
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
      jsonb_build_object('follow_up_id', r.id, 'due_at', r.due_at),
      not exists (
        select 1 from public.outreach o join public.settings s on s.owner_id = o.owner_id
         where o.lead_id = r.lead_id and o.auto_send = 'queued' and s.autosend_enabled));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.flag_due_follow_ups() from public, authenticated;
