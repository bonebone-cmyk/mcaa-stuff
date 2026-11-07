import Link from 'next/link';
import { TeamLogo, Badge } from '../ui';
import type { GameView, TeamRow } from '@/lib/queries';

export function kickoffLabel(d: Date | string | null) {
  if (!d) return 'TBD';
  const date = new Date(d);
  return date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
}

export function GameCard({ game, teams, ranks, compact = false }: { game: GameView; teams: Map<string, TeamRow>; ranks?: Map<string, number>; compact?: boolean }) {
  const home = teams.get(game.homeTeamId);
  const away = teams.get(game.awayTeamId);
  if (!home || !away) return null;
  const final = game.status === 'final';
  const row = (t: TeamRow, score: number | null, won: boolean) => (
    <div className={`flex items-center justify-between gap-2 ${final && !won ? 'opacity-60' : ''}`}>
      <div className="flex min-w-0 items-center gap-2">
        <TeamLogo team={t} size={compact ? 22 : 28} />
        {ranks?.get(t.id) ? <span className="text-[11px] font-bold text-muted">{ranks.get(t.id)}</span> : null}
        <span className={`truncate font-semibold ${compact ? 'text-sm' : ''}`}>{compact ? t.abbreviation : t.school}</span>
      </div>
      <span className={`tabular font-display text-xl font-bold ${won ? '' : ''}`}>{final ? score : ''}</span>
    </div>
  );
  const homeWon = final && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  return (
    <Link href={`/games/${game.id}`} className="card block p-3 transition hover:-translate-y-0.5 hover:border-accent/50">
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span className={final ? 'text-fg' : ''}>{final ? `Final${game.overtimes ? (game.overtimes > 1 ? `/${game.overtimes}OT` : '/OT') : ''}` : kickoffLabel(game.kickoffAt)}</span>
        <span className="flex items-center gap-1">
          {game.isRivalry && <Badge tone="gold">Rivalry</Badge>}
          {game.gameType === 'playoff' && <Badge tone="accent">CFP</Badge>}
          {game.gameType === 'conference_championship' && <Badge tone="accent">Title</Badge>}
          {game.gameType === 'exhibition' && <Badge>Exhibition</Badge>}
          {game.networkShort && !final && <span>{game.networkShort}</span>}
        </span>
      </div>
      <div className="space-y-1.5">
        {row(away, game.awayScore, final && !homeWon)}
        {row(home, game.homeScore, homeWon)}
      </div>
      {!compact && game.summary?.tags?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">{(game.summary.tags as string[]).filter((t) => t !== 'manual').map((t) => <span key={t} className="chip capitalize">{t}</span>)}</div>
      ) : null}
    </Link>
  );
}
