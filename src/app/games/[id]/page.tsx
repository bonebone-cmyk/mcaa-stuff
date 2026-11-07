import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSql } from '@/lib/db';
import { Badge, Card, DemoBadge, EmptyState, Tabs, TeamLogo, fmtClock, quarterLabel } from '@/components/ui';
import { WinProbChart } from '@/components/games/win-prob-chart';
import { DriveChart } from '@/components/games/drive-chart';
import { kickoffLabel } from '@/components/games/game-card';
import { getRankMap, getTeamMap, getTeamRecords, recordStr, weekLabel } from '@/lib/queries';
import { getActor } from '@/lib/auth/session';
import { GameAdminPanel } from './admin-panel';

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const [g] = await getSql()`select h.school as home, a.school as away from games g join teams h on h.id = g.home_team_id join teams a on a.id = g.away_team_id where g.id = ${id}`.catch(() => []);
  return { title: g ? `${g.away} at ${g.home}` : 'Game' };
}

const STAT_ROWS: [string, string][] = [
  ['firstDowns', 'First downs'], ['totalYards', 'Total yards'], ['passYards', 'Passing yards'], ['rushYards', 'Rushing yards'],
  ['passCmpAtt', 'Comp / Att'], ['rushAtt', 'Rush attempts'], ['thirdDowns', '3rd down'], ['turnovers', 'Turnovers'],
  ['sacks', 'Sacks'], ['penaltyLine', 'Penalties'], ['top', 'Time of possession'],
];

export default async function GamePage({ params, searchParams }: Params) {
  const { id } = await params;
  const { tab = 'box' } = await searchParams;
  const sql = getSql();
  const [g] = await sql`select g.*, n.name as network_name, r.name as rivalry_name, s.name as season_name, s.regular_season_weeks, s.year
                        from games g join seasons s on s.id = g.season_id left join tv_networks n on n.id = g.tv_network_id left join rivalries r on r.id = g.rivalry_id
                        where g.id = ${id}`;
  if (!g) notFound();
  const [teams, ranks, records, actor] = await Promise.all([getTeamMap(), getRankMap(g.seasonId), getTeamRecords(g.seasonId), getActor()]);
  const home = teams.get(g.homeTeamId)!;
  const away = teams.get(g.awayTeamId)!;
  const final = g.status === 'final';
  const [teamStats, playerStats, plays, drives, h2h] = await Promise.all([
    sql`select * from team_game_stats where game_id = ${id}`,
    sql`select s.*, p.first_name, p.last_name, p.position, p.jersey from player_game_stats s join players p on p.id = s.player_id where s.game_id = ${id}`,
    tab === 'pbp' || tab === 'box' ? sql`select * from game_plays where game_id = ${id} order by seq` : Promise.resolve([]),
    sql`select * from game_drives where game_id = ${id} order by drive_no`,
    sql`select count(*) filter (where winner_team_id = ${home.id})::int as hw, count(*) filter (where winner_team_id = ${away.id})::int as aw
        from games where status = 'final' and game_type <> 'exhibition' and ((home_team_id = ${home.id} and away_team_id = ${away.id}) or (home_team_id = ${away.id} and away_team_id = ${home.id}))`,
  ]);
  const ts = (teamId: string) => teamStats.find((t) => t.teamId === teamId);
  const fmtStat = (t: any, key: string) => {
    if (!t) return '—';
    if (key === 'passCmpAtt') return `${t.passCmp}/${t.passAtt}`;
    if (key === 'thirdDowns') return `${t.thirdDownConv}/${t.thirdDownAtt}`;
    if (key === 'penaltyLine') return `${t.penalties}-${t.penaltyYards}`;
    if (key === 'top') return fmtClock(t.timeOfPossession);
    return t[key];
  };
  const quarters = Math.max(g.homeQuarters?.length ?? 4, 4);
  const pregame = g.summary?.pregameHomeWinProb as number | undefined;

  return (
    <div className="space-y-6">
      {/* Scoreboard */}
      <div className="overflow-hidden rounded-2xl shadow-card" style={{ background: `linear-gradient(110deg, ${away.primaryColor}, #0b0b0d 45%, #0b0b0d 55%, ${home.primaryColor})` }}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">
          <span>{g.seasonName} · {weekLabel(g, g.week)}</span>
          <span className="flex items-center gap-2">
            {g.rivalryName && <Badge tone="gold">{g.rivalryName}</Badge>}
            {g.gameType === 'exhibition' && <Badge>Exhibition · not counted</Badge>}
            {g.simMode && <Badge>{g.simMode === 'manual' ? 'Manual result' : `${g.simMode} sim`}</Badge>}
            <DemoBadge show={g.isDemo} />
          </span>
        </div>
        <div className="flex items-center gap-3 px-5 py-6 text-white sm:gap-6">
          {[away, home].map((t, i) => (
            <div key={t.id} className={`flex flex-1 items-center gap-3 ${i === 1 ? 'flex-row-reverse text-right' : ''}`}>
              <TeamLogo team={t} size={72} />
              <div className="min-w-0">
                <div className="text-xs font-bold text-white/70">{ranks.get(t.id) ? `No. ${ranks.get(t.id)} · ` : ''}{recordStr(records.get(t.id))}</div>
                <Link href={`/teams/${t.slug}`} className="block truncate font-display text-xl font-extrabold uppercase hover:underline sm:text-3xl">{t.school}</Link>
                <div className="text-xs text-white/70">{t.mascot}</div>
              </div>
              {final && <div className={`tabular font-display text-5xl font-black sm:text-6xl ${(i === 0 ? g.awayScore < g.homeScore : g.homeScore < g.awayScore) ? 'opacity-50' : ''}`}>{i === 0 ? g.awayScore : g.homeScore}</div>}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-black/30 px-5 py-2 text-xs font-semibold text-white/85">
          <span>{final ? `FINAL${g.overtimes ? ` (${g.overtimes > 1 ? `${g.overtimes}OT` : 'OT'})` : ''}` : kickoffLabel(g.kickoffAt)}</span>
          {g.networkName && <span>{g.networkName}</span>}
          <span>{g.siteName ?? (g.neutralSite ? 'Neutral site' : home.school + ' home')}</span>
          <span>Series: {home.abbreviation} {h2h[0].hw} – {h2h[0].aw} {away.abbreviation}</span>
          {pregame !== undefined && <span>Pregame: {home.abbreviation} {(pregame * 100).toFixed(0)}% to win</span>}
        </div>
      </div>

      {actor?.role === 'commissioner' && <GameAdminPanel gameId={g.id} status={g.status} version={g.version} homeAbbr={home.abbreviation} awayAbbr={away.abbreviation} />}

      {!final ? (
        <Card title="Matchup Preview">
          <div className="grid gap-4 sm:grid-cols-3">
            {[['Overall', 'overallRating'], ['Offense', 'offenseRating'], ['Defense', 'defenseRating']].map(([label, key]) => (
              <div key={key} className="rounded-xl border border-line p-3">
                <div className="eyebrow mb-2">{label}</div>
                <div className="flex items-center justify-between font-display text-2xl font-bold"><span>{away.abbreviation} {(away as any)[key]}</span><span>{(home as any)[key]} {home.abbreviation}</span></div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <>
          <Tabs active={tab} tabs={[
            { key: 'box', label: 'Box Score', href: `/games/${id}?tab=box` },
            { key: 'pbp', label: 'Play-by-Play', href: `/games/${id}?tab=pbp` },
            { key: 'drives', label: 'Drive Chart', href: `/games/${id}?tab=drives` },
            ...(plays.length || drives.length ? [{ key: 'live', label: '▶ Live Replay', href: `/games/${id}/live` }] : []),
          ]} />

          {tab === 'box' && (
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="space-y-6 lg:col-span-3">
                <Card title="Scoring by Quarter" pad={false}>
                  <div className="overflow-x-auto">
                    <table className="table tabular">
                      <thead><tr><th>Team</th>{Array.from({ length: quarters }, (_, i) => <th key={i} className="text-center">{quarterLabel(i + 1)}</th>)}<th className="text-center">T</th></tr></thead>
                      <tbody>
                        {[[away, g.awayQuarters, g.awayScore], [home, g.homeQuarters, g.homeScore]].map(([t, q, s]: any) => (
                          <tr key={t.id}><td><span className="flex items-center gap-2 font-semibold"><TeamLogo team={t} size={20} />{t.abbreviation}</span></td>
                            {Array.from({ length: quarters }, (_, i) => <td key={i} className="text-center">{q?.[i] ?? 0}</td>)}
                            <td className="text-center font-bold">{s}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
                {plays.length > 1 && (
                  <Card title="Win Probability">
                    <WinProbChart points={plays.map((p, i) => ({ x: i, p: p.homeWinProb }))} homeColor={home.primaryColor} awayColor={away.primaryColor} homeAbbr={home.abbreviation} awayAbbr={away.abbreviation} />
                  </Card>
                )}
                <PlayerStats lines={playerStats} teams={[away, home]} />
              </div>
              <div className="space-y-6 lg:col-span-2">
                <Card title="Team Stats" pad={false}>
                  <table className="table tabular">
                    <thead><tr><th>{away.abbreviation}</th><th className="text-center"></th><th className="text-right">{home.abbreviation}</th></tr></thead>
                    <tbody>{STAT_ROWS.map(([k, label]) => (
                      <tr key={k}><td className="font-semibold">{fmtStat(ts(away.id), k)}</td><td className="text-center text-xs text-muted">{label}</td><td className="text-right font-semibold">{fmtStat(ts(home.id), k)}</td></tr>
                    ))}</tbody>
                  </table>
                </Card>
                <Card title="Scoring Summary">
                  {g.summary?.scoring?.length ? (
                    <ol className="space-y-3 text-sm">
                      {g.summary.scoring.filter((s: any) => /TOUCHDOWN|field goal|SAFETY|two-point|extra point/i.test(s.text) && !/extra point/i.test(s.text)).map((s: any, i: number) => {
                        const t = teams.get(s.team);
                        return (
                          <li key={i} className="flex gap-3">
                            {t && <TeamLogo team={t} size={22} />}
                            <div className="min-w-0"><div className="text-[11px] font-bold text-muted">{quarterLabel(s.q)} {s.q <= 4 ? fmtClock(s.clock) : ''} · {away.abbreviation} {s.away} – {s.home} {home.abbreviation}</div><div className="truncate">{s.text.replace(/^.* — /, '')}</div></div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : <p className="text-sm text-muted">{g.simMode === 'manual' ? 'Manual result — no play data recorded.' : 'Quick sim — no scoring detail recorded.'}</p>}
                </Card>
                {g.summary?.injuries?.length ? (
                  <Card title="Injuries">
                    <ul className="space-y-1 text-sm">{g.summary.injuries.map((i: any) => <li key={i.playerId}><Link href={`/players/${i.playerId}`} className="font-semibold hover:text-accent">{i.name}</Link> <span className="text-muted">({teams.get(i.teamId)?.abbreviation}) — {i.type}, {i.weeks >= 12 ? 'season' : `${i.weeks} wk`}</span></li>)}</ul>
                  </Card>
                ) : null}
                {g.notes && <Card title="Notes"><p className="text-sm">{g.notes}</p></Card>}
              </div>
            </div>
          )}

          {tab === 'pbp' && (
            plays.length ? (
              <Card pad={false}>
                <ol className="divide-y divide-line/60">
                  {plays.map((p) => {
                    const t = teams.get(p.offenseTeamId);
                    const meta = p.playType === 'end_quarter' || p.playType === 'injury';
                    return (
                      <li key={p.seq} className={`flex gap-3 px-4 py-2 text-sm ${p.isScoring ? 'bg-accent/10' : ''} ${meta ? 'bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted' : ''}`}>
                        <span className="tabular w-16 shrink-0 text-xs text-muted">{quarterLabel(p.quarter)} {p.quarter <= 4 ? fmtClock(p.clock) : ''}</span>
                        {!meta && t && <TeamLogo team={t} size={18} />}
                        <span className="flex-1">{p.description}</span>
                        <span className="tabular shrink-0 text-xs text-muted">{p.awayScore}-{p.homeScore}</span>
                      </li>
                    );
                  })}
                </ol>
              </Card>
            ) : <EmptyState title="No play-by-play">This game was {g.simMode === 'manual' ? 'entered manually' : 'quick-simmed'}; only the box score was saved.</EmptyState>
          )}

          {tab === 'drives' && (
            drives.length ? <Card title="Drive Chart"><DriveChart drives={drives as any} home={home} away={away} /></Card>
              : <EmptyState title="No drive data">Drive charts are saved for detailed and live simulations.</EmptyState>
          )}
        </>
      )}
    </div>
  );
}

function PlayerStats({ lines, teams }: { lines: any[]; teams: any[] }) {
  if (!lines.length) return null;
  const name = (l: any) => <Link href={`/players/${l.playerId}`} className="font-semibold hover:text-accent">{l.firstName[0]}. {l.lastName}</Link>;
  const sections: { title: string; filter: (l: any) => boolean; sort: (l: any) => number; cols: [string, (l: any) => string | number][] }[] = [
    { title: 'Passing', filter: (l) => l.passAtt > 0, sort: (l) => l.passYds, cols: [['C/ATT', (l) => `${l.passCmp}/${l.passAtt}`], ['YDS', (l) => l.passYds], ['TD', (l) => l.passTd], ['INT', (l) => l.passInt]] },
    { title: 'Rushing', filter: (l) => l.rushAtt > 0, sort: (l) => l.rushYds, cols: [['CAR', (l) => l.rushAtt], ['YDS', (l) => l.rushYds], ['AVG', (l) => (l.rushYds / l.rushAtt).toFixed(1)], ['TD', (l) => l.rushTd]] },
    { title: 'Receiving', filter: (l) => l.rec > 0, sort: (l) => l.recYds, cols: [['REC', (l) => l.rec], ['YDS', (l) => l.recYds], ['TD', (l) => l.recTd]] },
    { title: 'Defense', filter: (l) => l.tackles > 0 || l.sacks > 0 || l.defInt > 0, sort: (l) => l.tackles + l.sacks * 2 + l.defInt * 3, cols: [['TKL', (l) => l.tackles], ['TFL', (l) => l.tfl], ['SACK', (l) => Number(l.sacks)], ['INT', (l) => l.defInt], ['FF', (l) => l.forcedFumbles]] },
    { title: 'Kicking', filter: (l) => l.fga > 0 || l.xpa > 0, sort: (l) => l.fgm * 3 + l.xpm, cols: [['FG', (l) => `${l.fgm}/${l.fga}`], ['XP', (l) => `${l.xpm}/${l.xpa}`], ['PTS', (l) => l.fgm * 3 + l.xpm]] },
  ];
  return (
    <Card title="Individual Stats" pad={false}>
      <div className="divide-y divide-line">
        {sections.map((s) => (
          <div key={s.title} className="grid gap-0 md:grid-cols-2">
            {teams.map((t) => {
              const rows = lines.filter((l) => l.teamId === t.id && s.filter(l)).sort((a, b) => s.sort(b) - s.sort(a)).slice(0, s.title === 'Defense' ? 5 : 4);
              return (
                <div key={t.id} className="overflow-x-auto">
                  <table className="table tabular">
                    <thead><tr><th>{t.abbreviation} {s.title}</th>{s.cols.map(([h]) => <th key={h} className="text-right">{h}</th>)}</tr></thead>
                    <tbody>{rows.length ? rows.map((l) => <tr key={l.playerId}><td>{name(l)}</td>{s.cols.map(([h, f]) => <td key={h} className="text-right">{f(l)}</td>)}</tr>) : <tr><td colSpan={s.cols.length + 1} className="text-muted">—</td></tr>}</tbody>
                  </table>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}
