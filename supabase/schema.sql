-- MAHAM — online database (Supabase / PostgreSQL). Run once in Supabase → SQL Editor → New query → Run.
-- The app keeps the same data as in the shared folder: one JSON "file" per person, per company.
-- Security is enforced here (row-level security), not in the browser:
--   * people read only their own company's files
--   * each person writes only their own file (users/<their id>.json) and backups
--   * the company owner may write any file of the company (restores, clean-ups, imports)

create extension if not exists pgcrypto;

-- companies (one row per customer)
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- who belongs to which company, and which person in the app they are
create table if not exists public.company_members (
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  member_id   text not null,            -- the person's id in the app (Admin → People), e.g. 'adam'
  is_owner    boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (company_id, user_id),
  unique (company_id, member_id)
);

-- the data: what used to be files in the shared folder
create table if not exists public.files (
  company_id  uuid not null references public.companies (id) on delete cascade,
  path        text not null,            -- e.g. 'MAHAM Data/users/adam.json'
  content     text not null default '',
  size        integer generated always as (octet_length(content)) stored,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (company_id, path)
);
create index if not exists files_company_path on public.files (company_id, path text_pattern_ops);

-- every save stamps the time and the person
create or replace function public.files_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists files_touch on public.files;
create trigger files_touch before insert or update on public.files for each row execute function public.files_touch();

-- helpers used by the policies (security definer: they may read company_members)
create or replace function public.is_member(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members where company_id = c and user_id = auth.uid());
$$;
create or replace function public.is_owner(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members where company_id = c and user_id = auth.uid() and is_owner);
$$;
create or replace function public.my_member_id(c uuid) returns text language sql stable security definer set search_path = public as $$
  select member_id from company_members where company_id = c and user_id = auth.uid();
$$;

alter table public.companies       enable row level security;
alter table public.company_members enable row level security;
alter table public.files           enable row level security;

-- companies: members see their company; owners rename it
drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies for select using (public.is_member(id));
drop policy if exists companies_owner on public.companies;
create policy companies_owner on public.companies for update using (public.is_owner(id));

-- members: everyone in the company sees the list; only owners add, change or remove people
drop policy if exists members_read on public.company_members;
create policy members_read on public.company_members for select using (public.is_member(company_id));
drop policy if exists members_owner_ins on public.company_members;
create policy members_owner_ins on public.company_members for insert with check (public.is_owner(company_id));
drop policy if exists members_owner_upd on public.company_members;
create policy members_owner_upd on public.company_members for update using (public.is_owner(company_id));
drop policy if exists members_owner_del on public.company_members;
create policy members_owner_del on public.company_members for delete using (public.is_owner(company_id));

-- files: read the whole company; write your own file and backups; the owner writes anything
drop policy if exists files_read on public.files;
create policy files_read on public.files for select using (public.is_member(company_id));

drop policy if exists files_write on public.files;
create policy files_write on public.files for insert with check (
  public.is_member(company_id) and (
    public.is_owner(company_id)
    or path = 'MAHAM Data/users/' || public.my_member_id(company_id) || '.json'
    or path like 'MAHAM Data/Backups/%'
  )
);
drop policy if exists files_update on public.files;
create policy files_update on public.files for update using (
  public.is_member(company_id) and (
    public.is_owner(company_id)
    or path = 'MAHAM Data/users/' || public.my_member_id(company_id) || '.json'
    or path like 'MAHAM Data/Backups/%'
  )
);
drop policy if exists files_delete on public.files;
create policy files_delete on public.files for delete using (
  public.is_member(company_id) and (public.is_owner(company_id) or path like 'MAHAM Data/Backups/%')
);

-- ---------------------------------------------------------------------------------------------------------------
-- First company (run after creating the owner's account in Authentication → Users; replace the email and names):
--
-- with c as (insert into public.companies (name) values ('My Company') returning id)
-- insert into public.company_members (company_id, user_id, member_id, is_owner)
-- select c.id, u.id, 'adam', true from c, auth.users u where u.email = 'owner@example.com';
--
-- Add a person: create their account in Authentication → Users, add them in the app (Admin → People), then:
--
-- insert into public.company_members (company_id, user_id, member_id)
-- select '<company id>', u.id, '<their id in the app>' from auth.users u where u.email = 'person@example.com';
