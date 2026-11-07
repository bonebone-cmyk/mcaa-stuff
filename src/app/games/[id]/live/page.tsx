import { notFound } from 'next/navigation';
import { getSql } from '@/lib/db';
import { getTeamMap } from '@/lib/queries';
import { EmptyState } from '@/components/ui';
import { LiveGameCenter } from './live-center';

export const metadata = { title: 'Live Game Center' };

export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = getSql();
  const [g] = await sql`select * from games where id = ${id}`;
  if (!g) notFound();
  const teams = await getTeamMap();
  const home = teams.get(g.homeTeamId)!;
  const away = teams.get(g.awayTeamId)!;
  const plays = await sql`select seq, drive_no, quarter, clock, offense_team_id, down, distance, yard_line, play_type, yards, description,
                          home_score, away_score, is_scoring, is_turnover, home_win_prob, stat_deltas from game_plays where game_id = ${id} order by seq`;
  if (g.status !== 'final' || !plays.length) {
    return <EmptyState title="No live replay available">Live replays exist for games simulated in Detailed or Live mode.</EmptyState>;
  }
  const players = await sql`select s.player_id, s.team_id, p.first_name, p.last_name, p.position from player_game_stats s join players p on p.id = s.player_id where s.game_id = ${id}`;
  const pick = (t: typeof home) => ({ id: t.id, slug: t.slug, school: t.school, abbreviation: t.abbreviation, logoUrl: t.logoUrl, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor });
  return (
    <LiveGameCenter
      gameId={id}
      home={pick(home)}
      away={pick(away)}
      plays={plays.map((p) => ({ ...p, homeWinProb: Number(p.homeWinProb) })) as any}
      players={Object.fromEntries(players.map((p) => [p.playerId, { name: `${p.firstName[0]}. ${p.lastName}`, teamId: p.teamId, position: p.position }]))}
    />
  );
}
