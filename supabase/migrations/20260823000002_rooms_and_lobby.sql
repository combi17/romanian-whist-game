-- ============================================================================
-- 0002: rooms and lobby
-- ============================================================================

create table if not exists public.rooms (
  id            bigint primary key,           -- the 6-digit room code
  is_active     boolean not null default true,
  is_full       boolean not null default false,
  player_count  integer not null default 0,
  created_by    uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now()
);

create table if not exists public.room_players (
  id           bigint generated always as identity primary key,
  room_id      bigint not null references public.rooms (id) on delete cascade,
  user_id      uuid   not null references auth.users (id) on delete cascade,
  seat_number  integer not null check (seat_number between 1 and 6),
  username     text,
  avatar_url   text,
  joined_at    timestamptz not null default now(),

  -- you cannot sit twice, and two people cannot share a seat
  unique (room_id, user_id),
  unique (room_id, seat_number)
);

create index if not exists room_players_room_id_idx on public.room_players (room_id);


-- ----------------------------------------------------------------------------
-- RLS. The update and join policies are tightened in 0008.
-- ----------------------------------------------------------------------------
alter table public.rooms        enable row level security;
alter table public.room_players enable row level security;

drop policy if exists "read rooms"        on public.rooms;
drop policy if exists "create rooms"      on public.rooms;
drop policy if exists "update rooms"      on public.rooms;
drop policy if exists "read room players" on public.room_players;
drop policy if exists "join as self"      on public.room_players;
drop policy if exists "leave as self"     on public.room_players;

-- you must be able to look a room up by code before you are in it
create policy "read rooms"
  on public.rooms for select
  to authenticated
  using (true);

create policy "create rooms"
  on public.rooms for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "update rooms"
  on public.rooms for update
  to authenticated
  using (true)
  with check (true);

create policy "read room players"
  on public.room_players for select
  to authenticated
  using (true);

create policy "join as self"
  on public.room_players for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "leave as self"
  on public.room_players for delete
  to authenticated
  using (auth.uid() = user_id);


-- Realtime, for the lobby.
alter publication supabase_realtime add table public.room_players;
alter publication supabase_realtime add table public.rooms;
