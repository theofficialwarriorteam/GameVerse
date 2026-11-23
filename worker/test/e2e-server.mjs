// TEST HARNESS ONLY (not used in production): serves the website on :5173 and runs the real Worker
// code on :8788 with SQLite-backed D1 and external download redirects, so the UI can be tested in a browser.
// Run:  node --experimental-sqlite worker/test/e2e-server.mjs
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../src/index.js';
import { makeD1, makeAuth } from './shims.js';

const root = join(fileURLToPath(import.meta.url), '..', '..', '..');
const PROJECT = 'gameverse-5f25c', ADMIN = 'aanjorajeev@gmail.com';
const env = {
  DB: makeD1(), FIREBASE_PROJECT_ID: PROJECT, ADMIN_EMAIL: ADMIN, ALLOWED_ORIGINS: 'http://localhost:5173',
  STATS_TIMEZONE: 'Asia/Kolkata', TOKEN_SECRET: 'e2e-secret', ADS_POSTBACK_SECRET: 'e2e-ads', STATS_CACHE_SECONDS: 0, CONFIG_CACHE_SECONDS: 0
};
const sign = await makeAuth(PROJECT);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const body = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });

http.createServer(async (req, res) => {
  const buf = ['GET', 'HEAD'].includes(req.method) ? undefined : await body(req);
  const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (!['host', 'connection', 'content-length'].includes(k)) headers.set(k, String(v));
  if (buf) headers.set('content-length', String(buf.length));
  headers.set('CF-Connecting-IP', req.socket.remoteAddress || '1.1.1.1');
  const r = await worker.fetch(new Request('http://localhost:8788' + req.url, { method: req.method, headers, body: buf }), env, {});
  const out = {}; r.headers.forEach((v, k) => { out[k] = v; });
  res.writeHead(r.status, out);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8788);

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__token') { res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); return res.end(await sign({ email: ADMIN })); }
  if (u.pathname === '/__debug') {
    const q = s => env.DB.raw.prepare(s).all();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ feedback: q('SELECT * FROM feedback'), visitors: q('SELECT COUNT(*) n FROM visitors')[0].n, online: q('SELECT COUNT(*) n FROM online')[0].n, ratings: q('SELECT * FROM ratings'), game_stats: q('SELECT * FROM game_stats'), downloads: q('SELECT id,title,download_count,published FROM downloads') }));
  }
  let p = normalize(u.pathname).replace(/^(\.\.[/\\])+/, ''); if (p === '/' || p === '') p = '/index.html';
  try { const f = join(root, p); if ((await stat(f)).isDirectory()) throw 0; res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); }
  catch { res.writeHead(404); res.end('nf'); }
}).listen(5173);
console.log('e2e ready');
