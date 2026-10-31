// MCAA Sports — Cloudflare Workers version (free hosting, public URL).
// Static files in /public are served by Workers Static Assets; /api/* and /logos/* go to a single
// Durable Object ("League") that keeps the whole league in its built-in SQLite storage.
import { DurableObject } from 'cloudflare:workers';
import { createLeague } from './lib/league.js';

const CHUNK = 400_000; // characters per stored row (Durable Object rows max out around 2 MB)

export class League extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS db_chunks (i INTEGER PRIMARY KEY, v TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS logos (name TEXT PRIMARY KEY, data TEXT NOT NULL)');
    this.ready = null;
  }

  makeStore() {
    const sql = this.sql;
    const storage = this.ctx.storage;
    return {
      async load() {
        const rows = sql.exec('SELECT v FROM db_chunks ORDER BY i').toArray();
        if (!rows.length) return null;
        try { return JSON.parse(rows.map((r) => r.v).join('')); } catch { return null; }
      },
      async save(db) {
        const text = JSON.stringify(db);
        storage.transactionSync(() => {
          sql.exec('DELETE FROM db_chunks');
          for (let i = 0, n = 0; i < text.length; i += CHUNK, n++) sql.exec('INSERT INTO db_chunks (i, v) VALUES (?, ?)', n, text.slice(i, i + CHUNK));
        });
      },
      async putLogo(name, data) { sql.exec('INSERT OR REPLACE INTO logos (name, data) VALUES (?, ?)', name, data); },
      async getLogo(name) { return sql.exec('SELECT data FROM logos WHERE name = ?', name).toArray()[0]?.data ?? null; },
      async deleteLogos(prefix) {
        if (!prefix) sql.exec('DELETE FROM logos');
        else sql.exec('DELETE FROM logos WHERE substr(name, 1, ?) = ?', prefix.length, prefix);
      },
      async listLogos() { return sql.exec('SELECT name, data FROM logos').toArray(); },
    };
  }

  async fetch(request) {
    this.ready ||= createLeague({ store: this.makeStore(), ownerUsername: this.env.OWNER_USERNAME || '' });
    const league = await this.ready;
    const url = new URL(request.url);
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Bad request', { status: 400 }); }
    const headers = {};
    for (const [k, v] of request.headers) headers[k.toLowerCase()] = v;
    const out = await league.handle({
      method: request.method, pathname, search: url.search, headers,
      ip: request.headers.get('cf-connecting-ip') || 'unknown', readBody: () => request.text(),
    });
    if (!out) return new Response('Not found', { status: 404 });
    return new Response(out.body, { status: out.status, headers: out.headers });
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/') || pathname.startsWith('/logos/')) {
      return env.LEAGUE.get(env.LEAGUE.idFromName('league')).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
