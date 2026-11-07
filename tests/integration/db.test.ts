/**
 * Integration tests against a real Postgres. Set TEST_DATABASE_URL to an
 * EMPTY scratch database (it is wiped), e.g.
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5432/cfu_test npm test
 * Skipped when the variable is not set.
 */
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '@/lib/db';
import type { Actor } from '@/lib/auth/permissions';
import { generateRoster, refreshTeamRatings } from '@/lib/services/teams';
import { createSeason, generateSeasonSchedule, advanceWeek } from '@/lib/services/seasons';
import { finalizeGame, reopenGame, simulateScheduledGame, enterManualResult } from '@/lib/services/games';
import { generateClass, processRecruiting, submitRecruitingAction } from '@/lib/services/recruiting';
import { saveArticle } from '@/lib/services/articles';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('database integration', () => {
  let sql: Sql;
  let seasonId: string;
  let teams: { id: string; slug: string }[];
  let owner: Actor;
  let commissioner: Actor;

  beforeAll(async () => {
    sql = createSql(url!, { max: 6 });
    await sql.unsafe('drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;');
    execFileSync('npx', ['tsx', 'scripts/migrate.ts', '--local-auth-stub'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
    execFileSync('npx', ['tsx', 'scripts/seed.ts', '--base-only'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
    // shrink the universe to one conference for speed
    await sql`update teams set active = false where conference_id <> (select id from conferences where slug = 'sec')`;
    teams = (await sql`select id, slug, prestige, state from teams where active order by slug`) as any;
    for (const t of teams as any[]) await generateRoster(sql, t, { isDemo: true, seed: 'it' });
    await refreshTeamRatings(sql, teams.map((t) => t.id));
    const season = await createSeason(sql, { year: 2030, isDemo: true, regularSeasonWeeks: 9, playoffSize: 4, playoffAutoBids: 1 }, null);
    seasonId = season.id;
    await generateSeasonSchedule(sql, seasonId, null, { gamesPerTeam: 9 });
    await generateClass(sql, seasonId, 120, true);
    const [u1] = await sql`insert into auth.users (email) values ('owner@test.dev') returning id`;
    const [u2] = await sql`insert into auth.users (email) values ('comm@test.dev') returning id`;
    await sql`update profiles set role = 'owner' where id = ${u1.id}`;
    await sql`update profiles set role = 'commissioner' where id = ${u2.id}`;
    await sql`insert into team_staff (team_id, user_id, role) values (${teams[0].id}, ${u1.id}, 'owner')`;
    owner = { userId: u1.id, role: 'owner', displayName: 'Owner', ownedTeamIds: [teams[0].id], assistantTeamIds: [] };
    commissioner = { userId: u2.id, role: 'commissioner', displayName: 'Comm', ownedTeamIds: [], assistantTeamIds: [] };
    await advanceWeek(sql, seasonId, null); // preseason -> week 1
  });

  afterAll(async () => { await sql?.end(); });

  it('creates a profile for every new auth user', async () => {
    const [p] = await sql`select role from profiles where id = ${owner.userId}`;
    expect(p.role).toBe('owner');
  });

  it('finalizes a game exactly once even under concurrent requests', async () => {
    const [g] = await sql`select id from games where season_id = ${seasonId} and week = 1 limit 1`;
    const results = await Promise.allSettled([
      simulateScheduledGame(sql, g.id, 'detailed', commissioner.userId),
      simulateScheduledGame(sql, g.id, 'detailed', commissioner.userId),
      simulateScheduledGame(sql, g.id, 'live', commissioner.userId),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const [{ n }] = await sql`select count(*)::int as n from team_game_stats where game_id = ${g.id}`;
    expect(n).toBe(2);
    const [game] = await sql`select * from games where id = ${g.id}`;
    expect(game.status).toBe('final');
    const [tr] = await sql`select wins + losses as gp from team_records where season_id = ${seasonId} and team_id = ${game.homeTeamId}`;
    expect(tr.gp).toBe(1);
    // play-by-play final score matches the box score
    const [last] = await sql`select home_score, away_score from game_plays where game_id = ${g.id} order by seq desc limit 1`;
    expect([last.homeScore, last.awayScore]).toEqual([game.homeScore, game.awayScore]);
  });

  it('reproduces the same result from the stored seed', async () => {
    const [g] = await sql`select id from games where season_id = ${seasonId} and week = 1 and status = 'scheduled' limit 1`;
    await simulateScheduledGame(sql, g.id, 'quick', commissioner.userId, 'fixed-seed');
    const [first] = await sql`select home_score, away_score from games where id = ${g.id}`;
    await reopenGame(sql, g.id, commissioner.userId, 'test');
    const [{ n }] = await sql`select count(*)::int as n from player_game_stats where game_id = ${g.id}`;
    expect(n).toBe(0);
    await simulateScheduledGame(sql, g.id, 'quick', commissioner.userId, 'fixed-seed');
    const [second] = await sql`select home_score, away_score from games where id = ${g.id}`;
    expect(second).toEqual(first);
  });

  it('accepts manual results and rejects ties and mismatched quarters', async () => {
    const [g] = await sql`select id from games where season_id = ${seasonId} and week = 1 and status = 'scheduled' limit 1`;
    await expect(enterManualResult(sql, g.id, { homeScore: 21, awayScore: 21 }, commissioner.userId)).rejects.toThrow();
    await expect(enterManualResult(sql, g.id, { homeScore: 24, awayScore: 17, homeQuarters: [7, 7, 7, 0], awayQuarters: [0, 7, 3, 7] }, commissioner.userId)).rejects.toThrow(/add up/);
    await enterManualResult(sql, g.id, { homeScore: 24, awayScore: 17, homeQuarters: [7, 7, 3, 7], awayQuarters: [0, 7, 3, 7] }, commissioner.userId);
    const [game] = await sql`select sim_mode, home_score from games where id = ${g.id}`;
    expect(game).toMatchObject({ simMode: 'manual', homeScore: 24 });
  });

  it('never lets concurrent recruiting actions overspend the weekly budget', async () => {
    const recruits = await sql`select id from recruits where season_id = ${seasonId} order by national_rank limit 12`;
    const attempts = recruits.map((r) => submitRecruitingAction(sql, owner, { teamId: teams[0].id, recruitId: r.id, type: 'contact' }));
    const res = await Promise.allSettled(attempts);
    const ok = res.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(10); // 100 points / 10 per contact
    const [b] = await sql`select points_spent, points_total from recruiting_budgets where team_id = ${teams[0].id}`;
    expect(b.pointsSpent).toBeLessThanOrEqual(b.pointsTotal);
  });

  it('rejects duplicate actions and actions for teams the owner does not control', async () => {
    const [r] = await sql`select id from recruits where season_id = ${seasonId} order by national_rank limit 1`;
    await expect(submitRecruitingAction(sql, owner, { teamId: teams[0].id, recruitId: r.id, type: 'contact' })).rejects.toThrow();
    await expect(submitRecruitingAction(sql, owner, { teamId: teams[1].id, recruitId: r.id, type: 'offer' })).rejects.toThrow(/own|staff/i);
    await expect(submitRecruitingAction(sql, owner, { teamId: teams[0].id, recruitId: r.id, type: 'visit' })).rejects.toThrow(/offer/i);
  });

  it('processes recruiting weeks and never signs a recruit twice', async () => {
    for (let w = 1; w <= 3; w++) await sql.begin((tx) => processRecruiting(tx, seasonId, w, null));
    await sql.begin((tx) => processRecruiting(tx, seasonId, 16, null)); // signing day
    const dup = await sql`select recruit_id from commitments where event = 'signed' group by recruit_id having count(*) > 1`;
    expect(dup).toHaveLength(0);
    const [{ n }] = await sql`select count(*)::int as n from recruits where status = 'signed' and signed_team_id is null`;
    expect(n).toBe(0);
  });

  it('publishing lore never alters official results', async () => {
    const before = await sql`select id, home_score, away_score, status from games where season_id = ${seasonId} order by id`;
    await saveArticle(sql, owner, {
      headline: 'We actually won that game 70-0', bodyHtml: '<p>Trust us</p><script>alert(1)</script><img src=x onerror=alert(1)>',
      category: 'press_conference', tags: [], teamId: teams[0].id, relatedTeamIds: [], relatedPlayerIds: [], relatedGameIds: [],
      publish: true, isOfficial: false, isFeatured: false, isBreaking: false, commentsEnabled: true,
    });
    const after = await sql`select id, home_score, away_score, status from games where season_id = ${seasonId} order by id`;
    expect(after).toEqual(before);
    const [a] = await sql`select body_html from articles order by created_at desc limit 1`;
    expect(a.bodyHtml).not.toContain('<script');
    expect(a.bodyHtml).not.toContain('onerror');
    await expect(saveArticle(sql, owner, {
      headline: 'Official?', bodyHtml: '<p>x</p>', category: 'league_news', tags: [], teamId: teams[0].id, relatedTeamIds: [],
      relatedPlayerIds: [], relatedGameIds: [], publish: true, isOfficial: true, isFeatured: false, isBreaking: false, commentsEnabled: true,
    })).rejects.toThrow(/commissioner/i);
  });

  it('row-level security blocks API writes and hides private recruiting data', async () => {
    await sql.begin(async (tx) => {
      await tx`set local role anon`;
      const interest = await tx`select count(*)::int as n from recruit_interest`;
      expect(interest[0].n).toBe(0);
      const teamsVisible = await tx`select count(*)::int as n from teams`;
      expect(teamsVisible[0].n).toBeGreaterThan(0);
      await expect(tx`update games set home_score = 99`).resolves.toHaveProperty('count', 0);
    }).catch((e) => { throw e; });
  });
});
