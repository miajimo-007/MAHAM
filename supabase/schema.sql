-- MAHAM — online database for many companies (Supabase / PostgreSQL).
-- Run once in Supabase → SQL Editor → New query → Run. Safe to run again after an update (it only adds / replaces).
--
-- Who is who
--   * Platform owner (you): runs the Owner Console — creates companies, invites admins, pauses or deletes a company,
--     sets its seats — and has full admin access to every company (accounts and data). Every time the platform owner
--     opens a company, and their saves there, are written to that company's audit log, which its admins can read.
--   * Company admin: the super admin of their own company only (people, invitations, settings, data).
--   * Users: everyone else in a company.
-- Every company's data is kept apart HERE, by row-level security — not by the app.
-- The data itself is what used to be files in the shared folder: one JSON "file" per person (plus their monthly /
-- yearly parts), per company. Each person writes only their own files; the company admin may write any of them.
-- People join only by invitation: the admin invites an email, the person creates an account with that email, and the
-- app links them (function accept_invites). An account without an invitation sees nothing.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables
create table if not exists public.platform_owners (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.companies (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  status         text not null default 'active' check (status in ('active', 'paused')),
  seats          integer not null default 25 check (seats > 0),
  support_until  timestamptz,                -- the company admin's grant: the platform owner may read until then
  support_by     uuid,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid()
);
alter table public.companies add column if not exists status text not null default 'active';
alter table public.companies add column if not exists seats integer not null default 25;
alter table public.companies add column if not exists support_until timestamptz;
alter table public.companies add column if not exists support_by uuid;
alter table public.companies add column if not exists created_by uuid;

create table if not exists public.company_members (
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  member_id   text not null,                 -- the person's id in the app (Admin → People)
  role        text not null default 'user' check (role in ('admin', 'user')),
  active      boolean not null default true,
  email       text,
  created_at  timestamptz not null default now(),
  primary key (company_id, user_id),
  unique (company_id, member_id)
);
alter table public.company_members add column if not exists role text not null default 'user';
alter table public.company_members add column if not exists active boolean not null default true;
alter table public.company_members add column if not exists email text;
do $$ begin   -- older databases had "is_owner": owners become admins
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'company_members' and column_name = 'is_owner') then
    update public.company_members set role = 'admin' where is_owner;
    alter table public.company_members drop column is_owner;
  end if;
end $$;

create table if not exists public.invites (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  email        text not null,                -- stored lower-case
  member_id    text not null,
  role         text not null default 'user' check (role in ('admin', 'user')),
  invited_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  accepted_by  uuid
);
create unique index if not exists invites_open on public.invites (company_id, email) where accepted_at is null;

create table if not exists public.files (
  company_id  uuid not null references public.companies (id) on delete cascade,
  path        text not null,                 -- e.g. 'MAHAM Data/users/adam.json', 'MAHAM Data/users/adam.hd-2026-05.json'
  content     text not null default '',
  size        integer generated always as (octet_length(content)) stored,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (company_id, path)
);
create index if not exists files_company_path on public.files (company_id, path text_pattern_ops);

create table if not exists public.audit (
  id          bigserial primary key,
  company_id  uuid references public.companies (id) on delete cascade,
  at          timestamptz not null default now(),
  user_id     uuid default auth.uid(),
  action      text not null,
  detail      jsonb not null default '{}'
);

-- every save stamps the time and the person
create or replace function public.files_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists files_touch on public.files;
create trigger files_touch before insert or update on public.files for each row execute function public.files_touch();

-- ---------------------------------------------------------------- helpers (security definer: they may read the tables)
create or replace function public.is_platform_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_owners where user_id = auth.uid());
$$;
create or replace function public.company_active(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from companies where id = c and status = 'active');
$$;
-- the platform owner counts as an admin of every company (also a paused one); everything they do there is logged
create or replace function public.is_member(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select (public.is_platform_owner() and exists (select 1 from companies where id = c))
      or (public.company_active(c) and exists (select 1 from company_members where company_id = c and user_id = auth.uid() and active));
$$;
create or replace function public.is_admin(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select (public.is_platform_owner() and exists (select 1 from companies where id = c))
      or (public.company_active(c) and exists (select 1 from company_members where company_id = c and user_id = auth.uid() and active and role = 'admin'));
$$;
create or replace function public.has_support(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_owner() and exists (select 1 from companies where id = c);
$$;
create or replace function public.my_member_id(c uuid) returns text language sql stable security definer set search_path = public as $$
  select member_id from company_members where company_id = c and user_id = auth.uid() and active;
$$;
-- a person's own files: users/<id>.json and its parts users/<id>.<part>.json (help desk months, past years, logs)
create or replace function public.is_own_file(c uuid, p text) returns boolean language sql stable security definer set search_path = public as $$
  select public.my_member_id(c) is not null
     and left(p, length('MAHAM Data/users/' || public.my_member_id(c))) = 'MAHAM Data/users/' || public.my_member_id(c)
     and substr(p, length('MAHAM Data/users/' || public.my_member_id(c)) + 1) ~ '^(\.[A-Za-z0-9-]+)?\.json$';
$$;
create or replace function public.log(c uuid, a text, d jsonb default '{}') returns void language sql security definer set search_path = public as $$
  insert into audit (company_id, action, detail) values (c, a, coalesce(d, '{}'));
$$;
revoke execute on function public.log(uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- row-level security
alter table public.platform_owners enable row level security;
alter table public.companies       enable row level security;
alter table public.company_members enable row level security;
alter table public.invites         enable row level security;
alter table public.files           enable row level security;
alter table public.audit           enable row level security;

drop policy if exists owners_self on public.platform_owners;
create policy owners_self on public.platform_owners for select using (user_id = auth.uid());

-- companies: members see their own; the platform owner sees all (names, status, seats — not the data)
drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies for select using (public.is_member(id) or public.is_platform_owner()
  or exists (select 1 from company_members m where m.company_id = id and m.user_id = auth.uid()));
drop policy if exists companies_owner on public.companies;   -- (old name) changes go through the functions below
drop policy if exists companies_admin on public.companies;

-- members: the company sees its own list; changes go through the functions below
drop policy if exists members_read on public.company_members;
create policy members_read on public.company_members for select using (public.is_member(company_id) or public.is_platform_owner() or user_id = auth.uid());
drop policy if exists members_owner_ins on public.company_members;
drop policy if exists members_owner_upd on public.company_members;
drop policy if exists members_owner_del on public.company_members;

-- invitations: the company's admins and the platform owner see them; the invited person sees their own
drop policy if exists invites_read on public.invites;
create policy invites_read on public.invites for select using (public.is_admin(company_id) or public.is_platform_owner()
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- files: read the whole company (or with a support grant); write your own files and backups; admins write any
drop policy if exists files_read on public.files;
create policy files_read on public.files for select using (public.is_member(company_id));
drop policy if exists files_write on public.files;
create policy files_write on public.files for insert with check (
  public.is_member(company_id) and (public.is_admin(company_id) or public.is_own_file(company_id, path) or path like 'MAHAM Data/Backups/%'));
drop policy if exists files_update on public.files;
create policy files_update on public.files for update using (
  public.is_member(company_id) and (public.is_admin(company_id) or public.is_own_file(company_id, path) or path like 'MAHAM Data/Backups/%'));
drop policy if exists files_delete on public.files;
create policy files_delete on public.files for delete using (
  public.is_member(company_id) and (public.is_admin(company_id) or path like 'MAHAM Data/Backups/%'));

-- audit: the company's admins read their company's log; the platform owner reads all
drop policy if exists audit_read on public.audit;
create policy audit_read on public.audit for select using (public.is_admin(company_id) or public.is_platform_owner());

-- the platform owner's saves in a company go to its audit log (at most one line per 10 minutes, with the files saved)
create or replace function public.files_owner_log() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_platform_owner() and not exists (select 1 from company_members where company_id = new.company_id and user_id = auth.uid() and active) then
    if exists (select 1 from audit where company_id = new.company_id and user_id = auth.uid() and action = 'owner saved' and at > now() - interval '10 minutes') then
      update audit set detail = jsonb_set(detail, '{files}', to_jsonb(least(coalesce((detail ->> 'files')::int, 1) + 1, 100000)))
       where id = (select max(id) from audit where company_id = new.company_id and user_id = auth.uid() and action = 'owner saved');
    else
      insert into audit (company_id, action, detail) values (new.company_id, 'owner saved', jsonb_build_object('files', 1, 'first', new.path));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists files_owner_log on public.files;
create trigger files_owner_log after insert or update on public.files for each row execute function public.files_owner_log();

-- ---------------------------------------------------------------- functions the app calls
-- the companies I belong to (or was invited to), with my role there
create or replace function public.my_companies() returns table (company_id uuid, name text, status text, member_id text, role text, active boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.status, m.member_id, m.role, m.active from company_members m join companies c on c.id = m.company_id where m.user_id = auth.uid()
  order by c.name;
$$;

-- link every open invitation for my email (called right after sign-in); returns how many were linked
create or replace function public.accept_invites() returns integer language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); em text := lower(coalesce(auth.jwt() ->> 'email', '')); i record; n integer := 0; used integer;
begin
  if me is null or em = '' then return 0; end if;
  for i in select * from invites where email = em and accepted_at is null loop
    if not public.company_active(i.company_id) then continue; end if;
    -- already in this company as someone else: leave the invitation open
    if exists (select 1 from company_members where company_id = i.company_id and user_id = me and member_id <> i.member_id) then continue; end if;
    -- the person exists (e.g. left and is invited again, maybe with a new email): this account becomes them, with their work
    if exists (select 1 from company_members where company_id = i.company_id and member_id = i.member_id) then
      if not exists (select 1 from company_members where company_id = i.company_id and member_id = i.member_id and active)
         and (select count(*) from company_members where company_id = i.company_id and active) >= (select seats from companies where id = i.company_id) then continue; end if;
      update company_members set user_id = me, active = true, role = i.role, email = em where company_id = i.company_id and member_id = i.member_id;
      update invites set accepted_at = now(), accepted_by = me where id = i.id;
      perform public.log(i.company_id, 'joined again', jsonb_build_object('member', i.member_id, 'email', em, 'role', i.role));
      n := n + 1; continue;
    end if;
    select count(*) into used from company_members where company_id = i.company_id and active;
    if used >= (select seats from companies where id = i.company_id) then continue; end if;   -- no seat free: stays open
    insert into company_members (company_id, user_id, member_id, role, email) values (i.company_id, me, i.member_id, i.role, em);
    update invites set accepted_at = now(), accepted_by = me where id = i.id;
    perform public.log(i.company_id, 'joined', jsonb_build_object('member', i.member_id, 'email', em, 'role', i.role));
    n := n + 1;
  end loop;
  return n;
end $$;

-- company admin: invite a person (by email) as a person in the app (member_id); role 'user' or 'admin'
create or replace function public.invite_member(c uuid, p_email text, p_member text, p_role text default 'user') returns uuid
language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(p_email)); r uuid; used integer; open integer;
begin
  if not (public.is_admin(c) or public.is_platform_owner()) then raise exception 'Only the company admin can invite people' using errcode = '42501'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Not an email address: %', p_email; end if;
  if coalesce(p_member, '') = '' then raise exception 'Choose the person in the app'; end if;
  if p_role not in ('admin', 'user') then raise exception 'Role must be admin or user'; end if;
  if exists (select 1 from company_members where company_id = c and member_id = p_member and active) then raise exception 'That person already has an account'; end if;
  select count(*) into used from company_members where company_id = c and active;
  select count(*) into open from invites where company_id = c and accepted_at is null and email <> em;
  if used + open >= (select seats from companies where id = c) then raise exception 'No seat left — % of % used', used + open, (select seats from companies where id = c); end if;
  delete from invites where company_id = c and accepted_at is null and (email = em or member_id = p_member);
  insert into invites (company_id, email, member_id, role) values (c, em, p_member, p_role) returning id into r;
  perform public.log(c, 'invited', jsonb_build_object('email', em, 'member', p_member, 'role', p_role));
  return r;
end $$;

create or replace function public.cancel_invite(c uuid, p_member text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(c) then raise exception 'Only the company admin can do this' using errcode = '42501'; end if;
  delete from invites where company_id = c and member_id = p_member and accepted_at is null;
  perform public.log(c, 'invite canceled', jsonb_build_object('member', p_member));
end $$;

-- company admin: role / account on or off (keeps all their work); the last active admin cannot be removed
create or replace function public.set_member(c uuid, p_member text, p_role text, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(c) then raise exception 'Only the company admin can do this' using errcode = '42501'; end if;
  if p_role not in ('admin', 'user') then raise exception 'Role must be admin or user'; end if;
  if (p_role <> 'admin' or not p_active) and exists (select 1 from company_members where company_id = c and member_id = p_member and role = 'admin' and active)
     and (select count(*) from company_members where company_id = c and role = 'admin' and active) <= 1 then
    raise exception 'A company needs at least one admin';
  end if;
  if p_active and not exists (select 1 from company_members where company_id = c and member_id = p_member and active)
     and (select count(*) from company_members where company_id = c and active) >= (select seats from companies where id = c) then
    raise exception 'No seat left';
  end if;
  update company_members set role = p_role, active = p_active where company_id = c and member_id = p_member;
  perform public.log(c, 'member changed', jsonb_build_object('member', p_member, 'role', p_role, 'active', p_active));
end $$;

-- company admin: rename the company
create or replace function public.rename_company(c uuid, p_name text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(c) then raise exception 'Only the company admin can do this' using errcode = '42501'; end if;
  update companies set name = left(trim(p_name), 120) where id = c;
  perform public.log(c, 'renamed', jsonb_build_object('name', p_name));
end $$;

-- company admin: allow the platform owner to read this company's data for some hours (0 = take it back)
create or replace function public.grant_support(c uuid, hours integer) returns timestamptz language plpgsql security definer set search_path = public as $$
declare u timestamptz;
begin
  if not public.is_admin(c) then raise exception 'Only the company admin can do this' using errcode = '42501'; end if;
  u := case when hours > 0 then now() + make_interval(hours => least(hours, 168)) else null end;
  update companies set support_until = u, support_by = auth.uid() where id = c;
  perform public.log(c, case when u is null then 'support ended' else 'support granted' end, jsonb_build_object('until', u));
  return u;
end $$;

-- company admin: delete the company and ALL its data (type the name to confirm)
create or replace function public.delete_my_company(c uuid, p_confirm text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(c) then raise exception 'Only the company admin can do this' using errcode = '42501'; end if;
  if p_confirm is distinct from (select name from companies where id = c) then raise exception 'Type the company name exactly to confirm'; end if;
  delete from companies where id = c;
end $$;

-- ---------------------------------------------------------------- the Owner Console (platform owner only)
create or replace function public.owner_companies() returns table (id uuid, name text, status text, seats integer, members integer, admins integer,
  invites integer, data_kb integer, last_save timestamptz, support_until timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'Platform owner only' using errcode = '42501'; end if;
  return query select c.id, c.name, c.status, c.seats,
    (select count(*)::int from company_members m where m.company_id = c.id and m.active),
    (select count(*)::int from company_members m where m.company_id = c.id and m.active and m.role = 'admin'),
    (select count(*)::int from invites i where i.company_id = c.id and i.accepted_at is null),
    (select coalesce(sum(f.size), 0)::int / 1024 from files f where f.company_id = c.id),
    (select max(f.updated_at) from files f where f.company_id = c.id),
    c.support_until, c.created_at
  from companies c order by c.name;
end $$;

create or replace function public.owner_create_company(p_name text, p_admin_email text, p_admin_member text default 'admin', p_seats integer default 25) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if not public.is_platform_owner() then raise exception 'Platform owner only' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the company a name'; end if;
  insert into companies (name, seats) values (left(trim(p_name), 120), greatest(coalesce(p_seats, 25), 1)) returning id into c;
  perform public.invite_member(c, p_admin_email, coalesce(nullif(trim(p_admin_member), ''), 'admin'), 'admin');
  perform public.log(c, 'company created', jsonb_build_object('name', p_name, 'admin', lower(p_admin_email), 'seats', p_seats));
  return c;
end $$;

create or replace function public.owner_set_company(c uuid, p_status text, p_seats integer) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'Platform owner only' using errcode = '42501'; end if;
  if p_status not in ('active', 'paused') then raise exception 'Status must be active or paused'; end if;
  update companies set status = p_status, seats = greatest(coalesce(p_seats, seats), 1) where id = c;
  perform public.log(c, 'company changed', jsonb_build_object('status', p_status, 'seats', p_seats));
end $$;

create or replace function public.owner_invite_admin(c uuid, p_email text, p_member text default 'admin') returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'Platform owner only' using errcode = '42501'; end if;
  return public.invite_member(c, p_email, p_member, 'admin');
end $$;

create or replace function public.owner_delete_company(c uuid, p_confirm text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'Platform owner only' using errcode = '42501'; end if;
  if p_confirm is distinct from (select name from companies where id = c) then raise exception 'Type the company name exactly to confirm'; end if;
  delete from companies where id = c;
end $$;

-- the platform owner opens a company (as its admin) — recorded in that company's audit log
create or replace function public.owner_open(c uuid) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'Platform owner only' using errcode = '42501'; end if;
  if not exists (select 1 from companies where id = c) then raise exception 'No such company'; end if;
  perform public.log(c, 'owner opened', '{}');
  return true;
end $$;
drop function if exists public.owner_open_support(uuid);
-- the accounts of a company, for the Owner Console
create or replace function public.owner_accounts(c uuid) returns table (member_id text, email text, role text, active boolean, invited boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'Platform owner only' using errcode = '42501'; end if;
  return query
    select m.member_id, m.email, m.role, m.active, false, m.created_at from company_members m where m.company_id = c
    union all
    select i.member_id, i.email, i.role, true, true, i.created_at from invites i where i.company_id = c and i.accepted_at is null
    order by 5, 1;
end $$;

-- the company's audit log (its admins; the platform owner)
create or replace function public.company_audit(c uuid, n integer default 200) returns setof public.audit language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin(c) or public.is_platform_owner()) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query select * from audit where company_id = c order by at desc limit greatest(least(n, 1000), 1);
end $$;

grant usage on schema public to anon, authenticated;
grant select on public.platform_owners, public.companies, public.company_members, public.invites, public.audit to authenticated;
grant select, insert, update, delete on public.files to authenticated;
revoke all on public.companies, public.company_members, public.invites, public.audit, public.platform_owners from anon;
revoke all on public.files from anon;
revoke insert, update, delete on public.companies, public.company_members, public.invites, public.audit, public.platform_owners from authenticated;
grant execute on function public.my_companies(), public.accept_invites(), public.invite_member(uuid, text, text, text), public.cancel_invite(uuid, text),
  public.set_member(uuid, text, text, boolean), public.rename_company(uuid, text), public.grant_support(uuid, integer), public.delete_my_company(uuid, text),
  public.owner_companies(), public.owner_create_company(text, text, text, integer), public.owner_set_company(uuid, text, integer),
  public.owner_invite_admin(uuid, text, text), public.owner_delete_company(uuid, text), public.owner_open(uuid), public.owner_accounts(uuid), public.company_audit(uuid, integer),
  public.is_platform_owner(), public.is_member(uuid), public.is_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- ONE-TIME: make yourself the platform owner (after creating your account in Authentication → Users, or by signing
-- up in the app). Replace the email, then run just this line:
--
-- insert into public.platform_owners (user_id) select id from auth.users where email = 'you@example.com' on conflict do nothing;
--
-- Then everything else is done in the app's Owner Console: create a company, invite its admin by email.
