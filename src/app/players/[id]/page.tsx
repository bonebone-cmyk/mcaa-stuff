import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSql } from '@/lib/db';
import { ActionForm, Submit } from '@/components/action-form';
import { Badge, Card, DemoBadge, Meter, PageHeader, RatingPill, Stars, StatTile, TeamLogo } from '@/components/ui';
import { getActor } from '@/lib/auth/session';
import { canRecruitFor } from '@/lib/auth/permissions';
import { getTeamMap } from '@/lib/queries';
import { ATTRIBUTE_LABELS, classLabel, formatHeight } from '@/lib/players/positions';
import { portalAction } from '@/app/my-team/actions';
import { getSettings } from '@/lib/services/settings';

const COLS: [string, string][] = [
  ['games', 'G'], ['passCmp', 'CMP'], ['passAtt', 'ATT'], ['passYds', 'PASS YDS'], ['passTd', 'PASS TD'], ['passInt', 'INT'],
  ['rushAtt', 'CAR'], ['rushYds', 'RUSH YDS'], ['rushTd', 'RUSH TD'], ['rec', 'REC'], ['recYds', 'REC YDS'], ['recTd', 'REC TD'],
  ['tackles', 'TKL'], ['tfl', 'TFL'], ['sacks', 'SACK'], ['defInt', 'DEF INT'], ['forcedFumbles', 'FF'], ['fgm', 'FGM'], ['fga', 'FGA'], ['xpm', 'XPM'],
];

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = getSql();
  const [p] = await sql`select * from players where id = ${id}`;
  if (!p) notFound();
  const [teams, actor, settings] = await Promise.all([getTeamMap(), getActor(), getSettings(sql)]);
  const team = p.teamId ? teams.get(p.teamId) : null;
  const [seasons, gameLog, awards, transfers, devLog, recruit] = await Promise.all([
    sql`select ps.*, s.year, s.is_demo from player_season_stats ps join seasons s on s.id = ps.season_id where ps.player_id = ${id} order by s.year`,
    sql`select s.*, g.week, g.home_team_id, g.away_team_id, g.home_score, g.away_score, se.year from player_game_stats s join games g on g.id = s.game_id join seasons se on se.id = g.season_id
        where s.player_id = ${id} and g.game_type <> 'exhibition' order by se.year desc, g.week desc limit 15`,
    sql`select a.*, s.year from awards a left join seasons s on s.id = a.season_id where a.player_id = ${id} order by s.year desc`,
    sql`select * from player_transfers where player_id = ${id} order by created_at`,
    sql`select d.*, s.year from player_development_log d left join seasons s on s.id = d.season_id where d.player_id = ${id} order by d.created_at`,
    p.recruitId ? sql`select * from recruits where id = ${p.recruitId}` : Promise.resolve([]),
  ]);
  const career = Object.fromEntries(COLS.map(([k]) => [k, seasons.reduce((a, s) => a + Number(s[k] ?? 0), 0)]));
  const relevant = COLS.filter(([k]) => k === 'games' || seasons.some((s) => Number(s[k]) > 0));
  // Milestones derived from official statistics
  const milestones: string[] = [];
  for (const s of seasons) {
    if (s.passYds >= 3000) milestones.push(`${s.year}: ${s.passYds} passing yards`);
    if (s.rushYds >= 1000) milestones.push(`${s.year}: 1,000-yard rusher (${s.rushYds})`);
    if (s.recYds >= 1000) milestones.push(`${s.year}: 1,000-yard receiver (${s.recYds})`);
    if (Number(s.sacks) >= 10) milestones.push(`${s.year}: ${s.sacks} sacks`);
  }
  for (const g of gameLog) {
    if (g.passYds >= 400) milestones.push(`${g.year} Wk ${g.week}: ${g.passYds}-yard passing game`);
    if (g.rushYds >= 200) milestones.push(`${g.year} Wk ${g.week}: ${g.rushYds}-yard rushing game`);
  }
  const canPortal = p.status === 'active' && p.teamId && canRecruitFor(actor, p.teamId, settings);
  return (
    <div style={{ ['--team' as string]: team?.primaryColor }}>
      <div className="relative mb-6 overflow-hidden rounded-2xl p-6 text-white shadow-card" style={{ background: `linear-gradient(120deg, ${team?.primaryColor ?? '#333'}, #0b0b0d)` }}>
        <div className="flex flex-wrap items-center gap-5">
          {team && <TeamLogo team={team} size={80} />}
          <div className="flex-1">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/75">{team ? <Link href={`/teams/${team.slug}`} className="hover:underline">{team.school}</Link> : 'No team'} · #{p.jersey ?? '–'} · {p.position}</div>
            <h1 className="font-display text-4xl font-black uppercase">{p.firstName} {p.lastName}</h1>
            <div className="text-sm text-white/80">{classLabel(p.seasonsPlayed, p.redshirtUsed, p.status)} · {formatHeight(p.heightIn)}, {p.weight} lbs · {p.hometown ?? 'Hometown unknown'}</div>
            <div className="mt-2 flex flex-wrap gap-2"><Stars n={p.stars} size="md" />{p.status !== 'active' && <Badge>{p.status}</Badge>}{p.injuryWeeks > 0 && <Badge tone="loss">{p.injuryType} · {p.injuryWeeks} wk</Badge>}<DemoBadge show={p.isDemo} /></div>
          </div>
          <div className="text-center"><div className="eyebrow !text-white/70">Overall</div><div className="font-display text-6xl font-black">{p.overall}</div><div className="text-xs text-white/70">Potential {p.potential}</div></div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Season & Career Statistics" pad={false}>
            {seasons.length ? (
              <div className="overflow-x-auto"><table className="table tabular">
                <thead><tr><th>Season</th><th>Team</th>{relevant.map(([k, l]) => <th key={k} className="text-right">{l}</th>)}</tr></thead>
                <tbody>
                  {seasons.map((s) => <tr key={s.seasonId}><td>{s.year} <DemoBadge show={s.isDemo} /></td><td>{teams.get(s.teamId)?.abbreviation}</td>{relevant.map(([k]) => <td key={k} className="text-right">{Number(s[k])}</td>)}</tr>)}
                  <tr className="font-bold"><td>Career</td><td></td>{relevant.map(([k]) => <td key={k} className="text-right">{career[k]}</td>)}</tr>
                </tbody>
              </table></div>
            ) : <div className="card-pad text-sm text-muted">No official game statistics yet.</div>}
          </Card>
          <Card title="Game Log" pad={false}>
            {gameLog.length ? (
              <div className="overflow-x-auto"><table className="table tabular">
                <thead><tr><th>Game</th><th>Result</th><th className="text-right">Pass</th><th className="text-right">Rush</th><th className="text-right">Rec</th><th className="text-right">Def</th></tr></thead>
                <tbody>{gameLog.map((g) => {
                  const home = g.homeTeamId === g.teamId;
                  const opp = teams.get(home ? g.awayTeamId : g.homeTeamId);
                  const us = home ? g.homeScore : g.awayScore;
                  const them = home ? g.awayScore : g.homeScore;
                  return (
                    <tr key={g.gameId}>
                      <td><Link href={`/games/${g.gameId}`} className="hover:text-accent">{g.year} Wk {g.week} {home ? 'vs' : '@'} {opp?.abbreviation}</Link></td>
                      <td className={us > them ? 'text-win' : 'text-loss'}>{us > them ? 'W' : 'L'} {us}-{them}</td>
                      <td className="text-right">{g.passAtt ? `${g.passCmp}/${g.passAtt}, ${g.passYds}, ${g.passTd}TD` : '—'}</td>
                      <td className="text-right">{g.rushAtt ? `${g.rushAtt}-${g.rushYds}, ${g.rushTd}TD` : '—'}</td>
                      <td className="text-right">{g.rec ? `${g.rec}-${g.recYds}, ${g.recTd}TD` : '—'}</td>
                      <td className="text-right">{g.tackles || Number(g.sacks) || g.defInt ? `${g.tackles}T ${Number(g.sacks)}S ${g.defInt}I` : '—'}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            ) : <div className="card-pad text-sm text-muted">No games played.</div>}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Attributes">
            <div className="space-y-2">{Object.entries(p.attributes as Record<string, number>).map(([k, v]) => (
              <div key={k}><div className="mb-0.5 flex justify-between text-xs"><span className="text-muted">{ATTRIBUTE_LABELS[k] ?? k}</span><span className="tabular font-bold">{v}</span></div><Meter value={v} color={team?.primaryColor} /></div>
            ))}</div>
            <p className="mt-3 text-xs text-muted">Development trait: <span className="font-semibold capitalize text-fg">{p.devTrait}</span> · Eligibility used: {p.seasonsPlayed}/4{p.redshirtUsed ? ' (redshirt used)' : ''}</p>
          </Card>
          <Card title="Development">
            {devLog.length ? <ul className="space-y-1 text-sm">{devLog.map((d) => <li key={d.id} className="flex justify-between"><span>{d.year ?? '—'} offseason{d.note ? ` · ${d.note}` : ''}</span><span className={d.newOverall >= d.oldOverall ? 'text-win' : 'text-loss'}>{d.oldOverall} → {d.newOverall}</span></li>)}</ul> : <p className="text-sm text-muted">No offseason progression recorded yet.</p>}
          </Card>
          <Card title="Milestones & Awards">
            {milestones.length || awards.length ? <ul className="space-y-1 text-sm">{awards.map((a) => <li key={a.id}>🎖 {a.year} {a.name}</li>)}{milestones.map((m) => <li key={m}>⭐ {m}</li>)}</ul> : <p className="text-sm text-muted">None yet.</p>}
          </Card>
          <Card title="Recruiting & Transfers">
            <ul className="space-y-1 text-sm">
              {recruit[0] ? <li>Signed out of high school as a <Link href={`/recruiting/${recruit[0].id}`} className="font-semibold text-accent">{recruit[0].stars}-star, No. {recruit[0].nationalRank} prospect</Link></li> : <li className="text-muted">Pre-universe roster player (no recruiting record).</li>}
              {transfers.map((t) => <li key={t.id}>Transferred {teams.get(t.fromTeamId)?.abbreviation ?? '—'} → {teams.get(t.toTeamId)?.abbreviation ?? '—'}</li>)}
            </ul>
            {canPortal && (
              <ActionForm action={portalAction} confirm={`Release ${p.firstName} ${p.lastName} into the transfer portal? Other programs can then recruit him.`} className="mt-3">
                <input type="hidden" name="playerId" value={p.id} />
                <Submit className="btn-danger btn-sm">Release to transfer portal</Submit>
              </ActionForm>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
