import 'server-only';
import { getSql } from '@/lib/db';
import { getCurrentSeason, getTeams } from '@/lib/queries';
import { ARTICLE_CATEGORIES } from '@/lib/services/articles';

export async function editorOptions(teamScope: string | null) {
  const sql = getSql();
  const [teams, season] = await Promise.all([getTeams(), getCurrentSeason()]);
  const players = await sql`select id, first_name, last_name, position, team_id from players where status = 'active'
    ${teamScope ? sql`and team_id = ${teamScope}` : sql``} order by overall desc limit 400`;
  const games = season ? await sql`select g.id, g.week, h.abbreviation as h, a.abbreviation as a from games g join teams h on h.id = g.home_team_id join teams a on a.id = g.away_team_id
    where g.season_id = ${season.id} ${teamScope ? sql`and (g.home_team_id = ${teamScope} or g.away_team_id = ${teamScope})` : sql`and g.status = 'final'`} order by g.week desc limit 300` : [];
  const abbr = new Map(teams.map((t) => [t.id, t.abbreviation]));
  return {
    categories: Object.entries(ARTICLE_CATEGORIES).map(([value, label]) => ({ value, label })),
    teams: teams.map((t) => ({ value: t.id, label: t.school, slug: t.slug })),
    players: players.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName} (${p.position}, ${abbr.get(p.teamId) ?? '—'})` })),
    games: games.map((g) => ({ value: g.id, label: `Wk ${g.week}: ${g.a} @ ${g.h}` })),
  };
}
