import Link from 'next/link';
import { getSql } from '@/lib/db';
import { Badge, Card, DemoBadge, EmptyState, FilterBar, PageHeader, Select, Stars, Tabs, TeamLink, TeamLogo } from '@/components/ui';
import { getClassRankings, getCurrentSeason, getTeamMap } from '@/lib/queries';
import { formatHeight, POSITIONS } from '@/lib/players/positions';
import { STATES } from '@/lib/players/generate';

export const metadata = { title: 'Recruiting' };

export default async function RecruitingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const season = await getCurrentSeason();
  if (!season) return <EmptyState title="No season yet" />;
  const tab = sp.tab ?? 'prospects';
  const sql = getSql();
  const teams = await getTeamMap();
  const [{ total, committed, signed }] = await sql`select count(*)::int as total, count(*) filter (where status = 'committed')::int as committed, count(*) filter (where status = 'signed')::int as signed from recruits where season_id = ${season.id} and not is_transfer`;
  return (
    <div>
      <PageHeader title="Recruiting" eyebrow={<span className="flex items-center gap-2">Class of {season.year + 1}<DemoBadge show={season.isDemo} /></span>}>
        {total} prospects · {committed} committed · {signed} signed
      </PageHeader>
      <Tabs active={tab} tabs={[
        { key: 'prospects', label: 'Prospect Rankings', href: '/recruiting?tab=prospects' },
        { key: 'classes', label: 'Team Class Rankings', href: '/recruiting?tab=classes' },
        { key: 'commitments', label: 'Commitment Feed', href: '/recruiting?tab=commitments' },
        { key: 'portal', label: 'Transfer Portal', href: '/recruiting?tab=portal' },
      ]} />
      {tab === 'prospects' && <Prospects seasonId={season.id} sp={sp} teams={teams} transfer={false} />}
      {tab === 'portal' && <Prospects seasonId={season.id} sp={sp} teams={teams} transfer />}
      {tab === 'classes' && <Classes seasonId={season.id} teams={teams} />}
      {tab === 'commitments' && <Feed seasonId={season.id} teams={teams} />}
    </div>
  );
}

async function Prospects({ seasonId, sp, teams, transfer }: { seasonId: string; sp: Record<string, string | undefined>; teams: Awaited<ReturnType<typeof getTeamMap>>; transfer: boolean }) {
  const sql = getSql();
  const page = Math.max(1, Number(sp.page ?? 1));
  const per = 50;
  const where = sql`season_id = ${seasonId} and is_transfer = ${transfer}
    ${sp.pos ? sql`and position = ${sp.pos}` : sql``} ${sp.stars ? sql`and stars = ${Number(sp.stars)}` : sql``}
    ${sp.state ? sql`and home_state = ${sp.state}` : sql``} ${sp.status ? sql`and status = ${sp.status}` : sql``}
    ${sp.q ? sql`and (first_name || ' ' || last_name) ilike ${'%' + sp.q + '%'}` : sql``}`;
  const [rows, [{ n }]] = await Promise.all([
    sql`select * from recruits where ${where} order by ${transfer ? sql`overall desc` : sql`national_rank`} limit ${per} offset ${(page - 1) * per}`,
    sql`select count(*)::int as n from recruits where ${where}`,
  ]);
  const qs = (p: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), page: String(p) })}`;
  return (
    <>
      <FilterBar>
        <input type="hidden" name="tab" value={transfer ? 'portal' : 'prospects'} />
        <label className="min-w-[12rem] flex-1"><span className="label">Name</span><input name="q" defaultValue={sp.q} className="input" /></label>
        <Select name="pos" value={sp.pos} label="Position" options={[{ value: '', label: 'All' }, ...POSITIONS.map((p) => ({ value: p, label: p }))]} />
        <Select name="stars" value={sp.stars} label="Stars" options={[{ value: '', label: 'All' }, ...[5, 4, 3, 2, 1].map((s) => ({ value: String(s), label: `${s}★` }))]} />
        {!transfer && <Select name="state" value={sp.state} label="State" options={[{ value: '', label: 'All' }, ...STATES.map((s) => ({ value: s.code, label: s.name }))]} />}
        <Select name="status" value={sp.status} label="Status" options={[{ value: '', label: 'All' }, { value: 'uncommitted', label: 'Uncommitted' }, { value: 'committed', label: 'Committed' }, { value: 'signed', label: 'Signed' }, { value: 'withdrawn', label: 'Unsigned/withdrawn' }]} />
      </FilterBar>
      <Card pad={false}>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>{transfer ? 'From' : 'Natl'}</th><th>Prospect</th><th>Pos</th><th>{transfer ? 'Class' : 'Pos Rk'}</th><th>Hometown</th><th>Ht / Wt</th><th>Rating</th><th>Status</th></tr></thead>
              <tbody>{rows.map((r) => {
                const t = r.committedTeamId ? teams.get(r.signedTeamId ?? r.committedTeamId) : null;
                const from = r.fromTeamId ? teams.get(r.fromTeamId) : null;
                return (
                  <tr key={r.id}>
                    <td className="tabular font-bold">{transfer ? (from ? <TeamLogo team={from} size={22} /> : '—') : r.nationalRank}</td>
                    <td><Link href={`/recruiting/${r.id}`} className="font-semibold hover:text-accent">{r.firstName} {r.lastName}</Link></td>
                    <td>{r.position}</td>
                    <td className="tabular text-muted">{transfer ? `Yr ${r.classYear}` : `#${r.positionRank}`}</td>
                    <td className="text-muted">{r.hometown}</td>
                    <td className="tabular text-muted">{formatHeight(r.heightIn)} / {r.weight}</td>
                    <td><Stars n={r.stars} /></td>
                    <td>{t ? <span className="flex items-center gap-1.5"><TeamLogo team={t} size={20} /><span className="text-xs font-bold uppercase">{r.status}</span></span> : <span className="text-xs text-muted capitalize">{r.status}</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : <div className="card-pad"><EmptyState title={transfer ? 'The portal is quiet' : 'No prospects match'}>{transfer ? 'Players enter the portal when the season closes or when a coach releases them.' : ''}</EmptyState></div>}
      </Card>
      {n > per && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">Showing {(page - 1) * per + 1}–{Math.min(n, page * per)} of {n}</span>
          <span className="flex gap-2">{page > 1 && <Link className="btn-ghost btn-sm" href={qs(page - 1)}>← Prev</Link>}{page * per < n && <Link className="btn-ghost btn-sm" href={qs(page + 1)}>Next →</Link>}</span>
        </div>
      )}
    </>
  );
}

async function Classes({ seasonId, teams }: { seasonId: string; teams: Awaited<ReturnType<typeof getTeamMap>> }) {
  const ranks = await getClassRankings(seasonId);
  if (!ranks.length) return <EmptyState title="No commitments yet" />;
  return (
    <Card pad={false}>
      <table className="table tabular">
        <thead><tr><th>Rk</th><th>Team</th><th className="text-right">Commits</th><th className="text-right">5★</th><th className="text-right">4★</th><th className="text-right">Avg ★</th><th className="text-right">Score</th></tr></thead>
        <tbody>{ranks.map((r) => { const t = teams.get(r.teamId); return t ? (
          <tr key={r.teamId}><td className="font-display text-lg font-bold">{r.rank}</td><td><TeamLink team={t} /></td><td className="text-right">{r.commits}</td><td className="text-right">{r.fiveStars}</td><td className="text-right">{r.fourStars}</td><td className="text-right">{r.avgStars.toFixed(2)}</td><td className="text-right font-bold">{r.score.toFixed(1)}</td></tr>
        ) : null; })}</tbody>
      </table>
    </Card>
  );
}

async function Feed({ seasonId, teams }: { seasonId: string; teams: Awaited<ReturnType<typeof getTeamMap>> }) {
  const rows = await getSql()`select c.*, r.first_name, r.last_name, r.position, r.stars, r.national_rank, r.hometown, r.is_transfer from commitments c join recruits r on r.id = c.recruit_id
    where c.season_id = ${seasonId} order by c.created_at desc, c.week desc limit 100`;
  if (!rows.length) return <EmptyState title="No commitment news yet" />;
  const label: Record<string, string> = { commit: 'Commits to', decommit: 'Decommits from', flip: 'Flips to', signed: 'Signs with' };
  return (
    <Card pad={false}>
      <ul className="divide-y divide-line/60">{rows.map((c) => {
        const t = teams.get(c.teamId);
        const prev = c.previousTeamId ? teams.get(c.previousTeamId) : null;
        return (
          <li key={c.id} className="flex items-center gap-3 px-4 py-3">
            {t && <TeamLogo team={t} size={36} />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm"><Link href={`/recruiting/${c.recruitId}`} className="font-semibold hover:text-accent">{c.firstName} {c.lastName}</Link><Stars n={c.stars} /><span className="text-muted">{c.position} · {c.isTransfer ? 'Transfer' : `#${c.nationalRank}`} · {c.hometown}</span></div>
              <div className="text-xs font-bold uppercase tracking-wide"><Badge tone={c.event === 'decommit' ? 'loss' : c.event === 'flip' ? 'gold' : c.event === 'signed' ? 'win' : 'accent'}>{c.event}</Badge> {label[c.event]} {t?.school}{prev ? ` (from ${prev.school})` : ''} · week {c.week}</div>
            </div>
          </li>
        );
      })}</ul>
    </Card>
  );
}
