/**
 * Promotes an existing account to commissioner.
 *   DATABASE_URL=... npm run make-commissioner -- you@example.com
 * The user must have signed up first.
 */
import postgres from 'postgres';

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Usage: npm run make-commissioner -- you@example.com');
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  try {
    const rows = await sql`update profiles set role = 'commissioner' where id = (select id from auth.users where lower(email) = lower(${email})) returning id`;
    if (!rows.length) throw new Error(`No account found for ${email}. Sign up in the app first.`);
    await sql`insert into audit_log (actor_id, action, entity_type, entity_id, details) values (null, 'user.role_changed', 'profile', ${rows[0].id}, ${sql.json({ role: 'commissioner', via: 'cli' })})`;
    console.log(`${email} is now a commissioner.`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
