// Integration tests: the real Worker code against real SQL (node:sqlite), external-download flow and signed JWTs.
// Run:  node --experimental-sqlite test/api.test.mjs   (Node 22+)
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { makeD1, makeAuth } from './shims.js';
import { hmacHex, dayKey, nowSec } from '../src/util.js';
import { resetConfigCache } from '../src/config.js';
import { resetStatsMemo } from '../src/public.js';

const ORIGIN = 'https://site.test';
const env = {
  DB: makeD1(), FIREBASE_PROJECT_ID: 'gv-test', ADMIN_EMAIL: 'admin@example.com',
  ALLOWED_ORIGINS: ORIGIN, STATS_TIMEZONE: 'Asia/Kolkata', TOKEN_SECRET: 'unit-test-secret',
  ADS_POSTBACK_SECRET: 'ad-secret', STATS_CACHE_SECONDS: 0, CONFIG_CACHE_SECONDS: 0, MAX_UPLOAD_MB: 64
};
const signToken = await makeAuth('gv-test');
const ADMIN = await signToken();
let ipN = 0, vN = 0;
const newVid = () => 'visitor-' + String(++vN).padStart(12, '0') + 'abcd';
const sql = (q, ...a) => env.DB.raw.prepare(q).all(...a);

async function call(method, path, { vid, body, token, ip, origin = ORIGIN, headers = {}, raw, ua } = {}) {
  const h = { Origin: origin, 'CF-Connecting-IP': ip || `10.0.${Math.floor(++ipN / 250)}.${ipN % 250}`, 'User-Agent': ua || 'Mozilla/5.0 (X11) Chrome/120', ...headers };
  if (vid) h['X-GV-Visitor'] = vid;
  if (token) h.Authorization = 'Bearer ' + token;
  let payload;
  if (raw !== undefined) payload = raw; else if (body !== undefined) { payload = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
  const res = await worker.fetch(new Request('https://api.test' + path, { method, headers: h, body: payload }), env, {});
  let json = null;
  if ((res.headers.get('Content-Type') || '').includes('json')) json = await res.json();
  return { status: res.status, json, res };
}
const admin = (m, p, body, extra) => call(m, p, { token: ADMIN, body, ...extra });
const setCfg = async patch => { const r = await admin('PUT', '/v1/admin/config', patch); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json.config; };

let pass = 0; const failures = [];
async function test(name, fn) {
  try { resetStatsMemo(); resetConfigCache(); await fn(); pass++; console.log('  ✓', name); }
  catch (e) { failures.push([name, e]); console.log('  ✗', name, '\n     ', (e && e.message || e).toString().split('\n').slice(0, 4).join('\n      ')); }
}
const group = n => console.log('\n' + n);

group('Admin authentication');
await test('admin routes reject missing / malformed tokens', async () => {
  assert.equal((await call('GET', '/v1/admin/overview')).status, 401);
  assert.equal((await call('GET', '/v1/admin/overview', { token: 'not.a.jwt' })).status, 401);
});
await test('rejects wrong e-mail, unverified e-mail, wrong audience, expired, tampered, wrong alg', async () => {
  for (const [label, tok] of [
    ['wrong email', await signToken({ email: 'evil@example.com' })],
    ['unverified', await signToken({ email_verified: false })],
    ['wrong aud', await signToken({ aud: 'other-project' })],
    ['wrong iss', await signToken({ iss: 'https://securetoken.google.com/other' })],
    ['expired', await signToken({ exp: nowSec() - 10 })],
    ['tampered', await signToken({}, { badSig: true })],
    ['unknown kid', await signToken({}, { kid: 'nope' })],
    ['alg none', await signToken({}, { alg: 'none' })]
  ]) assert.equal((await call('GET', '/v1/admin/overview', { token: tok })).status, 401, label);
});
await test('accepts the verified administrator', async () => {
  const r = await admin('GET', '/v1/admin/overview');
  assert.equal(r.status, 200);
  assert.equal(r.json.status.externalDownloadsOnly, true);
});

group('Config + feature switches');
await test('public config exposes only safe fields', async () => {
  const r = await call('GET', '/v1/config');
  assert.equal(r.status, 200);
  assert.equal(r.json.features.ratings, true);
  assert.equal(r.json.ads.available, false);
  assert.equal(JSON.stringify(r.json).includes('launchUrl'), false);
});
await test('config PUT validates and persists', async () => {
  const bad1 = await admin('PUT', '/v1/admin/config', { ads: { launchUrl: 'http://insecure.example/{sid}' } });
  assert.equal(bad1.status, 400);
  const bad2 = await admin('PUT', '/v1/admin/config', { ads: { launchUrl: 'https://ok.example/no-placeholder' } });
  assert.equal(bad2.status, 400);
  const cfg = await setCfg({ tasks: { resetMode: 'weekly', minSeconds: 999 }, feedback: { maxLength: 5 } });
  assert.equal(cfg.tasks.resetMode, 'weekly'); assert.equal(cfg.tasks.minSeconds, 300); assert.equal(cfg.feedback.maxLength, 100);
  assert.equal((await call('GET', '/v1/config')).json.tasks.resetMode, 'weekly');
  await setCfg({ tasks: { resetMode: 'daily', minSeconds: 0 }, feedback: { maxLength: 1000 } });
});
await test('public cannot change config', async () => {
  assert.equal((await call('PUT', '/v1/admin/config', { body: { features: { ratings: false } } })).status, 401);
});

group('Visitor statistics + online tracking');
await test('unique visitors counted once; refreshes do not inflate', async () => {
  const a = newVid(), b = newVid();
  const before = (await call('GET', '/v1/stats')).json;
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/v1/ping', { vid: a })).status, 200);
  let s = (await call('GET', '/v1/stats')).json;
  assert.equal(s.totalVisitors, before.totalVisitors + 1); assert.equal(s.todayVisitors, before.todayVisitors + 1);
  await call('POST', '/v1/ping', { vid: b });
  s = (await call('GET', '/v1/stats')).json;
  assert.equal(s.totalVisitors, before.totalVisitors + 2);
  assert.equal(sql('SELECT visitors FROM daily_counts WHERE day=?', dayKey('Asia/Kolkata'))[0].visitors, s.todayVisitors);
});
await test('online = distinct active visitors; expires after the window', async () => {
  const a = newVid(), b = newVid();
  sql('DELETE FROM online');
  await call('POST', '/v1/ping', { vid: a }); await call('POST', '/v1/ping', { vid: a }); await call('POST', '/v1/ping', { vid: b });
  assert.equal((await call('GET', '/v1/stats')).json.online, 2);
  env.DB.raw.prepare('UPDATE online SET last_seen=? WHERE vid=?').run(nowSec() - 300, a);
  assert.equal((await call('GET', '/v1/stats')).json.online, 1);
});
await test('yesterday visitors are not "today" (new day row)', async () => {
  const v = newVid(); await call('POST', '/v1/ping', { vid: v });
  const before = (await call('GET', '/v1/stats')).json;
  env.DB.raw.prepare("UPDATE visitor_days SET day='2000-01-01' WHERE vid=?").run(v);
  env.DB.raw.prepare("UPDATE daily_counts SET visitors=visitors-1 WHERE day=?").run(dayKey('Asia/Kolkata'));
  await call('POST', '/v1/ping', { vid: v });
  const after = (await call('GET', '/v1/stats')).json;
  assert.equal(after.totalVisitors, before.totalVisitors); assert.equal(after.todayVisitors, before.todayVisitors);
});
await test('admin session, bots and bad ids are not counted', async () => {
  const before = (await call('GET', '/v1/stats')).json;
  const r = await call('POST', '/v1/ping', { vid: newVid(), token: ADMIN }); assert.equal(r.json.excluded, true);
  await call('POST', '/v1/ping', { vid: newVid(), ua: 'Googlebot/2.1' });
  assert.equal((await call('POST', '/v1/ping', { vid: 'short' })).status, 400);
  assert.equal((await call('POST', '/v1/ping')).status, 400);
  const after = (await call('GET', '/v1/stats')).json;
  assert.equal(after.totalVisitors, before.totalVisitors); assert.equal(after.online, before.online);
});
await test('visitor / online switches really turn tracking off', async () => {
  await setCfg({ features: { visitorStats: false } });
  const v = newVid(), before = sql('SELECT COUNT(*) n FROM visitors')[0].n;
  await call('POST', '/v1/ping', { vid: v });
  assert.equal(sql('SELECT COUNT(*) n FROM visitors')[0].n, before);
  assert.equal((await call('GET', '/v1/stats')).json.totalVisitors, null);
  await setCfg({ features: { visitorStats: true, onlineTracking: false } });
  const o = sql('SELECT COUNT(*) n FROM online')[0].n;
  await call('POST', '/v1/ping', { vid: newVid() });
  assert.equal(sql('SELECT COUNT(*) n FROM online')[0].n, o);
  assert.equal((await call('GET', '/v1/stats')).json.online, null);
  await setCfg({ features: { onlineTracking: true } });
});

group('Game analytics');
await test('views and Play Now clicks counted separately, duplicates ignored', async () => {
  const v = newVid(), id = 'gta-v';
  assert.equal((await call('POST', `/v1/games/${id}/view`, { vid: v })).json.tracked, true);
  assert.equal((await call('POST', `/v1/games/${id}/view`, { vid: v })).json.tracked, false);
  assert.equal((await call('POST', `/v1/games/${id}/play`, { vid: v })).json.tracked, true);
  assert.equal((await call('POST', `/v1/games/${id}/play`, { vid: v })).json.reason, 'duplicate');
  const info = (await call('GET', `/v1/games/${id}`, { vid: v })).json;
  assert.equal(info.views, 1); assert.equal(info.plays, 1);
  env.DB.raw.prepare("UPDATE event_dedupe SET ts=ts-100 WHERE k LIKE 'play:%'").run();
  assert.equal((await call('POST', `/v1/games/${id}/play`, { vid: v })).json.tracked, true);
  assert.equal((await call('GET', `/v1/games/${id}`)).json.plays, 2);
});
await test('rejects invalid game ids; caps tracked games', async () => {
  assert.equal((await call('POST', '/v1/games/bad%20id!/view', { vid: newVid() })).status, 400);
});
await test('analytics switch off → nothing recorded and values hidden', async () => {
  await setCfg({ features: { gameAnalytics: false } });
  const r = await call('POST', '/v1/games/hidden-game/view', { vid: newVid() });
  assert.equal(r.json.tracked, false);
  assert.equal(sql("SELECT COUNT(*) n FROM game_stats WHERE game_id='hidden-game'")[0].n, 0);
  assert.equal((await call('GET', '/v1/games/gta-v')).json.plays, null);
  await setCfg({ features: { gameAnalytics: true } });
});
await test('admin and bots do not inflate game counters', async () => {
  const before = (await call('GET', '/v1/games/gta-v')).json.views;
  await call('POST', '/v1/games/gta-v/view', { vid: newVid(), token: ADMIN });
  await call('POST', '/v1/games/gta-v/view', { vid: newVid(), ua: 'bingbot' });
  assert.equal((await call('GET', '/v1/games/gta-v')).json.views, before);
});

group('Star ratings');
await test('submit, aggregate, distribution and "mine"', async () => {
  const id = 'rate-test';
  const [a, b, c] = [newVid(), newVid(), newVid()];
  let r = await call('POST', `/v1/games/${id}/rate`, { vid: a, body: { stars: 5 } });
  assert.equal(r.status, 200); assert.equal(r.json.rating.count, 1); assert.equal(r.json.rating.average, 5);
  await call('POST', `/v1/games/${id}/rate`, { vid: b, body: { stars: 4 } });
  r = await call('POST', `/v1/games/${id}/rate`, { vid: c, body: { stars: 4 } });
  assert.deepEqual(r.json.rating.distribution, { 5: 1, 4: 2, 3: 0, 2: 0, 1: 0 });
  assert.equal(r.json.rating.average, 4.33);
  const info = (await call('GET', `/v1/games/${id}`, { vid: b })).json;
  assert.equal(info.mine, 4); assert.equal(info.rating.count, 3);
  assert.equal((await call('GET', `/v1/games/${id}`)).json.mine, null);
});
await test('same visitor cannot add a second rating; changing a rating moves the bar', async () => {
  const id = 'rate-dup', v = newVid();
  await call('POST', `/v1/games/${id}/rate`, { vid: v, body: { stars: 2 } });
  let r = await call('POST', `/v1/games/${id}/rate`, { vid: v, body: { stars: 2 } });
  assert.equal(r.json.changed, false); assert.equal(r.json.rating.count, 1);
  r = await call('POST', `/v1/games/${id}/rate`, { vid: v, body: { stars: 5 } });
  assert.equal(r.json.updated, true); assert.equal(r.json.rating.count, 1);
  assert.deepEqual(r.json.rating.distribution, { 5: 1, 4: 0, 3: 0, 2: 0, 1: 0 }); assert.equal(r.json.rating.average, 5);
  assert.equal(sql('SELECT COUNT(*) n FROM ratings WHERE game_id=?', id)[0].n, 1);
});
await test('validates stars; ratings switch blocks submissions; limits abuse', async () => {
  const v = newVid();
  for (const s of [0, 6, 2.5, 'x', null]) assert.equal((await call('POST', '/v1/games/rate-bad/rate', { vid: v, body: { stars: s } })).status, 400);
  assert.equal((await call('POST', '/v1/games/rate-bad/rate', { body: { stars: 3 } })).status, 400);
  await setCfg({ features: { ratings: false } });
  assert.equal((await call('POST', '/v1/games/rate-bad/rate', { vid: v, body: { stars: 3 } })).status, 403);
  assert.equal((await call('GET', '/v1/games/rate-test')).json.rating, null);
  await setCfg({ features: { ratings: true } });
  const ip = '203.0.113.9'; let last;
  for (let i = 0; i < 17; i++) last = await call('POST', `/v1/games/spam-${i}/rate`, { vid: newVid(), ip, body: { stars: 5 } });
  assert.equal(last.status, 429);
});

group('Feedback');
await test('visitor submits; invalid input rejected; honeypot + duplicates not stored', async () => {
  const v = newVid();
  const ok = await call('POST', '/v1/feedback', { vid: v, body: { category: 'Bug report', message: 'The play button on GTA V does not respond.', gameId: 'gta-v' } });
  assert.equal(ok.status, 200);
  assert.equal((await call('POST', '/v1/feedback', { vid: newVid(), body: { category: 'Nope', message: 'hello there friend' } })).status, 400);
  assert.equal((await call('POST', '/v1/feedback', { vid: newVid(), body: { category: 'Other', message: 'hi' } })).status, 400);
  assert.equal((await call('POST', '/v1/feedback', { vid: newVid(), body: { category: 'Other', message: 'x'.repeat(1001) } })).status, 400);
  const n = sql('SELECT COUNT(*) n FROM feedback')[0].n;
  await call('POST', '/v1/feedback', { vid: newVid(), body: { category: 'Other', message: 'spam bot message here', website: 'http://spam' } });
  await call('POST', '/v1/feedback', { vid: v, body: { category: 'Bug report', message: 'The play button on GTA V does not respond.', gameId: 'gta-v' } });
  assert.equal(sql('SELECT COUNT(*) n FROM feedback')[0].n, n);
});
await test('feedback is rate limited per visitor', async () => {
  const v = newVid(); let last;
  for (let i = 0; i < 6; i++) last = await call('POST', '/v1/feedback', { vid: v, body: { category: 'Other', message: 'unique message number ' + i + ' abc' } });
  assert.equal(last.status, 429);
});
await test('feedback switch off blocks submissions', async () => {
  await setCfg({ features: { feedback: false } });
  assert.equal((await call('POST', '/v1/feedback', { vid: newVid(), body: { category: 'Other', message: 'should be blocked now' } })).status, 403);
  await setCfg({ features: { feedback: true } });
});
await test('admin lists, filters, reads, reviews, bulk-actions and deletes feedback; public cannot', async () => {
  assert.equal((await call('GET', '/v1/admin/feedback')).status, 401);
  for (const [cat, msg, g] of [['Suggestion', 'Please add more racing games to the list', null], ['Broken game link', 'Vice City link opens a blank page', 'vice-city']])
    await call('POST', '/v1/feedback', { vid: newVid(), body: { category: cat, message: msg, gameId: g } });
  let r = await admin('GET', '/v1/admin/feedback');
  assert.ok(r.json.total >= 3); assert.ok(r.json.newCount >= 3);
  r = await admin('GET', '/v1/admin/feedback?category=Suggestion'); assert.ok(r.json.items.every(i => i.category === 'Suggestion') && r.json.items.length === 1);
  r = await admin('GET', '/v1/admin/feedback?q=blank'); assert.equal(r.json.items.length, 1);
  r = await admin('GET', '/v1/admin/feedback?gameId=vice-city'); assert.equal(r.json.items.length, 1);
  const id = r.json.items[0].id;
  assert.equal((await admin('GET', `/v1/admin/feedback/${id}`)).json.item.message, 'Vice City link opens a blank page');
  assert.equal((await admin('PUT', `/v1/admin/feedback/${id}`, { status: 'reviewed' })).json.item.status, 'reviewed');
  assert.equal((await admin('GET', '/v1/admin/feedback?status=reviewed')).json.items.length, 1);
  const all = (await admin('GET', '/v1/admin/feedback?limit=100')).json.items.map(i => i.id);
  await admin('POST', '/v1/admin/feedback/bulk', { ids: all, action: 'reviewed' });
  assert.equal((await admin('GET', '/v1/admin/feedback')).json.newCount, 0);
  assert.equal((await admin('DELETE', `/v1/admin/feedback/${id}`)).status, 200);
  assert.equal((await admin('GET', `/v1/admin/feedback/${id}`)).status, 404);
  await admin('POST', '/v1/admin/feedback/bulk', { ids: all, action: 'delete' });
  assert.equal((await admin('GET', '/v1/admin/feedback')).json.total, 0);
});

group('Download manager (external HTTPS only)');
let dlId;
await test('R2 upload endpoints are not available; external download can be created', async () => {
  assert.equal((await admin('POST', '/v1/admin/uploads', { filename: 'test.apk', size: 12 })).status, 404);
  assert.equal((await admin('PUT', '/v1/admin/cover')).status, 404);
  assert.equal((await admin('POST', '/v1/admin/downloads', { title: 'a', fileType: 'ZIP', externalUrl: 'javascript:alert(1)' })).status, 400);
  assert.equal((await admin('POST', '/v1/admin/downloads', { title: 'a', fileType: 'ZIP', externalUrl: 'http://insecure.example/a.zip' })).status, 400);
  const created = await admin('POST', '/v1/admin/downloads', { title: 'My Game', description: 'Free APK', fileType: 'APK', version: '1.0.2', externalUrl: 'https://files.example.com/game.apk', coverUrl: 'https://images.example.com/game.webp', sizeBytes: 12345, published: true });
  assert.equal(created.status, 200, JSON.stringify(created.json)); dlId = created.json.item.id;
  assert.equal(created.json.item.storage, 'external');
  assert.equal(created.json.item.coverUrl, 'https://images.example.com/game.webp');
});
await test('public list hides storage details and unpublished items', async () => {
  const r = await call('GET', '/v1/downloads');
  assert.equal(r.json.enabled, true); const it = r.json.items.find(i => i.id === dlId);
  assert.ok(it); assert.equal(it.fileType, 'APK'); assert.equal(it.coverUrl, 'https://images.example.com/game.webp');
  assert.equal('fileKey' in it, false);
  await admin('PUT', `/v1/admin/downloads/${dlId}`, { published: false });
  assert.equal((await call('GET', '/v1/downloads')).json.items.some(i => i.id === dlId), false);
  assert.equal((await call('POST', `/v1/downloads/${dlId}/ticket`, { vid: newVid() })).status, 404);
  await admin('PUT', `/v1/admin/downloads/${dlId}`, { published: true });
});
await test('ticketed download redirects to external file and counts once', async () => {
  assert.equal((await call('GET', `/v1/dl/${dlId}`)).status, 403);
  const t = (await call('POST', `/v1/downloads/${dlId}/ticket`, { vid: newVid() })).json;
  const url = new URL(t.url);
  const full = await call('GET', url.pathname + url.search);
  assert.equal(full.status, 302);
  assert.equal(full.res.headers.get('location'), 'https://files.example.com/game.apk');
  const count = () => sql('SELECT download_count n FROM downloads WHERE id=?', dlId)[0].n;
  assert.equal(count(), 1);
  await call('GET', url.pathname + url.search); assert.equal(count(), 1);
  const forged = `${url.pathname}?t=9999999999.deadbeef`;
  assert.equal((await call('GET', forged)).status, 403);
});
await test('external download can be edited and deleted without object storage', async () => {
  const up = await admin('PUT', `/v1/admin/downloads/${dlId}`, { title: 'My Game Renamed', version: '2.0', coverUrl: 'https://images.example.com/new.webp' });
  assert.equal(up.status, 200); assert.equal(up.json.item.title, 'My Game Renamed');
  assert.equal(up.json.item.coverUrl, 'https://images.example.com/new.webp');
  assert.equal((await admin('DELETE', `/v1/admin/downloads/${dlId}`)).status, 200);
  assert.equal((await admin('GET', '/v1/admin/downloads')).json.items.length, 0);
});
await test('download details, separate ratings, feedback moderation and click analytics', async () => {
  const created = await admin('POST', '/v1/admin/downloads', { title: 'Detailed Item', shortDescription: 'Card summary', description: 'Full details', fileType: 'ZIP', storage: 'external', externalUrl: 'https://files.example.com/detail.zip', sizeBytes: 2048, version: '2.1', developer: 'Test Studio', releaseDate: '2026-01-01', lastUpdatedDate: '2026-02-01', supportedDevices: ['Windows PC','Linux'], requirements: { operatingSystem: 'Windows 10', ram: '8 GB' }, installInstructions: 'Extract the archive.', notices: 'Free file.', published: true });
  assert.equal(created.status, 200, JSON.stringify(created.json)); const id = created.json.item.id;
  const detail = await call('GET', `/v1/downloads/${id}`, { vid: newVid() });
  assert.equal(detail.status, 200); assert.equal(detail.json.item.shortDescription, 'Card summary'); assert.deepEqual(detail.json.item.supportedDevices, ['Windows PC','Linux']); assert.equal(detail.json.item.requirements.ram, '8 GB');
  assert.equal((await call('POST', `/v1/downloads/${id}/rate`, { vid: newVid(), body: { stars: 5 } })).status, 200);
  const rated = await call('GET', `/v1/downloads/${id}`, { vid: newVid() }); assert.equal(rated.json.item.rating.count, 1); assert.equal(rated.json.item.rating.average, 5);
  assert.equal((await call('POST', `/v1/downloads/${id}/feedback`, { vid: newVid(), body: { category: 'Broken download link', message: 'The link is not opening.' } })).status, 200);
  const fb = await admin('GET', '/v1/admin/download-feedback'); assert.ok(fb.json.items.some(x => x.downloadId === id && x.category === 'Broken download link'));
  const f = fb.json.items.find(x => x.downloadId === id); assert.equal((await admin('PUT', `/v1/admin/download-feedback/${f.id}`, { status: 'reviewed' })).status, 200);
  const ticket = await call('POST', `/v1/downloads/${id}/ticket`, { vid: newVid() }); assert.equal(ticket.status, 200);
  const adminList = await admin('GET', '/v1/admin/downloads'); const row = adminList.json.items.find(x => x.id === id); assert.equal(row.downloadClicks, 1); assert.equal(row.ratingCount, 1);
  const preview = await admin('GET', `/v1/admin/downloads/${id}`); assert.equal(preview.status, 200); assert.equal(preview.json.item.title, 'Detailed Item'); assert.equal((await call('GET', `/v1/admin/downloads/${id}`)).status, 401);
  await admin('PUT', `/v1/admin/downloads/${id}`, { feedbackEnabled: false });
  assert.equal((await call('POST', `/v1/downloads/${id}/feedback`, { vid: newVid(), body: { category: 'General feedback', message: 'This feedback should be blocked.' } })).status, 403);
  await admin('DELETE', `/v1/admin/downloads/${id}`);
});
await test('download feature switch hides list and blocks tickets', async () => {
  const c = await admin('POST', '/v1/admin/downloads', { title: 'Sw', fileType: 'zip', storage: 'external', externalUrl: 'https://files.example.com/s.zip', published: true });
  await setCfg({ features: { downloads: false } });
  assert.equal((await call('GET', '/v1/downloads')).json.enabled, false);
  assert.equal((await call('POST', `/v1/downloads/${c.json.item.id}/ticket`, { vid: newVid() })).status, 403);
  await setCfg({ features: { downloads: true } });
  await admin('DELETE', `/v1/admin/downloads/${c.json.item.id}`);
});

group('Tasks, reset intervals and access');
const tasksOf = async v => (await call('GET', '/v1/me', { vid: v })).json;
await test('seeded tasks exist; admin can add, edit, reorder, disable and delete', async () => {
  let list = (await admin('GET', '/v1/admin/tasks')).json.tasks;
  assert.deepEqual(list.map(t => t.id), ['seed-youtube', 'seed-discord']);
  assert.equal((await admin('POST', '/v1/admin/tasks', { title: 'Bad', kind: 'discord', url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await admin('POST', '/v1/admin/tasks', { title: '', kind: 'custom' })).status, 400);
  list = (await admin('POST', '/v1/admin/tasks', { title: 'Watch our trailer', kind: 'youtube_watch', url: 'https://youtu.be/abc', description: 'Watch it', reward: 'access' })).json.tasks;
  assert.equal(list.length, 3);
  const mine = list.find(t => t.title === 'Watch our trailer');
  list = (await admin('PUT', `/v1/admin/tasks/${mine.id}`, { title: 'Watch the trailer', enabled: false, resetMode: 'custom', resetHours: 6 })).json.tasks;
  const edited = list.find(t => t.id === mine.id); assert.equal(edited.title, 'Watch the trailer'); assert.equal(edited.enabled, false); assert.equal(edited.resetHours, 6);
  assert.equal((await tasksOf(newVid())).tasks.items.length, 2);
  list = (await admin('PUT', '/v1/admin/tasks-order', { ids: [mine.id, 'seed-discord', 'seed-youtube'] })).json.tasks;
  assert.deepEqual(list.map(t => t.id), [mine.id, 'seed-discord', 'seed-youtube']);
  list = (await admin('DELETE', `/v1/admin/tasks/${mine.id}`)).json.tasks;
  assert.equal(list.length, 2);
  await admin('PUT', '/v1/admin/tasks-order', { ids: ['seed-youtube', 'seed-discord'] });
});
await test('completion needs the link to be opened and a minimum wait (self-confirmed, never "verified")', async () => {
  await setCfg({ tasks: { minSeconds: 30 } });
  const v = newVid();
  let r = await call('POST', '/v1/tasks/seed-youtube/complete', { vid: v }); assert.equal(r.status, 409); assert.equal(r.json.code, 'not_opened');
  await call('POST', '/v1/tasks/seed-youtube/open', { vid: v });
  r = await call('POST', '/v1/tasks/seed-youtube/complete', { vid: v }); assert.equal(r.status, 409); assert.equal(r.json.code, 'too_soon');
  env.DB.raw.prepare('UPDATE task_opens SET opened_at=opened_at-60 WHERE vid=?').run(v);
  r = await call('POST', '/v1/tasks/seed-youtube/complete', { vid: v });
  assert.equal(r.status, 200); assert.equal(r.json.verification, 'self');
  const me = await tasksOf(v);
  const t = me.tasks.items.find(x => x.id === 'seed-youtube');
  assert.equal(t.completed, true); assert.equal(t.verification, 'self'); assert.ok(t.resetsAt > me.serverNow);
  assert.equal(me.tasks.completed, 1); assert.equal(me.tasks.requiredTotal, 2);
  assert.equal((await call('POST', '/v1/tasks/seed-youtube/complete', { vid: v })).json.alreadyCompleted, true);
  assert.equal((await call('POST', '/v1/tasks/nope/open', { vid: v })).status, 404);
  await setCfg({ tasks: { minSeconds: 0 } });
});
const finishAll = async v => { for (const id of ['seed-youtube', 'seed-discord']) { await call('POST', `/v1/tasks/${id}/open`, { vid: v }); const r = await call('POST', `/v1/tasks/${id}/complete`, { vid: v }); assert.ok(r.status === 200, JSON.stringify(r.json)); } };
await test('persisted per visitor; access is granted only after ALL required tasks, then expires', async () => {
  const v = newVid();
  assert.equal((await call('POST', '/v1/access/claim', { vid: v })).status, 409);
  await call('POST', '/v1/tasks/seed-youtube/open', { vid: v }); await call('POST', '/v1/tasks/seed-youtube/complete', { vid: v });
  assert.equal((await call('POST', '/v1/access/claim', { vid: v })).status, 409);
  let me = await tasksOf(v); assert.equal(me.access.gateActive, true); assert.equal(me.access.granted, false); assert.equal(me.access.canClaimWithTasks, false);
  await call('POST', '/v1/tasks/seed-discord/open', { vid: v }); await call('POST', '/v1/tasks/seed-discord/complete', { vid: v });
  const claim = await call('POST', '/v1/access/claim', { vid: v });
  assert.equal(claim.status, 200); assert.equal(claim.json.access.granted, true); assert.equal(claim.json.access.source, 'tasks');
  assert.ok(Math.abs(claim.json.access.expiresAt - (nowSec() + 24 * 3600)) < 5);
  assert.equal((await tasksOf(newVid())).access.granted, false);
  env.DB.raw.prepare('UPDATE access_grants SET expires_at=? WHERE vid=?').run(nowSec() - 1, v);
  assert.equal((await tasksOf(v)).access.granted, false);
});
await test('daily reset (calendar day in the configured zone)', async () => {
  await setCfg({ tasks: { resetMode: 'daily' } });
  const v = newVid(); await finishAll(v); assert.equal((await tasksOf(v)).tasks.completed, 2);
  env.DB.raw.prepare('UPDATE task_completions SET completed_at=completed_at-172800 WHERE vid=?').run(v);
  assert.equal((await tasksOf(v)).tasks.completed, 0);
});
await test('weekly, custom-hour and never reset modes', async () => {
  const v = newVid(); await finishAll(v);
  await setCfg({ tasks: { resetMode: 'weekly' } });
  assert.equal((await tasksOf(v)).tasks.completed, 2);
  env.DB.raw.prepare('UPDATE task_completions SET completed_at=completed_at-9*86400 WHERE vid=?').run(v);
  assert.equal((await tasksOf(v)).tasks.completed, 0);
  await finishAll(v);
  await setCfg({ tasks: { resetMode: 'custom', resetHours: 3 } });
  assert.equal((await tasksOf(v)).tasks.completed, 2);
  env.DB.raw.prepare('UPDATE task_completions SET completed_at=completed_at-4*3600 WHERE vid=?').run(v);
  assert.equal((await tasksOf(v)).tasks.completed, 0);
  await setCfg({ tasks: { resetMode: 'never' } });
  env.DB.raw.prepare('UPDATE task_completions SET completed_at=1000 WHERE vid=?').run(v);
  assert.equal((await tasksOf(v)).tasks.completed, 2);
  await setCfg({ tasks: { resetMode: 'daily', resetHours: 24 } });
});
await test('per-task reset override beats the global interval', async () => {
  const v = newVid(); await finishAll(v);
  await admin('PUT', '/v1/admin/tasks/seed-discord', { resetMode: 'custom', resetHours: 1 });
  env.DB.raw.prepare('UPDATE task_completions SET completed_at=completed_at-7200 WHERE vid=?').run(v);
  const me = await tasksOf(v);
  assert.equal(me.tasks.items.find(t => t.id === 'seed-discord').completed, false);
  assert.equal(me.tasks.items.find(t => t.id === 'seed-youtube').completed, true);
  await admin('PUT', '/v1/admin/tasks/seed-discord', { resetMode: 'inherit' });
});
await test('"reward: none" tasks do not block access; tasks switch off disables everything', async () => {
  await admin('PUT', '/v1/admin/tasks/seed-discord', { reward: 'none' });
  const v = newVid(); await call('POST', '/v1/tasks/seed-youtube/open', { vid: v }); await call('POST', '/v1/tasks/seed-youtube/complete', { vid: v });
  assert.equal((await tasksOf(v)).access.canClaimWithTasks, true);
  await admin('PUT', '/v1/admin/tasks/seed-discord', { reward: 'access' });
  await setCfg({ features: { tasks: false } });
  const me = await tasksOf(v); assert.equal(me.tasks.enabled, false); assert.equal(me.tasks.items.length, 0); assert.equal(me.access.gateActive, false);
  assert.equal((await call('POST', '/v1/tasks/seed-youtube/open', { vid: v })).status, 403);
  await setCfg({ features: { tasks: true } });
});
await test('access scope: off → no gate; downloads → server-enforced on tickets', async () => {
  const ext = await admin('POST', '/v1/admin/downloads', { title: 'Gated', fileType: 'zip', storage: 'external', externalUrl: 'https://files.example.com/g.zip', published: true });
  const id = ext.json.item.id;
  await setCfg({ access: { scope: 'off' } });
  assert.equal((await tasksOf(newVid())).access.gateActive, false);
  await setCfg({ access: { scope: 'downloads' } });
  const v = newVid();
  const denied = await call('POST', `/v1/downloads/${id}/ticket`, { vid: v });
  assert.equal(denied.status, 403); assert.equal(denied.json.code, 'access_required');
  await finishAll(v); await call('POST', '/v1/access/claim', { vid: v });
  assert.equal((await call('POST', `/v1/downloads/${id}/ticket`, { vid: v })).status, 200);
  await setCfg({ access: { scope: 'site' } });
  assert.equal((await call('POST', `/v1/downloads/${id}/ticket`, { vid: newVid() })).status, 200);
  await admin('DELETE', `/v1/admin/downloads/${id}`);
});

group('Rewarded ads (server-side ledger — no real ad network is connected in tests)');
const adsig = (p) => hmacHex('ad-secret', `sid=${p.sid}&event_id=${p.event_id}&status=${p.status}&ts=${p.ts}`);
const postback = async (p, signed = true) => {
  const q = { ...p, ts: p.ts ?? nowSec() }; q.sig = signed ? await adsig(q) : 'bad';
  return call('GET', '/v1/ads/postback?' + new URLSearchParams(q), { origin: undefined, headers: { Origin: '' } });
};
await test('unavailable until a provider launch URL is configured; cannot start a session', async () => {
  await setCfg({ features: { rewardedAds: true } });
  assert.equal((await call('GET', '/v1/config')).json.ads.available, false);
  assert.equal((await call('POST', '/v1/ads/session', { vid: newVid() })).status, 503);
  assert.equal((await tasksOf(newVid())).ads.available, false);
});
await test('postback is signed, idempotent and only completed ads count; unlock after N ads', async () => {
  await setCfg({ features: { rewardedAds: true }, ads: { adsRequired: 2, unlockMinutes: 60, providerName: 'TestAds', launchUrl: 'https://ads.example/watch?user={sid}' } });
  const v = newVid();
  const s = (await call('POST', '/v1/ads/session', { vid: v })).json;
  assert.match(s.launchUrl, /^https:\/\/ads\.example\/watch\?user=ad/); assert.equal(s.required, 2);
  assert.equal((await call('POST', '/v1/ads/session', { vid: v })).json.sid, s.sid);
  assert.equal((await postback({ sid: s.sid, event_id: 'e1', status: 'completed' }, false)).status, 401);
  assert.equal((await postback({ sid: s.sid, event_id: 'e0', status: 'completed', ts: nowSec() - 5000 })).status, 400);
  assert.equal((await postback({ sid: 'adNOPE', event_id: 'e9', status: 'completed' })).status, 404);
  await postback({ sid: s.sid, event_id: 'f1', status: 'failed' }); await postback({ sid: s.sid, event_id: 'c1', status: 'cancelled' });
  let st = (await call('GET', `/v1/ads/session/${s.sid}`, { vid: v })).json; assert.equal(st.completed, 0); assert.equal(st.status, 'open');
  assert.equal((await call('GET', `/v1/ads/session/${s.sid}`, { vid: newVid() })).status, 404);
  assert.equal((await postback({ sid: s.sid, event_id: 'e1', status: 'completed' })).json.counted, true);
  assert.equal((await postback({ sid: s.sid, event_id: 'e1', status: 'completed' })).json.duplicate, true);
  st = (await call('GET', `/v1/ads/session/${s.sid}`, { vid: v })).json; assert.equal(st.completed, 1);
  assert.equal((await tasksOf(v)).access.granted, false);
  await postback({ sid: s.sid, event_id: 'e2', status: 'completed' });
  st = (await call('GET', `/v1/ads/session/${s.sid}`, { vid: v })).json; assert.equal(st.status, 'granted');
  const me = await tasksOf(v); assert.equal(me.access.granted, true); assert.equal(me.access.source, 'ads');
  assert.ok(Math.abs(me.access.expiresAt - (nowSec() + 3600)) < 5);
  await postback({ sid: s.sid, event_id: 'e3', status: 'completed' });
  assert.equal(sql('SELECT COUNT(*) n FROM access_grants WHERE vid=?', v)[0].n, 1);
  env.DB.raw.prepare('UPDATE access_grants SET expires_at=? WHERE vid=?').run(nowSec() - 1, v);
  assert.equal((await tasksOf(v)).access.granted, false);
});
await test('concurrent duplicate callbacks cannot over-count', async () => {
  const v = newVid(), s = (await call('POST', '/v1/ads/session', { vid: v })).json;
  await Promise.all([1, 2, 3, 4].map(() => postback({ sid: s.sid, event_id: 'same-event', status: 'completed' })));
  assert.equal((await call('GET', `/v1/ads/session/${s.sid}`, { vid: v })).json.completed, 1);
});
await test('rewarded-ads switch off removes availability', async () => {
  await setCfg({ features: { rewardedAds: false } });
  assert.equal((await tasksOf(newVid())).ads.available, false);
  assert.equal((await call('POST', '/v1/ads/session', { vid: newVid() })).status, 503);
});

group('Admin analytics, CORS and misc security');
await test('overview and per-game stats reflect real data', async () => {
  const o = (await admin('GET', '/v1/admin/overview')).json;
  assert.ok(o.visitors.total > 0); assert.ok(o.games.views > 0); assert.ok(o.games.ratingCount > 0);
  const g = (await admin('GET', '/v1/admin/game-stats')).json.games.find(x => x.gameId === 'rate-test');
  assert.equal(g.rating.count, 3);
  assert.equal((await admin('DELETE', '/v1/admin/game-stats/rate-test')).status, 200);
  assert.equal((await call('GET', '/v1/games/rate-test')).json.rating.count, 0);
});
await test('CORS: allowed origin echoed; others get no CORS headers and cannot write', async () => {
  const ok = await call('GET', '/v1/stats'); assert.equal(ok.res.headers.get('access-control-allow-origin'), ORIGIN);
  const pre = await call('OPTIONS', '/v1/ping', { headers: { 'Access-Control-Request-Method': 'POST' } }); assert.equal(pre.status, 204);
  assert.match(pre.res.headers.get('access-control-allow-headers'), /X-GV-Visitor/);
  const evil = await call('POST', '/v1/ping', { vid: newVid(), origin: 'https://evil.test' });
  assert.equal(evil.status, 403); assert.equal(evil.res.headers.get('access-control-allow-origin'), null);
  assert.equal((await call('GET', '/v1/nope')).status, 404);
  assert.equal((await call('DELETE', '/v1/stats')).status, 405);
});
await test('bad JSON and oversize bodies are rejected cleanly', async () => {
  assert.equal((await call('POST', '/v1/feedback', { vid: newVid(), raw: '{oops', headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await call('POST', '/v1/feedback', { vid: newVid(), raw: 'x'.repeat(7000) })).status, 413);
});
await test('maintenance cleanup runs without error', async () => {
  assert.equal((await admin('POST', '/v1/admin/maintenance/cleanup')).status, 200);
});

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const [n, e] of failures) console.log('\nFAILED:', n, '\n', e && e.stack || e); process.exit(1); }
