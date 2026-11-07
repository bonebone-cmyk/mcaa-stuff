import { quarterLabel, fmtClock } from '../ui';

interface Drive { driveNo: number; teamId: string; quarter: number; startClock: number; startYard: number; plays: number; yards: number; durationSeconds: number; result: string; points: number }

/** Each drive drawn on a 100-yard field, oriented in the offense's direction */
export function DriveChart({ drives, home, away }: { drives: Drive[]; home: { id: string; abbreviation: string; primaryColor: string }; away: { id: string; abbreviation: string; primaryColor: string } }) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[3.5rem_1fr_9rem] items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted">
        <span>Team</span>
        <div className="flex justify-between"><span>Own goal</span><span>50</span><span>Opp goal</span></div>
        <span className="text-right">Result</span>
      </div>
      {drives.map((d) => {
        const t = d.teamId === home.id ? home : away;
        const start = Math.max(0, Math.min(100, d.startYard));
        const end = Math.max(0, Math.min(100, d.startYard + d.yards));
        const left = Math.min(start, end);
        const width = Math.max(1.5, Math.abs(end - start));
        return (
          <div key={d.driveNo} className="grid grid-cols-[3.5rem_1fr_9rem] items-center gap-2 text-xs">
            <span className="font-bold" style={{ color: t.primaryColor }}>{t.abbreviation}</span>
            <div className="relative h-5 rounded bg-surface-2" title={`${quarterLabel(d.quarter)} ${fmtClock(d.startClock)} · ${d.plays} plays, ${d.yards} yds, ${fmtClock(d.durationSeconds)}`}>
              <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <div className="absolute inset-y-1 rounded" style={{ left: `${left}%`, width: `${width}%`, background: t.primaryColor, opacity: d.points ? 1 : 0.55 }} />
            </div>
            <span className={`truncate text-right ${d.points ? 'font-bold' : 'text-muted'}`}>{d.result}{d.points ? ` (+${d.points})` : ''}</span>
          </div>
        );
      })}
    </div>
  );
}
