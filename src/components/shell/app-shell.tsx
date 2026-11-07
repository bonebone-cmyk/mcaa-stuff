'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../icons';
import { MOBILE_PRIMARY, NAV } from './nav-items';

interface ShellUser { displayName: string; role: string; teamSlug: string | null }

function isActive(path: string, href: string) {
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
}

function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('cfu-theme', next ? 'dark' : 'light'); } catch { /* storage unavailable */ }
  };
  return (
    <button onClick={toggle} className="btn-ghost h-9 w-9 !p-0" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <Icon name={dark ? 'sun' : 'moon'} size={18} />
    </button>
  );
}

export function AppShell({ user, children, universeName, seasonLabel }: { user: ShellUser | null; children: ReactNode; universeName: string; seasonLabel: string | null }) {
  const path = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [path]);
  const items = NAV.filter((n) => !('requires' in n) || (n.requires === 'user' ? !!user : user?.role === 'commissioner'));
  const primary = items.filter((n) => MOBILE_PRIMARY.includes(n.href));

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent font-display text-lg font-black text-white">CFU</span>
          <span className="leading-tight">
            <span className="block font-display text-[15px] font-extrabold uppercase tracking-wide">College Football</span>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Universe</span>
          </span>
        </Link>
        <nav className="scrollbar-none flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {items.map((n) => (
            <Link key={n.href} href={n.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${isActive(path, n.href) ? 'bg-accent text-white shadow-card' : 'text-muted hover:bg-surface-2 hover:text-fg'}`}>
              <Icon name={n.icon} size={18} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line px-5 py-3 text-[11px] text-muted">
          {universeName}{seasonLabel ? ` · ${seasonLabel}` : ''}
        </div>
      </aside>

      <div className="lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
            <Link href="/" className="grid h-8 w-8 place-items-center rounded-lg bg-accent font-display text-sm font-black text-white lg:hidden">CFU</Link>
            <form action="/search" className="relative flex-1 max-w-xl">
              <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" placeholder="Search teams, players, recruits, articles, games…" className="input h-9 pl-9" aria-label="Search" />
            </form>
            <ThemeToggle />
            {user ? (
              <div className="flex items-center gap-2">
                <Link href={user.role === 'commissioner' ? '/commissioner' : '/my-team'} className="hidden text-right sm:block">
                  <div className="text-sm font-semibold leading-tight">{user.displayName}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-accent">{user.role === 'commissioner' ? 'Commissioner' : user.role === 'owner' ? 'Head Coach' : 'Fan'}</div>
                </Link>
                <form action="/auth/signout" method="post"><button className="btn-ghost btn-sm">Sign out</button></form>
              </div>
            ) : (
              <Link href="/login" className="btn-primary btn-sm">Sign in</Link>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 lg:pb-12">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {primary.map((n) => (
            <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${isActive(path, n.href) ? 'text-accent' : 'text-muted'}`}>
              <Icon name={n.icon} size={20} />
              {n.label.split(' ')[0]}
            </Link>
          ))}
          <button onClick={() => setMoreOpen((v) => !v)} className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${moreOpen ? 'text-accent' : 'text-muted'}`} aria-expanded={moreOpen}>
            <Icon name={moreOpen ? 'x' : 'menu'} size={20} />
            More
          </button>
        </div>
      </nav>
      {moreOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-x-0 bottom-[64px] rounded-t-2xl border-t border-line bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-2">
              {items.filter((n) => !MOBILE_PRIMARY.includes(n.href)).map((n) => (
                <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-1 rounded-xl border border-line p-3 text-center text-xs font-semibold ${isActive(path, n.href) ? 'bg-accent text-white' : 'bg-surface-2'}`}>
                  <Icon name={n.icon} size={20} />
                  {n.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
