/**
 * Drives the current season to completion and into the next one using only
 * the public services, printing what happened at each step. Useful as a smoke
 * test of the full lifecycle on a scratch/demo database:
 *   DATABASE_URL=... npx tsx scripts/lifecycle-check.ts
 */
import { createSql } from '../src/lib/db';
import { getSettings } from '../src/lib/services/settings';
import { advanceWeek, closeSeason, simulateWeek, startNewSeason } from '../src/lib/services/seasons';

async function main() {
  const sql = createSql(process.env.DATABASE_URL!, { max: 4 });
  try {
    const seasonId = (await getSettings(sql)).currentSeasonId!;
    for (let i = 0; i < 30; i++) {
      const [s] = await sql`select * from seasons where id = ${seasonId}`;
      if (s.phase === 'playoffs' && s.championTeamId) break;
      const n = await simulateWeek(sql, seasonId, s.currentWeek, 'quick', null);
      const r = await advanceWeek(sql, seasonId, null);
      console.log(`week ${s.currentWeek}: ${n} games → now week ${r.week} (${r.phase})`);
      const [after] = await sql`select champion_team_id from seasons where id = ${seasonId}`;
      if (after.championTeamId) break;
    }
    const ccg = await sql`select c.short_name, t.school, g.home_score, g.away_score from games g join conferences c on c.id = g.conference_id join teams t on t.id = g.winner_team_id where g.season_id = ${seasonId} and g.game_type = 'conference_championship'`;
    console.log('conference champions:', ccg.map((c) => `${c.shortName}: ${c.school}`).join(', '));
    const seeds = await sql`select ps.seed, t.school, ps.bid_type from playoff_seeds ps join playoff_brackets b on b.id = ps.bracket_id join teams t on t.id = ps.team_id where b.season_id = ${seasonId} order by seed`;
    console.log('playoff seeds:', seeds.map((s) => `${s.seed}. ${s.school}${s.bidType === 'auto' ? '*' : ''}`).join(' | '));
    const pg = await sql`select playoff_round, h.abbreviation as h, a.abbreviation as a, home_score, away_score, site_name from games g join teams h on h.id = g.home_team_id join teams a on a.id = g.away_team_id where season_id = ${seasonId} and game_type = 'playoff' order by playoff_round, bracket_slot`;
    for (const g of pg) console.log(`  R${g.playoffRound}: ${g.a} ${g.awayScore} @ ${g.h} ${g.homeScore} ${g.siteName ?? '(campus)'}`);
    const [champ] = await sql`select t.school from seasons s join teams t on t.id = s.champion_team_id where s.id = ${seasonId}`;
    console.log('NATIONAL CHAMPION:', champ?.school);
    const closed = await closeSeason(sql, seasonId, null);
    console.log('season closed; portal entries:', closed.portal);
    const [signing] = await sql`select count(*) filter (where status = 'signed')::int as signed, count(*) filter (where status = 'withdrawn')::int as unsigned from recruits where season_id = ${seasonId} and not is_transfer`;
    console.log('signing day:', signing);
    for (let i = 0; i < 3; i++) await advanceWeek(sql, seasonId, null); // portal recruiting weeks
    const [portal] = await sql`select count(*) filter (where status = 'committed')::int as committed, count(*)::int as total from recruits where season_id = ${seasonId} and is_transfer`;
    console.log('portal after 3 weeks:', portal);
    const next = await startNewSeason(sql, seasonId, null, { classSize: 1500 });
    console.log('new season:', next);
    const [ns] = await sql`select year, phase, current_week, (select count(*)::int from games where season_id = seasons.id) as games, (select count(*)::int from recruits where season_id = seasons.id) as recruits from seasons where id = ${next.seasonId}`;
    console.log('next season state:', ns);
    const [roster] = await sql`select count(*)::int as active, min(c) as min_roster, max(c) as max_roster from (select team_id, count(*) as c from players where status = 'active' group by team_id) x, lateral (select 1) y`;
    console.log('rosters:', roster);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
