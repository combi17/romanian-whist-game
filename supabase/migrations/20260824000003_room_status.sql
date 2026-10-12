-- ============================================================================
-- 0003: room status and the blind-rounds setting
-- ============================================================================

-- 'lobby'    open, people can still join
-- 'playing'  the host has started; no new players
-- 'finished' the game is over
alter table public.rooms
  add column if not exists status text not null default 'lobby';

alter table public.rooms
  drop constraint if exists rooms_status_check;

alter table public.rooms
  add constraint rooms_status_check
  check (status in ('lobby', 'playing', 'finished'));

-- Whether 1-card rounds are played blind. Set by the host before the game starts.
alter table public.rooms
  add column if not exists blind_one_card boolean not null default false;

-- Existing rooms predate the column and were all open lobbies.
update public.rooms set status = 'lobby' where status is null;

create index if not exists rooms_status_idx on public.rooms (status);
