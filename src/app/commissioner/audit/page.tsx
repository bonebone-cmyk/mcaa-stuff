import Link from 'next/link';
import { getSql } from '@/lib/db';
import { Card } from '@/components/ui';

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const rows = await getSql()`select a.*, p.display_name from audit_log a left join profiles p on p.id = a.actor_id
    ${sp.q ? getSql()`where a.action ilike ${'%' + sp.q + '%'}` : getSql()``} order by a.created_at desc limit 100 offset ${(page - 1) * 100}`;
  return (
    <Card title="Audit Log" pad={false} action={<form className="flex gap-2"><input name="q" defaultValue={sp.q} placeholder="Filter action…" className="input !py-1" /></form>}>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td className="text-xs text-muted">{new Date(r.createdAt).toLocaleString()}</td><td>{r.displayName ?? 'system'}</td><td className="font-semibold">{r.action}</td>
              <td className="text-xs text-muted">{r.entityType}{r.entityType === 'game' && r.entityId ? <> · <Link href={`/games/${r.entityId}`} className="text-accent">view</Link></> : ''}</td>
              <td className="max-w-md truncate font-mono text-xs text-muted" title={JSON.stringify(r.details)}>{JSON.stringify(r.details)}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2 p-3">{page > 1 && <Link className="btn-ghost btn-sm" href={`?page=${page - 1}`}>← Newer</Link>}{rows.length === 100 && <Link className="btn-ghost btn-sm" href={`?page=${page + 1}`}>Older →</Link>}</div>
    </Card>
  );
}
