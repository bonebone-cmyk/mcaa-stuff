// MCAA Sports — Node.js server (local / self-hosted). Fake currency only ("coins").
// Zero dependencies: run with `node server.js`. For the free Cloudflare website see worker.js.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createLeague } from './lib/league.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB_FILE = path.join(DATA_DIR, 'db.json');
const LOGO_DIR = path.join(DATA_DIR, 'logos');
const PUBLIC_DIR = path.join(__dirname, 'public');
fs.mkdirSync(LOGO_DIR, { recursive: true });

const safeName = (n) => path.basename(String(n));

/** File-system storage: one JSON file + a logos folder. */
const store = {
  async load() {
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return null; }
  },
  async save(db) {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  },
  async putLogo(name, base64) { fs.writeFileSync(path.join(LOGO_DIR, safeName(name)), Buffer.from(base64, 'base64')); },
  async getLogo(name) {
    try { return fs.readFileSync(path.join(LOGO_DIR, safeName(name))).toString('base64'); } catch { return null; }
  },
  async deleteLogos(prefix) {
    for (const f of fs.readdirSync(LOGO_DIR)) if (f.startsWith(prefix)) fs.rmSync(path.join(LOGO_DIR, f));
  },
  async listLogos() {
    return fs.readdirSync(LOGO_DIR).map((f) => ({ name: f, data: fs.readFileSync(path.join(LOGO_DIR, f)).toString('base64') }));
  },
};

const league = await createLeague({ store, ownerUsername: process.env.OWNER_USERNAME });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
};

function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 210 * 1024 * 1024) { req.destroy(); reject(new Error('too large')); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }

  const out = await league.handle({
    method: req.method, pathname, search: url.search, headers: req.headers, ip: req.socket.remoteAddress, readBody: () => readBody(req),
  }).catch((e) => { console.error(e); return { status: 500, headers: { 'Content-Type': 'text/plain' }, body: 'Server error' }; });
  if (out) { res.writeHead(out.status, out.headers); return res.end(out.body); }

  let file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  if (pathname === '/' || !path.extname(pathname)) file = path.join(PUBLIC_DIR, 'index.html');
  serveFile(res, file);
});

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n  MCAA Sports is already running (port ${PORT} is in use). Opening it in your browser…\n`);
    if (process.env.OPEN_BROWSER) openBrowser(`http://localhost:${PORT}`);
    setTimeout(() => process.exit(0), 1500);
    return;
  }
  throw e;
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log('\n  ==============================================');
  console.log('    ⛏  MCAA SPORTS IS RUNNING');
  console.log('  ==============================================');
  console.log(`    On this computer:   ${url}`);
  for (const ip of lanAddresses()) console.log(`    Friends on your Wi-Fi: http://${ip}:${PORT}`);
  console.log(`    Data is saved in:   ${DATA_DIR}`);
  if (!league.hasOwner()) {
    console.log(process.env.OWNER_USERNAME
      ? `\n    No owner yet — sign up as "${process.env.OWNER_USERNAME}" to become the league owner/admin.`
      : '\n    No accounts yet — the FIRST account you create becomes the league owner/admin.');
  }
  console.log('\n    Keep this window open while people are using the site.');
  console.log('    Close it (or press Ctrl+C) to shut the site down.\n');
  if (process.env.OPEN_BROWSER) openBrowser(url);
});
