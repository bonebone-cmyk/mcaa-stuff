import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSql } from '@/lib/db';
import { Badge, Card, DemoBadge, Meter, PageHeader, Stars, StatTile, TeamLogo } from '@/components/ui';
import { getActor } from '@/lib/auth/session';
import { actorTeamId } from '@/lib/queries/actor-team';
import { getTeamMap } from '@/lib/queries';
import { ATTRIBUTE_LABELS, formatHeight, SCHEME_LABELS } from '@/lib/players/positions';
import { factorScores, PRIORITY_KEYS, PRIORITY_LABELS, topPriorities, type Priorities } from '@/lib/recruiting/engine';
import { ratingBand } from '@/lib/recruiting/generate';
import { loadTeamContexts } from '@/lib/services/recruiting';
import { getSettings } from '@/lib/services/settings';
import { RecruitActions } from './recruit-actions';

export default async function RecruitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = getSql();
  const [r] = await sql`select r.*, s.current_week, s.year from recruits r join seasons s on s.id = r.season_id where r.id = ${id}`;
  if (!r) notFound();
  const [teams, actor, settings] = await Promise.all([getTeamMap(), getActor(), getSettings(sql)]);
  const myTeamId = actorTeamId(actor);
  const isComm = actor?.role === 'commissioner';
  // Interest is private: a coach sees only their own program's meter, the commissioner sees every school.
  const interest = isComm
    ? await sql`select * from recruit_interest where recruit_id = ${id} order by interest desc limit 12`
    : myTeamId ? await sql`select * from recruit_interest where recruit_id = ${id} and team_id = ${myTeamId}` : [];
  const mine = myTeamId ? interest.find((i) => i.teamId === myTeamId) ?? null : null;
  const scouted = isComm || !!mine?.scouted || r.status === 'signed';
  const [offers, history, myActions] = await Promise.all([
    sql`select team_id from recruit_interest where recruit_id = ${id} and offered`,
    sql`select * from commitments where recruit_id = ${id} order by created_at`,
    myTeamId ? sql`select * from recruiting_actions where recruit_id = ${id} and team_id = ${myTeamId} order by created_at desc limit 20` : Promise.resolve([]),
  ]);
  const committed = r.committedTeamId ? teams.get(r.signedTeamId ?? r.committedTeamId) : null;
  const priorities = r.priorities as Priorities;
  const top3 = topPriorities(priorities);
  let myFit: Record<string, number> | null = null;
  if (myTeamId) {
    const ctxs = await loadTeamContexts(sql, r.seasonId);
    const ctx = ctxs.find((c) => c.id === myTeamId);
    if (ctx) myFit = factorScores({ ...r, priorities } as any, ctx, (mine as any) ?? undefined, ctxs.length);
  }
  const hsClosed = !r.isTransfer && r.currentWeek > settings.recruitingRules.signingDayWeek;
  return (
    <div>
      <PageHeader title={`${r.firstName} ${r.lastName}`} eyebrow={<span className="flex items-center gap-2">{r.isTransfer ? 'Transfer portal' : `Class of ${r.classYear}`}<DemoBadge show={r.isDemo} /></span>}>
        {r.position} · {r.hometown} · {formatHeight(r.heightIn)}, {r.weight} lbs
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Rating" value={<Stars n={r.stars} size="md" />} sub={`${r.stars}-star`} />
            <StatTile label="National" value={r.nationalRank ? `#${r.nationalRank}` : '—'} sub={r.isTransfer ? 'Portal' : 'Overall rank'} />
            <StatTile label={`${r.position} rank`} value={r.positionRank ? `#${r.positionRank}` : '—'} />
            <StatTile label={`${r.homeState} rank`} value={r.stateRank ? `#${r.stateRank}` : '—'} />
          </div>
          <Card title="Scouting Report" action={!scouted ? <Badge>Unscouted · ranges shown</Badge> : <Badge tone="win">Scouted</Badge>}>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <StatTile label="Overall" value={ratingBand(r.overall, scouted)} />
              <StatTile label="Potential" value={ratingBand(r.potential, scouted)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(r.attributes as Record<string, number>).map(([k, v]) => (
                <div key={k}>
                  <div className="mb-1 flex justify-between text-xs"><span className="text-muted">{ATTRIBUTE_LABELS[k] ?? k}</span><span className="tabular font-bold">{ratingBand(v, scouted)}</span></div>
                  <Meter value={scouted ? v : Math.floor((v - 4) / 5) * 5 + 5} />
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">Preferred scheme: {r.preferredScheme ? SCHEME_LABELS[r.preferredScheme] : 'No preference'}</p>
          </Card>
          <Card title="What Matters Most">
            <div className="grid gap-2 sm:grid-cols-3">
              {top3.map((k, i) => <div key={k} className="rounded-xl bg-surface-2 p-3"><div className="eyebrow">#{i + 1} priority</div><div className="font-semibold">{PRIORITY_LABELS[k]}</div></div>)}
            </div>
            {myFit && (
              <div className="mt-4">
                <div className="eyebrow mb-2">How {teams.get(myTeamId!)?.school} measures up (your eyes only)</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PRIORITY_KEYS.map((k) => (
                    <div key={k}><div className="mb-0.5 flex justify-between text-xs"><span className={top3.includes(k) ? 'font-bold' : 'text-muted'}>{PRIORITY_LABELS[k]}</span><span className="tabular">{Math.round(myFit![k] * 100)}</span></div><Meter value={myFit![k] * 100} /></div>
                  ))}
                </div>
              </div>
            )}
          </Card>
          <Card title="Recruitment Timeline">
            {history.length ? (
              <ol className="space-y-2 text-sm">{history.map((h) => { const t = teams.get(h.teamId); return <li key={h.id} className="flex items-center gap-2">{t && <TeamLogo team={t} size={20} />}<Badge tone={h.event === 'decommit' ? 'loss' : h.event === 'signed' ? 'win' : h.event === 'flip' ? 'gold' : 'accent'}>{h.event}</Badge><span>{t?.school}</span><span className="text-muted">· week {h.week}</span></li>; })}</ol>
            ) : <p className="text-sm text-muted">No commitment activity yet.</p>}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Status">
            {committed ? (
              <div className="flex items-center gap-3"><TeamLogo team={committed} size={52} /><div><div className="eyebrow">{r.status === 'signed' ? 'Signed with' : 'Committed to'}</div><Link href={`/teams/${committed.slug}`} className="font-display text-xl font-bold hover:text-accent">{committed.school}</Link></div></div>
            ) : <div className="font-display text-xl font-bold capitalize">{r.status === 'withdrawn' ? (r.isTransfer ? 'Withdrew from portal' : 'Unsigned') : 'Uncommitted'}</div>}
            {r.isTransfer && r.fromTeamId && <p className="mt-2 text-sm text-muted">Transferring from {teams.get(r.fromTeamId)?.school}</p>}
          </Card>
          <Card title={`Offers (${offers.length})`}>
            {offers.length ? <div className="flex flex-wrap gap-2">{offers.map((o) => { const t = teams.get(o.teamId); return t ? <Link key={o.teamId} href={`/teams/${t.slug}`} title={t.school}><TeamLogo team={t} size={30} /></Link> : null; })}</div> : <p className="text-sm text-muted">No scholarship offers yet.</p>}
          </Card>
          {interest.length > 0 && (
            <Card title={isComm ? 'Interest (commissioner view)' : 'Your Interest Meter'}>
              <ul className="space-y-3">{interest.map((i) => { const t = teams.get(i.teamId); return t ? (
                <li key={i.teamId}>
                  <div className="mb-1 flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-semibold"><TeamLogo team={t} size={18} />{t.abbreviation}{i.offered && <Badge tone="accent">Offer</Badge>}{i.visited && <Badge tone="win">Visited</Badge>}</span><span className="tabular font-bold">{Math.round(i.interest)}</span></div>
                  <Meter value={i.interest} color={t.primaryColor} />
                  <div className="mt-0.5 text-[11px] text-muted">Relationship {Math.round(i.relationship)} · {i.pitches} pitches</div>
                </li>
              ) : null; })}</ul>
            </Card>
          )}
          {myTeamId && r.status !== 'signed' && r.status !== 'withdrawn' && !hsClosed && (
            <RecruitActions recruitId={r.id} teamId={myTeamId} offered={!!mine?.offered || myActions.some((a) => a.actionType === 'offer' && (a.status === 'pending' || a.status === 'approved'))} offerPending={!mine?.offered && myActions.some((a) => a.actionType === 'offer' && (a.status === 'pending' || a.status === 'approved'))} visited={!!mine?.visited} scouted={!!mine?.scouted} costs={settings.recruitingRules.costs} recent={myActions.map((a) => ({ id: a.id, type: a.actionType, status: a.status, week: a.week, note: a.resultNote }))} />
          )}
          {!actor && <Card><p className="text-sm text-muted"><Link href="/login" className="font-semibold text-accent">Sign in</Link> as a head coach to recruit this prospect.</p></Card>}
        </div>
      </div>
    </div>
  );
}
