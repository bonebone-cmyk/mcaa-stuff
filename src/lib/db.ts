import postgres from 'postgres';

/**
 * Server-side Postgres connection (Supabase connection string). All official
 * writes go through this connection inside transactions after permission
 * checks; the browser never receives these credentials.
 */
export type Sql = postgres.Sql<any>;
export type Tx = postgres.TransactionSql<any> | postgres.Sql<any>;

const globalForDb = globalThis as unknown as { __cfuSql?: Sql };

export function createSql(url: string, opts: { max?: number } = {}): Sql {
  return postgres(url, {
    prepare: false, // required for Supabase's transaction pooler
    max: opts.max ?? 5,
    idle_timeout: 20,
    // snake_case columns <-> camelCase fields (JSON payloads are left untouched)
    transform: { column: { from: postgres.toCamel, to: postgres.fromCamel } },
    onnotice: () => {},
    // count()/sum() return int8/numeric; parse them as JS numbers (values here are far below 2^53)
    types: {
      int8: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    } as any,
  });
}

export function getSql(): Sql {
  if (!globalForDb.__cfuSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not configured. See .env.example.');
    globalForDb.__cfuSql = createSql(url);
  }
  return globalForDb.__cfuSql;
}

/** Insert many rows in chunks to stay under Postgres' parameter limit */
export async function insertMany(sql: Tx, table: string, rows: Record<string, unknown>[], chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    if (part.length) await sql`insert into ${sql(table)} ${sql(part as any)}`;
  }
}
