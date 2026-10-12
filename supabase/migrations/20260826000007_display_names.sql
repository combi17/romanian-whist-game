-- ============================================================================
-- 0007: keep spaces in display names
--
-- handle_new_user() stripped everything outside [a-zA-Z0-9_], so "Ana Maria"
-- became "AnaMaria". It now keeps spaces, hyphens, apostrophes and full stops.
--
-- Existing rows are repaired only when the stored username is exactly the
-- provider's full_name with the spaces removed. Chosen usernames are untouched.
-- ============================================================================

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

  -- Keep the characters that appear in names.
  base_username := regexp_replace(base_username, '[^a-zA-Z0-9_ ''.-]', '', 'g');
  base_username := btrim(regexp_replace(base_username, '\s+', ' ', 'g'));
  if base_username = '' then
    base_username := 'player';
  end if;
  base_username := btrim(left(base_username, 20));

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

-- ----------------------------------------------------------------------------
-- Repair existing rows, only on an exact match and only when the spaced name
-- isn't taken.
-- ----------------------------------------------------------------------------
update public.profiles p
set username = fixed.name
from (
  select
    u.id,
    btrim(regexp_replace(
      regexp_replace(
        coalesce(
          nullif(u.raw_user_meta_data ->> 'full_name', ''),
          nullif(u.raw_user_meta_data ->> 'name',      '')
        ),
        '[^a-zA-Z0-9_ ''.-]', '', 'g'
      ),
      '\s+', ' ', 'g'
    )) as name
  from auth.users u
) as fixed
where p.id = fixed.id
  and fixed.name is not null
  and fixed.name <> ''
  and fixed.name ~ '\s'
  and p.username = regexp_replace(fixed.name, '[^a-zA-Z0-9_]', '', 'g')
  and not exists (
    select 1 from public.profiles other
    where other.id <> p.id
      and lower(other.username) = lower(fixed.name)
  );
