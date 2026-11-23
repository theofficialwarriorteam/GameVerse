// Public-facing feature UI: header/footer, homepage stats, ratings, feedback, downloads, tasks & access.
import { state, $, $$, esc, toast, navigate, pageInterval, fmtNum, fmtBytes, fmtDuration, serverNow, setBusy, openModal } from './core.js';
import { api, apiConfigured, loadConfig, loadMe, feature, ApiError } from './api.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const app = () => $('#app');
const ICON = {
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.9-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.1 1.1-6.5L2.6 9.5l6.5-.9z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C6.5 5 2.7 9 1.5 12c1.2 3 5 7 10.5 7s9.3-4 10.5-7C21.3 9 17.5 5 12 5zm0 11a4 4 0 110-8 4 4 0 010 8zm0-2a2 2 0 100-4 2 2 0 000 4z"/></svg>',
  users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a3 3 0 100-6 3 3 0 000 6zM8 11a3 3 0 100-6 3 3 0 000 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 1.9 2 3.400V19h6v-2.500C23 14.200 18.300 13 16 13z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7a5 5 0 100 10 5 5 0 000-10zM11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.2 5.6l1.4-1.4 2.100 2.100-1.400 1.400zm12.100 12.100l1.400-1.400 2.100 2.100-1.400 1.400zM5.600 19.800l-1.400-1.400 2.100-2.100 1.400 1.400zM18.400 6.300l-1.400-1.400 2.100-2.100 1.400 1.400z"/></svg>',
  pad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12a4 4 0 014 4v2a3 3 0 01-5.400 1.800L15 14H9l-1.600 1.800A3 3 0 012 14v-2a4 4 0 014-4zm1 2v1H6v2h1v1h2v-1h1v-2H9v-1zm8 1a1 1 0 100 2 1 1 0 000-2zm2 1a1 1 0 100 2 1 1 0 000-2z"/></svg>',
  dl: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3h2v9l3.500-3.500 1.400 1.400L12 15.800 6.100 9.900l1.400-1.400L11 12zM5 18h14v3H5z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.200L4.800 12l-1.400 1.400L9 19 21 7l-1.400-1.400z"/></svg>',
  yt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.600 7.200a2.500 2.500 0 00-1.800-1.800C18.200 5 12 5 12 5s-6.200 0-7.800.4A2.500 2.500 0 002.400 7.200C2 8.800 2 12 2 12s0 3.200.4 4.800a2.500 2.500 0 001.800 1.800C5.800 19 12 19 12 19s6.200 0 7.800-.4a2.500 2.500 0 001.800-1.800c.4-1.600.4-4.800.4-4.800s0-3.200-.4-4.800zM10 15V9l5.200 3z"/></svg>',
  discord: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.300 5.300A16 16 0 0015.400 4l-.5 1a15 15 0 00-4.800 0l-.5-1a16 16 0 00-3.900 1.300C3.200 9 2.500 12.600 2.800 16.200a16 16 0 004.800 2.400l1-1.600a10 10 0 01-1.600-.8l.4-.3a11.500 11.500 0 009.200 0l.4.300c-.5.300-1 .600-1.600.8l1 1.600a16 16 0 004.800-2.400c.4-4.200-.7-7.800-2.900-10.900zM9.500 14c-.9 0-1.600-.8-1.600-1.800S8.600 10.400 9.500 10.400s1.600.8 1.600 1.800S10.400 14 9.500 14zm5 0c-.9 0-1.600-.8-1.600-1.800s.7-1.800 1.600-1.800 1.600.8 1.600 1.800S15.400 14 14.500 14z"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.600 13.400a4 4 0 005.700 0l3-3a4 4 0 00-5.700-5.700l-1 1 1.400 1.400 1-1a2 2 0 112.900 2.900l-3 3a2 2 0 01-2.900 0zm2.800-2.800a4 4 0 00-5.700 0l-3 3a4 4 0 005.700 5.700l1-1-1.400-1.400-1 1a2 2 0 11-2.900-2.900l3-3a2 2 0 012.900 0z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 5h-2v6l5 3 1-1.700-4-2.300z"/></svg>'
};
const kindIcon = k => (k.startsWith('youtube') ? ICON.yt : k === 'discord' ? ICON.discord : ICON.link);

/* =============================== header / footer =============================== */
export function header() {
  const h = location.hash || '#home';
  const f = state.apiStatus === 'ok' ? state.cfg.features : null;
  const links = [['#home', 'HOME'], ['#games', 'GAMES'], ...(f && !f.downloads ? [] : [['#downloads', 'DOWNLOADS']]), ...(f && f.tasks ? [['#tasks', 'TASKS']] : []), ['#contact', 'CONTACT']];
  const act = p => (h === p || (p === '#games' && h.startsWith('#game/')) ? 'active' : '');
  return `<header class="topbar"><a class="logo" href="#home"><span class="logo-icon">G</span> GAMEVERSE</a><nav class="nav" id="main-nav" aria-label="Main">${links.map(([href, label]) => `<a href="${href}" class="${act(href)}">${label}</a>`).join('')}<a class="nav-explore" href="#games">EXPLORE GAMES ↗</a></nav><div class="actions"><span class="access-pill" id="gv-access-pill" hidden></span><a class="btn btn-primary btn-small hide-sm" href="#games">EXPLORE GAMES ↗</a><button type="button" class="menu-btn" id="menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="main-nav"><span></span><span></span><span></span></button></div></header>`;
}
export function footer() {
  return `<footer class="footer"><div class="container footer-inner"><div>© ${new Date().getFullYear()} GAMEVERSE. Independent gaming directory. <span class="gv-live-stats" id="gv-footer-stats"></span></div><div class="footer-links"><a href="#home">Home</a><a href="#games">Games</a><a href="#downloads">Downloads</a><a href="#contact">Contact</a><a href="#privacy">Privacy</a><a href="#terms">Terms</a></div></div></footer>`;
}

/* One-time global wiring: mobile menu + live access countdown pill. */
export function initGlobalUI() {
  document.addEventListener('click', e => {
    const b = e.target.closest('#menu-btn');
    const nav = $('#main-nav');
    if (b && nav) { const open = nav.classList.toggle('open'); b.setAttribute('aria-expanded', String(open)); b.classList.toggle('open', open); return; }
    if (nav?.classList.contains('open') && (e.target.closest('#main-nav a') || !e.target.closest('.topbar'))) { nav.classList.remove('open'); $('#menu-btn')?.setAttribute('aria-expanded', 'false'); $('#menu-btn')?.classList.remove('open'); }
  });
  let expiring = false;
  setInterval(async () => {
    const pill = $('#gv-access-pill'), a = state.me?.access;
    if (!a || !a.granted || !a.gateActive) { if (pill) pill.hidden = true; return; }
    const left = a.expiresAt - serverNow();
    if (pill) { pill.hidden = false; pill.innerHTML = `${ICON.clock}<span>ACCESS ${fmtDuration(left)}</span>`; pill.title = 'Your temporary access expires automatically.'; }
    if (left <= 0 && !expiring) {
      expiring = true;
      await loadMe();
      expiring = false;
      if (gateBlocks()) { toast('Your access has expired. Complete the unlock again to continue.', 'info'); stashReturn(); navigate('#unlock'); }
    }
  }, 1000);
}
export const gateBlocks = () => state.apiStatus === 'ok' && !!state.me && state.me.access.gateActive && state.me.access.scope === 'site' && !state.me.access.granted;
export const stashReturn = () => { try { const h = location.hash; if (h && !['#unlock', '#admin'].includes(h)) sessionStorage.setItem('gv_return', h); } catch { /* ignore */ } };
const takeReturn = () => { let h = '#home'; try { h = sessionStorage.getItem('gv_return') || '#home'; sessionStorage.removeItem('gv_return'); } catch { /* ignore */ } return h === '#unlock' ? '#home' : h; };

/* ================================= statistics ================================= */
let statsCache = { at: 0, data: null };
export async function fetchStats(force = false) {
  if (!force && statsCache.data && Date.now() - statsCache.at < 15000) return statsCache.data;
  const d = await api('/v1/stats', { timeout: 8000 });
  statsCache = { at: Date.now(), data: d };
  return d;
}
function countTo(el, to) {
  const from = Number(el.dataset.v || 0); el.dataset.v = to;
  if (reduced() || from === to) { el.textContent = fmtNum(to); return; }
  const t0 = performance.now(), dur = 700;
  const step = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmtNum(Math.round(from + (to - from) * e)); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const STAT_DEFS = [
  ['totalVisitors', 'Total Visitors', 'unique browsers', ICON.users],
  ['todayVisitors', "Today's Visitors", 'unique visitors today', ICON.sun],
  ['online', 'Currently Online', 'active in the last 2 minutes', '<span class="live-dot"></span>'],
  ['games', 'Games Available', 'published on GameVerse', ICON.pad],
  ['totalPlays', 'Play Now Clicks', 'launch requests, not verified plays', ICON.play]
];
export function statsSectionHTML() {
  if (state.apiStatus === 'ok' && !state.cfg.features.homepageStats) return '';
  return `<section class="section container gv-stats" id="gv-stats" aria-label="Community statistics"><div class="section-head"><div><div class="eyebrow">LIVE FROM THE COMMUNITY</div><h2>GAMEVERSE IN NUMBERS</h2></div></div><div class="stat-grid">${STAT_DEFS.map(([k, label, sub, ico]) => `<div class="stat-card" data-stat="${k}"><div class="stat-ico">${ico}</div><div class="stat-body"><span class="stat-label">${label}</span><strong class="stat-value ${k === 'games' ? '' : 'skel'}" data-v="0">${k === 'games' ? fmtNum(state.games.filter(g => g.published).length) : '&nbsp;'}</strong><small>${sub}</small></div></div>`).join('')}</div><p class="stats-note" id="stats-note" role="status"></p></section>`;
}
export async function hydrateStats() {
  const root = $('#gv-stats'); if (!root) return;
  const note = $('#stats-note');
  const fail = msg => {
    if (!root.isConnected) return; // the page re-rendered while we were loading
    root.classList.add('is-error');
    root.querySelectorAll('.stat-card:not([data-stat="games"]) .stat-value').forEach(v => { v.classList.remove('skel'); v.textContent = '—'; });
    note.innerHTML = `${esc(msg)} <button type="button" class="link-btn" id="stats-retry">Try again</button>`;
    note.querySelector('#stats-retry').onclick = async () => { note.textContent = 'Loading…'; root.classList.remove('is-error'); if (state.apiStatus !== 'ok') await loadConfig(); run(true); };
  };
  const run = async force => {
    if (!$('#gv-stats')) return;
    if (!apiConfigured()) return fail('Live statistics are not available yet.');
    if (state.apiStatus === 'error') return fail('Live statistics are temporarily unavailable.');
    if (state.apiStatus !== 'ok') return;
    try {
      const d = await fetchStats(force);
      root.classList.remove('is-error'); note.textContent = '';
      for (const [k] of STAT_DEFS) {
        const card = root.querySelector(`[data-stat="${k}"]`); if (!card) continue;
        const val = k === 'games' ? state.games.filter(g => g.published).length : d[k];
        if (val === null || val === undefined) { card.remove(); continue; }
        const el = card.querySelector('.stat-value'); el.classList.remove('skel'); countTo(el, val);
      }
    } catch (e) { fail('Live statistics are temporarily unavailable.'); }
  };
  await run(false);
  pageInterval(() => run(true), 30000);
}
export async function hydrateFooterStats() {
  const el = $('#gv-footer-stats');
  if (!el || state.apiStatus !== 'ok') return;
  try {
    const d = await fetchStats();
    const bits = [];
    if (d.online !== null) bits.push(`<span class="live-dot sm"></span>${fmtNum(d.online)} online`);
    if (d.totalVisitors !== null) bits.push(`${fmtNum(d.totalVisitors)} visitors`);
    if ($('#gv-footer-stats')) $('#gv-footer-stats').innerHTML = bits.length ? '· ' + bits.join(' · ') : '';
  } catch { /* the footer simply stays empty */ }
}
let bulkCache = { at: 0, data: null };
export async function hydrateCardStats() {
  const cards = $$('[data-gid]'); if (!cards.length || state.apiStatus !== 'ok') return;
  const f = state.cfg.features; if (!f.ratings && !f.gameAnalytics) return;
  try {
    if (!bulkCache.data || Date.now() - bulkCache.at > 60000) { bulkCache = { at: Date.now(), data: (await api('/v1/games', { timeout: 8000 })).games }; }
    const map = Object.fromEntries(bulkCache.data.map(g => [g.gameId, g]));
    cards.forEach(c => {
      const g = map[c.dataset.gid]; if (!g) return;
      const bits = [];
      if (g.ratingCount) bits.push(`<span class="gc-chip gold">${ICON.star}${g.ratingAverage.toFixed(1)}</span>`);
      if (g.plays) bits.push(`<span class="gc-chip">${ICON.play}${fmtNum(g.plays)}</span>`);
      c.innerHTML = bits.join('');
    });
  } catch { /* cards simply show no stats */ }
}

/* ================================== ratings ================================== */
const starRow = () => ICON.star.repeat(5);
export const starsHTML = (avg, cls = '') => `<span class="stars ${cls}" style="--p:${Math.max(0, Math.min(100, avg / 5 * 100)).toFixed(1)}%" role="img" aria-label="${avg ? avg.toFixed(1) : 'No'} out of 5 stars"><span class="stars-bg">${starRow()}</span><span class="stars-fg">${starRow()}</span></span>`;
const LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

export function communityBarHTML() {
  if (state.apiStatus === 'ok' && !state.cfg.features.ratings && !state.cfg.features.gameAnalytics) return '';
  return `<div class="community-bar" id="community-bar" aria-live="polite">
   <div class="cb-item" id="cb-rating"><span class="cb-ico gold">${ICON.star}</span><div><strong class="skel">0.0</strong><small>community rating</small></div></div>
   <div class="cb-item" id="cb-plays"><span class="cb-ico">${ICON.play}</span><div><strong class="skel">000</strong><small>Play Now clicks</small></div></div>
   <div class="cb-item" id="cb-views"><span class="cb-ico">${ICON.eye}</span><div><strong class="skel">000</strong><small>page views</small></div></div></div>
   <p class="cb-foot">Play Now clicks show how often visitors pressed the button — they don’t confirm that a game loaded. Ratings are anonymous community ratings.</p>`;
}
export function ratingPanelHTML() {
  if (state.apiStatus === 'ok' && !state.cfg.features.ratings) return '';
  return `<section class="panel rating-panel" id="rating-panel" aria-labelledby="rp-title"><div class="rp-top"><div><div class="eyebrow">WHAT PLAYERS THINK</div><h2 id="rp-title">COMMUNITY RATING</h2></div></div>
   <div class="rp-grid"><div class="rp-score"><div class="rp-big"><span id="rp-avg" class="skel">0.0</span><small>/ 5</small></div><div id="rp-stars">${starsHTML(0, 'lg')}</div><div class="rp-count" id="rp-count">Loading ratings…</div></div>
   <div class="rp-bars" id="rp-bars">${[5, 4, 3, 2, 1].map(n => `<div class="rp-row" data-n="${n}"><span class="rp-n">${n}<i>${ICON.star}</i></span><span class="rp-track"><span class="rp-fill" style="width:0"></span></span><span class="rp-num">—</span></div>`).join('')}</div></div>
   <div class="rp-rate" id="rp-rate"></div></section>`;
}
function paintRating(r, mine, game) {
  const avg = r.average || 0;
  $('#rp-avg').classList.remove('skel'); $('#rp-avg').textContent = r.count ? avg.toFixed(1) : '–';
  $('#rp-stars').innerHTML = starsHTML(avg, 'lg');
  $('#rp-count').textContent = r.count ? `Based on ${fmtNum(r.count)} rating${r.count === 1 ? '' : 's'}` : 'No ratings yet — be the first to rate!';
  $$('#rp-bars .rp-row').forEach(row => {
    const n = row.dataset.n, c = r.distribution[n] || 0, pct = r.count ? c / r.count * 100 : 0;
    row.querySelector('.rp-fill').style.width = pct.toFixed(1) + '%';
    row.querySelector('.rp-num').textContent = r.count ? `${fmtNum(c)} · ${Math.round(pct)}%` : '0';
    row.setAttribute('aria-label', `${n} star: ${c} rating${c === 1 ? '' : 's'}`);
  });
  const cb = $('#cb-rating strong'); if (cb) { cb.classList.remove('skel'); cb.textContent = r.count ? `${avg.toFixed(1)} / 5` : '–'; cb.nextElementSibling.textContent = r.count ? `${fmtNum(r.count)} rating${r.count === 1 ? '' : 's'}` : 'no ratings yet'; }
  paintPicker(mine, game);
}
function paintPicker(mine, game) {
  const box = $('#rp-rate'); if (!box) return;
  let sel = mine || 0;
  box.innerHTML = `<div class="rp-rate-head"><strong>${mine ? 'Your rating' : 'Rate this game'}</strong><span id="rp-hint">${mine ? `You rated ${mine} star${mine === 1 ? '' : 's'} — ${LABELS[mine]}. You can change it.` : 'Tap a star, then submit.'}</span></div>
   <div class="star-pick" role="radiogroup" aria-label="Your rating">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" class="sp ${n <= sel ? 'on' : ''}" data-v="${n}" aria-checked="${n === sel}" aria-label="${n} star${n > 1 ? 's' : ''} — ${LABELS[n]}" tabindex="${n === (sel || 1) ? 0 : -1}">${ICON.star}</button>`).join('')}<span class="sp-label" id="sp-label">${sel ? LABELS[sel] : ''}</span></div>
   <div class="rp-actions"><button type="button" class="btn btn-primary btn-small" id="rp-submit" disabled>${mine ? 'UPDATE RATING' : 'SUBMIT RATING'}</button><span class="rp-msg" id="rp-msg" role="status"></span></div>`;
  const btns = $$('#rp-rate .sp'), label = $('#sp-label'), submit = $('#rp-submit');
  const show = v => { btns.forEach(b => b.classList.toggle('on', Number(b.dataset.v) <= v)); label.textContent = v ? LABELS[v] : ''; };
  const choose = v => { sel = v; show(v); btns.forEach(b => { b.setAttribute('aria-checked', String(Number(b.dataset.v) === v)); b.tabIndex = Number(b.dataset.v) === v ? 0 : -1; }); submit.disabled = v === mine; };
  btns.forEach((b, i) => {
    b.onmouseenter = () => show(Number(b.dataset.v)); b.onmouseleave = () => show(sel);
    b.onclick = () => choose(Number(b.dataset.v));
    b.onkeydown = e => {
      const k = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (!k) return;
      e.preventDefault(); const n = Math.min(5, Math.max(1, (sel || i + 1) + k)); choose(n); btns[n - 1].focus();
    };
  });
  submit.onclick = async () => {
    if (!sel) return;
    setBusy(submit, true, 'SAVING…');
    try {
      const r = await api(`/v1/games/${encodeURIComponent(game.id)}/rate`, { method: 'POST', body: { stars: sel } });
      toast(r.updated ? 'Your rating was updated.' : 'Thanks for rating this game!', 'success');
      paintRating(r.rating, r.mine, game);
      $('#rp-msg').textContent = `✓ Saved — you rated ${r.mine} star${r.mine === 1 ? '' : 's'}.`; $('#rp-msg').className = 'rp-msg ok';
    } catch (e) { setBusy(submit, false); $('#rp-msg').textContent = e.message; $('#rp-msg').className = 'rp-msg err'; toast(e.message, 'error'); }
  };
}
export async function hydrateGameCommunity(game) {
  const panel = $('#rating-panel'), bar = $('#community-bar');
  if (!panel && !bar) return;
  const unavailable = msg => {
    $$('#community-bar strong').forEach(s => { s.classList.remove('skel'); s.textContent = '—'; });
    if (panel) {
      $('#rp-avg')?.classList.remove('skel'); if ($('#rp-avg')) $('#rp-avg').textContent = '–';
      $('#rp-count').textContent = msg;
      $('#rp-rate').innerHTML = `<div class="inline-state">${esc(msg)} <button type="button" class="link-btn" id="rp-retry">Try again</button></div>`;
      $('#rp-retry').onclick = () => { $('#rp-rate').innerHTML = ''; if ($('#rp-avg')) $('#rp-avg').classList.add('skel'); load(); };
    }
  };
  const load = async () => {
    if (!apiConfigured()) return unavailable('Community stats are not available yet.');
    if (state.apiStatus === 'error') return unavailable('Community stats are temporarily unavailable.');
    if (state.apiStatus !== 'ok') return;
    try {
      const d = await api(`/v1/games/${encodeURIComponent(game.id)}`, { timeout: 8000 });
      if (d.plays !== null) { const s = $('#cb-plays strong'); if (s) { s.classList.remove('skel'); s.textContent = fmtNum(d.plays); } const v = $('#cb-views strong'); if (v) { v.classList.remove('skel'); v.textContent = fmtNum(d.views); } }
      else { $('#cb-plays')?.remove(); $('#cb-views')?.remove(); }
      if (d.rating) paintRating(d.rating, d.mine, game); else { $('#cb-rating')?.remove(); }
    } catch (e) { unavailable('Community stats are temporarily unavailable.'); }
  };
  await load();
}

/* ================================== feedback ================================== */
export function feedbackSectionHTML(game) {
  if (state.apiStatus === 'ok' && !state.cfg.features.feedback) return '';
  return `<section class="panel feedback-panel" id="feedback-panel"><div class="eyebrow">YOUR VOICE</div><h2>${game ? 'GAME FEEDBACK' : 'SEND FEEDBACK'}</h2><p class="section-sub">${game ? `Tell us what you think about ${esc(game.title)} — bugs, broken links or ideas.` : 'Found a bug or have an idea? Tell us — every message is read by the GameVerse team.'}</p><div id="feedback-body"></div></section>`;
}
export function wireFeedback(game) {
  const box = $('#feedback-body'); if (!box) return;
  const cfg = state.cfg?.feedback || { categories: ['Bug report', 'Broken game link', 'Suggestion', 'Game request', 'Other'], maxLength: 1000 };
  if (!apiConfigured() || state.apiStatus === 'error') { box.innerHTML = '<div class="inline-state">Feedback is temporarily unavailable. Please try again later.</div>'; return; }
  const formHTML = () => `<form id="feedback-form" class="fb-form" novalidate><div class="fb-row"><label for="fb-cat">Category</label><select id="fb-cat" name="category" class="field" required>${cfg.categories.map(c => `<option>${esc(c)}</option>`).join('')}</select></div><div class="fb-row"><label for="fb-msg">Your feedback</label><textarea id="fb-msg" name="message" class="field" maxlength="${cfg.maxLength}" required placeholder="Describe what happened or what you would like to see…"></textarea><div class="fb-count"><span id="fb-n">0</span> / ${cfg.maxLength}</div></div><input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><div class="fb-actions"><button class="btn btn-primary" id="fb-send">SEND FEEDBACK</button><span class="fb-err" id="fb-err" role="alert"></span></div><p class="muted-note left">Please don’t include personal information. Messages are visible to the site administrator only.</p></form>`;
  const mount = () => {
    box.innerHTML = formHTML();
    const msg = $('#fb-msg'), n = $('#fb-n'), err = $('#fb-err');
    msg.oninput = () => { n.textContent = msg.value.length; err.textContent = ''; };
    $('#feedback-form').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget), text = String(fd.get('message') || '').trim();
      if (text.length < 5) { err.textContent = 'Please write at least a few words.'; msg.focus(); return; }
      const btn = $('#fb-send'); setBusy(btn, true, 'SENDING…');
      try {
        await api('/v1/feedback', { method: 'POST', body: { category: fd.get('category'), message: text, gameId: game?.id, website: fd.get('website') } });
        box.innerHTML = `<div class="fb-done"><div class="fb-check">${ICON.check}</div><h3>Thank you!</h3><p>Your feedback was sent to the GameVerse team.</p><button type="button" class="btn btn-ghost btn-small" id="fb-again">SEND ANOTHER</button></div>`;
        $('#fb-again').onclick = mount; toast('Feedback sent — thank you!', 'success');
      } catch (e2) { setBusy(btn, false); err.textContent = e2.message; toast(e2.message, 'error'); }
    };
  };
  mount();
}

/* ================================== downloads ================================== */
const TYPE_HUE = { APK: 140, ZIP: 36, EXE: 210, MSI: 210, RAR: 285, '7Z': 285, DMG: 330, OTHER: 0 };
export async function renderDownloads() {
  app().innerHTML = `${header()}<main class="page-shell container"><div class="page-head"><div class="eyebrow">GAMEVERSE FILE CENTER</div><h1 class="page-title">FREE GAME DOWNLOADS</h1><p>Every file here is free. Check system requirements and scan files with trusted security software before opening them.</p></div><div id="dl-toolbar"></div><div id="dl-grid" class="download-grid" aria-live="polite">${Array.from({ length: 6 }, () => '<div class="dl-card skeleton-card"><div class="dl-art skel"></div><div class="dl-body"><div class="skel line w60"></div><div class="skel line w40"></div><div class="skel line"></div></div></div>').join('')}</div><p class="muted-note left" style="margin-top:24px">Only download files you are authorized to use. GAMEVERSE does not guarantee third-party files.</p></main>${footer()}`;
  hydrateFooterStats();
  const grid = $('#dl-grid');
  const stateBox = (title, msg, retry) => { grid.className = ''; grid.innerHTML = `<div class="empty state-box"><h3>${esc(title)}</h3><p>${esc(msg)}</p>${retry ? '<button type="button" class="btn btn-small" id="dl-retry">TRY AGAIN</button>' : ''}</div>`; if (retry) $('#dl-retry').onclick = () => renderDownloads(); };
  if (!apiConfigured()) return stateBox('Downloads aren’t available yet', 'The GameVerse server isn’t connected. Please check back soon.');
  if (state.apiStatus !== 'ok') await loadConfig();
  if (state.apiStatus !== 'ok') return stateBox('Couldn’t load downloads', 'The server didn’t respond. Please try again in a moment.', true);
  let data;
  try { data = await api('/v1/downloads', { timeout: 10000 }); } catch (e) { return stateBox('Couldn’t load downloads', e.message, true); }
  if (!data.enabled) return stateBox('Downloads are switched off', 'The download center is temporarily unavailable.');
  if (!data.items.length) return stateBox('No downloads yet', 'Free game files will appear here as soon as they’re published. Check back soon!');
  const types = [...new Set(data.items.map(i => i.fileType))];
  const devices = [...new Set(data.items.flatMap(i => i.supportedDevices || []))].sort();
  const ui = { q: '', type: '', device: '', sort: 'new' };
  $('#dl-toolbar').innerHTML = `<div class="toolbar"><input id="dl-search" class="field search" type="search" placeholder="Search downloads…" aria-label="Search downloads"><select id="dl-sort" class="field" style="max-width:190px" aria-label="Sort"><option value="new">Newest first</option><option value="pop">Most downloaded</option><option value="rated">Highest rated</option><option value="az">A → Z</option></select><select id="dl-device" class="field" style="max-width:190px" aria-label="Supported device"><option value="">All devices</option>${devices.map(d=>`<option>${esc(d)}</option>`).join('')}</select><button type="button" class="btn btn-small" id="dl-clear">CLEAR FILTERS</button></div><div class="chips" role="group" aria-label="File type"><button type="button" class="chip on" data-t="">ALL</button>${types.map(t => `<button type="button" class="chip" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
  const paint = () => {
    let list = data.items.filter(i => (!ui.type || i.fileType === ui.type) && (!ui.device || (i.supportedDevices||[]).includes(ui.device)) && (`${i.title} ${i.description} ${i.shortDescription} ${i.fileType}`).toLowerCase().includes(ui.q));
    list = [...list].sort(ui.sort === 'az' ? (a, b) => a.title.localeCompare(b.title) : ui.sort === 'pop' ? (a, b) => (b.downloadClicks || 0) - (a.downloadClicks || 0) : ui.sort === 'rated' ? (b.rating?.average || 0) - (a.rating?.average || 0) : (a, b) => b.updatedAt - a.updatedAt);
    grid.className = 'download-grid';
    grid.innerHTML = list.length ? list.map(downloadCard).join('') : '<div class="empty state-box" style="grid-column:1/-1"><h3>No matches</h3><p>Try a different search or file type.</p></div>';
  };
  $('#dl-search').oninput = e => { ui.q = e.target.value.trim().toLowerCase(); paint(); };
  $('#dl-sort').onchange = e => { ui.sort = e.target.value; paint(); };
  $('#dl-device').onchange = e => { ui.device = e.target.value; paint(); };
  $('#dl-clear').onclick = () => { ui.q=''; ui.type=''; ui.device=''; ui.sort='new'; $('#dl-search').value=''; $('#dl-device').value=''; $('#dl-sort').value='new'; $$('#dl-toolbar .chip').forEach(x=>x.classList.toggle('on',!x.dataset.t)); paint(); };
  $('#dl-toolbar').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; ui.type = c.dataset.t; $$('#dl-toolbar .chip').forEach(x => x.classList.toggle('on', x === c)); paint(); };
  grid.onclick = e => {
    const more = e.target.closest('[data-more]'); if (more) { more.previousElementSibling.classList.toggle('open'); more.textContent = more.textContent === 'Read more' ? 'Show less' : 'Read more'; return; }
    const card = e.target.closest('[data-details]'); if (card) navigate(`#download/${encodeURIComponent(card.dataset.details)}`);
  };
  paint();
}
function downloadCard(i) {
  const hue = TYPE_HUE[i.fileType] ?? 0;
  const art = i.coverUrl ? `<img src="${esc(i.coverUrl)}" alt="${esc(i.title)} cover" loading="lazy" onerror="this.remove()">` : '';
  const rating = i.rating?.count ? `<span>★ ${(i.rating.average || 0).toFixed(1)} (${fmtNum(i.rating.count)})</span>` : '<span>Not rated yet</span>';
  return `<article class="dl-card" data-details="${esc(i.id)}"><div class="dl-art" style="--h:${hue}"><span class="dl-glyph">${ICON.dl}</span>${art}<span class="dl-type">${esc(i.fileType)}</span><span class="dl-free">FREE</span></div><div class="dl-body"><h3>${esc(i.title)}</h3><div class="dl-meta">${i.version ? `<span>v${esc(i.version.replace(/^v/i, ''))}</span>` : ''}<span>${fmtBytes(i.sizeBytes)}</span><span>${fmtNum(i.downloadClicks)} button clicks</span><span>${fmtNum(i.downloadCount)} file requests</span></div><p class="dl-desc">${esc(i.shortDescription || i.description || 'No description provided.')}</p><div class="dl-meta">${rating}</div><button type="button" class="btn btn-primary dl-btn" data-details="${esc(i.id)}">VIEW DETAILS →</button></div></article>`;
}

export async function renderDownloadDetails(id, preview = false) {
  app().innerHTML = `${header()}<main class="page-shell container"><div class="panel"><div class="skel line w40"></div><div class="skel line"></div></div></main>${footer()}`;
  hydrateFooterStats();
  let item;
  try { const d = await api(preview ? `/v1/admin/downloads/${encodeURIComponent(id)}` : `/v1/downloads/${encodeURIComponent(id)}`, { timeout: 10000, ...(preview ? {auth:'admin'} : {}) }); item = d.item; }
  catch (e) { app().innerHTML = `${header()}<main class="page-shell container"><a class="btn btn-ghost btn-small" href="#downloads">← BACK TO DOWNLOADS</a><div class="empty state-box"><h2>DOWNLOAD UNAVAILABLE</h2><p>${esc(e.message)}</p></div></main>${footer()}`; return; }
  const r = item.rating || { count:0, average:0, distribution:[0,0,0,0,0], mine:null };
  const reqLabels = {operatingSystem:'Operating system',processor:'Processor',ram:'RAM',storage:'Storage',graphics:'Graphics',additionalSoftware:'Additional software'};
  const reqRows = Object.entries(reqLabels).filter(([k]) => item.requirements?.[k]).map(([k,l]) => `<div class="gv-dl-fact"><b>${l}</b><span>${esc(item.requirements[k])}</span></div>`).join('');
  const devices = (item.supportedDevices || []).map(x => `<span class="gc-chip">${esc(x)}</span>`).join('');
  const cover = item.coverUrl ? `<img class="gv-dl-hero-img" src="${esc(item.coverUrl)}" alt="${esc(item.title)} cover">` : '';
  const dist = [5,4,3,2,1].map(n => { const count=r.distribution?.[n-1]||0, pct=r.count?Math.round(count/r.count*100):0; return `<div class="gv-dl-dist-row"><span>${n} ★</span><span class="gv-dl-dist-track"><i style="width:${pct}%"></i></span><span>${count}</span></div>`; }).join('');
  app().innerHTML = `${header()}<main class="page-shell container gv-download-detail">${preview ? '<div class="notice warn">ADMIN PREVIEW — this download may be unpublished and is not visible to visitors.</div>' : ''}<a class="btn btn-ghost btn-small" href="#downloads">← BACK TO DOWNLOADS</a><section class="gv-dl-hero">${cover}<div class="gv-dl-head"><div class="eyebrow">GAMEVERSE FREE FILE CENTER</div><h1>${esc(item.title)}</h1><p>${esc(item.shortDescription || '')}</p><div class="chips"><span class="gc-chip">${esc(item.fileType)}</span>${item.version?`<span class="gc-chip">v${esc(item.version)}</span>`:''}<span class="gc-chip">${fmtBytes(item.sizeBytes)}</span><span class="gc-chip">${fmtNum(item.downloadClicks)} button clicks</span><span class="gc-chip">${fmtNum(item.downloadCount)} file requests</span></div><div class="gv-dl-downloadbox"><div><b>FREE DOWNLOAD</b><small>${esc(item.fileType)} · ${fmtBytes(item.sizeBytes)}</small></div><button class="btn btn-primary" id="gv-dl-start" ${preview ? 'disabled' : ''}>${preview ? 'PREVIEW ONLY' : 'FREE DOWNLOAD ↓'}</button><small id="gv-dl-status" role="status"></small></div></div></section>
  <section class="panel gv-dl-section"><h2>DOWNLOAD INFORMATION</h2><p>${esc(item.description || item.shortDescription || 'No description provided.')}</p><div class="gv-dl-facts"><div class="gv-dl-fact"><b>File type</b><span>${esc(item.fileType)}</span></div><div class="gv-dl-fact"><b>File size</b><span>${fmtBytes(item.sizeBytes)}</span></div><div class="gv-dl-fact"><b>Version</b><span>${esc(item.version || 'Not specified')}</span></div><div class="gv-dl-fact"><b>Release date</b><span>${esc(item.releaseDate || 'Not specified')}</span></div><div class="gv-dl-fact"><b>Last updated</b><span>${esc(item.lastUpdatedDate || 'Not specified')}</span></div>${item.developer?`<div class="gv-dl-fact"><b>Developer / publisher</b><span>${esc(item.developer)}</span></div>`:''}</div>${devices?`<h3>SUPPORTED DEVICES</h3><div class="chips">${devices}</div>`:''}${reqRows?`<h3>SYSTEM REQUIREMENTS</h3><div class="gv-dl-facts">${reqRows}</div>`:''}${item.installInstructions?`<h3>INSTALLATION INSTRUCTIONS</h3><div class="gv-dl-prose">${esc(item.installInstructions)}</div>`:''}${item.notices?`<h3>IMPORTANT NOTICES</h3><div class="notice">${esc(item.notices)}</div>`:''}</section>
  <section class="panel gv-dl-section"><h2>DOWNLOAD RATING</h2><div class="gv-dl-rating"><div><strong>${r.count?r.average.toFixed(1):'—'}</strong><span>/ 5</span><div class="gv-dl-stars">${'★'.repeat(Math.round(r.average))}${'☆'.repeat(5-Math.round(r.average))}</div><small>${fmtNum(r.count)} rating${r.count===1?'':'s'}</small></div><div class="gv-dl-dist">${dist}</div></div><div class="gv-dl-rate-action"><label for="gv-dl-stars">${r.mine?`Your rating: ${r.mine} / 5`:'Rate this download'}</label><div id="gv-dl-stars" class="gv-dl-star-pick">${[1,2,3,4,5].map(n=>`<button type="button" data-rating="${n}" aria-label="${n} stars" class="${r.mine>=n?'on':''}">★</button>`).join('')}</div><button class="btn btn-primary btn-small" id="gv-dl-rate-submit" disabled>${r.mine?'UPDATE RATING':'SUBMIT RATING'}</button><span id="gv-dl-rate-msg" role="status"></span></div></section>
${item.feedbackEnabled ? `<section class="panel gv-dl-section"><h2>DOWNLOAD FEEDBACK</h2><p class="section-sub">Report broken links, installation or compatibility issues, or send general feedback.</p><form id="gv-dl-feedback" class="form-grid"><div class="form-row full"><label for="gv-dlf-cat">Feedback type</label><select class="field" id="gv-dlf-cat" name="category"><option>General feedback</option><option>Broken download link</option><option>Installation problem</option><option>Compatibility problem</option></select></div><div class="form-row full"><label for="gv-dlf-msg">Message</label><textarea class="field" id="gv-dlf-msg" name="message" maxlength="1000" required></textarea></div><input class="hp" name="website" tabindex="-1" autocomplete="off"><div class="form-row full"><button class="btn btn-primary" id="gv-dlf-send">SEND FEEDBACK</button><span id="gv-dlf-status" role="status"></span></div></form></section>` : ``}</main>${footer()}`;
  let selected = r.mine || 0;
  const pick = $('#gv-dl-stars');
  pick.onclick = e => { const b=e.target.closest('[data-rating]'); if(!b)return; selected=Number(b.dataset.rating); pick.querySelectorAll('button').forEach(x=>x.classList.toggle('on',Number(x.dataset.rating)<=selected)); $('#gv-dl-rate-submit').disabled=false; };
  $('#gv-dl-rate-submit').onclick = async e => { if(!selected)return; const btn=e.currentTarget; setBusy(btn,true,'SENDING…'); try { await api(`/v1/downloads/${encodeURIComponent(id)}/rate`,{method:'POST',body:{stars:selected}}); toast('Download rating saved.','success'); await renderDownloadDetails(id); } catch(err){toast(err.message,'error');setBusy(btn,false);} };
  $('#gv-dl-feedback')?.addEventListener('submit', async e => { e.preventDefault(); const fd=new FormData(e.currentTarget); const btn=$('#gv-dlf-send'); setBusy(btn,true,'SENDING…'); try { await api(`/v1/downloads/${encodeURIComponent(id)}/feedback`,{method:'POST',body:{category:fd.get('category'),message:fd.get('message'),website:fd.get('website')}}); $('#gv-dlf-status').textContent='Thank you. Your feedback was sent to the GameVerse team.'; e.currentTarget.reset(); } catch(err){ $('#gv-dlf-status').textContent=err.message; } finally{setBusy(btn,false);} });
  if (!preview) $('#gv-dl-start').onclick = async e => { const b=e.currentTarget, status=$('#gv-dl-status'); setBusy(b,true,'PREPARING…'); status.textContent='Preparing your free download…'; try { const t=await api(`/v1/downloads/${encodeURIComponent(id)}/ticket`,{method:'POST'}); const a=document.createElement('a'); a.href=t.url; a.rel='noopener'; a.download=''; document.body.appendChild(a); a.click(); a.remove(); status.textContent='Download link requested. Your browser or external host will handle the file.'; toast('Download link opened.','success'); } catch(err){ if(err.code==='access_required'){stashReturn();navigate('#unlock');} else {status.textContent=err.message;toast(err.message,'error');} } finally{setBusy(b,false);} };
}


/* ============================ tasks, unlock and rewarded ads ============================ */
const resetText = t => (t.resetsAt ? `Resets in ${fmtDuration(t.resetsAt - serverNow())}` : 'Stays completed');
function taskCard(t, minSeconds) {
  const wait = t.openedAt ? Math.max(0, t.openedAt + minSeconds - serverNow()) : null;
  let action;
  if (t.completed) action = `<span class="task-done">${ICON.check} COMPLETED</span>`;
  else if (t.openedAt && wait > 0) action = `<button class="btn btn-small" disabled data-wait="${t.id}">CONFIRM IN ${wait}s</button>`;
  else if (t.openedAt) action = `<button class="btn btn-primary btn-small" data-confirm="${t.id}">I’VE DONE THIS ✓</button>`;
  else action = `<button class="btn btn-primary btn-small" data-open="${t.id}">OPEN ↗</button>`;
  return `<div class="task-card ${t.completed ? 'done' : ''}" data-task="${t.id}"><div class="task-ico">${kindIcon(t.kind)}</div><div class="task-main"><div class="task-title">${esc(t.title)}${t.reward === 'access' ? '<span class="tag-mini">REQUIRED</span>' : '<span class="tag-mini mute">OPTIONAL</span>'}</div><div class="task-desc">${esc(t.description || '')}</div><div class="task-sub"><span class="verif" title="GAMEVERSE cannot check YouTube or Discord activity automatically. You confirm this task yourself.">SELF-CONFIRMED</span>${t.completed ? `<span>${resetText(t)}</span>` : (t.openedAt && wait > 0 ? '<span>Finish the task, then confirm.</span>' : '')}</div></div><div class="task-act">${action}</div></div>`;
}
function adsCardHTML(me) {
  const f = state.cfg?.features; if (!f?.rewardedAds) return '';
  const a = me.ads;
  if (!a.available) return `<div class="ads-card disabled"><div class="ads-ico">${ICON.play}</div><div class="ads-main"><strong>Unlock for ${a.unlockMinutes} minutes with rewarded ads</strong><small>Rewarded ads aren’t available right now. Please use the tasks above.</small></div><button class="btn btn-small" disabled>UNAVAILABLE</button></div>`;
  const s = a.session;
  return `<div class="ads-card"><div class="ads-ico">${ICON.play}</div><div class="ads-main"><strong>Or watch ${a.adsRequired} ad${a.adsRequired > 1 ? 's' : ''} → ${a.unlockMinutes} minutes of access</strong><small id="ads-status">${s ? `${s.completed} of ${s.required} ads verified.` : 'Each ad counts only after the ad network confirms it was fully watched.'}</small><div class="progress ads-prog"><span id="ads-bar" style="width:${s ? s.completed / s.required * 100 : 0}%"></span></div></div><button class="btn btn-primary btn-small" id="ads-btn">${s && s.completed ? 'WATCH NEXT AD' : 'WATCH AD'}</button></div>`;
}
export async function renderAccessPage(mode) {
  const gate = mode === 'gate';
  if (state.apiStatus === 'idle' || state.apiStatus === 'loading') await loadConfig();
  const shell = inner => { app().innerHTML = gate ? `<section class="unlock-wrap"><div class="unlock-card wide">${inner}</div></section>` : `${header()}<main class="page-shell container"><div class="page-head"><div class="eyebrow">COMMUNITY MISSIONS</div><h1 class="page-title">TASKS</h1></div><div class="tasks-wrap">${inner}</div></main>${footer()}`; };
  const brand = `<div class="unlock-brand"><div class="logo"><span class="logo-icon">G</span> GAMEVERSE</div><h1>UNLOCK YOUR <span style="color:var(--red)">WORLD.</span></h1><p>Complete the community missions to enter GAMEVERSE.<br>Thanks for supporting the community.</p></div>`;
  if (state.apiStatus !== 'ok') {
    shell(`${gate ? brand : ''}<div class="empty state-box"><h3>Tasks are unavailable</h3><p>${apiConfigured() ? 'The server didn’t respond.' : 'The GameVerse server isn’t connected yet.'}</p>${gate ? '<a class="btn btn-primary" href="#home">CONTINUE TO GAMEVERSE →</a>' : '<button class="btn btn-small" id="t-retry">TRY AGAIN</button>'}</div>`);
    $('#t-retry') && ($('#t-retry').onclick = () => renderAccessPage(mode));
    return;
  }
  shell('<div class="empty"><span class="gv-spin big"></span><p style="margin-top:12px">Loading your progress…</p></div>');
  let me = await loadMe();
  if (!me) { shell(`${gate ? brand : ''}<div class="empty state-box"><h3>Couldn’t load tasks</h3><p>Please try again.</p><button class="btn btn-small" id="t-retry">TRY AGAIN</button>${gate ? '<a class="btn btn-ghost btn-small" href="#home">SKIP</a>' : ''}</div>`); $('#t-retry').onclick = () => renderAccessPage(mode); return; }
  if (gate && (!me.access.gateActive || me.access.granted)) { navigate(takeReturn()); return; }

  const paint = () => {
    me = state.me; const T = me.tasks, A = me.access;
    const required = T.items.filter(t => t.reward === 'access'), shown = required.length || !gate ? T.items : [];
    const total = required.length || T.items.length, done = required.length ? T.requiredCompleted : T.completed;
    const hours = state.cfg.tasks.accessHours;
    const list = !T.enabled ? '<div class="empty">The task system is currently switched off.</div>' : shown.length ? `<div class="task-list2">${shown.map(t => taskCard(t, T.minSeconds)).join('')}</div>` : '<div class="empty">No tasks are available right now.</div>';
    shell(`${gate ? brand : ''}${list}${T.enabled && total ? `<div class="task-progress"><div class="tp-top"><strong>${done} of ${total} ${required.length ? 'required ' : ''}task${total > 1 ? 's' : ''} done</strong><span>${Math.round(done / total * 100)}%</span></div><div class="progress"><span style="width:${done / total * 100}%"></span></div></div>` : ''}${gate ? `<button class="btn btn-primary unlock-main" id="claim-btn" ${A.canClaimWithTasks ? '' : 'disabled'}>UNLOCK GAMEVERSE FOR ${hours >= 24 && hours % 24 === 0 ? hours / 24 + ' DAY' + (hours > 24 ? 'S' : '') : hours + ' HOUR' + (hours > 1 ? 'S' : '')} →</button>` : A.granted && A.gateActive ? `<div class="access-note ok">${ICON.clock} Access active — ${fmtDuration(A.expiresAt - serverNow())} remaining (${A.source === 'ads' ? 'rewarded ads' : 'tasks'}).</div>` : ''}${adsCardHTML(me)}<p class="muted-note ${gate ? '' : 'left'}">Tasks are <b>self-confirmed</b>: GAMEVERSE can’t automatically check YouTube or Discord activity, so a task counts when you tell us you did it. Your progress is stored on the GAMEVERSE server for this browser.</p>${gate ? '<p class="muted-note"><a href="#privacy">Privacy</a> · <a href="#terms">Terms</a></p>' : ''}`);
    wire();
  };
  const refresh = async () => { await loadMe(); if ($('.task-list2, .empty, .unlock-card, .tasks-wrap')) paint(); };
  const wire = () => {
    const root = app();
    root.onclick = async e => {
      const o = e.target.closest('[data-open]'), c = e.target.closest('[data-confirm]');
      if (o) {
        const t = me.tasks.items.find(x => x.id === o.dataset.open);
        window.open(t.url, '_blank', 'noopener,noreferrer');
        try { await api(`/v1/tasks/${encodeURIComponent(t.id)}/open`, { method: 'POST' }); t.openedAt = serverNow(); paint(); }
        catch (err) { toast(err.message, 'error'); }
      } else if (c) {
        setBusy(c, true, 'SAVING…');
        try { await api(`/v1/tasks/${encodeURIComponent(c.dataset.confirm)}/complete`, { method: 'POST' }); toast('Task completed!', 'success'); await refresh(); }
        catch (err) { setBusy(c, false); toast(err.message, 'error'); if (err.code === 'not_opened') { const t = me.tasks.items.find(x => x.id === c.dataset.confirm); if (t) t.openedAt = null; paint(); } }
      } else if (e.target.closest('#claim-btn')) {
        const b = $('#claim-btn'); setBusy(b, true, 'UNLOCKING…');
        try { state.me = await api('/v1/access/claim', { method: 'POST' }); toast('Unlocked — enjoy GAMEVERSE!', 'success'); navigate(takeReturn()); }
        catch (err) { setBusy(b, false); toast(err.message, 'error'); await refresh(); }
      } else if (e.target.closest('#ads-btn')) watchAd();
    };
    // keep the confirm countdown and the "resets in" labels live
    pageInterval(() => {
      let flip = false;
      $$('[data-wait]').forEach(b => { const t = me.tasks.items.find(x => x.id === b.dataset.wait); const w = t?.openedAt ? t.openedAt + me.tasks.minSeconds - serverNow() : 0; if (w > 0) b.textContent = `CONFIRM IN ${w}s`; else flip = true; });
      if (flip) paint();
    }, 1000);
  };
  const watchAd = async () => {
    const btn = $('#ads-btn'); setBusy(btn, true, 'OPENING…');
    const win = window.open('', '_blank'); // opened synchronously so popup blockers allow it
    try {
      const s = await api('/v1/ads/session', { method: 'POST' });
      if (win) win.location.href = s.launchUrl; else toast('Please allow pop-ups to watch the ad.', 'error');
      $('#ads-status').textContent = `Waiting for the ad network to confirm… (${s.completed} of ${s.required} verified)`;
      const poll = async () => {
        try {
          const st = await api(`/v1/ads/session/${encodeURIComponent(s.sid)}`, { timeout: 8000 });
          $('#ads-bar') && ($('#ads-bar').style.width = st.completed / st.required * 100 + '%');
          if ($('#ads-status')) $('#ads-status').textContent = `${st.completed} of ${st.required} ads verified.`;
          if (st.status === 'granted') { await loadMe(); toast('Ads verified — access unlocked!', 'success'); if (gate) navigate(takeReturn()); else paint(); return true; }
          if (st.status === 'expired') { toast('The ad session expired. Please start again.', 'info'); paint(); return true; }
        } catch { /* keep polling */ }
        return false;
      };
      setBusy(btn, false);
      const id = pageInterval(async () => { if (await poll()) clearInterval(id); }, 3000);
    } catch (err) { win?.close(); setBusy(btn, false); toast(err.message, 'error'); }
  };
  paint();
}
export { ApiError };
