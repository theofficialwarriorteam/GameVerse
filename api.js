// Client for the GAMEVERSE API Worker. Never holds secrets: admin calls carry the
// signed-in administrator's Firebase ID token, which the Worker verifies server-side.
import { state, serverNow } from './core.js';
import { API_BASE } from './firebase-config.js';

export class ApiError extends Error {
  constructor(message, status = 0, code = 'error', data = null) { super(message); this.status = status; this.code = code; this.data = data; }
}
export const apiBase = () => String(state.settings?.features?.statsApiUrl || '').trim().replace(/\/+$/, '') || String(API_BASE || '').replace(/\/+$/, '');
export const apiConfigured = () => !!apiBase();

let memoryId = null;
export function getVisitorId() {
  try {
    let id = localStorage.getItem('gv_visitor_id');
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) { id = crypto.randomUUID(); localStorage.setItem('gv_visitor_id', id); }
    return id;
  } catch { return memoryId || (memoryId = crypto.randomUUID()); }
}

async function adminToken() {
  const u = state.fb?.auth?.currentUser;
  if (!u) throw new ApiError('Sign in as administrator first.', 401, 'unauthorized');
  return u.getIdToken();
}

// auth: 'admin' → required token; 'optional' → attach the token when the admin is signed in
// (so the Worker can exclude admin traffic from statistics); default → none.
export async function api(path, { method = 'GET', body, rawBody, auth, timeout = 12000, headers = {}, keepalive = false } = {}) {
  const base = apiBase();
  if (!base) throw new ApiError('The GameVerse server is not connected yet.', 0, 'unconfigured');
  const h = { 'X-GV-Visitor': getVisitorId(), ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (auth === 'admin') h.Authorization = 'Bearer ' + await adminToken();
  else if (auth === 'optional' && state.user) { try { h.Authorization = 'Bearer ' + await adminToken(); } catch { /* ignore */ } }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  let res;
  try {
    res = await fetch(base + path, { method, headers: h, body: rawBody !== undefined ? rawBody : (body !== undefined ? JSON.stringify(body) : undefined), signal: ctl.signal, keepalive });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'The server took too long to respond.' : 'Could not reach the GameVerse server.', 0, 'network');
  } finally { clearTimeout(timer); }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code || 'error', data);
  return data;
}

/* ---- public configuration + visitor profile ---- */
export async function loadConfig() {
  if (!apiConfigured()) { state.apiStatus = 'none'; state.cfg = null; return null; }
  state.apiStatus = 'loading';
  try {
    state.cfg = await api('/v1/config', { timeout: 6000 });
    state.apiStatus = 'ok';
    state.serverOffset = state.cfg.serverNow - Math.floor(Date.now() / 1000);
  } catch (e) { state.apiStatus = 'error'; state.cfg = null; }
  return state.cfg;
}
export async function loadMe() {
  if (state.apiStatus !== 'ok') return null;
  try {
    state.me = await api('/v1/me', { timeout: 6000 });
    state.serverOffset = state.me.serverNow - Math.floor(Date.now() / 1000);
  } catch { state.me = null; }
  return state.me;
}
export const feature = key => state.apiStatus === 'ok' && state.cfg?.features?.[key] === true;

/* ---- tracking (privacy-light: random id, no personal data) ---- */
let trackingStarted = false;
const trackingWanted = () => state.apiStatus === 'ok' && (state.cfg.features.visitorStats || state.cfg.features.onlineTracking);
const ping = () => { if (!document.hidden && !state.user && location.hash !== '#admin' && trackingWanted()) api('/v1/ping', { method: 'POST', auth: 'optional', keepalive: true, timeout: 8000 }).catch(() => {}); };
export function startTracking() {
  if (trackingStarted || !trackingWanted()) return;
  trackingStarted = true;
  ping();
  setInterval(ping, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ping(); });
}
export function trackGame(kind, gameId) {
  if (state.apiStatus !== 'ok' || !state.cfg.features.gameAnalytics || state.user) return;
  api(`/v1/games/${encodeURIComponent(gameId)}/${kind}`, { method: 'POST', auth: 'optional', keepalive: true, timeout: 8000 }).catch(() => {});
}
export { serverNow };
