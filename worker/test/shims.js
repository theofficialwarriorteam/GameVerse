// Test doubles: D1 over node:sqlite (real SQL), in-memory R2 with multipart + ranges.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  const migDir = join(here, '..', 'migrations');
  for (const f of readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(join(migDir, f), 'utf8'));
  const isRows = sql => /^\s*select/i.test(sql) || /\breturning\b/i.test(sql);
  const mk = (sql, args = []) => ({
    bind: (...a) => mk(sql, a.map(x => (x === undefined ? null : x))),
    _exec() {
      const st = db.prepare(sql);
      if (isRows(sql)) { const rows = st.all(...args); return { rows, changes: rows.length }; }
      const r = st.run(...args);
      return { rows: [], changes: Number(r.changes) };
    },
    async run() { const r = this._exec(); return { success: true, meta: { changes: r.changes } }; },
    async first(col) { const r = this._exec().rows[0] ?? null; return col && r ? r[col] : r; },
    async all() { return { success: true, results: this._exec().rows, meta: {} }; }
  });
  return {
    raw: db,
    prepare: sql => mk(sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = stmts.map(s => { const r = s._exec(); return { success: true, results: r.rows, meta: { changes: r.changes } }; });
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  };
}

export function makeR2() {
  const objs = new Map(), uploads = new Map();
  const toU8 = async body => (body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer()));
  return {
    objs,
    async put(key, body, opts) { const buf = await toU8(body); objs.set(key, { buf, httpMetadata: opts?.httpMetadata || {} }); return { key, size: buf.length }; },
    async head(key) { const o = objs.get(key); return o ? { key, size: o.buf.length, httpMetadata: o.httpMetadata } : null; },
    async get(key, opts) {
      const o = objs.get(key); if (!o) return null;
      let buf = o.buf, range;
      const h = opts?.range && opts.range.get ? opts.range.get('range') : null;
      const m = h && /^bytes=(\d+)-(\d*)$/.exec(h);
      if (m) {
        const offset = Number(m[1]), end = m[2] ? Math.min(Number(m[2]), o.buf.length - 1) : o.buf.length - 1;
        buf = o.buf.slice(offset, end + 1); range = { offset, length: end - offset + 1 };
      }
      return { key, size: o.buf.length, body: new Response(buf).body, httpEtag: '"etag"', httpMetadata: o.httpMetadata, range };
    },
    async delete(key) { objs.delete(key); },
    async createMultipartUpload(key, opts) { const id = 'up' + Math.random().toString(36).slice(2); uploads.set(id, { key, parts: new Map(), opts }); return { uploadId: id, key }; },
    resumeMultipartUpload(key, uploadId) {
      const u = uploads.get(uploadId);
      if (!u || u.key !== key) throw new Error('No such multipart upload');
      return {
        async uploadPart(n, body) { const buf = await toU8(body); u.parts.set(n, buf); return { partNumber: n, etag: `e${n}-${buf.length}` }; },
        async complete(parts) {
          const bufs = parts.sort((a, b) => a.partNumber - b.partNumber).map(p => {
            const b = u.parts.get(p.partNumber);
            if (!b || p.etag !== `e${p.partNumber}-${b.length}`) throw new Error('Bad part');
            return b;
          });
          const all = new Uint8Array(bufs.reduce((n, b) => n + b.length, 0)); let off = 0;
          for (const b of bufs) { all.set(b, off); off += b.length; }
          objs.set(key, { buf: all, httpMetadata: u.opts?.httpMetadata || {} }); uploads.delete(uploadId);
          return { key, size: all.length };
        },
        async abort() { uploads.delete(uploadId); }
      };
    }
  };
}

// Real RS256 Firebase-style tokens signed with a throw-away key; the Worker verifies them
// against a stubbed Google JWKS endpoint, so the verification code path is the production one.
export async function makeAuth(projectId) {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => /securetoken@system\.gserviceaccount\.com/.test(String(url))
    ? new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'Cache-Control': 'max-age=3600', 'Content-Type': 'application/json' } })
    : realFetch(url, init);
  return async function sign(overrides = {}, { badSig = false, kid = 'test-key', alg = 'RS256' } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const payload = { iss: `https://securetoken.google.com/${projectId}`, aud: projectId, sub: 'uid-1', iat: now - 5, exp: now + 3600, auth_time: now - 5, email: 'admin@example.com', email_verified: true, ...overrides };
    const head = b64({ alg, kid, typ: 'JWT' }), body = b64(payload);
    const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`)));
    if (badSig) sig[0] ^= 0xff;
    return `${head}.${body}.${sig.toString('base64url')}`;
  };
}
