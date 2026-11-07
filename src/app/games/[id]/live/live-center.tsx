'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { TeamLogo } from '@/components/team-logo';
import { Icon } from '@/components/icons';
import { WinProbChart } from '@/components/games/win-prob-chart';

interface Team { id: string; slug: string; school: string; abbreviation: string; logoUrl: string | null; primaryColor: string; secondaryColor: string }
interface Play {
  seq: number; driveNo: number; quarter: number; clock: number; offenseTeamId: string; down: number | null; distance: number | null;
  yardLine: number | null; playType: string; yards: number; description: string; homeScore: number; awayScore: number;
  isScoring: boolean; isTurnover: boolean; homeWinProb: number; statDeltas: [string, string, number][] | null;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const qLabel = (q: number) => (q <= 4 ? ['1st', '2nd', '3rd', '4th'][q - 1] : q === 5 ? 'OT' : `${q - 4}OT`);
const SPEEDS = [{ label: '1×', ms: 1600 }, { label: '3×', ms: 550 }, { label: '10×', ms: 160 }];

/**
 * Drive-by-drive presentation of a game the server already simulated and
 * saved. Every number shown is computed from the stored plays, so the replay
 * always matches the official box score.
 */
export function LiveGameCenter({ gameId, home, away, plays, players }: { gameId: string; home: Team; away: Team; plays: Play[]; players: Record<string, { name: string; teamId: string; position: string }> }) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const last = plays.length - 1;
  useEffect(() => {
    if (!playing || idx >= last) return;
    const t = setTimeout(() => setIdx((i) => Math.min(last, i + 1)), SPEEDS[speed].ms);
    return () => clearTimeout(t);
  }, [playing, idx, speed, last]);

  const cur = plays[idx];
  // the situation on the field is the pre-snap state of the NEXT play
  const situ = plays[Math.min(idx + 1, last)];
  const shown = plays.slice(0, idx + 1);
  const team = (id: string) => (id === home.id ? home : away);

  const { teamStats, leaders } = useMemo(() => {
    const per: Record<string, Record<string, number>> = {};
    for (const p of shown) for (const [pid, k, v] of p.statDeltas ?? []) {
      per[pid] ??= {};
      per[pid][k] = (per[pid][k] ?? 0) + v;
    }
    const ts = (tid: string) => {
      const ids = Object.keys(per).filter((pid) => players[pid]?.teamId === tid);
      const sum = (k: string) => ids.reduce((a, pid) => a + (per[pid][k] ?? 0), 0);
      const offPlays = shown.filter((p) => p.offenseTeamId === tid);
      return {
        pass: sum('passYds'), rush: sum('rushYds'), cmp: sum('passCmp'), att: sum('passAtt'),
        to: offPlays.filter((p) => p.isTurnover && (p.playType === 'interception' || p.playType === 'fumble' || /FUMBLE/.test(p.description))).length,
        pen: shown.filter((p) => p.playType === 'penalty' && p.description.includes(`on ${team(tid).abbreviation},`)).length,
      };
    };
    const top = (k: string, n = 1) => Object.entries(per).filter(([, s]) => (s[k] ?? 0) > 0).sort((a, b) => (b[1][k] ?? 0) - (a[1][k] ?? 0)).slice(0, n);
    return {
      teamStats: { home: ts(home.id), away: ts(away.id) },
      leaders: {
        passing: top('passYds', 2).map(([id, s]) => ({ id, line: `${s.passCmp ?? 0}/${s.passAtt ?? 0}, ${s.passYds} yds, ${s.passTd ?? 0} TD, ${s.passInt ?? 0} INT` })),
        rushing: top('rushYds', 2).map(([id, s]) => ({ id, line: `${s.rushAtt ?? 0} car, ${s.rushYds} yds, ${s.rushTd ?? 0} TD` })),
        receiving: top('recYds', 2).map(([id, s]) => ({ id, line: `${s.rec ?? 0} rec, ${s.recYds} yds, ${s.recTd ?? 0} TD` })),
        defense: top('tackles', 2).map(([id, s]) => ({ id, line: `${s.tackles} tkl, ${s.sacks ?? 0} sk, ${s.defInt ?? 0} INT` })),
      },
    };
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextDrive = () => {
    const d = cur.driveNo;
    const n = plays.findIndex((p, i) => i > idx && p.driveNo !== d);
    setIdx(n === -1 ? last : n);
  };
  const offense = team(situ.offenseTeamId);
  const done = idx >= last;
  const ballPct = situ.yardLine != null ? (situ.offenseTeamId === home.id ? 100 - situ.yardLine : situ.yardLine) : null; // home defends right end zone
  const firstDownPct = situ.yardLine != null && situ.distance != null ? (situ.offenseTeamId === home.id ? 100 - (situ.yardLine + situ.distance) : situ.yardLine + situ.distance) : null;
  const fieldLabel = situ.yardLine == null ? '' : situ.yardLine === 50 ? '50' : situ.yardLine < 50 ? `${offense.abbreviation} ${situ.yardLine}` : `${team(situ.offenseTeamId === home.id ? away.id : home.id).abbreviation} ${100 - situ.yardLine}`;
  const scoring = shown.filter((p) => p.isScoring && !/extra point/i.test(p.description));

  return (
    <div className="space-y-5">
      {/* Broadcast scoreboard */}
      <div className="overflow-hidden rounded-2xl bg-[#0b0b0d] text-white shadow-card">
        <div className="flex items-center justify-between px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em]">
          <span className="flex items-center gap-2">{done ? <span className="rounded bg-white/15 px-2 py-0.5">Final</span> : <><span className="h-2 w-2 animate-live rounded-full bg-accent" /> Live Game Center</>}</span>
          <Link href={`/games/${gameId}`} className="text-white/70 hover:text-white">Box score →</Link>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-stretch">
          {[away, home].map((t, i) => {
            const score = t.id === home.id ? cur.homeScore : cur.awayScore;
            const hasBall = !done && t.id === situ.offenseTeamId && situ.down != null;
            return (
              <div key={t.id} className={`flex items-center gap-3 px-4 py-4 ${i === 1 ? 'order-3 flex-row-reverse text-right' : ''}`} style={{ background: `linear-gradient(${i ? 270 : 90}deg, ${t.primaryColor}, transparent)` }}>
                <TeamLogo team={t} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-lg font-extrabold uppercase sm:text-2xl">{t.school}</div>
                  <div className="h-4 text-xs font-bold text-gold">{hasBall ? '● Possession' : ''}</div>
                </div>
                <div className="tabular font-display text-5xl font-black sm:text-6xl">{score}</div>
              </div>
            );
          })}
          <div className="order-2 flex min-w-[7rem] flex-col items-center justify-center bg-white/5 px-3 text-center">
            <div className="font-display text-xl font-bold">{done ? 'FINAL' : qLabel(situ.quarter)}</div>
            <div className="tabular font-display text-2xl font-black">{!done && situ.quarter <= 4 ? clock(situ.clock) : ''}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-2 text-sm font-semibold">
          <span>{cur.down ? `${['', '1st', '2nd', '3rd', '4th'][cur.down]} & ${cur.yardLine != null && cur.distance != null && cur.yardLine + cur.distance >= 100 ? 'Goal' : cur.distance} · ${fieldLabel}` : ' '}</span>
          <span className="text-white/70">Win prob: {home.abbreviation} {(cur.homeWinProb * 100).toFixed(0)}% · {away.abbreviation} {(100 - cur.homeWinProb * 100).toFixed(0)}%</span>
        </div>
        {/* Field */}
        <div className="relative mx-4 mb-4 h-14 overflow-hidden rounded-lg bg-[#1f6b35]">
          <div className="absolute inset-y-0 left-0 w-[8%] opacity-90" style={{ background: away.primaryColor }} />
          <div className="absolute inset-y-0 right-0 w-[8%] opacity-90" style={{ background: home.primaryColor }} />
          {Array.from({ length: 9 }, (_, i) => <div key={i} className="absolute inset-y-0 w-px bg-white/30" style={{ left: `${8 + (i + 1) * 8.4}%` }} />)}
          {ballPct != null && !done && (
            <>
              {firstDownPct != null && firstDownPct > 0 && firstDownPct < 100 && <div className="absolute inset-y-0 w-0.5 bg-yellow-300" style={{ left: `${8 + firstDownPct * 0.84}%` }} />}
              <div className="absolute inset-y-0 w-0.5 bg-sky-300" style={{ left: `${8 + ballPct * 0.84}%` }} />
              <div className="absolute top-1/2 h-3 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-800 ring-2 ring-white transition-all duration-500" style={{ left: `${8 + ballPct * 0.84}%` }} />
            </>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" onClick={() => setPlaying((p) => !p)} disabled={done}><Icon name={playing && !done ? 'pause' : 'play'} size={16} />{playing && !done ? 'Pause' : 'Play'}</button>
        {SPEEDS.map((s, i) => <button key={s.label} className={`btn-ghost btn-sm ${speed === i ? '!border-accent text-accent' : ''}`} onClick={() => setSpeed(i)}>{s.label}</button>)}
        <button className="btn-ghost btn-sm" onClick={nextDrive} disabled={done}>Next drive ⏭</button>
        <button className="btn-ghost btn-sm" onClick={() => { setIdx(last); setPlaying(false); }} disabled={done}>Skip to final</button>
        <button className="btn-ghost btn-sm" onClick={() => { setIdx(0); setPlaying(true); }}>Restart</button>
        <span className="ml-auto text-xs text-muted">Play {idx + 1} of {plays.length}</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <header className="border-b border-line px-4 py-3"><h2 className="section-title">Play-by-Play</h2></header>
          <ol className="max-h-[520px] divide-y divide-line/60 overflow-y-auto">
            {[...shown].reverse().map((p) => {
              const t = team(p.offenseTeamId);
              return (
                <li key={p.seq} className={`flex gap-3 px-4 py-2.5 text-sm animate-fadein ${p.isScoring ? 'bg-accent/10 font-semibold' : ''} ${p.isTurnover ? 'bg-gold/10' : ''}`}>
                  <span className="tabular w-14 shrink-0 text-xs text-muted">{qLabel(p.quarter)} {p.quarter <= 4 ? clock(p.clock) : ''}</span>
                  <TeamLogo team={t} size={18} />
                  <span className="flex-1">{p.description}</span>
                  <span className="tabular text-xs text-muted">{p.awayScore}-{p.homeScore}</span>
                </li>
              );
            })}
          </ol>
        </section>
        <div className="space-y-5">
          <section className="card card-pad">
            <h2 className="section-title mb-3">Team Stats</h2>
            <table className="table tabular">
              <thead><tr><th>{away.abbreviation}</th><th></th><th className="text-right">{home.abbreviation}</th></tr></thead>
              <tbody>
                {([['Total yards', (s: any) => s.pass + s.rush], ['Passing', (s: any) => s.pass], ['Comp/Att', (s: any) => `${s.cmp}/${s.att}`], ['Rushing', (s: any) => s.rush], ['Turnovers', (s: any) => s.to], ['Penalties', (s: any) => s.pen]] as const).map(([l, f]) => (
                  <tr key={l}><td className="font-semibold">{f(teamStats.away)}</td><td className="text-center text-xs text-muted">{l}</td><td className="text-right font-semibold">{f(teamStats.home)}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="card card-pad">
            <h2 className="section-title mb-3">Leaders</h2>
            {(Object.entries(leaders) as [string, { id: string; line: string }[]][]).map(([k, rows]) => (
              <div key={k} className="mb-3 last:mb-0">
                <div className="eyebrow mb-1">{k}</div>
                {rows.length ? rows.map((r) => (
                  <div key={r.id} className="text-sm"><span className="font-semibold" style={{ color: team(players[r.id]?.teamId ?? home.id).primaryColor }}>{team(players[r.id]?.teamId ?? home.id).abbreviation}</span> <Link href={`/players/${r.id}`} className="font-semibold hover:text-accent">{players[r.id]?.name}</Link> <span className="text-muted">{r.line}</span></div>
                )) : <div className="text-sm text-muted">—</div>}
              </div>
            ))}
          </section>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card card-pad">
          <h2 className="section-title mb-3">Win Probability</h2>
          <WinProbChart points={shown.map((p, i) => ({ x: i, p: p.homeWinProb }))} homeColor={home.primaryColor} awayColor={away.primaryColor} homeAbbr={home.abbreviation} awayAbbr={away.abbreviation} height={160} />
        </section>
        <section className="card card-pad">
          <h2 className="section-title mb-3">Scoring Summary</h2>
          {scoring.length ? (
            <ol className="space-y-2 text-sm">
              {scoring.map((p) => (
                <li key={p.seq} className="flex gap-2"><TeamLogo team={team(p.offenseTeamId)} size={18} /><span className="tabular text-xs text-muted">{qLabel(p.quarter)} {p.quarter <= 4 ? clock(p.clock) : ''}</span><span className="flex-1 truncate">{p.description.replace(/^.* — /, '')}</span><span className="tabular text-xs font-bold">{p.awayScore}-{p.homeScore}</span></li>
              ))}
            </ol>
          ) : <p className="text-sm text-muted">No scoring yet.</p>}
        </section>
      </div>
    </div>
  );
}
