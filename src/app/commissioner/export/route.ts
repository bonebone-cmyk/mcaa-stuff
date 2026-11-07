import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getActor } from '@/lib/auth/session';

const CORE = ['conferences', 'teams', 'rivalries', 'players', 'depth_chart'];
const FULL = [...CORE, 'tv_networks', 'universe_settings', 'seasons', 'team_seasons', 'games', 'team_game_stats', 'player_game_stats', 'game_drives',
  'recruits', 'commitments', 'rankings', 'playoff_brackets', 'playoff_seeds', 'championships', 'awards', 'articles', 'article_teams',
  'team_timeline_events', 'player_transfers', 'player_development_log', 'audit_log'];

export async function GET(request: Request) {
  const actor = await getActor();
  if (actor?.role !== 'commissioner') return NextResponse.json({ error: 'Commissioner access required' }, { status: 403 });
  const scope = new URL(request.url).searchParams.get('scope') === 'core' ? CORE : FULL;
  const sql = getSql();
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), format: 'cfu-export-v1' };
  for (const table of scope) out[table] = await sql`select * from ${sql(table)}`;
  return new NextResponse(JSON.stringify(out), {
    headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="cfu-export-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
