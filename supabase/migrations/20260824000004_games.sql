-- ============================================================================
-- 0004: online games
--
--   games.state  public state: turn, bids, tricks, scores, trump and hand
--                sizes. Readable by everyone seated at the table.
--
--   hands        the cards, one row per seat per round, readable only by
--                the player in that seat.
--
-- Clients can't write to either table. Every write goes through the `game`
-- Edge Function with the service role.
-- ============================================================================

create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  room_id     bigint not null references public.rooms (id) on delete cascade,

  -- user ids indexed by engine seat (0-based), fixed when the game starts.
  -- room_players.seat_number is 1-based and can have gaps.
  seats       jsonb not null,

  state       jsonb not null,
  version     integer not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- one live game per room; starting again replaces it
create unique index if not exists games_room_id_key on public.games (room_id);

create table if not exists public.hands (
  game_id      uuid not null references public.games (id) on delete cascade,
  round_index  integer not null,
  seat         integer not null,
  cards        jsonb not null,
  primary key (game_id, round_index, seat)
);

-- ----------------------------------------------------------------------------
-- Which engine seat a user occupies in a given game, or null.
-- ----------------------------------------------------------------------------
create or replace function public.engine_seat(seats jsonb, uid uuid)
returns integer
language sql
immutable
as $$
  select (idx - 1)::integer
  from jsonb_array_elements_text(seats) with ordinality as t(value, idx)
  where t.value = uid::text
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- RLS: read-only for clients. No write policies exist.
-- ----------------------------------------------------------------------------
alter table public.games enable row level security;
alter table public.hands enable row level security;

drop policy if exists "read games you are seated in" on public.games;
drop policy if exists "read only hands you may see"  on public.hands;

create policy "read games you are seated in"
  on public.games for select
  to authenticated
  using (seats ? auth.uid()::text);

-- Normally you can read only your own hand. In a blind round it's reversed:
-- every hand except yours, since your card is on your forehead. Enforcing it
-- here keeps the card out of the network tab.
create policy "read only hands you may see"
  on public.hands for select
  to authenticated
  using (
    exists (
      select 1
      from public.games g
      where g.id = hands.game_id
        and g.seats ? auth.uid()::text
        and case
              when coalesce((g.state -> 'isBlindRound')::boolean, false)
                then hands.seat <> public.engine_seat(g.seats, auth.uid())
              else hands.seat = public.engine_seat(g.seats, auth.uid())
            end
    )
  );

-- ----------------------------------------------------------------------------
-- Realtime publishes games only. Clients read their hands with a normal
-- RLS-checked select when the game changes.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
end $$;
