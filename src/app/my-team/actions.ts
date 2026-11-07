'use server';
import { revalidatePath } from 'next/cache';
import { getSql } from '@/lib/db';
import { getActor, requireActor } from '@/lib/auth/session';
import { assertCanManageTeam, canPublishLore, PermissionError } from '@/lib/auth/permissions';
import { bool, num, runAction, str, type ActionState } from '@/lib/actions';
import { getSettings } from '@/lib/services/settings';
import { logAudit } from '@/lib/services/audit';
import { cancelRecruitingAction, enterPortal, submitRecruitingAction } from '@/lib/services/recruiting';
import { refreshTeamRatings } from '@/lib/services/teams';
import { PRIORITY_KEYS, type ActionType, type PriorityKey } from '@/lib/recruiting/engine';
import { DEFENSE_SCHEMES, OFFENSE_SCHEMES, POSITIONS, type Position } from '@/lib/players/positions';

type A = (prev: ActionState, fd: FormData) => Promise<ActionState>;
const ACTIONS: ActionType[] = ['scout', 'contact', 'offer', 'visit', 'pitch', 'pull_offer'];

export const recruitAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireActor();
  const type = str(fd, 'type') as ActionType;
  if (!ACTIONS.includes(type)) throw new Error('Unknown recruiting action');
  const angle = str(fd, 'pitchAngle') as PriorityKey;
  await submitRecruitingAction(getSql(), actor, {
    teamId: str(fd, 'teamId'), recruitId: str(fd, 'recruitId'), type, pitchAngle: PRIORITY_KEYS.includes(angle) ? angle : null,
  });
  revalidatePath('/my-team', 'layout');
  revalidatePath(`/recruiting/${str(fd, 'recruitId')}`);
  return `${type === 'pull_offer' ? 'Offer withdrawal' : type[0].toUpperCase() + type.slice(1)} queued — it will be resolved when the week advances.`;
});

export const cancelRecruitAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireActor();
  await cancelRecruitingAction(getSql(), actor, str(fd, 'actionId'));
  revalidatePath('/my-team', 'layout');
  return 'Action cancelled and points refunded.';
});

export const strategyAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireActor();
  const sql = getSql();
  const teamId = str(fd, 'teamId');
  assertCanManageTeam(actor, teamId, await getSettings(sql));
  const off = str(fd, 'offenseScheme');
  const def = str(fd, 'defenseScheme');
  if (!(OFFENSE_SCHEMES as readonly string[]).includes(off) || !(DEFENSE_SCHEMES as readonly string[]).includes(def)) throw new Error('Unknown scheme');
  await sql`update teams set offense_scheme = ${off}, defense_scheme = ${def}, updated_at = now() where id = ${teamId}`;
  await logAudit(sql, actor.userId, 'team.strategy', 'team', teamId, { off, def });
  revalidatePath('/', 'layout');
  return 'Schemes updated.';
});

/** Saves the order for one position group. Only players on this team's active roster at that position are accepted. */
export const depthChartAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireActor();
  const sql = getSql();
  const teamId = str(fd, 'teamId');
  const slot = str(fd, 'slot') as Position;
  assertCanManageTeam(actor, teamId, await getSettings(sql));
  if (!POSITIONS.includes(slot)) throw new Error('Unknown position');
  const order = str(fd, 'order').split(',').filter(Boolean);
  const valid = await sql`select id from players where team_id = ${teamId} and status = 'active' and position = ${slot}`;
  const ok = new Set(valid.map((v) => v.id as string));
  const ids = [...new Set(order)].filter((id) => ok.has(id)).slice(0, 12);
  for (const v of valid) if (!ids.includes(v.id) && ids.length < 12) ids.push(v.id);
  await sql.begin(async (tx) => {
    await tx`delete from depth_chart where team_id = ${teamId} and slot = ${slot}`;
    if (ids.length) await tx`insert into depth_chart ${tx(ids.map((playerId, i) => ({ teamId, slot, depth: i + 1, playerId })))}`;
    await refreshTeamRatings(tx, [teamId]);
  });
  revalidatePath('/my-team', 'layout');
  return `${slot} depth chart saved.`;
});

export const portalAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireActor();
  await enterPortal(getSql(), actor, str(fd, 'playerId'));
  revalidatePath('/', 'layout');
  return 'Player entered the transfer portal.';
});

export const followAction: A = async (_p, fd) => runAction(async () => {
  const actor = await requireActor();
  const sql = getSql();
  const teamId = str(fd, 'teamId');
  const del = await sql`delete from follows where user_id = ${actor.userId} and team_id = ${teamId} returning team_id`;
  if (!del.length) await sql`insert into follows (user_id, team_id) values (${actor.userId}, ${teamId})`;
  revalidatePath('/', 'layout');
  return del.length ? 'Unfollowed.' : 'Following!';
});

export const addTimelineAction: A = async (_p, fd) => runAction(async () => {
  const actor = await getActor();
  const sql = getSql();
  const teamId = str(fd, 'teamId');
  const settings = await getSettings(sql);
  if (!canPublishLore(actor, teamId, settings)) throw new PermissionError('Only this program’s staff or the commissioner can add to its timeline.');
  const official = bool(fd, 'official') && actor!.role === 'commissioner';
  const title = str(fd, 'title');
  if (!title) throw new Error('Title is required');
  await sql`insert into team_timeline_events (team_id, year, title, description, kind, created_by)
            values (${teamId}, ${num(fd, 'year')}, ${title.slice(0, 160)}, ${str(fd, 'description').slice(0, 2000) || null}, ${official ? 'official' : 'lore'}, ${actor!.userId})`;
  await logAudit(sql, actor!.userId, 'timeline.added', 'team', teamId, { title, official });
  revalidatePath('/teams', 'layout');
  return 'Added to the timeline.';
});
