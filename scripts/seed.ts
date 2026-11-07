/**
 * Seeds the universe.
 *
 *   npm run db:seed                 base data + DEMO season (6 simulated weeks)
 *   npm run db:seed -- --weeks 3    simulate a different number of demo weeks
 *   npm run db:seed -- --base-only  conferences/teams/rivalries/networks only (no demo data)
 *   npm run db:reset-demo           delete all demo data, then re-seed the demo
 *
 * Base data (the 138 programs, conferences, rivalries, TV networks) is the
 * starting dataset of the official universe. Everything else created here —
 * the season, players, recruits, results and articles — is flagged is_demo and
 * shown with a DEMO badge; the commissioner can purge it in one click.
 */
import { createSql, insertMany } from '../src/lib/db';
import { CONFERENCES, RIVALRIES, TEAMS, TV_NETWORKS, conferenceLogo, teamLogo } from '../src/lib/data/teams';
import { createRng } from '../src/lib/rng';
import { randomName } from '../src/lib/players/generate';
import { generateRoster, refreshTeamRatings } from '../src/lib/services/teams';
import { advanceWeek, createSeason, generateSeasonSchedule, purgeDemoData, simulateWeek } from '../src/lib/services/seasons';
import { generateClass } from '../src/lib/services/recruiting';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const sql = createSql(url, { max: 4 });
  const t0 = Date.now();
  const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
  try {
    if (process.argv.includes('--reset')) {
      await purgeDemoData(sql, null as unknown as string);
      log('demo data purged');
    }
    // ---------------------------------------------------------- base data
    for (const c of CONFERENCES) {
      await sql`insert into conferences (slug, name, short_name, conference_games, logo_url)
                values (${c.slug}, ${c.name}, ${c.shortName}, ${c.conferenceGames}, ${conferenceLogo(c.espnId)})
                on conflict (slug) do nothing`;
    }
    const confIds = new Map((await sql`select id, slug from conferences`).map((c) => [c.slug as string, c.id as string]));
    const rng = createRng('coaches');
    for (const t of TEAMS) {
      const coach = randomName(rng);
      await sql`insert into teams (slug, school, mascot, abbreviation, logo_url, espn_id, primary_color, secondary_color, conference_id,
                  city, state, latitude, longitude, stadium, stadium_capacity, home_field_rating, prestige, coach_name, coach_rating,
                  offense_scheme, defense_scheme)
                values (${t.slug}, ${t.school}, ${t.mascot}, ${t.abbreviation}, ${teamLogo(t.espnId)}, ${t.espnId}, ${t.primaryColor},
                  ${t.secondaryColor}, ${confIds.get(t.conference) ?? null}, ${t.city}, ${t.state}, ${t.latitude}, ${t.longitude}, ${t.stadium},
                  ${t.capacity}, ${Math.round(Math.min(95, 35 + t.capacity / 2500 + t.prestige / 5))}, ${t.prestige},
                  ${`${coach.firstName} ${coach.lastName}`}, ${Math.round(Math.min(95, 45 + t.prestige * 0.45 + rng.range(-6, 6)))},
                  ${t.offenseScheme ?? rng.pick(['spread', 'spread', 'pro_style', 'rpo', 'west_coast'])}, ${t.defenseScheme ?? rng.pick(['4-3', '4-3', '3-4', '4-2-5'])})
                on conflict (slug) do nothing`;
    }
    const teams = await sql`select id, slug, prestige, state from teams`;
    const teamIds = new Map(teams.map((t) => [t.slug as string, t.id as string]));
    for (const r of RIVALRIES) {
      await sql`insert into rivalries (name, team_a_id, team_b_id, trophy) values (${r.name}, ${teamIds.get(r.a)!}, ${teamIds.get(r.b)!}, ${r.trophy ?? null})
                on conflict do nothing`;
    }
    for (const n of TV_NETWORKS) {
      await sql`insert into tv_networks (name, short_name, tier) values (${n.name}, ${n.shortName}, ${n.tier}) on conflict (name) do nothing`;
    }
    log(`base data: ${CONFERENCES.length} conferences, ${teams.length} teams, ${RIVALRIES.length} rivalries`);
    if (process.argv.includes('--base-only')) return;

    // ---------------------------------------------------------- demo rosters
    const [{ n: playerCount }] = await sql`select count(*)::int as n from players`;
    if (playerCount === 0) {
      for (const t of teams) await generateRoster(sql, { id: t.id, prestige: t.prestige, state: t.state }, { isDemo: true, seed: 'demo' });
      await refreshTeamRatings(sql);
      log('demo rosters generated');
    }

    // ---------------------------------------------------------- demo season
    const existing = await sql`select id from seasons where is_demo limit 1`;
    if (existing.length) {
      log('demo season already exists — use --reset to rebuild it');
      return;
    }
    const season = await createSeason(sql, { year: 2026, name: '2026 Demo Season', isDemo: true }, null);
    await generateSeasonSchedule(sql, season.id, null);
    log('schedule generated');
    await generateClass(sql, season.id, 2000, true);
    log('recruiting class of 2027 generated');
    await advanceWeek(sql, season.id, null); // preseason polls → week 1
    const weeks = Number(arg('--weeks') ?? 6);
    for (let w = 1; w <= weeks; w++) {
      await simulateWeek(sql, season.id, w, 'detailed', null);
      await advanceWeek(sql, season.id, null);
      log(`week ${w} simulated, recruiting processed, polls published`);
    }

    // ---------------------------------------------------------- demo lore
    const top = await sql`select t.id, t.school, t.mascot from rankings r join teams t on t.id = r.team_id
                          where r.season_id = ${season.id} and r.poll = 'media' order by r.week desc, r.rank limit 5`;
    const gotw = await sql`select g.id, h.school as home, a.school as away, g.home_score, g.away_score, g.home_team_id, g.away_team_id
                           from games g join teams h on h.id = g.home_team_id join teams a on a.id = g.away_team_id
                           where g.season_id = ${season.id} and g.status = 'final' and g.is_game_of_week order by g.week desc limit 1`;
    const topRecruit = await sql`select r.*, t.school from recruits r left join teams t on t.id = r.committed_team_id
                                 where r.season_id = ${season.id} order by r.national_rank limit 1`;
    const articles = [
      {
        slug: 'demo-welcome-to-the-universe', headline: 'Welcome to the College Football Universe', category: 'league_news', isOfficial: true, isFeatured: true,
        sub: 'A demo season is underway — every result, recruit and storyline here is sample data.',
        body: `<p>This is a <strong>demo season</strong>. Rosters, recruits, game results and these articles are generated sample data so you can explore every feature. The commissioner can purge all demo data from the Commissioner Panel and start the official universe.</p><h2>What lives here</h2><ul><li>138 programs with their real logos and colors</li><li>A server-side play-by-play simulation engine</li><li>Recruiting battles with interest meters, visits, flips and signing day</li><li>Polls, playoffs, record books and program histories</li></ul>`,
        teams: [],
      },
      ...(top[0] ? [{
        slug: 'demo-power-rankings', headline: `Power Rankings: ${top[0].school} sits alone at the top`, category: 'power_rankings', isOfficial: true, isFeatured: false,
        sub: 'Our weekly look at the national pecking order.',
        body: `<p>${top.map((t, i) => `<strong>${i + 1}. ${t.school}</strong>`).join(' · ')}</p><p>The ${top[0].mascot} have separated themselves early, but the gap between the top five is thinner than the polls suggest.</p>`,
        teams: top.map((t) => t.id),
      }] : []),
      ...(gotw[0] ? [{
        slug: 'demo-game-of-the-week-recap', headline: `${gotw[0].homeScore > gotw[0].awayScore ? gotw[0].home : gotw[0].away} wins the Game of the Week`, category: 'legendary_performance', isOfficial: true, isFeatured: false,
        sub: `${gotw[0].home} ${gotw[0].homeScore}, ${gotw[0].away} ${gotw[0].awayScore}`,
        body: `<p>The marquee matchup lived up to the billing. Full play-by-play, drive chart and win probability are in the Game Center.</p>`,
        teams: [gotw[0].homeTeamId, gotw[0].awayTeamId], game: gotw[0].id,
      }] : []),
      ...(topRecruit[0] ? [{
        slug: 'demo-recruiting-battle', headline: `Recruiting battle heats up for No. 1 prospect ${topRecruit[0].firstName} ${topRecruit[0].lastName}`, category: 'recruiting_battle', isOfficial: true, isFeatured: false,
        sub: `${topRecruit[0].stars}-star ${topRecruit[0].position} from ${topRecruit[0].hometown}`,
        body: `<p>The top-ranked player in the Class of 2027 is ${topRecruit[0].status === 'committed' ? `committed to ${topRecruit[0].school} — but the courtship isn't over until signing day.` : 'still on the board, and several programs believe they are leading.'}</p>`,
        teams: [],
      }] : []),
    ];
    for (const a of articles) {
      const [row] = await sql`insert into articles (slug, headline, subheadline, body_html, category, status, is_official, is_featured, is_breaking, is_demo, published_at, tags)
                              values (${a.slug}, ${a.headline}, ${a.sub}, ${a.body}, ${a.category}, 'published', ${a.isOfficial}, ${a.isFeatured}, ${a.slug.includes('welcome')}, true, now(), ${['demo']})
                              on conflict (slug) do nothing returning id`;
      if (row) {
        if (a.teams.length) await insertMany(sql, 'article_teams', a.teams.map((teamId: string) => ({ articleId: row.id, teamId })));
        if ('game' in a && a.game) await sql`insert into article_games (article_id, game_id) values (${row.id}, ${a.game})`;
      }
    }
    log('demo articles published');
  } finally {
    await sql.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
