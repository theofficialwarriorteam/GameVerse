// Shared helpers used by the app shell, the public feature UI and the admin feature UI.
export const state = { games: [], settings: null, user: null, adminTab: 'overview', editingId: null, fb: null, cfg: null, apiStatus: 'idle', me: null, serverOffset: 0 };

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const isValidUrl = s => { try { return ['http:', 'https:'].includes(new URL(s).protocol); } catch { return false; } };
export const navigate = hash => { location.hash = hash; };
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- page-scoped timers (cleared on every route change) ---- */
const timers = [];
export function pageInterval(fn, ms) { const id = setInterval(fn, ms); timers.push(id); return id; }
export function clearTimers() { while (timers.length) clearInterval(timers.pop()); }

/* ---- formatting ---- */
export const fmtNum = n => (n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-US'));
export function fmtBytes(b) {
  b = Number(b) || 0;
  if (!b) return 'Size not listed';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b >= 100 || i === 0 ? Math.round(b) : b.toFixed(1)} ${u[i]}`;
}
export function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
export function timeAgo(sec) {
  const d = Math.floor(Date.now() / 1000) - sec;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return new Date(sec * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export const serverNow = () => Math.floor(Date.now() / 1000) + (state.serverOffset || 0);

/* ---- toast notifications ---- */
export function toast(msg, type = 'info') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `gv-toast gv-toast-${type}`;
  t.innerHTML = `<span class="gv-toast-ico" aria-hidden="true">${type === 'success' ? '✓' : type === 'error' ? '!' : 'i'}</span><span class="gv-toast-msg"></span><button type="button" aria-label="Dismiss">×</button>`;
  t.querySelector('.gv-toast-msg').textContent = String(msg);
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 250); };
  t.querySelector('button').onclick = close;
  box.appendChild(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(close, type === 'error' ? 7000 : 4500);
}

/* ---- confirmation dialog (replaces window.confirm) ---- */
export function confirmDialog(message, { title = 'Are you sure?', confirmText = 'Confirm', danger = false } = {}) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'gv-modal-bg';
    wrap.innerHTML = `<div class="gv-modal" role="alertdialog" aria-modal="true" aria-labelledby="gvm-t" aria-describedby="gvm-m"><h3 id="gvm-t"></h3><p id="gvm-m"></p><div class="gv-modal-actions"><button type="button" class="btn btn-ghost" data-r="0">CANCEL</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1"></button></div></div>`;
    wrap.querySelector('h3').textContent = title;
    wrap.querySelector('p').textContent = message;
    wrap.querySelector('[data-r="1"]').textContent = confirmText.toUpperCase();
    const done = v => { document.removeEventListener('keydown', onKey); wrap.remove(); prev?.focus?.(); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(false); };
    wrap.addEventListener('click', e => { if (e.target === wrap) done(false); const r = e.target.closest('[data-r]'); if (r) done(r.dataset.r === '1'); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    wrap.querySelector(danger ? '[data-r="0"]' : '[data-r="1"]').focus();
  });
}

/* ---- generic modal (admin edit forms) ---- */
export function openModal(html, { wide = false, onClose } = {}) {
  const prev = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'gv-modal-bg';
  wrap.innerHTML = `<div class="gv-modal ${wide ? 'gv-modal-wide' : ''}" role="dialog" aria-modal="true"><button type="button" class="gv-modal-x" aria-label="Close">×</button>${html}</div>`;
  const close = () => { document.removeEventListener('keydown', onKey); wrap.remove(); prev?.focus?.(); onClose?.(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  wrap.querySelector('.gv-modal-x').onclick = close;
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  wrap.querySelector('input,select,textarea,button:not(.gv-modal-x)')?.focus();
  return { el: wrap, close };
}

export const spinner = '<span class="gv-spin" aria-hidden="true"></span>';
export function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `${spinner}${label || 'WORKING…'}`; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}
