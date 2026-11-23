// Verifies Firebase Authentication ID tokens (RS256) with Google's public keys.
// No secret is needed: only the Firebase project id and the admin e-mail.
import { b64urlDecode, td, nowSec } from './util.js';

const JWKS_URL = 'https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com';
let jwks = { keys: null, exp: 0 };

async function getKeys() {
  if (jwks.keys && Date.now() < jwks.exp) return jwks.keys;
  const res = await fetch(JWKS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw new Error('Could not load Firebase signing keys');
  const data = await res.json();
  const m = /max-age=(\d+)/.exec(res.headers.get('Cache-Control') || '');
  jwks = { keys: data.keys || [], exp: Date.now() + (m ? Number(m[1]) : 3600) * 1000 };
  return jwks.keys;
}
export const resetAuthCache = () => { jwks = { keys: null, exp: 0 }; };

export function hasBearer(request) {
  return /^Bearer\s+\S+/i.test(request.headers.get('Authorization') || '');
}

// Returns {email} for the verified administrator, otherwise null.
export async function verifyAdmin(request, env) {
  try {
    const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization') || '');
    if (!m || !env.FIREBASE_PROJECT_ID || !env.ADMIN_EMAIL) return null;
    const [h64, p64, s64] = m[1].split('.');
    if (!h64 || !p64 || !s64) return null;
    const header = JSON.parse(td.decode(b64urlDecode(h64)));
    const p = JSON.parse(td.decode(b64urlDecode(p64)));
    if (header.alg !== 'RS256' || !header.kid) return null;
    const now = nowSec();
    if (typeof p.exp !== 'number' || p.exp <= now) return null;
    if (typeof p.iat !== 'number' || p.iat > now + 300) return null;
    if (p.aud !== env.FIREBASE_PROJECT_ID) return null;
    if (p.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`) return null;
    if (!p.sub || typeof p.sub !== 'string') return null;
    if (String(p.email || '').toLowerCase() !== String(env.ADMIN_EMAIL).toLowerCase()) return null;
    if (p.email_verified !== true) return null;
    const jwk = (await getKeys()).find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(s64), new TextEncoder().encode(`${h64}.${p64}`));
    return ok ? { email: p.email } : null;
  } catch {
    return null;
  }
}
