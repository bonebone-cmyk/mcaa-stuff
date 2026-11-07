import Link from 'next/link';
import { PageHeader, TeamLogo } from '@/components/ui';
import { getConferences, getTeams } from '@/lib/queries';

export const metadata = { title: 'Conferences' };

export default async function ConferencesPage() {
  const [confs, teams] = await Promise.all([getConferences(), getTeams()]);
  return (
    <div>
      <PageHeader title="Conferences">{confs.length} conferences · alignments are fully customizable by the commissioner</PageHeader>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {confs.map((c) => (
          <Link key={c.id} href={`/conferences/${c.slug}`} className="card card-pad group block transition hover:-translate-y-0.5">
            <div className="mb-3 flex items-center gap-3">
              <TeamLogo team={{ logoUrl: c.logoUrl, abbreviation: c.shortName, school: c.name }} size={40} />
              <div><div className="font-display text-xl font-bold uppercase group-hover:text-accent">{c.name}</div><div className="text-xs text-muted">{c.teamCount} teams · {c.conferenceGames} conference games{c.isCustom ? ' · custom' : ''}</div></div>
            </div>
            <div className="flex flex-wrap gap-1.5">{teams.filter((t) => t.conferenceId === c.id).map((t) => <TeamLogo key={t.id} team={t} size={26} />)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
