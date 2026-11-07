import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Inter } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/shell/app-shell';
import { getActor } from '@/lib/auth/session';
import { getCurrentSeason, getSettingsRow, getTeamMap, PHASE_LABEL } from '@/lib/queries';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const display = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '600', '700', '800', '900'], variable: '--font-display', display: 'swap' });

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'College Football Universe', template: '%s · College Football Universe' },
  description: 'A living college football universe: owners, recruiting battles, simulated games, rankings, rivalries and lore.',
};
export const viewport: Viewport = { themeColor: '#09090b', width: 'device-width', initialScale: 1 };

const themeScript = `try{if(localStorage.getItem('cfu-theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let user = null;
  let universeName = 'College Football Universe';
  let seasonLabel: string | null = null;
  try {
    const [actor, settings, season, teams] = await Promise.all([getActor(), getSettingsRow(), getCurrentSeason(), getTeamMap()]);
    universeName = settings?.name ?? universeName;
    if (season) seasonLabel = `${season.year} · ${PHASE_LABEL[season.phase] ?? season.phase}`;
    if (actor) {
      const teamId = actor.ownedTeamIds[0] ?? actor.assistantTeamIds[0];
      user = { displayName: actor.displayName, role: actor.role, teamSlug: teamId ? teams.get(teamId)?.slug ?? null : null };
    }
  } catch (e) {
    console.error('layout data unavailable', e);
  }
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} dark`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">
        <AppShell user={user} universeName={universeName} seasonLabel={seasonLabel}>{children}</AppShell>
      </body>
    </html>
  );
}
