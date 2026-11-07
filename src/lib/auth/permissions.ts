/**
 * Role-based permission rules. Pure functions so they can be unit tested and
 * reused by every server action. All official writes call one of these first.
 */
export type AppRole = 'commissioner' | 'owner' | 'viewer';

export interface Actor {
  userId: string;
  role: AppRole;
  displayName: string;
  /** team ids where the user is primary owner */
  ownedTeamIds: string[];
  /** team ids where the user is an assistant coach */
  assistantTeamIds: string[];
}

export interface PermissionContext {
  allowAssistantCoaches: boolean;
  allowOwnerLore: boolean;
}

export class PermissionError extends Error {
  constructor(message = 'You do not have permission to do that.') {
    super(message);
    this.name = 'PermissionError';
  }
}

export const isCommissioner = (a: Actor | null): a is Actor => !!a && a.role === 'commissioner';

/** Can this actor run a team (roster, depth chart, strategy, recruiting)? */
export function canManageTeam(a: Actor | null, teamId: string, ctx: PermissionContext): boolean {
  if (!a) return false;
  if (a.role === 'commissioner') return true;
  if (a.ownedTeamIds.includes(teamId)) return true;
  return ctx.allowAssistantCoaches && a.assistantTeamIds.includes(teamId);
}

/** Recruiting actions are made by the team's staff only (commissioners approve/reject, not recruit for teams) */
export function canRecruitFor(a: Actor | null, teamId: string, ctx: PermissionContext): boolean {
  if (!a) return false;
  if (a.ownedTeamIds.includes(teamId)) return true;
  return ctx.allowAssistantCoaches && a.assistantTeamIds.includes(teamId);
}

export function canPublishLore(a: Actor | null, teamId: string | null, ctx: PermissionContext): boolean {
  if (!a) return false;
  if (a.role === 'commissioner') return true;
  if (!ctx.allowOwnerLore || !teamId) return false;
  return canManageTeam(a, teamId, ctx);
}

/** Official (league) articles, featured/breaking flags: commissioner only */
export function canPublishOfficial(a: Actor | null): boolean {
  return isCommissioner(a);
}

export function canEditArticle(a: Actor | null, article: { authorId: string | null; teamId: string | null; isOfficial: boolean }, ctx: PermissionContext): boolean {
  if (!a) return false;
  if (a.role === 'commissioner') return true;
  if (article.isOfficial) return false;
  return article.authorId === a.userId && canPublishLore(a, article.teamId, ctx);
}

export function assertCommissioner(a: Actor | null): asserts a is Actor {
  if (!isCommissioner(a)) throw new PermissionError('Commissioner access required.');
}

export function assertCanManageTeam(a: Actor | null, teamId: string, ctx: PermissionContext): asserts a is Actor {
  if (!canManageTeam(a, teamId, ctx)) throw new PermissionError('You can only manage your own program.');
}

export function assertCanRecruitFor(a: Actor | null, teamId: string, ctx: PermissionContext): asserts a is Actor {
  if (!canRecruitFor(a, teamId, ctx)) throw new PermissionError('Only the program staff can recruit for this team.');
}
