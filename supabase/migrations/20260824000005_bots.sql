-- ============================================================================
-- 0005: bots
--
-- A seat can hold a person or a bot. Only the `game` Edge Function adds bots;
-- there's no client policy for it.
-- ============================================================================

-- A bot has no auth.users row to point at.
alter table public.room_players
  alter column user_id drop not null;

alter table public.room_players
  add column if not exists is_bot boolean not null default false;

-- A seat is either a person or a bot, never both and never neither.
alter table public.room_players
  drop constraint if exists room_players_occupant_check;

alter table public.room_players
  add constraint room_players_occupant_check
  check ((is_bot and user_id is null) or (not is_bot and user_id is not null));

-- unique (room_id, user_id) still holds for people. NULLs are distinct, so a
-- room can have several bots.

create index if not exists room_players_bot_idx
  on public.room_players (room_id)
  where is_bot;
