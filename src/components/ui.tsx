import Link from 'next/link';
import type { ReactNode } from 'react';
import { TeamLogo, type LogoTeam } from './team-logo';

export { TeamLogo };

export function Card({ children, className = '', title, action, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; pad?: boolean }) {
  return (
    <section className={`card animate-fadein ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          {typeof title === 'string' ? <h2 className="section-title">{title}</h2> : title}
          {action}
        </header>
      )}
      <div className={pad ? 'card-pad' : 'overflow-x-auto'}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, eyebrow, children, actions }: { title: ReactNode; eyebrow?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight sm:text-4xl">{title}</h1>
        {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stars({ n, size = 'sm' }: { n: number; size?: 'sm' | 'md' }) {
  return (
    <span className={`inline-flex ${size === 'md' ? 'text-base' : 'text-xs'} leading-none tracking-tight`} aria-label={`${n} stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < n ? 'text-gold' : 'text-line'}>★</span>
      ))}
    </span>
  );
}

export function Badge({ children, tone = 'default', className = '' }: { children: ReactNode; tone?: 'default' | 'accent' | 'win' | 'loss' | 'gold' | 'demo'; className?: string }) {
  const tones: Record<string, string> = {
    default: 'border-line bg-surface-2 text-fg',
    accent: 'border-accent/40 bg-accent/15 text-accent',
    win: 'border-win/40 bg-win/10 text-win',
    loss: 'border-loss/40 bg-loss/10 text-loss',
    gold: 'border-gold/40 bg-gold/10 text-gold',
    demo: 'border-amber-500/50 bg-amber-500/15 text-amber-500',
  };
  return <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tones[tone]} ${className}`}>{children}</span>;
}

export const DemoBadge = ({ show = true }: { show?: boolean }) => (show ? <Badge tone="demo">Demo</Badge> : null);

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-8 text-center">
      <div className="font-display text-lg font-bold uppercase">{title}</div>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Tabs({ tabs, active }: { tabs: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="scrollbar-none -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition ${t.key === active ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export interface TeamLike extends LogoTeam {
  slug: string;
  school: string;
  abbreviation: string;
}

export function TeamLink({ team, rank, size = 22, short = false, className = '' }: { team: TeamLike; rank?: number | null; size?: number; short?: boolean; className?: string }) {
  return (
    <Link href={`/teams/${team.slug}`} className={`inline-flex min-w-0 items-center gap-2 font-semibold hover:text-accent ${className}`}>
      <TeamLogo team={team} size={size} />
      {rank ? <span className="text-xs font-bold text-muted">{rank}</span> : null}
      <span className="truncate">{short ? team.abbreviation : team.school}</span>
    </Link>
  );
}

export function Meter({ value, max = 100, color, label }: { value: number; max?: number; color?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="w-full" title={label ?? `${Math.round(value)}`}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color ?? 'rgb(var(--accent))' }} />
      </div>
    </div>
  );
}

export function RatingPill({ value }: { value: number }) {
  const tone = value >= 85 ? 'bg-win/15 text-win' : value >= 75 ? 'bg-gold/15 text-gold' : value >= 65 ? 'bg-surface-2 text-fg' : 'bg-loss/10 text-loss';
  return <span className={`tabular inline-flex min-w-[2.25rem] justify-center rounded-md px-1.5 py-0.5 text-xs font-bold ${tone}`}>{value}</span>;
}

export function Movement({ current, previous }: { current: number; previous: number | null }) {
  if (previous == null) return <span className="text-[10px] font-bold text-accent">NEW</span>;
  const d = previous - current;
  if (d === 0) return <span className="text-xs text-muted">–</span>;
  return <span className={`tabular text-xs font-bold ${d > 0 ? 'text-win' : 'text-loss'}`}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}</span>;
}

export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-3">
      <div className="eyebrow">{label}</div>
      <div className="tabular mt-1 font-display text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <form className="mb-5 flex flex-wrap items-end gap-2" method="get">{children}<button className="btn-ghost btn-sm h-[38px]" type="submit">Apply</button></form>;
}

export function Select({ name, value, options, label, className = '' }: { name: string; value?: string; options: { value: string; label: string }[]; label?: string; className?: string }) {
  return (
    <label className={`min-w-[8rem] ${className}`}>
      {label && <span className="label">{label}</span>}
      <select name={name} defaultValue={value ?? ''} className="input">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function fmtClock(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function quarterLabel(q: number) {
  return q <= 4 ? `Q${q}` : q === 5 ? 'OT' : `${q - 4}OT`;
}
