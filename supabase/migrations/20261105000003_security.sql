-- Personal OS: sign-up guard and permissions.
-- Run after migrations 1 and 2, once your own user exists (see README).

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
-- 2. Permissions: nothing is callable or readable anonymously.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
