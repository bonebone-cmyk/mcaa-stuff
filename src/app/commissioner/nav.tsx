'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  ['/commissioner', 'Overview'], ['/commissioner/games', 'Games & Sim'], ['/commissioner/teams', 'Teams'], ['/commissioner/users', 'Users & Owners'],
  ['/commissioner/league', 'Seasons & League'], ['/commissioner/rankings', 'Rankings'], ['/commissioner/recruiting', 'Recruiting'],
  ['/commissioner/settings', 'Settings'], ['/commissioner/audit', 'Audit Log'], ['/commissioner/data', 'Import / Export'],
];

export function CommissionerNav() {
  const path = usePathname();
  return (
    <nav className="scrollbar-none -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      {ITEMS.map(([href, label]) => {
        const active = href === '/commissioner' ? path === href : path.startsWith(href);
        return <Link key={href} href={href} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${active ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'}`}>{label}</Link>;
      })}
    </nav>
  );
}
