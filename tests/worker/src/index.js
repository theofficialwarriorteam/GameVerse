// GAMEVERSE API — Cloudflare Worker (D1 + external HTTPS downloads). See ../README.md for setup.
import { HttpError, td } from './util.js';
import { verifyAdmin } from './auth.js';
import { publicRoutes } from './public.js';
import { adminRoutes } from './admin.js';

function compile(path) {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  return { re, keys };
}
const routes = [
  ...publicRoutes.map(([m, p, h, o]) => ({ m, h, o: o || {}, ...compile(p) })),
  ...adminRoutes.map(([m, p, h]) => ({ m, h, o: { admin: true }, ...compile(p) }))
];

function corsFor(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const h = { Vary: 'Origin' };
  if (origin && (allowed.includes(origin) || allowed.includes('*'))) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-GV-Visitor';
    h['Access-Control-Max-Age'] = '86400';
  }
  return { headers: h, originOk: !origin || !!h['Access-Control-Allow-Origin'] };
}
const json = (data, status, headers) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }
});

export default {
  async fetch(request, env, ectx) {
    const url = new URL(request.url);
    const cors = corsFor(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers });
    try {
      if (!env.DB) throw new HttpError(503, 'The D1 database binding "DB" is missing', 'server_not_configured');
      const pathname = url.pathname.replace(/\/+$/, '') || '/';
      let matched = null, params = {};
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.m !== request.method) continue;
        matched = r;
        r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch { params[k] = m[i + 1]; } });
        break;
      }
      if (!matched) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Method not allowed' : 'Not found', pathMatched ? 'method_not_allowed' : 'not_found');
      const isPostback = pathname === '/v1/ads/postback';
      if (!cors.originOk && !['GET', 'HEAD'].includes(request.method) && !isPostback) {
        throw new HttpError(403, 'Origin not allowed', 'bad_origin');
      }
      if (matched.o.admin) {
        const admin = await verifyAdmin(request, env);
        if (!admin) throw new HttpError(401, 'Administrator sign-in required', 'unauthorized');
      }
      const c = { request, env, url, params, ectx };
      const out = await matched.h(c);
      if (out instanceof Response) {
        const h = new Headers(out.headers);
        for (const [k, v] of Object.entries(cors.headers)) h.set(k, v);
        return new Response(out.body, { status: out.status, headers: h });
      }
      return json(out, 200, cors.headers);
    } catch (e) {
      if (e instanceof HttpError) {
        const headers = { ...cors.headers };
        if (e.extra?.retryAfter) headers['Retry-After'] = String(e.extra.retryAfter);
        return json({ error: e.message, code: e.code, ...(e.extra || {}) }, e.status, headers);
      }
      console.error('Unhandled error', e && e.stack || e);
      return json({ error: 'Something went wrong on the server', code: 'server_error' }, 500, cors.headers);
    }
  }
};
