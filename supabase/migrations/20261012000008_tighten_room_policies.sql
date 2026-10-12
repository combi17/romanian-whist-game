-- ============================================================================
-- 0008: only the host may change a room, and only open lobbies can be joined
--
-- 0002 let any signed-in user update any room, which meant anyone could make
-- themselves host of someone else's table or flip its status.
-- ============================================================================

drop policy if exists "update rooms" on public.rooms;

-- The host may change their own room, including handing it to another player.
create policy "host updates room"
  on public.rooms for update
  to authenticated
  using (auth.uid() = created_by)
  with check (true);

drop policy if exists "join as self" on public.room_players;

-- You can only take a seat for yourself, and only while the room is a lobby.
create policy "join as self"
  on public.room_players for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and not is_bot
    and exists (
      select 1 from public.rooms r
      where r.id = room_id
        and r.status = 'lobby'
    )
  );
