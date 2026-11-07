-- College Football Universe — core schema
-- Normalized tables for users, roles, teams, conferences, seasons, schedules,
-- games, plays, players, statistics, recruits, recruiting actions, commitments,
-- rankings, articles, rivalries, awards and historical records.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type app_role as enum ('commissioner', 'owner', 'viewer');
create type staff_role as enum ('owner', 'assistant');
create type season_phase as enum ('preseason', 'regular', 'conference_championships', 'playoffs', 'offseason', 'archived');
create type game_status as enum ('scheduled', 'final');
create type game_type as enum ('regular', 'conference_championship', 'playoff', 'bowl', 'exhibition');
create type sim_mode as enum ('quick', 'detailed', 'live', 'manual');
create type player_status as enum ('active', 'graduated', 'transferred', 'portal', 'departed');
create type recruit_status as enum ('uncommitted', 'committed', 'signed', 'withdrawn');
create type recruiting_action_type as enum ('scout', 'contact', 'offer', 'visit', 'pitch', 'pull_offer');
create type recruiting_action_status as enum ('pending', 'approved', 'rejected', 'processed');
create type commitment_event as enum ('commit', 'decommit', 'flip', 'signed');
create type poll_type as enum ('coaches', 'media', 'computer', 'playoff');
create type article_status as enum ('draft', 'published');
create type article_category as enum (
  'breaking_news', 'rivalry', 'coaching_controversy', 'recruiting_battle', 'player_bio',
  'championship_history', 'team_tradition', 'program_rebuild', 'legendary_performance',
  'historical_event', 'power_rankings', 'playoff_predictions', 'transfer_announcement',
  'press_conference', 'announcement', 'league_news'
);
create type timeline_kind as enum ('official', 'lore');

-- ---------------------------------------------------------------------------
-- Users & roles
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'New Coach',
  role app_role not null default 'viewer',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Universe-wide configuration (single row, id = 1)
create table universe_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'College Football Universe',
  current_season_id uuid,
  allow_assistant_coaches boolean not null default true,
  allow_owner_lore boolean not null default true,
  comments_enabled boolean not null default true,
  sim_settings jsonb not null default '{
    "upsetFrequency": 50, "offensiveExplosiveness": 50, "defensiveEffectiveness": 50,
    "turnoverFrequency": 50, "homeFieldAdvantage": 50, "injuryFrequency": 50,
    "penaltyFrequency": 50, "randomness": 50
  }'::jsonb,
  recruiting_rules jsonb not null default '{
    "weeklyPoints": 100, "scholarshipLimit": 25, "maxActiveOffers": 35,
    "costs": {"scout": 5, "contact": 10, "offer": 0, "visit": 25, "pitch": 15, "pull_offer": 0},
    "maxVisitsPerWeek": 4, "requireApproval": false, "signingDayWeek": 16,
    "commitThreshold": 64, "flipMargin": 16, "rosterLimit": 85
  }'::jsonb,
  updated_at timestamptz not null default now()
);
insert into universe_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Conferences & teams
-- ---------------------------------------------------------------------------
create table conferences (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text not null,
  logo_url text,
  conference_games int not null default 8 check (conference_games between 0 and 13),
  is_custom boolean not null default false,
  created_at timestamptz not null default now()
);

create table divisions (
  id uuid primary key default gen_random_uuid(),
  conference_id uuid not null references conferences (id) on delete cascade,
  name text not null,
  unique (conference_id, name)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  school text not null,
  mascot text not null,
  abbreviation text not null,
  logo_url text,
  espn_id int,
  primary_color text not null default '#333333' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#ffffff' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  conference_id uuid references conferences (id) on delete set null,
  division_id uuid references divisions (id) on delete set null,
  city text,
  state text,
  latitude double precision,
  longitude double precision,
  stadium text,
  stadium_capacity int check (stadium_capacity is null or stadium_capacity >= 0),
  home_field_rating int not null default 50 check (home_field_rating between 0 and 100),
  prestige int not null default 50 check (prestige between 1 and 100),
  coach_name text,
  coach_rating int not null default 60 check (coach_rating between 1 and 99),
  offense_scheme text not null default 'spread',
  defense_scheme text not null default '4-3',
  overall_rating int not null default 60,
  offense_rating int not null default 60,
  defense_rating int not null default 60,
  is_custom boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index teams_conference_idx on teams (conference_id);

create table team_staff (
  team_id uuid not null references teams (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role staff_role not null,
  assigned_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
-- One primary owner per team, and a user may be primary owner of only one team.
create unique index team_staff_one_owner_per_team on team_staff (team_id) where role = 'owner';
create unique index team_staff_one_team_per_owner on team_staff (user_id) where role = 'owner';

create table follows (
  user_id uuid not null references profiles (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

create table rivalries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team_a_id uuid not null references teams (id) on delete cascade,
  team_b_id uuid not null references teams (id) on delete cascade,
  trophy text,
  description text,
  annual boolean not null default true,
  check (team_a_id <> team_b_id)
);
create unique index rivalries_pair_idx on rivalries (least(team_a_id, team_b_id), greatest(team_a_id, team_b_id));

create table tv_networks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text not null,
  logo_url text,
  tier int not null default 2 check (tier between 1 and 4)
);

-- ---------------------------------------------------------------------------
-- Seasons, membership and schedule
-- ---------------------------------------------------------------------------
create table seasons (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  name text not null,
  phase season_phase not null default 'preseason',
  current_week int not null default 0,
  regular_season_weeks int not null default 13 check (regular_season_weeks between 1 and 20),
  playoff_size int not null default 12 check (playoff_size in (4, 8, 12, 16)),
  playoff_auto_bids int not null default 5 check (playoff_auto_bids between 0 and 16),
  is_demo boolean not null default false,
  champion_team_id uuid references teams (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (year, is_demo)
);
alter table universe_settings add constraint universe_current_season_fk
  foreign key (current_season_id) references seasons (id) on delete set null;

-- Conference membership per season so history stays accurate after realignment
create table team_seasons (
  season_id uuid not null references seasons (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  conference_id uuid references conferences (id) on delete set null,
  division_id uuid references divisions (id) on delete set null,
  preseason_overall int,
  -- final snapshot written when a season is archived
  final_wins int,
  final_losses int,
  final_conf_wins int,
  final_conf_losses int,
  final_rank int,
  conference_champion boolean not null default false,
  national_champion boolean not null default false,
  primary key (season_id, team_id)
);

create table games (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  week int not null check (week >= 0),
  home_team_id uuid not null references teams (id),
  away_team_id uuid not null references teams (id),
  game_type game_type not null default 'regular',
  is_conference_game boolean not null default false,
  conference_id uuid references conferences (id),
  is_rivalry boolean not null default false,
  rivalry_id uuid references rivalries (id) on delete set null,
  neutral_site boolean not null default false,
  site_name text,
  kickoff_at timestamptz,
  tv_network_id uuid references tv_networks (id) on delete set null,
  is_game_of_week boolean not null default false,
  playoff_round int,
  bracket_slot int,
  status game_status not null default 'scheduled',
  home_score int check (home_score is null or home_score >= 0),
  away_score int check (away_score is null or away_score >= 0),
  home_quarters int[],
  away_quarters int[],
  overtimes int not null default 0,
  winner_team_id uuid references teams (id),
  sim_mode sim_mode,
  sim_seed text,
  sim_settings jsonb,
  summary jsonb,
  finalized_at timestamptz,
  finalized_by uuid references profiles (id),
  version int not null default 0,
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (home_team_id <> away_team_id),
  check (status <> 'final' or (home_score is not null and away_score is not null and home_score <> away_score))
);
create index games_season_week_idx on games (season_id, week);
create index games_home_idx on games (home_team_id);
create index games_away_idx on games (away_team_id);

create table game_drives (
  game_id uuid not null references games (id) on delete cascade,
  drive_no int not null,
  team_id uuid not null references teams (id),
  quarter int not null,
  start_clock int not null,
  start_yard int not null,
  plays int not null,
  yards int not null,
  duration_seconds int not null,
  result text not null,
  points int not null default 0,
  primary key (game_id, drive_no)
);

create table game_plays (
  game_id uuid not null references games (id) on delete cascade,
  seq int not null,
  drive_no int not null,
  quarter int not null,
  clock int not null,
  offense_team_id uuid not null references teams (id),
  down int,
  distance int,
  yard_line int,
  play_type text not null,
  yards int not null default 0,
  description text not null,
  home_score int not null,
  away_score int not null,
  is_scoring boolean not null default false,
  is_turnover boolean not null default false,
  home_win_prob real not null,
  stat_deltas jsonb,
  primary key (game_id, seq)
);

create table team_game_stats (
  game_id uuid not null references games (id) on delete cascade,
  team_id uuid not null references teams (id),
  points int not null,
  first_downs int not null default 0,
  total_yards int not null default 0,
  pass_yards int not null default 0,
  rush_yards int not null default 0,
  pass_att int not null default 0,
  pass_cmp int not null default 0,
  rush_att int not null default 0,
  turnovers int not null default 0,
  penalties int not null default 0,
  penalty_yards int not null default 0,
  third_down_conv int not null default 0,
  third_down_att int not null default 0,
  sacks int not null default 0,
  time_of_possession int not null default 0,
  primary key (game_id, team_id)
);

-- ---------------------------------------------------------------------------
-- Players
-- ---------------------------------------------------------------------------
create table players (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  position text not null,
  team_id uuid references teams (id) on delete set null,
  jersey int check (jersey is null or jersey between 0 and 99),
  height_in int,
  weight int,
  hometown text,
  home_state text,
  seasons_played int not null default 0 check (seasons_played between 0 and 6),
  years_in_program int not null default 0,
  redshirt_used boolean not null default false,
  redshirt_this_season boolean not null default false,
  stars int not null default 2 check (stars between 1 and 5),
  overall int not null check (overall between 1 and 99),
  potential int not null check (potential between 1 and 99),
  attributes jsonb not null default '{}'::jsonb,
  dev_trait text not null default 'normal',
  status player_status not null default 'active',
  injury_type text,
  injury_weeks int not null default 0,
  recruit_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index players_team_idx on players (team_id) where status = 'active';
create index players_name_idx on players (lower(last_name), lower(first_name));

create table depth_chart (
  team_id uuid not null references teams (id) on delete cascade,
  slot text not null,
  depth int not null check (depth between 1 and 12),
  player_id uuid not null references players (id) on delete cascade,
  primary key (team_id, slot, depth),
  unique (team_id, slot, player_id)
);

create table player_game_stats (
  game_id uuid not null references games (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  team_id uuid not null references teams (id),
  pass_att int not null default 0, pass_cmp int not null default 0, pass_yds int not null default 0,
  pass_td int not null default 0, pass_int int not null default 0,
  rush_att int not null default 0, rush_yds int not null default 0, rush_td int not null default 0,
  rec int not null default 0, rec_yds int not null default 0, rec_td int not null default 0,
  tackles int not null default 0, sacks numeric(4,1) not null default 0, tfl int not null default 0,
  def_int int not null default 0, forced_fumbles int not null default 0,
  fgm int not null default 0, fga int not null default 0, xpm int not null default 0, xpa int not null default 0,
  punts int not null default 0, punt_yds int not null default 0,
  kr int not null default 0, kr_yds int not null default 0, pr int not null default 0, pr_yds int not null default 0,
  primary key (game_id, player_id)
);
create index pgs_player_idx on player_game_stats (player_id);

create table player_transfers (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  season_id uuid references seasons (id) on delete set null,
  from_team_id uuid references teams (id),
  to_team_id uuid references teams (id),
  created_at timestamptz not null default now()
);

create table player_development_log (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  season_id uuid references seasons (id) on delete set null,
  old_overall int not null,
  new_overall int not null,
  note text,
  created_at timestamptz not null default now()
);

create table awards (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references seasons (id) on delete cascade,
  name text not null,
  player_id uuid references players (id) on delete set null,
  team_id uuid references teams (id) on delete set null,
  description text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Recruiting & transfer portal
-- ---------------------------------------------------------------------------
create table recruits (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  position text not null,
  hometown text not null,
  home_state text not null,
  latitude double precision,
  longitude double precision,
  height_in int not null,
  weight int not null,
  class_year int not null,
  stars int not null check (stars between 1 and 5),
  national_rank int,
  state_rank int,
  position_rank int,
  overall int not null check (overall between 1 and 99),
  potential int not null check (potential between 1 and 99),
  attributes jsonb not null default '{}'::jsonb,
  preferred_scheme text,
  priorities jsonb not null,
  status recruit_status not null default 'uncommitted',
  committed_team_id uuid references teams (id),
  committed_week int,
  signed_team_id uuid references teams (id),
  is_transfer boolean not null default false,
  source_player_id uuid references players (id) on delete set null,
  from_team_id uuid references teams (id),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (status <> 'committed' or committed_team_id is not null),
  check (status <> 'signed' or signed_team_id is not null)
);
create index recruits_season_idx on recruits (season_id, status);
alter table players add constraint players_recruit_fk foreign key (recruit_id) references recruits (id) on delete set null;

create table recruit_interest (
  recruit_id uuid not null references recruits (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  interest real not null default 0 check (interest between 0 and 100),
  relationship real not null default 0 check (relationship between 0 and 100),
  scouted boolean not null default false,
  offered boolean not null default false,
  offered_week int,
  visited boolean not null default false,
  visit_week int,
  pitches int not null default 0,
  last_action_week int,
  primary key (recruit_id, team_id)
);
create index recruit_interest_team_idx on recruit_interest (team_id);

create table recruiting_budgets (
  season_id uuid not null references seasons (id) on delete cascade,
  week int not null,
  team_id uuid not null references teams (id) on delete cascade,
  points_total int not null,
  points_spent int not null default 0 check (points_spent >= 0),
  check (points_spent <= points_total),
  primary key (season_id, week, team_id)
);

create table recruiting_actions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  week int not null,
  team_id uuid not null references teams (id) on delete cascade,
  recruit_id uuid not null references recruits (id) on delete cascade,
  action_type recruiting_action_type not null,
  pitch_angle text,
  points int not null check (points >= 0),
  status recruiting_action_status not null default 'pending',
  is_ai boolean not null default false,
  created_by uuid references profiles (id),
  reviewed_by uuid references profiles (id),
  result_note text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index recruiting_actions_week_idx on recruiting_actions (season_id, week, status);
-- one action of each type per team/recruit/week prevents double-submits
create unique index recruiting_actions_once_per_week on recruiting_actions (season_id, week, team_id, recruit_id, action_type)
  where status <> 'rejected';

create table commitments (
  id uuid primary key default gen_random_uuid(),
  recruit_id uuid not null references recruits (id) on delete cascade,
  team_id uuid not null references teams (id),
  previous_team_id uuid references teams (id),
  season_id uuid not null references seasons (id) on delete cascade,
  week int not null,
  event commitment_event not null,
  created_at timestamptz not null default now()
);
create index commitments_recruit_idx on commitments (recruit_id, created_at desc);
-- a recruit can only sign once
create unique index commitments_single_signing on commitments (recruit_id) where event = 'signed';

-- ---------------------------------------------------------------------------
-- Rankings, playoffs, championships
-- ---------------------------------------------------------------------------
create table rankings (
  season_id uuid not null references seasons (id) on delete cascade,
  week int not null,
  poll poll_type not null,
  rank int not null check (rank between 1 and 25),
  team_id uuid not null references teams (id) on delete cascade,
  points int not null default 0,
  first_place_votes int not null default 0,
  previous_rank int,
  record text,
  score real,
  breakdown jsonb,
  is_manual boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (season_id, week, poll, rank),
  unique (season_id, week, poll, team_id)
);

create table playoff_brackets (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null unique references seasons (id) on delete cascade,
  size int not null check (size in (4, 8, 12, 16)),
  auto_bids int not null,
  created_at timestamptz not null default now()
);

create table playoff_seeds (
  bracket_id uuid not null references playoff_brackets (id) on delete cascade,
  seed int not null,
  team_id uuid not null references teams (id),
  bid_type text not null check (bid_type in ('auto', 'at_large')),
  conference_id uuid references conferences (id),
  primary key (bracket_id, seed),
  unique (bracket_id, team_id)
);

create table championships (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  kind text not null check (kind in ('national', 'conference')),
  conference_id uuid references conferences (id),
  team_id uuid not null references teams (id),
  game_id uuid references games (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index championships_unique on championships (season_id, kind, coalesce(conference_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------------
-- Lore & news (fiction — never alters official records)
-- ---------------------------------------------------------------------------
create table articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  headline text not null,
  subheadline text,
  cover_image_url text,
  body_html text not null default '',
  category article_category not null default 'league_news',
  tags text[] not null default '{}',
  author_id uuid references profiles (id) on delete set null,
  team_id uuid references teams (id) on delete set null,
  status article_status not null default 'draft',
  is_official boolean not null default false,
  is_featured boolean not null default false,
  is_breaking boolean not null default false,
  comments_enabled boolean not null default true,
  is_demo boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index articles_published_idx on articles (status, published_at desc);

create table article_teams (article_id uuid references articles (id) on delete cascade, team_id uuid references teams (id) on delete cascade, primary key (article_id, team_id));
create table article_players (article_id uuid references articles (id) on delete cascade, player_id uuid references players (id) on delete cascade, primary key (article_id, player_id));
create table article_games (article_id uuid references articles (id) on delete cascade, game_id uuid references games (id) on delete cascade, primary key (article_id, game_id));

create table comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table team_timeline_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  year int not null,
  title text not null,
  description text,
  kind timeline_kind not null,
  article_id uuid references articles (id) on delete set null,
  game_id uuid references games (id) on delete set null,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index timeline_team_idx on team_timeline_events (team_id, year desc);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on audit_log (created_at desc);
