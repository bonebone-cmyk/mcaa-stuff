/**
 * Applies supabase/migrations/*.sql in order to DATABASE_URL, tracking applied
 * files in public._cfu_migrations. On a Supabase project you can instead run
 * `supabase db push`. Pass --local-auth-stub to emulate Supabase's auth schema
 * on plain Postgres (local testing only).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    if (process.argv.includes('--local-auth-stub')) {
      await sql.unsafe(readFileSync(path.join('supabase', 'local', 'auth_stub.sql'), 'utf8'));
      console.log('✓ local auth stub');
    }
    await sql`create table if not exists public._cfu_migrations (name text primary key, applied_at timestamptz default now())`;
    const applied = new Set((await sql`select name from public._cfu_migrations`).map((r) => r.name));
    const dir = path.join('supabase', 'migrations');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      if (applied.has(file)) continue;
      await sql.begin(async (tx) => {
        await tx.unsafe(readFileSync(path.join(dir, file), 'utf8'));
        await tx`insert into public._cfu_migrations (name) values (${file})`;
      });
      console.log(`✓ ${file}`);
    }
    console.log('Migrations complete.');
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
