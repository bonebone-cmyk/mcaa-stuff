-- Derived views: standings & statistics are always computed from official
-- final game results, so results automatically flow into standings/leaderboards.

-- One row per team per official final game
create view team_game_results as
select g.id as game_id, g.season_id, g.week, g.game_type, g.is_conference_game,
       g.home_team_id as team_id, g.away_team_id as opponent_id, true as is_home, g.neutral_site,
       g.home_score as points_for, g.away_score as points_against,
       (g.home_score > g.away_score) as won
from games g
where g.status = 'final' and g.game_type <> 'exhibition'
union all
select g.id, g.season_id, g.week, g.game_type, g.is_conference_game,
       g.away_team_id, g.home_team_id, false, g.neutral_site,
       g.away_score, g.home_score, (g.away_score > g.home_score)
from games g
where g.status = 'final' and g.game_type <> 'exhibition';

create view team_records as
select season_id, team_id,
  count(*) filter (where won) as wins,
  count(*) filter (where not won) as losses,
  count(*) filter (where won and is_conference_game and game_type = 'regular') as conf_wins,
  count(*) filter (where not won and is_conference_game and game_type = 'regular') as conf_losses,
  count(*) filter (where won and is_home and not neutral_site) as home_wins,
  count(*) filter (where not won and is_home and not neutral_site) as home_losses,
  count(*) filter (where won and not is_home and not neutral_site) as away_wins,
  count(*) filter (where not won and not is_home and not neutral_site) as away_losses,
  coalesce(sum(points_for), 0) as points_for,
  coalesce(sum(points_against), 0) as points_against
from team_game_results
group by season_id, team_id;

-- Season aggregates of individual statistics (official games only)
create view player_season_stats as
select g.season_id, s.player_id, s.team_id,
  count(*) as games,
  sum(pass_att) as pass_att, sum(pass_cmp) as pass_cmp, sum(pass_yds) as pass_yds,
  sum(pass_td) as pass_td, sum(pass_int) as pass_int,
  sum(rush_att) as rush_att, sum(rush_yds) as rush_yds, sum(rush_td) as rush_td,
  sum(rec) as rec, sum(rec_yds) as rec_yds, sum(rec_td) as rec_td,
  sum(tackles) as tackles, sum(sacks) as sacks, sum(tfl) as tfl,
  sum(def_int) as def_int, sum(forced_fumbles) as forced_fumbles,
  sum(fgm) as fgm, sum(fga) as fga, sum(xpm) as xpm, sum(xpa) as xpa,
  sum(punts) as punts, sum(punt_yds) as punt_yds,
  sum(kr) as kr, sum(kr_yds) as kr_yds, sum(pr) as pr, sum(pr_yds) as pr_yds
from player_game_stats s
join games g on g.id = s.game_id
where g.status = 'final' and g.game_type <> 'exhibition'
group by g.season_id, s.player_id, s.team_id;

create view team_season_stats as
select g.season_id, t.team_id,
  count(*) as games,
  sum(t.points) as points, sum(t.total_yards) as total_yards, sum(t.pass_yards) as pass_yards,
  sum(t.rush_yards) as rush_yards, sum(t.turnovers) as turnovers, sum(t.first_downs) as first_downs,
  sum(o.points) as points_allowed, sum(o.total_yards) as yards_allowed, sum(o.turnovers) as takeaways,
  sum(t.sacks) as sacks, sum(t.penalties) as penalties
from team_game_stats t
join games g on g.id = t.game_id
join team_game_stats o on o.game_id = t.game_id and o.team_id <> t.team_id
where g.status = 'final' and g.game_type <> 'exhibition'
group by g.season_id, t.team_id;

-- ---------------------------------------------------------------------------
-- Profile bootstrap: every new auth user gets a viewer profile
-- ---------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- helper used by RLS
create function public.is_commissioner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'commissioner');
$$;

create function public.is_team_staff(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_staff where team_id = t and user_id = auth.uid());
$$;
