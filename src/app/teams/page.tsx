import Link from 'next/link';
import { FilterBar, PageHeader, RatingPill, Select, TeamLogo } from '@/components/ui';
import { getConferences, getCurrentSeason, getRankMap, getTeamRecords, getTeams, recordStr } from '@/lib/queries';

export const metadata = { title: 'Teams' };

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ q?: string; conf?: string }> }) {
  const sp = await searchParams;
  const [teams, confs, season] = await Promise.all([getTeams(), getConferences(), getCurrentSeason()]);
  const [ranks, records] = season ? await Promise.all([getRankMap(season.id), getTeamRecords(season.id)]) : [new Map(), new Map()];
  const q = (sp.q ?? '').toLowerCase();
  const list = teams.filter((t) => (!sp.conf || t.conferenceSlug === sp.conf) && (!q || `${t.school} ${t.mascot} ${t.abbreviation}`.toLowerCase().includes(q)));
  const groups = confs.map((c) => ({ conf: c, teams: list.filter((t) => t.conferenceId === c.id) })).filter((g) => g.teams.length);
  const orphans = list.filter((t) => !t.conferenceId);
  return (
    <div>
      <PageHeader title="Teams">{teams.length} programs in the universe</PageHeader>
      <FilterBar>
        <label className="min-w-[14rem] flex-1"><span className="label">Search</span><input name="q" defaultValue={sp.q} className="input" placeholder="School, mascot or abbreviation" /></label>
        <Select name="conf" value={sp.conf} label="Conference" options={[{ value: '', label: 'All conferences' }, ...confs.map((c) => ({ value: c.slug, label: c.shortName }))]} />
      </FilterBar>
      <div className="space-y-8">
        {[...groups, ...(orphans.length ? [{ conf: { id: 'none', name: 'Unaffiliated', slug: '' } as any, teams: orphans }] : [])].map(({ conf, teams: ts }) => (
          <section key={conf.id}>
            <div className="mb-3 flex items-center gap-3">
              {conf.logoUrl && <TeamLogo team={{ logoUrl: conf.logoUrl, abbreviation: conf.shortName }} size={28} />}
              <h2 className="section-title">{conf.name}</h2>
              {conf.slug && <Link href={`/conferences/${conf.slug}`} className="text-xs font-semibold text-accent">Standings →</Link>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {ts.map((t) => (
                <Link key={t.id} href={`/teams/${t.slug}`} className="card group flex items-center gap-3 overflow-hidden p-3 transition hover:-translate-y-0.5" style={{ borderLeft: `4px solid ${t.primaryColor}` }}>
                  <TeamLogo team={t} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold group-hover:text-accent">{ranks.get(t.id) ? <span className="mr-1 text-xs text-muted">{ranks.get(t.id)}</span> : null}{t.school}</div>
                    <div className="truncate text-xs text-muted">{t.mascot} · {recordStr(records.get(t.id))}</div>
                  </div>
                  <RatingPill value={t.overallRating} />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
