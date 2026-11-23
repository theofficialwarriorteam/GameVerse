// Shared helpers for the GAMEVERSE API Worker.
export const te = new TextEncoder();
export const td = new TextDecoder();
export const nowSec = () => Math.floor(Date.now() / 1000);

export class HttpError extends Error {
  constructor(status, message, code, extra) {
    super(message);
    this.status = status;
    this.code = code || 'error';
    this.extra = extra || null;
  }
}
export const bad = (msg, code) => { throw new HttpError(400, msg, code || 'bad_request'); };

const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(str) {
  return toHex(await crypto.subtle.digest('SHA-256', te.encode(str)));
}
export async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, te.encode(msg)));
}
export function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
export const b64urlEncode = bytes => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const rid = (len = 20) => Array.from(crypto.getRandomValues(new Uint8Array(len)), b => ALPHA[b % 36]).join('');

// ---- validation helpers ----
export const cleanStr = (v, max, d = '') =>
  typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : d;
export const toBool = (v, d) => (typeof v === 'boolean' ? v : d);
export const toInt = (v, d, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
export const oneOf = (v, list, d) => (list.includes(v) ? v : d);
export function httpUrl(v, { required = false, httpsOnly = false, max = 2048 } = {}) {
  const s = cleanStr(v, max + 1);
  if (!s) { if (required) bad('A valid URL is required'); return ''; }
  if (s.length > max) bad('URL is too long');
  let u;
  try { u = new URL(s); } catch { bad('Enter a valid URL'); }
  if (!(u.protocol === 'https:' || (!httpsOnly && u.protocol === 'http:'))) bad(httpsOnly ? 'URL must start with https://' : 'URL must start with http:// or https://');
  return u.toString();
}
export const VID_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const GAME_ID_RE = /^[A-Za-z0-9_.-]{1,100}$/;

// ---- time in the configured statistics time zone ----
export function safeTz(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'UTC'; }
}
function parts(tz, ms) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { y: p.year, m: p.month, d: p.day, h: Number(p.hour) % 24, mi: Number(p.minute), s: Number(p.second), wd: p.weekday };
}
export const dayKey = (tz, ms = Date.now()) => { const p = parts(tz, ms); return `${p.y}-${p.m}-${p.d}`; };
export function startOfDayMs(tz, ms = Date.now()) {
  const p = parts(tz, ms);
  return ms - ((p.h * 3600 + p.mi * 60 + p.s) * 1000 + (ms % 1000));
}
export function startOfWeekMs(tz, ms = Date.now()) {
  const idx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts(tz, ms).wd);
  return startOfDayMs(tz, ms) - Math.max(0, idx) * 86400000;
}

export async function readJson(request, maxBytes = 20000) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > maxBytes) throw new HttpError(413, 'Request body too large', 'too_large');
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request body too large', 'too_large');
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? v : {};
  } catch { throw new HttpError(400, 'Invalid JSON body', 'bad_json'); }
}
