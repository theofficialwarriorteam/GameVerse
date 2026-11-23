import { HttpError, bad, readJson, cleanStr, nowSec, dayKey, safeTz, hmacHex, safeEqual, sha256Hex, rid } from './util.js';
import { getConfig, periodStartSec, resetsAtSec } from './config.js';
import { visitorId, gameIdParam, isBot, isAdminCall, rateLimit, dedupe, cleanup, ensureGameCapacity } from './db.js';

export const ONLINE_WINDOW = 130; // seconds without a heartbeat before a visitor stops counting as online
const tzOf = env => safeTz(env.STATS_TIMEZONE || 'UTC');
const adsAvailable = (cfg, env) => cfg.features.rewardedAds && !!cfg.ads.launchUrl && !!env.ADS_POSTBACK_SECRET;

export function summarize(row) {
  const count = row?.rating_count || 0;
  return {
    average: count ? Math.round((row.rating_sum / count) * 100) / 100 : 0,
    count,
    distribution: { 5: row?.c5 || 0, 4: row?.c4 || 0, 3: row?.c3 || 0, 2: row?.c2 || 0, 1: row?.c1 || 0 }
  };
}

/* ------------------------------ config ------------------------------ */
async function publicConfig(c) {
  const cfg = await getConfig(c.env);
  return {
    serverNow: nowSec(),
    features: cfg.features,
    access: cfg.access,
    tasks: { resetMode: cfg.tasks.resetMode, accessHours: cfg.tasks.accessHours, minSeconds: cfg.tasks.minSeconds },
    ads: { available: adsAvailable(cfg, c.env), adsRequired: cfg.ads.adsRequired, unlockMinutes: cfg.ads.unlockMinutes, providerName: cfg.ads.providerName },
    feedback: cfg.feedback
  };
}

/* --------------------------- visitor analytics --------------------------- */
async function ping(c) {
  const vid = visitorId(c);
  if (isBot(c.request)) return { ok: true, counted: false };
  if (await isAdminCall(c)) return { ok: true, counted: false, excluded: true };
  await rateLimit(c, 'ping', 300, 60);
  const cfg = await getConfig(c.env);
  const db = c.env.DB, now = nowSec(), day = dayKey(tzOf(c.env));
  let isNew = false;
  if (cfg.features.visitorStats) {
    const r = await db.prepare('INSERT OR IGNORE INTO visitors(vid,first_seen,last_seen) VALUES(?,?,?)').bind(vid, now, now).run();
    if ((r.meta?.changes || 0) > 0) {
      isNew = true;
      await db.prepare("INSERT INTO counters(key,value) VALUES('visitors_total',1) ON CONFLICT(key) DO UPDATE SET value=value+1").run();
    } else {
      await db.prepare('UPDATE visitors SET last_seen=? WHERE vid=? AND last_seen<?').bind(now, vid, now - 600).run();
    }
    const d = await db.prepare('INSERT OR IGNORE INTO visitor_days(day,vid) VALUES(?,?)').bind(day, vid).run();
    if ((d.meta?.changes || 0) > 0) {
      await db.prepare('INSERT INTO daily_counts(day,visitors) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET visitors=visitors+1').bind(day).run();
    }
  }
  if (cfg.features.onlineTracking) {
    await db.prepare('INSERT INTO online(vid,last_seen) VALUES(?,?) ON CONFLICT(vid) DO UPDATE SET last_seen=excluded.last_seen').bind(vid, now).run();
  }
  await cleanup(c);
  return { ok: true, counted: isNew };
}

let statsMemo = { v: null, at: 0 };
export const resetStatsMemo = () => { statsMemo = { v: null, at: 0 }; };
export async function rawStats(env, { fresh = false } = {}) {
  const ttl = Number(env.STATS_CACHE_SECONDS ?? 10) * 1000;
  if (!fresh && statsMemo.v && Date.now() - statsMemo.at < ttl) return statsMemo.v;
  const db = env.DB, now = nowSec();
  const [total, today, online, games] = await Promise.all([
    db.prepare("SELECT value FROM counters WHERE key='visitors_total'").first(),
    db.prepare('SELECT visitors FROM daily_counts WHERE day=?').bind(dayKey(tzOf(env))).first(),
    db.prepare('SELECT COUNT(*) AS n FROM online WHERE last_seen>=?').bind(now - ONLINE_WINDOW).first(),
    db.prepare('SELECT COALESCE(SUM(plays),0) AS plays, COALESCE(SUM(views),0) AS views FROM game_stats').first()
  ]);
  const v = {
    totalVisitors: total?.value || 0, todayVisitors: today?.visitors || 0, online: online?.n || 0,
    totalPlays: games?.plays || 0, totalViews: games?.views || 0
  };
  statsMemo = { v, at: Date.now() };
  return v;
}
async function stats(c) {
  const cfg = await getConfig(c.env);
  const s = await rawStats(c.env);
  const f = cfg.features;
  return {
    generatedAt: nowSec(),
    totalVisitors: f.visitorStats ? s.totalVisitors : null,
    todayVisitors: f.visitorStats ? s.todayVisitors : null,
    online: f.onlineTracking ? s.online : null,
    totalPlays: f.gameAnalytics ? s.totalPlays : null,
    totalViews: f.gameAnalytics ? s.totalViews : null,
    onlineWindowSeconds: ONLINE_WINDOW
  };
}

/* ----------------------------- game analytics ----------------------------- */
async function gameInfo(c) {
  const id = gameIdParam(c), cfg = await getConfig(c.env), vid = visitorId(c, { optional: true });
  const row = await c.env.DB.prepare('SELECT * FROM game_stats WHERE game_id=?').bind(id).first();
  let mine = null;
  if (vid && cfg.features.ratings) {
    mine = (await c.env.DB.prepare('SELECT stars FROM ratings WHERE game_id=? AND vid=?').bind(id, vid).first())?.stars || null;
  }
  return {
    gameId: id,
    views: cfg.features.gameAnalytics ? (row?.views || 0) : null,
    plays: cfg.features.gameAnalytics ? (row?.plays || 0) : null,
    rating: cfg.features.ratings ? summarize(row) : null,
    mine
  };
}
async function gamesBulk(c) {
  const cfg = await getConfig(c.env);
  const rows = (await c.env.DB.prepare('SELECT game_id,views,plays,rating_count,rating_sum FROM game_stats LIMIT 500').all()).results || [];
  return {
    games: rows.map(r => ({
      gameId: r.game_id,
      views: cfg.features.gameAnalytics ? r.views : null,
      plays: cfg.features.gameAnalytics ? r.plays : null,
      ratingAverage: cfg.features.ratings && r.rating_count ? Math.round((r.rating_sum / r.rating_count) * 100) / 100 : null,
      ratingCount: cfg.features.ratings ? r.rating_count : null
    }))
  };
}
async function gameEvent(c, kind) {
  const id = gameIdParam(c), vid = visitorId(c), cfg = await getConfig(c.env);
  if (!cfg.features.gameAnalytics) return { ok: true, tracked: false, reason: 'disabled' };
  if (isBot(c.request) || await isAdminCall(c)) return { ok: true, tracked: false, reason: 'excluded' };
  await rateLimit(c, 'gev', 120, 60);
  await ensureGameCapacity(c.env, id);
  // views: one per visitor per game per 30 min; Play Now clicks: ignore double-clicks within 30 s
  if (!(await dedupe(c.env, `${kind}:${id}:${vid}`, kind === 'view' ? 1800 : 30))) return { ok: true, tracked: false, reason: 'duplicate' };
  await c.env.DB.prepare(
    'INSERT INTO game_stats(game_id,views,plays) VALUES(?,?,?) ON CONFLICT(game_id) DO UPDATE SET views=views+excluded.views, plays=plays+excluded.plays'
  ).bind(id, kind === 'view' ? 1 : 0, kind === 'play' ? 1 : 0).run();
  return { ok: true, tracked: true };
}
async function rate(c) {
  const id = gameIdParam(c), vid = visitorId(c), cfg = await getConfig(c.env);
  if (!cfg.features.ratings) throw new HttpError(403, 'Ratings are currently turned off', 'feature_off');
  const body = await readJson(c.request, 500);
  const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) bad('Rating must be a whole number from 1 to 5');
  await rateLimit(c, 'rate', 15, 600);
  await rateLimit(c, 'ratev', 20, 3600, vid);
  const db = c.env.DB, now = nowSec();
  const prev = (await db.prepare('SELECT stars FROM ratings WHERE game_id=? AND vid=?').bind(id, vid).first())?.stars;
  let changed = true;
  if (prev === stars) changed = false;
  else if (prev) {
    await db.batch([
      db.prepare('UPDATE ratings SET stars=?, updated_at=? WHERE game_id=? AND vid=?').bind(stars, now, id, vid),
      db.prepare(`UPDATE game_stats SET rating_sum=rating_sum-?+?, c${prev}=c${prev}-1, c${stars}=c${stars}+1 WHERE game_id=?`).bind(prev, stars, id)
    ]);
  } else {
    await ensureGameCapacity(c.env, id);
    const d = n => (n === stars ? 1 : 0);
    await db.batch([
      db.prepare('INSERT INTO ratings(game_id,vid,stars,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id, vid, stars, now, now),
      db.prepare(
        `INSERT INTO game_stats(game_id,rating_count,rating_sum,c1,c2,c3,c4,c5) VALUES(?,1,?,?,?,?,?,?)
         ON CONFLICT(game_id) DO UPDATE SET rating_count=rating_count+1, rating_sum=rating_sum+excluded.rating_sum,
           c1=c1+excluded.c1, c2=c2+excluded.c2, c3=c3+excluded.c3, c4=c4+excluded.c4, c5=c5+excluded.c5`
      ).bind(id, stars, d(1), d(2), d(3), d(4), d(5))
    ]);
  }
  const row = await db.prepare('SELECT * FROM game_stats WHERE game_id=?').bind(id).first();
  return { ok: true, changed, updated: !!prev && changed, mine: stars, rating: summarize(row) };
}

/* -------------------------------- feedback -------------------------------- */
async function submitFeedback(c) {
  const cfg = await getConfig(c.env);
  if (!cfg.features.feedback) throw new HttpError(403, 'Feedback is currently turned off', 'feature_off');
  const vid = visitorId(c);
  const body = await readJson(c.request, 6000);
  if (body.website) return { ok: true }; // honeypot: silently accept, store nothing
  const category = cleanStr(body.category, 40);
  if (!cfg.feedback.categories.includes(category)) bad('Please choose a feedback category');
  const message = cleanStr(body.message, cfg.feedback.maxLength + 1);
  if (message.length < 5) bad('Please write at least a few words');
  if (message.length > cfg.feedback.maxLength) bad(`Feedback must be ${cfg.feedback.maxLength} characters or fewer`);
  let gameId = null;
  if (body.gameId) { gameId = cleanStr(body.gameId, 100); if (!/^[A-Za-z0-9_.-]{1,100}$/.test(gameId)) bad('Invalid game'); }
  await rateLimit(c, 'fb', 6, 3600);
  await rateLimit(c, 'fbv', 4, 3600, vid);
  if (!(await dedupe(c.env, `fb:${vid}:${(await sha256Hex(message)).slice(0, 20)}`, 86400))) return { ok: true, duplicate: true };
  await c.env.DB.prepare('INSERT INTO feedback(id,game_id,category,message,status,created_at) VALUES(?,?,?,?,?,?)')
    .bind('fb-' + rid(16), gameId, category, message, 'new', nowSec()).run();
  return { ok: true };
}

/* -------------------------------- downloads -------------------------------- */
const parseStored = (v, fallback) => { try { return JSON.parse(v || ''); } catch { return fallback; } };
async function downloadRating(c, id, vid) {
  const [sum, mine] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(stars),0) AS s, SUM(stars=1) AS c1, SUM(stars=2) AS c2, SUM(stars=3) AS c3, SUM(stars=4) AS c4, SUM(stars=5) AS c5 FROM download_ratings WHERE download_id=?').bind(id).first(),
    vid ? c.env.DB.prepare('SELECT stars FROM download_ratings WHERE download_id=? AND vid=?').bind(id, vid).first() : Promise.resolve(null)
  ]);
  const count = sum?.n || 0;
  return { count, average: count ? Math.round((sum.s / count) * 100) / 100 : 0, distribution: [1,2,3,4,5].map(n => sum?.[`c${n}`] || 0), mine: mine?.stars || null };
}
const publicDownload = (d, origin, rating = null) => ({
  id: d.id, title: d.title, description: d.description, shortDescription: d.short_description || '', fileType: d.file_type, version: d.version,
  sizeBytes: d.size_bytes || 0, developer: d.developer || '', releaseDate: d.release_date || '', lastUpdatedDate: d.last_updated_date || '',
  supportedDevices: parseStored(d.supported_devices, []), requirements: parseStored(d.requirements, {}), installInstructions: d.install_instructions || '', notices: d.notices || '', feedbackEnabled: d.feedback_enabled !== 0,
  coverUrl: d.cover_url || '',
  downloadCount: d.download_count || 0, downloadClicks: d.download_clicks || 0, updatedAt: d.updated_at, rating
});
async function listDownloads(c) {
  const cfg = await getConfig(c.env);
  if (!cfg.features.downloads) return { enabled: false, items: [] };
  const rows = (await c.env.DB.prepare(`SELECT d.*, COUNT(r.vid) AS rating_count, COALESCE(AVG(r.stars),0) AS rating_average, COALESCE(SUM(r.stars=1),0) AS c1, COALESCE(SUM(r.stars=2),0) AS c2, COALESCE(SUM(r.stars=3),0) AS c3, COALESCE(SUM(r.stars=4),0) AS c4, COALESCE(SUM(r.stars=5),0) AS c5 FROM downloads d LEFT JOIN download_ratings r ON r.download_id=d.id WHERE d.published=1 GROUP BY d.id ORDER BY d.sort_order ASC,d.created_at DESC LIMIT 200`).all()).results || [];
  const items = rows.map(r => publicDownload(r, c.url.origin, {count:r.rating_count||0,average:Math.round((r.rating_average||0)*100)/100,distribution:[r.c1||0,r.c2||0,r.c3||0,r.c4||0,r.c5||0],mine:null}));
  return { enabled: true, items };
}
async function downloadDetails(c) {
  const cfg = await getConfig(c.env); if (!cfg.features.downloads) throw new HttpError(403, 'Downloads are currently unavailable', 'feature_off');
  const row = await c.env.DB.prepare('SELECT * FROM downloads WHERE id=? AND published=1').bind(c.params.id).first();
  if (!row) throw new HttpError(404, 'Download not found', 'not_found');
  const vid = visitorId(c, { optional: true });
  return { item: publicDownload(row, c.url.origin, await downloadRating(c, row.id, vid)) };
}
async function rateDownload(c) {
  const cfg = await getConfig(c.env); if (!cfg.features.downloads || !cfg.features.ratings) throw new HttpError(403, 'Download ratings are currently unavailable', 'feature_off');
  const id = c.params.id, vid = visitorId(c), body = await readJson(c.request, 500); const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) bad('Rating must be a whole number from 1 to 5');
  const exists = await c.env.DB.prepare('SELECT 1 AS x FROM downloads WHERE id=? AND published=1').bind(id).first(); if (!exists) throw new HttpError(404, 'Download not found', 'not_found');
  await rateLimit(c, 'dlrate', 15, 600); await rateLimit(c, 'dlratev', 20, 3600, vid);
  const now = nowSec();
  await c.env.DB.prepare('INSERT INTO download_ratings(download_id,vid,stars,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(download_id,vid) DO UPDATE SET stars=excluded.stars,updated_at=excluded.updated_at').bind(id,vid,stars,now,now).run();
  return { ok: true, rating: await downloadRating(c, id, vid) };
}
async function submitDownloadFeedback(c) {
  const cfg = await getConfig(c.env); if (!cfg.features.downloads || !cfg.features.feedback) throw new HttpError(403, 'Download feedback is currently unavailable', 'feature_off');
  const vid = visitorId(c), body = await readJson(c.request, 6000); if (body.website) return { ok: true };
  const id = c.params.id, exists = await c.env.DB.prepare('SELECT feedback_enabled FROM downloads WHERE id=? AND published=1').bind(id).first(); if (!exists) throw new HttpError(404, 'Download not found', 'not_found'); if (!exists.feedback_enabled) throw new HttpError(403, 'Feedback is disabled for this download', 'feature_off');
  const categories = ['General feedback','Broken download link','Installation problem','Compatibility problem'];
  const category = cleanStr(body.category, 40), message = cleanStr(body.message, 1000);
  if (!categories.includes(category)) bad('Choose a feedback category'); if (message.length < 5) bad('Please write at least a few words');
  await rateLimit(c, 'dlfb', 5, 3600); await rateLimit(c, 'dlfbv', 4, 3600, vid);
  const hash = (await sha256Hex(message)).slice(0,20); if (!(await dedupe(c.env, `dlfb:${id}:${vid}:${hash}`, 86400))) return { ok:true, duplicate:true };
  await c.env.DB.prepare('INSERT INTO download_feedback(id,download_id,vid,category,message,status,created_at) VALUES(?,?,?,?,?,?,?)').bind('dlfb-'+rid(16),id,vid,category,message,'new',nowSec()).run();
  return { ok:true };
}
async function downloadTicket(c) {
  const cfg = await getConfig(c.env);
  if (!cfg.features.downloads) throw new HttpError(403, 'Downloads are currently unavailable', 'feature_off');
  if (!c.env.TOKEN_SECRET) throw new HttpError(503, 'Server is missing TOKEN_SECRET', 'server_not_configured');
  const vid = visitorId(c);
  await rateLimit(c, 'ticket', 30, 600);
  const item = await c.env.DB.prepare('SELECT id FROM downloads WHERE id=? AND published=1').bind(c.params.id).first();
  if (!item) throw new HttpError(404, 'Download not found', 'not_found');
  if (cfg.access.scope === 'downloads') {
    const me = await buildMe(c, cfg, vid);
    if (me.access.gateActive && !me.access.granted) throw new HttpError(403, 'Complete the unlock requirements to download', 'access_required');
  }
  await c.env.DB.prepare('UPDATE downloads SET download_clicks=download_clicks+1 WHERE id=?').bind(item.id).run();
  const exp = nowSec() + 300, nonce = rid(10); // ticket request = a download-button click, not proof of successful completion
  const sig = await hmacHex(c.env.TOKEN_SECRET, `dl|${item.id}|${exp}|${nonce}`);
  return { url: `${c.url.origin}/v1/dl/${item.id}?t=${exp}.${nonce}.${sig}`, expiresAt: exp };
}
async function serveDownload(c) {
  const t = c.url.searchParams.get('t') || '';
  const [expS, nonce, sig] = t.split('.');
  const exp = Number(expS);
  if (!c.env.TOKEN_SECRET || !exp || !nonce || !sig || exp < nowSec() || !safeEqual(sig, await hmacHex(c.env.TOKEN_SECRET, `dl|${c.params.id}|${exp}|${nonce}`))) {
    throw new HttpError(403, 'This download link has expired. Go back and press Download again.', 'bad_ticket');
  }
  const item = await c.env.DB.prepare('SELECT * FROM downloads WHERE id=? AND published=1').bind(c.params.id).first();
  if (!item) throw new HttpError(404, 'Download not found', 'not_found');
  const range = c.request.headers.get('Range');
  const startsAtZero = !range || /^bytes=0-/.test(range);
  if (startsAtZero && await dedupe(c.env, `dl:${sig}`, 86400)) {
    await c.env.DB.prepare('UPDATE downloads SET download_count=download_count+1, last_download=? WHERE id=?').bind(nowSec(), item.id).run();
  }
  if (!item.external_url || !/^https:\/\//i.test(item.external_url)) throw new HttpError(404, 'External download link is missing', 'file_missing');
  return new Response(null, { status: 302, headers: { Location: item.external_url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

/* ----------------------- tasks, access and the visitor profile ----------------------- */
export async function buildMe(c, cfg, vid) {
  const db = c.env.DB, now = nowSec(), tz = tzOf(c.env);
  let items = [];
  if (cfg.features.tasks) {
    const tasks = (await db.prepare('SELECT * FROM tasks WHERE enabled=1 ORDER BY sort_order ASC, created_at ASC').all()).results || [];
    const [comps, opens] = tasks.length ? await Promise.all([
      db.prepare('SELECT task_id, completed_at FROM task_completions WHERE vid=?').bind(vid).all(),
      db.prepare('SELECT task_id, opened_at FROM task_opens WHERE vid=?').bind(vid).all()
    ]) : [{ results: [] }, { results: [] }];
    const cm = Object.fromEntries((comps.results || []).map(r => [r.task_id, r.completed_at]));
    const om = Object.fromEntries((opens.results || []).map(r => [r.task_id, r.opened_at]));
    items = tasks.map(t => {
      const at = cm[t.id];
      const completed = !!at && at >= periodStartSec(t, cfg, tz);
      return {
        id: t.id, kind: t.kind, title: t.title, description: t.description, url: t.url,
        reward: t.reward, verification: 'self',
        completed, completedAt: completed ? at : null, resetsAt: completed ? resetsAtSec(t, cfg, tz, at) : null,
        openedAt: om[t.id] || null
      };
    });
  }
  const required = items.filter(t => t.reward === 'access');
  const grant = await db.prepare('SELECT source, expires_at FROM access_grants WHERE vid=?').bind(vid).first();
  const granted = !!grant && grant.expires_at > now;
  const available = adsAvailable(cfg, c.env);
  const session = available
    ? await db.prepare("SELECT sid, required, completed, status, expires_at FROM ad_sessions WHERE vid=? AND status='open' AND expires_at>? ORDER BY created_at DESC LIMIT 1").bind(vid, now).first()
    : null;
  return {
    serverNow: now,
    tasks: {
      enabled: cfg.features.tasks, items, total: items.length, completed: items.filter(t => t.completed).length,
      requiredTotal: required.length, requiredCompleted: required.filter(t => t.completed).length,
      minSeconds: cfg.tasks.minSeconds
    },
    access: {
      scope: cfg.access.scope,
      gateActive: cfg.access.scope !== 'off' && (required.length > 0 || available),
      granted, source: granted ? grant.source : null, expiresAt: granted ? grant.expires_at : null,
      canClaimWithTasks: required.length > 0 && required.every(t => t.completed)
    },
    ads: {
      available, enabled: cfg.features.rewardedAds, adsRequired: cfg.ads.adsRequired, unlockMinutes: cfg.ads.unlockMinutes,
      providerName: cfg.ads.providerName,
      session: session ? { sid: session.sid, required: session.required, completed: session.completed, expiresAt: session.expires_at } : null
    }
  };
}
async function me(c) {
  return buildMe(c, await getConfig(c.env), visitorId(c));
}
async function loadTask(c, cfg) {
  if (!cfg.features.tasks) throw new HttpError(403, 'Tasks are currently turned off', 'feature_off');
  const t = await c.env.DB.prepare('SELECT * FROM tasks WHERE id=? AND enabled=1').bind(c.params.id).first();
  if (!t) throw new HttpError(404, 'Task not found', 'not_found');
  return t;
}
async function openTask(c) {
  const cfg = await getConfig(c.env), t = await loadTask(c, cfg), vid = visitorId(c);
  await rateLimit(c, 'topen', 120, 600);
  await c.env.DB.prepare(
    'INSERT INTO task_opens(vid,task_id,opened_at) VALUES(?,?,?) ON CONFLICT(vid,task_id) DO UPDATE SET opened_at=CASE WHEN task_opens.opened_at<? THEN excluded.opened_at ELSE task_opens.opened_at END'
  ).bind(vid, t.id, nowSec(), nowSec() - 86400).run();
  return { ok: true, minSeconds: cfg.tasks.minSeconds };
}
async function completeTask(c) {
  const cfg = await getConfig(c.env), t = await loadTask(c, cfg), vid = visitorId(c);
  await rateLimit(c, 'tdone', 120, 600);
  const db = c.env.DB, now = nowSec(), tz = tzOf(c.env);
  const done = await db.prepare('SELECT completed_at FROM task_completions WHERE vid=? AND task_id=?').bind(vid, t.id).first();
  if (done && done.completed_at >= periodStartSec(t, cfg, tz)) return { ok: true, alreadyCompleted: true, verification: 'self' };
  const open = await db.prepare('SELECT opened_at FROM task_opens WHERE vid=? AND task_id=?').bind(vid, t.id).first();
  if (!open || open.opened_at < now - 86400) throw new HttpError(409, 'Open the task link first, then come back to confirm.', 'not_opened');
  const wait = open.opened_at + cfg.tasks.minSeconds - now;
  if (wait > 0) throw new HttpError(409, `Please give it a moment — you can confirm in ${wait}s.`, 'too_soon', { retryAfter: wait });
  await db.batch([
    db.prepare('INSERT INTO task_completions(vid,task_id,completed_at) VALUES(?,?,?) ON CONFLICT(vid,task_id) DO UPDATE SET completed_at=excluded.completed_at').bind(vid, t.id, now),
    db.prepare('DELETE FROM task_opens WHERE vid=? AND task_id=?').bind(vid, t.id)
  ]);
  return { ok: true, verification: 'self', completedAt: now, resetsAt: resetsAtSec(t, cfg, tz, now) };
}
async function grantAccess(db, vid, source, seconds) {
  const now = nowSec(), exp = now + seconds;
  await db.prepare(
    `INSERT INTO access_grants(vid,source,granted_at,expires_at) VALUES(?,?,?,?)
     ON CONFLICT(vid) DO UPDATE SET
       source=CASE WHEN excluded.expires_at>=access_grants.expires_at THEN excluded.source ELSE access_grants.source END,
       granted_at=CASE WHEN excluded.expires_at>=access_grants.expires_at THEN excluded.granted_at ELSE access_grants.granted_at END,
       expires_at=MAX(access_grants.expires_at, excluded.expires_at)`
  ).bind(vid, source, now, exp).run();
  return exp;
}
async function claimAccess(c) {
  const cfg = await getConfig(c.env), vid = visitorId(c);
  await rateLimit(c, 'claim', 30, 600);
  const me = await buildMe(c, cfg, vid);
  if (!me.access.canClaimWithTasks) throw new HttpError(409, 'Finish all required tasks first.', 'tasks_incomplete');
  await grantAccess(c.env.DB, vid, 'tasks', cfg.tasks.accessHours * 3600);
  return buildMe(c, cfg, vid);
}

/* ------------------------------ rewarded ads ------------------------------ */
async function startAdSession(c) {
  const cfg = await getConfig(c.env), vid = visitorId(c);
  if (!adsAvailable(cfg, c.env)) throw new HttpError(503, 'Rewarded ads are not available right now', 'ads_unavailable');
  await rateLimit(c, 'adsess', 40, 3600);
  await rateLimit(c, 'adsessv', 10, 3600, vid);
  const db = c.env.DB, now = nowSec();
  let s = await db.prepare("SELECT * FROM ad_sessions WHERE vid=? AND status='open' AND expires_at>? ORDER BY created_at DESC LIMIT 1").bind(vid, now).first();
  if (!s) {
    s = { sid: 'ad' + rid(24), vid, required: cfg.ads.adsRequired, completed: 0, status: 'open', created_at: now, expires_at: now + 1800 };
    await db.prepare('INSERT INTO ad_sessions(sid,vid,required,completed,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?)')
      .bind(s.sid, vid, s.required, 0, 'open', now, s.expires_at).run();
  }
  return { sid: s.sid, required: s.required, completed: s.completed, expiresAt: s.expires_at, launchUrl: cfg.ads.launchUrl.replace('{sid}', encodeURIComponent(s.sid)) };
}
async function adSessionStatus(c) {
  const vid = visitorId(c), now = nowSec();
  const s = await c.env.DB.prepare('SELECT * FROM ad_sessions WHERE sid=? AND vid=?').bind(c.params.sid, vid).first();
  if (!s) throw new HttpError(404, 'Session not found', 'not_found');
  const grant = await c.env.DB.prepare('SELECT expires_at FROM access_grants WHERE vid=?').bind(vid).first();
  return {
    sid: s.sid, required: s.required, completed: s.completed,
    status: s.status === 'open' && s.expires_at <= now ? 'expired' : s.status,
    accessExpiresAt: s.status === 'granted' && grant ? grant.expires_at : null
  };
}
// Server-to-server callback from the ad provider. Signed with HMAC-SHA256 so a visitor
// cannot forge it; event_id makes duplicate deliveries harmless.
export async function adsPostback(c) {
  const secret = c.env.ADS_POSTBACK_SECRET;
  if (!secret) throw new HttpError(503, 'Ad postbacks are not configured', 'ads_unavailable');
  const q = c.url.searchParams;
  let p = { sid: q.get('sid'), event_id: q.get('event_id'), status: q.get('status'), ts: q.get('ts'), sig: q.get('sig') };
  if (c.request.method === 'POST' && !p.sid) {
    const b = await readJson(c.request, 2000);
    p = { sid: b.sid, event_id: b.event_id, status: b.status, ts: b.ts, sig: b.sig };
  }
  const sid = cleanStr(String(p.sid ?? ''), 80), eventId = cleanStr(String(p.event_id ?? ''), 120), status = cleanStr(String(p.status ?? ''), 20), ts = Number(p.ts);
  if (!sid || !eventId || !['completed', 'failed', 'cancelled'].includes(status) || !Number.isFinite(ts)) bad('Invalid postback');
  const expected = await hmacHex(secret, `sid=${sid}&event_id=${eventId}&status=${status}&ts=${p.ts}`);
  if (!safeEqual(String(p.sig || ''), expected)) throw new HttpError(401, 'Bad signature', 'bad_signature');
  const now = nowSec();
  if (Math.abs(now - ts) > 600) throw new HttpError(400, 'Postback timestamp is outside the allowed window', 'stale');
  const db = c.env.DB, cfg = await getConfig(c.env);
  const s = await db.prepare('SELECT * FROM ad_sessions WHERE sid=?').bind(sid).first();
  if (!s) throw new HttpError(404, 'Unknown session', 'not_found');
  const ins = await db.prepare('INSERT OR IGNORE INTO ad_events(event_id,sid,status,created_at) VALUES(?,?,?,?)').bind(eventId, sid, status, now).run();
  if ((ins.meta?.changes || 0) === 0) return { ok: true, duplicate: true };
  if (status !== 'completed') return { ok: true, recorded: status };
  if (s.status !== 'open' || s.expires_at <= now) return { ok: true, ignored: 'session_closed' };
  const upd = await db.prepare("UPDATE ad_sessions SET completed=completed+1 WHERE sid=? AND status='open' AND completed<required RETURNING completed, required").bind(sid).first();
  if (upd && upd.completed >= upd.required) {
    const done = await db.prepare("UPDATE ad_sessions SET status='granted' WHERE sid=? AND status='open'").bind(sid).run();
    if ((done.meta?.changes || 0) > 0) await grantAccess(db, s.vid, 'ads', cfg.ads.unlockMinutes * 60);
  }
  return { ok: true, counted: !!upd };
}

export const publicRoutes = [
  ['GET', '/v1/health', async () => ({ ok: true })],
  ['GET', '/v1/config', publicConfig],
  ['POST', '/v1/ping', ping],
  ['GET', '/v1/stats', stats],
  ['GET', '/v1/games', gamesBulk],
  ['GET', '/v1/games/:id', gameInfo],
  ['POST', '/v1/games/:id/view', c => gameEvent(c, 'view')],
  ['POST', '/v1/games/:id/play', c => gameEvent(c, 'play')],
  ['POST', '/v1/games/:id/rate', rate],
  ['POST', '/v1/feedback', submitFeedback],
  ['GET', '/v1/downloads', listDownloads],
  ['GET', '/v1/downloads/:id', downloadDetails],
  ['POST', '/v1/downloads/:id/rate', rateDownload],
  ['POST', '/v1/downloads/:id/feedback', submitDownloadFeedback],
  ['POST', '/v1/downloads/:id/ticket', downloadTicket],
  ['GET', '/v1/dl/:id', serveDownload, { raw: true }],
  ['GET', '/v1/me', me],
  ['POST', '/v1/tasks/:id/open', openTask],
  ['POST', '/v1/tasks/:id/complete', completeTask],
  ['POST', '/v1/access/claim', claimAccess],
  ['POST', '/v1/ads/session', startAdSession],
  ['GET', '/v1/ads/session/:sid', adSessionStatus],
  ['GET', '/v1/ads/postback', adsPostback],
  ['POST', '/v1/ads/postback', adsPostback]
];
