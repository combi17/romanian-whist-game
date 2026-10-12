-- ============================================================================
-- 0001: profiles and auth
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles: one row per auth.users row, created automatically by a trigger.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique,
  email       text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Public profile per user. Rows are created by the on_auth_user_created trigger, never by the client.';

-- Usernames are unique regardless of case.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));


-- ----------------------------------------------------------------------------
-- Create a profile for every new user.
--   * email signup  -> username from options.data.username (Signup.jsx)
--   * Google        -> falls back to full_name, then the email
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username  text;
  final_username text;
  suffix         int := 0;
begin
  base_username := coalesce(
    nullif(new.raw_user_meta_data ->> 'username',  ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name',      ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'player'
  );

  -- strip anything that would look broken on a name plate
  base_username := regexp_replace(base_username, '[^a-zA-Z0-9_]', '', 'g');
  if base_username = '' then
    base_username := 'player';
  end if;
  base_username := left(base_username, 20);

  -- Google sign-ups skip the availability check, so add a number on a clash.
  final_username := base_username;
  while exists (
    select 1 from public.profiles where lower(username) = lower(final_username)
  ) loop
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  end loop;

  insert into public.profiles (id, username, email, avatar_url)
  values (
    new.id,
    final_username,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(new.raw_user_meta_data ->> 'picture',    ''),
      -- default avatar for email signups
      'https://api.dicebear.com/9.x/thumbs/svg?seed=' || new.id::text
    )
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ----------------------------------------------------------------------------
-- Username availability check for anonymous users. A function, so anon never
-- needs read access to profiles (which holds emails).
-- ----------------------------------------------------------------------------
create or replace function public.username_available(candidate text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(candidate)
  );
$$;

grant execute on function public.username_available(text) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- RLS: users can read and update only their own profile. There's no insert
-- policy; the trigger above creates the rows.
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "read own profile"   on public.profiles;
drop policy if exists "update own profile" on public.profiles;

create policy "read own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
