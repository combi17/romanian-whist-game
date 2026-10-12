-- ============================================================================
-- 0006: presence
--
-- A bot plays a seat if the seat is a bot or its player hasn't been seen for
-- 15 seconds. When the player's heartbeat resumes, they get the seat back.
-- ============================================================================

alter table public.room_players
  add column if not exists last_seen timestamptz not null default now();

create index if not exists room_players_last_seen_idx
  on public.room_players (room_id, last_seen);

-- ----------------------------------------------------------------------------
-- The heartbeat. A function instead of an update policy, so a player can
-- touch only last_seen on their own row and never their seat_number.
-- ----------------------------------------------------------------------------
create or replace function public.heartbeat(room bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.room_players
     set last_seen = now()
   where room_id = room
     and user_id = auth.uid();
$$;

grant execute on function public.heartbeat(bigint) to authenticated;

comment on column public.room_players.last_seen is
  'Updated every few seconds by the player''s own client via heartbeat(). A seat whose last_seen is older than 15s is played by a bot until its owner returns.';
