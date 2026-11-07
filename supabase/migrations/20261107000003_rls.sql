-- Row-level security.
--
-- The Next.js server performs all official writes through a privileged
-- Postgres connection inside transactions, after checking the caller's role
-- (see src/lib/auth/permissions.ts). These policies are defense in depth for
-- anyone talking to the Supabase REST API directly with the public anon key:
-- official data is read-only, private recruiting data is visible only to the
-- owning staff and the commissioner, and nobody can write official records.

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','universe_settings','conferences','divisions','teams','team_staff','follows','rivalries',
    'tv_networks','seasons','team_seasons','games','game_drives','game_plays','team_game_stats','players',
    'depth_chart','player_game_stats','player_transfers','player_development_log','awards','recruits',
    'recruit_interest','recruiting_budgets','recruiting_actions','commitments','rankings','playoff_brackets',
    'playoff_seeds','championships','articles','article_teams','article_players','article_games','comments',
    'team_timeline_events','audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Public, read-only official data
do $$
declare t text;
begin
  foreach t in array array[
    'conferences','divisions','teams','team_staff','rivalries','tv_networks','seasons','team_seasons','games',
    'game_drives','game_plays','team_game_stats','players','depth_chart','player_game_stats','player_transfers',
    'player_development_log','awards','recruits','commitments','rankings','playoff_brackets','playoff_seeds',
    'championships','article_teams','article_players','article_games','team_timeline_events','universe_settings'
  ] loop
    execute format('create policy "public read" on public.%I for select using (true)', t);
  end loop;
end $$;

-- Profiles: everyone can see display names; a user may edit only their own
-- display name / avatar. The role column is not updatable through the API.
create policy "profiles readable" on profiles for select using (true);
create policy "profiles self update" on profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on profiles from anon, authenticated;
grant update (display_name, avatar_url) on profiles to authenticated;

-- Follows: own rows only
create policy "follows read own" on follows for select using (user_id = auth.uid());
create policy "follows insert own" on follows for insert with check (user_id = auth.uid());
create policy "follows delete own" on follows for delete using (user_id = auth.uid());

-- Recruiting secrecy: interest, budgets and actions belong to the team staff
create policy "interest staff read" on recruit_interest for select using (public.is_team_staff(team_id) or public.is_commissioner());
create policy "budgets staff read" on recruiting_budgets for select using (public.is_team_staff(team_id) or public.is_commissioner());
create policy "actions staff read" on recruiting_actions for select using (public.is_team_staff(team_id) or public.is_commissioner());

-- Articles: published are public; drafts visible to author and commissioner
create policy "articles read" on articles for select
  using (status = 'published' or author_id = auth.uid() or public.is_commissioner());

-- Comments: public read, authenticated users comment as themselves
create policy "comments read" on comments for select using (true);
create policy "comments insert own" on comments for insert
  with check (user_id = auth.uid() and exists (
    select 1 from articles a, universe_settings u
    where a.id = article_id and a.status = 'published' and a.comments_enabled and u.comments_enabled));
create policy "comments delete own" on comments for delete using (user_id = auth.uid() or public.is_commissioner());

-- Audit log: commissioner only
create policy "audit commissioner read" on audit_log for select using (public.is_commissioner());

-- ---------------------------------------------------------------------------
-- Storage bucket for logos and article images (Supabase only)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('media', 'media', true)
    on conflict (id) do nothing;
  end if;
end $$;
