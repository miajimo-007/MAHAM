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
-- a person's own attachments: Attachments/<id>/<file> (MAHAM — 📎 on any piece of work)
create or replace function public.is_own_attachment(c uuid, p text) returns boolean language sql stable security definer set search_path = public as $$
  select public.my_member_id(c) is not null
     and left(p, length('MAHAM Data/Attachments/' || public.my_member_id(c) || '/')) = 'MAHAM Data/Attachments/' || public.my_member_id(c) || '/'
     and position('/' in substr(p, length('MAHAM Data/Attachments/' || public.my_member_id(c) || '/') + 1)) = 0
     and position('..' in p) = 0;
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
  public.is_member(company_id) and (public.is_admin(company_id) or public.is_own_file(company_id, path) or path like 'MAHAM Data/Backups/%' or public.is_own_attachment(company_id, path)));
drop policy if exists files_update on public.files;
create policy files_update on public.files for update using (
  public.is_member(company_id) and (public.is_admin(company_id) or public.is_own_file(company_id, path) or path like 'MAHAM Data/Backups/%' or public.is_own_attachment(company_id, path)));
drop policy if exists files_delete on public.files;
create policy files_delete on public.files for delete using (
  public.is_member(company_id) and (public.is_admin(company_id) or path like 'MAHAM Data/Backups/%' or public.is_own_attachment(company_id, path)));

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

-- ---------------------------------------------------------------- records: the team's data, one row per record
-- Every record belongs to one of the app's files ("users/adam.json", "users/adam.hd-2026-05.json", "seed.json") — the
-- same files the shared folder had — and gets a change number ("seq", always larger than the one before). The app asks
-- only for what changed since the last number it saw, and saves only the records that changed (save_records).
-- A record that leaves a file keeps its row with data = null, so every PC learns it is gone.
create sequence if not exists public.records_seq;
create table if not exists public.records (
  company_id  uuid not null references public.companies (id) on delete cascade,
  f           text not null,
  id          text not null,
  data        jsonb,
  ts          bigint not null default 0,          -- the record's own _ts (newest wins)
  seq         bigint not null default nextval('public.records_seq'),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (company_id, f, id)
);
create index if not exists records_company_seq on public.records (company_id, seq);
create index if not exists records_company_rid on public.records (company_id, id);
alter table public.records enable row level security;
drop policy if exists records_read on public.records;
-- a record with an audience ("aud": direct messages, private channels) goes only to the people in it — not even the
-- company admin or the platform owner reads those
create or replace function public.in_audience(c uuid, d jsonb) returns boolean language sql stable security definer set search_path = public as $$
  select d is null or jsonb_typeof(d -> 'aud') is distinct from 'array' or (d -> 'aud') ? coalesce(public.my_member_id(c), '');
$$;
create policy records_read on public.records for select using (public.is_member(company_id) and public.in_audience(company_id, data));
-- the app file f may be written by: its owner (users/<me>….json), the company admin (any)
create or replace function public.may_write_file(c uuid, p_f text) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_member(c) and (public.is_admin(c) or public.is_own_file(c, 'MAHAM Data/' || p_f));
$$;
create or replace function public.records_owner_log(c uuid, p_f text) returns void language plpgsql security definer set search_path = public as $$
begin
  if public.is_platform_owner() and not exists (select 1 from company_members where company_id = c and user_id = auth.uid() and active) then
    if exists (select 1 from audit where company_id = c and user_id = auth.uid() and action = 'owner saved' and at > now() - interval '10 minutes') then
      update audit set detail = jsonb_set(detail, '{files}', to_jsonb(least(coalesce((detail ->> 'files')::int, 1) + 1, 100000)))
       where id = (select max(id) from audit where company_id = c and user_id = auth.uid() and action = 'owner saved');
    else
      insert into audit (company_id, action, detail) values (c, 'owner saved', jsonb_build_object('files', 1, 'first', p_f));
    end if;
  end if;
end $$;
revoke execute on function public.records_owner_log(uuid, text) from public, anon, authenticated;

-- save the changed records: items = [{ f, r } | { f, id, d: true, ts }]. A copy older (_ts) than the one kept is not
-- taken (the app gets the newer one with its next read). Returns { seq, taken, skipped }.
create or replace function public.save_records(c uuid, items jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; p_f text; p_id text; p_ts bigint; cur bigint; taken integer := 0; skipped integer := 0; files text[] := '{}';
begin
  if jsonb_typeof(items) <> 'array' then raise exception 'items must be a list'; end if;
  for it in select * from jsonb_array_elements(items) loop
    p_f := it ->> 'f';
    if p_f is null or not (p_f = 'seed.json' or p_f ~ '^users/[A-Za-z0-9 ._@()+-]+\.json$') then raise exception 'Bad file name: %', p_f; end if;
    if not public.may_write_file(c, p_f) then raise exception 'You can only save your own files' using errcode = '42501'; end if;
    if not (p_f = any(files)) then files := files || p_f; end if;
    if coalesce((it ->> 'd')::boolean, false) then
      p_id := it ->> 'id'; p_ts := coalesce((it ->> 'ts')::numeric, 0)::bigint;
      select ts into cur from records where company_id = c and f = p_f and id = p_id and data is not null;
      if not found or cur > p_ts then skipped := skipped + 1; continue; end if;
      update records set data = null, seq = nextval('public.records_seq'), updated_at = now(), updated_by = auth.uid() where company_id = c and f = p_f and id = p_id;
    else
      p_id := it -> 'r' ->> 'id'; p_ts := coalesce((it -> 'r' ->> '_ts')::numeric, 0)::bigint;
      if coalesce(p_id, '') = '' then raise exception 'A record without an id'; end if;
      select ts into cur from records where company_id = c and f = p_f and id = p_id and data is not null;
      if found and (cur > p_ts or (select data from records where company_id = c and f = p_f and id = p_id) = it -> 'r') then skipped := skipped + 1; continue; end if;
      insert into records (company_id, f, id, data, ts) values (c, p_f, p_id, it -> 'r', p_ts)
        on conflict (company_id, f, id) do update set data = excluded.data, ts = excluded.ts, seq = nextval('public.records_seq'), updated_at = now(), updated_by = auth.uid();
    end if;
    taken := taken + 1;
  end loop;
  foreach p_f in array files loop perform public.records_owner_log(c, p_f); end loop;
  return jsonb_build_object('seq', (select coalesce(max(seq), 0) from records where company_id = c), 'taken', taken, 'skipped', skipped);
end $$;

-- a whole file (admin tools, import, restore): its records become exactly these. Returns { added, changed, removed }.
create or replace function public.replace_file(c uuid, p_f text, recs jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; a integer := 0; ch integer := 0; rm integer := 0; ids text[] := '{}'; old jsonb;
begin
  if p_f is null or not (p_f = 'seed.json' or p_f ~ '^users/[A-Za-z0-9 ._@()+-]+\.json$') then raise exception 'Bad file name: %', p_f; end if;
  if not public.may_write_file(c, p_f) then raise exception 'You can only save your own files' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(coalesce(recs, '[]'::jsonb)) loop
    if jsonb_typeof(r) <> 'object' or coalesce(r ->> 'id', '') = '' then continue; end if;
    ids := ids || (r ->> 'id');
    select data into old from records where company_id = c and f = p_f and id = r ->> 'id';
    if old is null then a := a + 1; elsif old = r then continue; else ch := ch + 1; end if;
    insert into records (company_id, f, id, data, ts) values (c, p_f, r ->> 'id', r, coalesce((r ->> '_ts')::numeric, 0)::bigint)
      on conflict (company_id, f, id) do update set data = excluded.data, ts = excluded.ts, seq = nextval('public.records_seq'), updated_at = now(), updated_by = auth.uid();
  end loop;
  with gone as (
    update records set data = null, seq = nextval('public.records_seq'), updated_at = now(), updated_by = auth.uid()
     where company_id = c and f = p_f and data is not null and not (id = any(ids))
       and public.in_audience(c, data) returning 1)   -- what the caller cannot read (someone's direct messages) is never removed this way
  select count(*) into rm from gone;
  perform public.records_owner_log(c, p_f);
  return jsonb_build_object('added', a, 'changed', ch, 'removed', rm, 'seq', (select coalesce(max(seq), 0) from records where company_id = c));
end $$;

-- ONE-TIME (safe to run again): person files kept in "files" by an older MAHAM become records; the file row then goes.
do $$
declare x record; j jsonb; r jsonb;
begin
  for x in select company_id, path, content from public.files where path ~ '^MAHAM Data/(users/[^/]+\.json|seed\.json)$' loop
    begin j := x.content::jsonb; exception when others then continue; end;   -- unreadable: left as it is
    for r in select * from jsonb_array_elements(case when jsonb_typeof(j -> 'records') = 'array' then j -> 'records' else '[]'::jsonb end) loop
      if jsonb_typeof(r) <> 'object' or coalesce(r ->> 'id', '') = '' then continue; end if;
      insert into public.records (company_id, f, id, data, ts, updated_by) values (x.company_id, substr(x.path, length('MAHAM Data/') + 1), r ->> 'id', r, coalesce((r ->> '_ts')::numeric, 0)::bigint, null)
        on conflict (company_id, f, id) do nothing;
    end loop;
    delete from public.files where company_id = x.company_id and path = x.path;
  end loop;
end $$;

-- ---------------------------------------------------------------- emails for 🔔 notifications (MAHAM)
-- A notification record ({ c: 'notify', to }) queues one email to that person's account address, unless they switched
-- emails off in 🔔 (their notifprefs record). The function supabase/functions/send-notifications sends the queue
-- (every minute, with the service key); nobody else can read or change it.
create table if not exists public.notify_queue (
  id          bigserial primary key,
  company_id  uuid not null references public.companies (id) on delete cascade,
  to_member   text not null,
  to_email    text not null,
  title       text not null default '',
  body        text not null default '',
  link        text not null default '',
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  tries       integer not null default 0,
  error       text
);
create index if not exists notify_queue_open on public.notify_queue (created_at) where sent_at is null;
alter table public.notify_queue enable row level security;
revoke all on public.notify_queue from anon, authenticated;
create or replace function public.records_notify_mail() returns trigger language plpgsql security definer set search_path = public as $$
declare who text; em text; off boolean; byname text;
begin
  if new.data is null or new.data ->> 'c' is distinct from 'notify' or (tg_op = 'UPDATE' and old.data is not null) then return new; end if;
  who := new.data ->> 'to';
  select email into em from company_members where company_id = new.company_id and member_id = who and active and coalesce(email, '') <> '';
  if em is null then return new; end if;
  select coalesce((data ->> 'email')::boolean, true) = false into off from records where company_id = new.company_id and id = 'notifprefs-' || who and data is not null order by ts desc limit 1;
  if coalesce(off, false) then return new; end if;
  byname := coalesce(new.data ->> 'by', '');
  insert into notify_queue (company_id, to_member, to_email, title, body, link)
    values (new.company_id, who, em, left(byname || ' ' || coalesce(new.data ->> 'title', ''), 200), left(coalesce(new.data ->> 'text', ''), 1000), left(coalesce(new.data ->> 'link', ''), 200));
  return new;
end $$;
drop trigger if exists records_notify_mail on public.records;
create trigger records_notify_mail after insert or update on public.records for each row execute function public.records_notify_mail();

-- ---------------------------------------------------------------- 🎫 customer portal (MAHAM service desk)
-- Customers have no account: they raise a ticket on portal.html?c=<company id>, get a private link (token) to follow it
-- and reply. These functions are the only way in; what they save goes into the file users/_portal.json as "_portal".
-- The portal is OFF until the company admin switches it on (Service desk → Settings).
create or replace function public.svc_settings(c uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select data from records where company_id = c and id = 'settings-service' and data is not null order by ts desc limit 1), '{}'::jsonb);
$$;
create or replace function public.ticket_now(c uuid, p_id text) returns jsonb language sql stable security definer set search_path = public as $$
  select data from records where company_id = c and id = p_id and data is not null order by ts desc limit 1;
$$;
revoke execute on function public.svc_settings(uuid), public.ticket_now(uuid, text) from public, anon, authenticated;
-- a 🔔 notification from the portal to a person (and so an email, see records_notify_mail)
create or replace function public.portal_notify(c uuid, p_to text, p_title text, p_text text, p_link text) returns void language plpgsql security definer set search_path = public as $$
declare now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; nid text := 'notify-_portal-' || to_hex(now_ms) || substr(md5(random()::text), 1, 4);
begin
  insert into records (company_id, f, id, data, ts, updated_by) values (c, 'users/_portal.json', nid, jsonb_build_object('c', 'notify', 'id', nid, 'to', p_to, 'by', '_portal',
    'at', now_ms, 'kind', 'ticket', 'title', p_title, 'text', coalesce(p_text, ''), 'link', p_link, '_ts', now_ms, '_by', '_portal'), now_ms, null);
end $$;
revoke execute on function public.portal_notify(uuid, text, text, text, text) from public, anon, authenticated;
create or replace function public.portal_info(c uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.company_active(c) and coalesce((public.svc_settings(c) -> 'portal' ->> 'on')::boolean, false)
    then jsonb_build_object('name', (select name from companies where id = c), 'title', coalesce(public.svc_settings(c) -> 'portal' ->> 'title', 'Help centre'),
      'intro', coalesce(public.svc_settings(c) -> 'portal' ->> 'intro', ''), 'categories', coalesce(public.svc_settings(c) -> 'categories', '[]'::jsonb))
    else null end;
$$;
create or replace function public.portal_submit(c uuid, p_name text, p_email text, p_subject text, p_desc text, p_category text default '') returns text
language plpgsql security definer set search_path = public as $$
declare st jsonb := public.svc_settings(c); n int; tid text; tok text; now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
        q jsonb; qid text := ''; who text := ''; recent int;
begin
  if public.portal_info(c) is null then raise exception 'This help centre is not open' using errcode = '42501'; end if;
  if coalesce(trim(p_subject), '') = '' or coalesce(trim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'A subject and a valid email are needed'; end if;
  select count(*) into recent from records where company_id = c and f = 'users/_portal.json' and data ->> 'c' = 'ticket' and updated_at > now() - interval '1 hour';
  if recent >= 30 then raise exception 'Too many requests just now — please try again in a while'; end if;
  -- the queue for the category (else the first), and its member with the fewest open tickets
  select x into q from jsonb_array_elements(coalesce(st -> 'queues', '[]'::jsonb)) x where coalesce(x -> 'categories', '[]'::jsonb) ? coalesce(p_category, '') limit 1;
  if q is null then q := coalesce(st -> 'queues', '[]'::jsonb) -> 0; end if;
  if q is not null then
    qid := coalesce(q ->> 'id', '');
    select m into who from jsonb_array_elements_text(coalesce(q -> 'members', '[]'::jsonb)) m
      order by (select count(*) from records r where r.company_id = c and r.data ->> 'c' = 'ticket' and r.data ->> 'assignee' = m
                and r.data ->> 'status' in ('New', 'Open', 'Waiting on customer', 'Waiting on third party')), m limit 1;
  end if;
  select coalesce(max((data ->> 'no')::int), 0) + 1 into n from records where company_id = c and data ->> 'c' = 'ticket';
  tid := 'ticket-_portal-' || to_hex(now_ms) || substr(md5(random()::text), 1, 4);
  tok := md5(random()::text || clock_timestamp()::text) || md5(random()::text || tid);
  insert into records (company_id, f, id, data, ts, updated_by) values (c, 'users/_portal.json', tid, jsonb_strip_nulls(jsonb_build_object(
    'c', 'ticket', 'id', tid, 'no', n, 'subject', left(trim(p_subject), 200), 'desc', left(coalesce(p_desc, ''), 8000), 'category', nullif(p_category, ''),
    'priority', 'Normal', 'status', 'New', 'channel', 'portal', 'created', now_ms, 'token', tok, 'queue', nullif(qid, ''), 'assignee', nullif(who, ''),
    'cust', jsonb_build_object('name', left(coalesce(trim(p_name), ''), 100), 'email', lower(trim(p_email))), '_ts', now_ms, '_by', '_portal')), now_ms, null);
  if coalesce(who, '') <> '' then perform public.portal_notify(c, who, 'sent a new ticket TK-' || n, left(trim(p_subject), 160), '#/tickets/mine'); end if;
  return tok;
end $$;
create or replace function public.portal_status(p_token text) returns jsonb language sql stable security definer set search_path = public as $$
  with t as (select company_id, id from records where data ->> 'c' = 'ticket' and data ->> 'token' = p_token and length(p_token) >= 24 limit 1),
       cur as (select public.ticket_now(t.company_id, t.id) d, t.company_id, t.id from t)
  select jsonb_build_object('no', d ->> 'no', 'subject', d ->> 'subject', 'status', d ->> 'status', 'created', d -> 'created',
    'replies', coalesce((select jsonb_agg(jsonb_build_object('at', r.data -> 'at', 'text', r.data ->> 'text', 'mine', r.data ? 'cust',
              'by', case when r.data ? 'cust' then coalesce(r.data -> 'cust' ->> 'name', 'You') else 'Support' end) order by (r.data ->> 'at')::bigint)
       from records r where r.company_id = cur.company_id and r.data ->> 'c' = 'tkreply' and r.data ->> 'on' = cur.id
         and coalesce((r.data ->> 'internal')::boolean, false) = false), '[]'::jsonb)) from cur;
$$;
create or replace function public.portal_reply(p_token text, p_text text) returns boolean language plpgsql security definer set search_path = public as $$
declare c uuid; tid text; d jsonb; now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; rid text;
begin
  select company_id, id into c, tid from records where data ->> 'c' = 'ticket' and data ->> 'token' = p_token and length(p_token) >= 24 limit 1;
  if c is null then raise exception 'This link is not valid' using errcode = '42501'; end if;
  if coalesce(trim(p_text), '') = '' then raise exception 'Write a reply'; end if;
  d := public.ticket_now(c, tid);
  rid := 'tkreply-_portal-' || to_hex(now_ms) || substr(md5(random()::text), 1, 4);
  insert into records (company_id, f, id, data, ts, updated_by) values (c, 'users/_portal.json', rid, jsonb_build_object('c', 'tkreply', 'id', rid, 'on', tid,
    'cust', d -> 'cust', 'at', now_ms, 'text', left(trim(p_text), 8000), '_ts', now_ms, '_by', '_portal'), now_ms, null);
  if coalesce(d ->> 'assignee', '') <> '' then perform public.portal_notify(c, d ->> 'assignee', 'replied on TK-' || (d ->> 'no'), left(trim(p_text), 160), '#/tickets/mine'); end if;
  -- the customer answered: a ticket waiting on them (or resolved) opens again, and its SLA clock runs again
  if d ->> 'status' in ('Waiting on customer', 'Resolved') then
    d := d || jsonb_build_object('status', 'Open', 'pausedMs', coalesce((d ->> 'pausedMs')::bigint, 0) + case when d ->> 'status' = 'Waiting on customer' and d ? 'pausedAt' and jsonb_typeof(d -> 'pausedAt') = 'number' then now_ms - (d ->> 'pausedAt')::bigint else 0 end,
      'pausedAt', null, 'resolvedAt', null, '_ts', now_ms, '_by', '_portal');
    insert into records (company_id, f, id, data, ts, updated_by) values (c, 'users/_portal.json', tid, jsonb_strip_nulls(d), now_ms, null)
      on conflict (company_id, f, id) do update set data = excluded.data, ts = excluded.ts, seq = nextval('public.records_seq'), updated_at = now();
  end if;
  return true;
end $$;
create or replace function public.portal_articles(c uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.portal_info(c) is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('title', d ->> 'title', 'problem', d ->> 'problem', 'solution', d ->> 'solution', 'tags', d -> 'tags'))
    from (select distinct on (id) data d from records where company_id = c and data ->> 'c' = 'kbarticle' and data ->> 'vis' = 'public' order by id, ts desc) x where coalesce((d ->> '_del')::boolean, false) = false), '[]'::jsonb) end;
$$;
grant execute on function public.portal_info(uuid), public.portal_submit(uuid, text, text, text, text, text), public.portal_status(text), public.portal_reply(text, text), public.portal_articles(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- 📣 lead forms (MAHAM marketing)
-- form.html?c=<company>&f=<campaign id>: a public sign-up form for a campaign whose form is switched on. Each sign-up
-- becomes a contact (source = the campaign) and a follow-up for the campaign's owner, who gets a 🔔 notification.
create or replace function public.form_info(c uuid, p_form text) returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.company_active(c) and coalesce((d -> 'form' ->> 'on')::boolean, false) and d ->> 'c' = 'campaign' and coalesce(d ->> 'status', '') <> 'Done'
    then jsonb_build_object('company', (select name from companies where id = c), 'title', coalesce(nullif(d -> 'form' ->> 'title', ''), d ->> 'name'), 'intro', coalesce(d -> 'form' ->> 'intro', ''))
    else null end
  from (select public.ticket_now(c, p_form) d) x;
$$;
create or replace function public.form_submit(c uuid, p_form text, p_name text, p_email text, p_phone text default '', p_note text default '') returns boolean
language plpgsql security definer set search_path = public as $$
declare d jsonb := public.ticket_now(c, p_form); now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; cid text; aid text; owner text; recent int;
begin
  if public.form_info(c, p_form) is null then raise exception 'This form is closed' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' or (coalesce(trim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and coalesce(trim(p_phone), '') = '') then raise exception 'A name and an email or phone are needed'; end if;
  select count(*) into recent from records where company_id = c and f = 'users/_portal.json' and data ->> 'c' = 'contact' and updated_at > now() - interval '1 hour';
  if recent >= 60 then raise exception 'Too many sign-ups just now — please try again in a while'; end if;
  owner := coalesce(d ->> 'owner', '');
  cid := 'contact-_portal-' || to_hex(now_ms) || substr(md5(random()::text), 1, 4);
  aid := 'crmact-_portal-' || to_hex(now_ms) || substr(md5(random()::text), 1, 4);
  insert into records (company_id, f, id, data, ts, updated_by) values (c, 'users/_portal.json', cid, jsonb_strip_nulls(jsonb_build_object('c', 'contact', 'id', cid, 'name', left(trim(p_name), 100),
    'email', nullif(lower(trim(coalesce(p_email, ''))), ''), 'phone', nullif(left(trim(coalesce(p_phone, '')), 40), ''), 'notes', nullif(left(coalesce(p_note, ''), 2000), ''), 'tags', jsonb_build_array('lead'),
    'source', p_form, 'owner', nullif(owner, ''), '_ts', now_ms, '_by', '_portal')), now_ms, null);
  insert into records (company_id, f, id, data, ts, updated_by) values (c, 'users/_portal.json', aid, jsonb_build_object('c', 'crmact', 'id', aid, 'on', cid, 'kind', 'followup',
    'text', 'New sign-up from ' || coalesce(d ->> 'name', 'a campaign') || ': contact them', 'due', to_char(now(), 'YYYY-MM-DD'), 'done', false, 'by', '_portal', 'at', now_ms, '_ts', now_ms, '_by', '_portal'), now_ms, null);
  if owner <> '' then perform public.portal_notify(c, owner, 'signed up for ' || coalesce(d ->> 'name', 'your campaign'), left(trim(p_name), 100), '#/crm/activities'); end if;
  return true;
end $$;
grant execute on function public.form_info(uuid, text), public.form_submit(uuid, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- ✨ AI connections (MAHAM)
-- A company's AI and each person's own AI. The key is written here and NEVER read back by the app: there is no
-- select for anyone; only the function ai-proxy (supabase/functions/ai-proxy, service key) reads it to call the AI.
create table if not exists public.ai_keys (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  scope       text not null check (scope in ('company', 'person')),
  member_id   text,                          -- whose (scope 'person')
  provider    text not null,
  model       text not null default '',
  base_url    text not null default '',
  name        text not null default '',
  secret      text not null,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
alter table public.ai_keys enable row level security;
revoke all on public.ai_keys from anon, authenticated;
create or replace function public.ai_set_key(c uuid, p_scope text, p_provider text, p_model text, p_base text, p_name text, p_key text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me text := public.my_member_id(c); r uuid; pol jsonb := coalesce((select data from records where company_id = c and id = 'settings-ai' and data is not null order by ts desc limit 1), '{}'::jsonb);
begin
  if not public.is_member(c) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_scope not in ('company', 'person') then raise exception 'Scope must be company or person'; end if;
  if p_scope = 'company' and not public.is_admin(c) then raise exception 'Only the company admin can connect the company AI' using errcode = '42501'; end if;
  if p_scope = 'person' and coalesce((pol ->> 'personal')::boolean, true) = false then raise exception 'Your admin has not allowed personal AI connections' using errcode = '42501'; end if;
  if jsonb_typeof(pol -> 'providers') = 'array' and not ((pol -> 'providers') ? p_provider) then raise exception 'Your admin has not allowed this AI service' using errcode = '42501'; end if;
  if coalesce(p_key, '') = '' then raise exception 'The key is empty'; end if;
  insert into ai_keys (company_id, scope, member_id, provider, model, base_url, name, secret)
    values (c, p_scope, case when p_scope = 'person' then me end, p_provider, coalesce(p_model, ''), coalesce(p_base, ''), left(coalesce(p_name, ''), 80), p_key) returning id into r;
  perform public.log(c, 'AI connected', jsonb_build_object('scope', p_scope, 'provider', p_provider, 'model', p_model, 'member', me));
  return r;
end $$;
-- the connections this person may use — never the key
create or replace function public.ai_list(c uuid) returns table (id uuid, scope text, provider text, model text, base_url text, name text)
language sql stable security definer set search_path = public as $$
  select k.id, k.scope, k.provider, k.model, k.base_url, k.name from ai_keys k
   where k.company_id = c and public.is_member(c) and (k.scope = 'company' or k.member_id = public.my_member_id(c)) order by k.scope, k.created_at;
$$;
create or replace function public.ai_delete(c uuid, p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from ai_keys where id = p_id and company_id = c and ((scope = 'company' and public.is_admin(c)) or (scope = 'person' and member_id = public.my_member_id(c)));
  if not found then raise exception 'Not found, or not yours' using errcode = '42501'; end if;
  perform public.log(c, 'AI removed', jsonb_build_object('id', p_id));
end $$;
-- for ai-proxy only (service key): the connection a signed-in person may use, with its key
create or replace function public.ai_key_for(c uuid, p_id uuid, p_user uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(x) from (select k.provider, k.model, k.base_url, k.secret, k.scope from ai_keys k join company_members m on m.company_id = k.company_id and m.user_id = p_user and m.active
    join companies co on co.id = k.company_id and co.status = 'active'
    where k.id = p_id and k.company_id = c and (k.scope = 'company' or k.member_id = m.member_id)) x;
$$;
revoke execute on function public.ai_key_for(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_set_key(uuid, text, text, text, text, text, text), public.ai_list(uuid), public.ai_delete(uuid, uuid) to authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.platform_owners, public.companies, public.company_members, public.invites, public.audit to authenticated;
grant select, insert, update, delete on public.files to authenticated;
revoke all on public.companies, public.company_members, public.invites, public.audit, public.platform_owners from anon;
revoke all on public.files from anon;
grant select on public.records to authenticated;
revoke all on public.records from anon;
revoke insert, update, delete on public.records from authenticated;
revoke all on sequence public.records_seq from anon, authenticated;
revoke insert, update, delete on public.companies, public.company_members, public.invites, public.audit, public.platform_owners from authenticated;
grant execute on function public.my_companies(), public.accept_invites(), public.invite_member(uuid, text, text, text), public.cancel_invite(uuid, text),
  public.set_member(uuid, text, text, boolean), public.rename_company(uuid, text), public.grant_support(uuid, integer), public.delete_my_company(uuid, text),
  public.owner_companies(), public.owner_create_company(text, text, text, integer), public.owner_set_company(uuid, text, integer),
  public.owner_invite_admin(uuid, text, text), public.owner_delete_company(uuid, text), public.owner_open(uuid), public.owner_accounts(uuid), public.company_audit(uuid, integer),
  public.is_platform_owner(), public.is_member(uuid), public.is_admin(uuid), public.save_records(uuid, jsonb), public.replace_file(uuid, text, jsonb), public.may_write_file(uuid, text), public.is_own_attachment(uuid, text), public.in_audience(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- ONE-TIME: make yourself the platform owner (after creating your account in Authentication → Users, or by signing
-- up in the app). Replace the email, then run just this line:
--
-- insert into public.platform_owners (user_id) select id from auth.users where email = 'you@example.com' on conflict do nothing;
--
-- Then everything else is done in the app's Owner Console: create a company, invite its admin by email.
