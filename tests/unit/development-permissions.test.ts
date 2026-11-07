import { describe, expect, it } from 'vitest';
import { developPlayer } from '@/lib/development';
import { createRng } from '@/lib/rng';
import { canManageTeam, canPublishLore, canRecruitFor, canEditArticle, type Actor } from '@/lib/auth/permissions';
import { classLabel } from '@/lib/players/positions';

const base = { id: 'p', position: 'QB' as const, overall: 70, potential: 88, attributes: { throwPower: 70, throwAccuracy: 70, awareness: 70, speed: 70 }, devTrait: 'normal', seasonsPlayed: 0, yearsInProgram: 0, redshirtUsed: false, gamesPlayed: 10, performance: 0.6 };

describe('player development', () => {
  it('redshirts players with four or fewer appearances once', () => {
    const r = developPlayer({ ...base, gamesPlayed: 3 }, 70, createRng('a'));
    expect(r.redshirted).toBe(true);
    expect(r.seasonsPlayed).toBe(0);
    const again = developPlayer({ ...base, gamesPlayed: 2, redshirtUsed: true }, 70, createRng('a'));
    expect(again.redshirted).toBe(false);
    expect(again.seasonsPlayed).toBe(1);
  });
  it('graduates players after four playing seasons or five years', () => {
    expect(developPlayer({ ...base, seasonsPlayed: 3, yearsInProgram: 3 }, 70, createRng('b')).graduated).toBe(true);
    expect(developPlayer({ ...base, seasonsPlayed: 2, yearsInProgram: 4, redshirtUsed: true, gamesPlayed: 1 }, 70, createRng('c')).graduated).toBe(true);
  });
  it('young high-potential players usually improve and never exceed potential', () => {
    let improved = 0;
    for (let i = 0; i < 100; i++) {
      const r = developPlayer(base, 80, createRng(`d${i}`));
      if (r.change > 0) improved++;
      expect(r.overall).toBeLessThanOrEqual(88);
    }
    expect(improved).toBeGreaterThan(80);
  });
  it('labels classes', () => {
    expect(classLabel(0, true)).toBe('RS FR');
    expect(classLabel(2, false)).toBe('JR');
  });
});

describe('permissions', () => {
  const ctx = { allowAssistantCoaches: true, allowOwnerLore: true };
  const owner: Actor = { userId: 'u1', role: 'owner', displayName: 'O', ownedTeamIds: ['t1'], assistantTeamIds: [] };
  const assistant: Actor = { userId: 'u2', role: 'owner', displayName: 'A', ownedTeamIds: [], assistantTeamIds: ['t1'] };
  const fan: Actor = { userId: 'u3', role: 'viewer', displayName: 'F', ownedTeamIds: [], assistantTeamIds: [] };
  const comm: Actor = { userId: 'u4', role: 'commissioner', displayName: 'C', ownedTeamIds: [], assistantTeamIds: [] };

  it('owners control only their own program', () => {
    expect(canManageTeam(owner, 't1', ctx)).toBe(true);
    expect(canManageTeam(owner, 't2', ctx)).toBe(false);
    expect(canRecruitFor(owner, 't2', ctx)).toBe(false);
  });
  it('assistants depend on the commissioner setting', () => {
    expect(canManageTeam(assistant, 't1', ctx)).toBe(true);
    expect(canManageTeam(assistant, 't1', { ...ctx, allowAssistantCoaches: false })).toBe(false);
  });
  it('fans cannot modify anything; commissioners can', () => {
    expect(canManageTeam(fan, 't1', ctx)).toBe(false);
    expect(canPublishLore(fan, 't1', ctx)).toBe(false);
    expect(canManageTeam(comm, 't1', ctx)).toBe(true);
    expect(canManageTeam(null, 't1', ctx)).toBe(false);
  });
  it('owners cannot edit official articles', () => {
    expect(canEditArticle(owner, { authorId: 'u1', teamId: 't1', isOfficial: true }, ctx)).toBe(false);
    expect(canEditArticle(owner, { authorId: 'u1', teamId: 't1', isOfficial: false }, ctx)).toBe(true);
    expect(canEditArticle(owner, { authorId: 'u9', teamId: 't1', isOfficial: false }, ctx)).toBe(false);
  });
});
