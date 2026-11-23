import { HttpError, VID_RE, GAME_ID_RE, nowSec, sha256Hex } from './util.js';
import { hasBearer, verifyAdmin } from './auth.js';

export async function ipKey(c) {
  const ip = c.request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  return (await sha256Hex(`${c.env.TOKEN_SECRET || 'gv'}|ip|${ip}`)).slice(0, 24);
}
export function visitorId(c, { optional = false } = {}) {
  const v = c.request.headers.get('X-GV-Visitor') || '';
  if (VID_RE.test(v)) return v;
  if (optional) return null;
  throw new HttpError(400, 'Missing or invalid visitor id', 'bad_visitor');
}
export function gameIdParam(c) {
  const id = c.params.id;
  if (!GAME_ID_RE.test(id)) throw new HttpError(400, 'Invalid game id', 'bad_game');
  return id;
}
export const isBot = request => /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|wget|python-requests/i.test(request.headers.get('User-Agent') || '');
export async function isAdminCall(c) {
  return hasBearer(c.request) && !!(await verifyAdmin(c.request, c.env));
}

// Fixed-window rate limit stored in D1. `who` defaults to the hashed client IP.
export async function rateLimit(c, name, limit, windowSec, who) {
  const now = nowSec();
  const win = Math.floor(now / windowSec);
  const key = `${name}:${who || await ipKey(c)}`;
  const row = await c.env.DB.prepare(
    `INSERT INTO rate_limits(k,win,n,exp) VALUES(?,?,1,?)
     ON CONFLICT(k) DO UPDATE SET n=CASE WHEN win=excluded.win THEN n+1 ELSE 1 END, win=excluded.win, exp=excluded.exp
     RETURNING n`
  ).bind(key, win, (win + 2) * windowSec).first();
  if ((row?.n || 1) > limit) {
    throw new HttpError(429, 'Too many requests. Please slow down and try again shortly.', 'rate_limited', { retryAfter: windowSec });
  }
}

// True when the event should be counted (first time in the window).
export async function dedupe(env, key, windowSec) {
  const now = nowSec();
  const r = await env.DB.prepare(
    'INSERT INTO event_dedupe(k,ts) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET ts=excluded.ts WHERE event_dedupe.ts<=?'
  ).bind(key, now, now - windowSec).run();
  return (r.meta?.changes || 0) > 0;
}

export async function cleanup(c, force = false) {
  if (!force && Math.random() > 0.01) return;
  const run = async () => {
    const now = nowSec();
    const day = new Date((now - 8 * 86400) * 1000).toISOString().slice(0, 10);
    const db = c.env.DB;
    await db.batch([
      db.prepare('DELETE FROM rate_limits WHERE exp<?').bind(now),
      db.prepare('DELETE FROM event_dedupe WHERE ts<?').bind(now - 2 * 86400),
      db.prepare('DELETE FROM online WHERE last_seen<?').bind(now - 86400),
      db.prepare('DELETE FROM visitor_days WHERE day<?').bind(day),
      db.prepare('DELETE FROM task_opens WHERE opened_at<?').bind(now - 2 * 86400),
      db.prepare('DELETE FROM access_grants WHERE expires_at<?').bind(now - 7 * 86400),
      db.prepare("UPDATE ad_sessions SET status='expired' WHERE status='open' AND expires_at<?").bind(now)
    ]);
  };
  if (c.ectx?.waitUntil) c.ectx.waitUntil(run().catch(() => {})); else await run();
}

export const MAX_TRACKED_GAMES = 500;
export async function ensureGameCapacity(env, id) {
  const has = await env.DB.prepare('SELECT 1 AS x FROM game_stats WHERE game_id=?').bind(id).first();
  if (has) return;
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM game_stats').first();
  if ((n?.n || 0) >= MAX_TRACKED_GAMES) throw new HttpError(400, 'Too many games are being tracked', 'too_many_games');
}
