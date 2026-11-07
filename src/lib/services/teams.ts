import { createRng } from '../rng';
import { insertMany, type Tx } from '../db';
import { generatePlayer, jerseyFor } from '../players/generate';
import { POSITIONS, ROSTER_TEMPLATE, type Position } from '../players/positions';
import { teamRatings } from '../development';
import type { SimPlayer } from '../sim/types';

export const qualityFromPrestige = (prestige: number) => 52 + prestige * 0.38;

/** Generates a fictional roster for a program (used by the seed and the commissioner "generate roster" tool) */
export async function generateRoster(sql: Tx, team: { id: string; prestige: number; state: string | null }, opts: { isDemo: boolean; seed: string }) {
  const rng = createRng(`${opts.seed}-roster-${team.id}`);
  const quality = qualityFromPrestige(team.prestige);
  const used = new Set<number>();
  const rows: Record<string, unknown>[] = [];
  for (const pos of POSITIONS) {
    for (let i = 0; i < ROSTER_TEMPLATE[pos]; i++) {
      const seasonsPlayed = rng.int(0, 3);
      const g = generatePlayer(rng, pos, quality, seasonsPlayed, i, team.state ?? undefined);
      rows.push({
        firstName: g.firstName, lastName: g.lastName, position: pos, teamId: team.id, jersey: jerseyFor(rng, pos, used),
        heightIn: g.heightIn, weight: g.weight, hometown: g.hometown, homeState: g.homeState, seasonsPlayed,
        yearsInProgram: seasonsPlayed + (rng.chance(0.25) ? 1 : 0), redshirtUsed: false, stars: g.stars, overall: g.overall,
        potential: g.potential, attributes: g.attributes, devTrait: g.devTrait, isDemo: opts.isDemo,
      });
    }
  }
  for (const r of rows) if ((r.yearsInProgram as number) > (r.seasonsPlayed as number)) r.redshirtUsed = true;
  await insertMany(sql, 'players', rows.map((r) => ({ ...r, attributes: sql.json(r.attributes as any) })));
  await autoDepthChart(sql, team.id);
}

/** Rebuild a depth chart by overall rating (keeps owners' manual order for players still on the roster when `preserve` is set) */
export async function autoDepthChart(sql: Tx, teamId: string, preserve = false) {
  const players = await sql`select id, position, overall from players where team_id = ${teamId} and status = 'active' order by overall desc`;
  const existing = preserve ? await sql`select slot, depth, player_id from depth_chart where team_id = ${teamId} order by slot, depth` : [];
  await sql`delete from depth_chart where team_id = ${teamId}`;
  const rows: Record<string, unknown>[] = [];
  for (const pos of POSITIONS) {
    const onRoster = players.filter((p) => p.position === pos);
    const ids = new Set(onRoster.map((p) => p.id));
    const kept = existing.filter((e) => e.slot === pos && ids.has(e.playerId)).map((e) => e.playerId as string);
    const ordered = [...kept, ...onRoster.map((p) => p.id as string).filter((id) => !kept.includes(id))].slice(0, 12);
    ordered.forEach((playerId, i) => rows.push({ teamId, slot: pos, depth: i + 1, playerId }));
  }
  await insertMany(sql, 'depth_chart', rows);
}

/** Players by position in depth-chart order (healthy only unless includeInjured) */
export async function loadDepthRoster(sql: Tx, teamId: string, includeInjured = false): Promise<Partial<Record<Position, SimPlayer[]>>> {
  const rows = await sql`
    select p.id, p.first_name, p.last_name, p.position, p.overall, p.attributes, p.injury_weeks, d.depth
    from players p
    left join depth_chart d on d.player_id = p.id and d.team_id = p.team_id and d.slot = p.position
    where p.team_id = ${teamId} and p.status = 'active'
    order by p.position, d.depth nulls last, p.overall desc`;
  const roster: Partial<Record<Position, SimPlayer[]>> = {};
  for (const r of rows) {
    if (!includeInjured && r.injuryWeeks > 0) continue;
    const pos = r.position as Position;
    (roster[pos] ??= []).push({ id: r.id, name: `${r.firstName[0]}. ${r.lastName}`, position: pos, overall: r.overall, attrs: r.attributes ?? {} });
  }
  return roster;
}

export async function refreshTeamRatings(sql: Tx, teamIds?: string[]) {
  const teams = teamIds?.length ? teamIds : (await sql`select id from teams where active`).map((t) => t.id as string);
  for (const id of teams) {
    const roster = await loadDepthRoster(sql, id);
    const r = teamRatings(roster);
    await sql`update teams set overall_rating = ${r.overall}, offense_rating = ${r.offense}, defense_rating = ${r.defense}, updated_at = now() where id = ${id}`;
  }
}

export async function teamIdsWithOwners(sql: Tx): Promise<Set<string>> {
  const rows = await sql`select team_id from team_staff where role = 'owner'`;
  return new Set(rows.map((r) => r.teamId as string));
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/&/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
