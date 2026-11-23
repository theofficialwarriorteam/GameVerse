import { HttpError, bad, readJson, cleanStr, toBool, toInt, oneOf, httpUrl, nowSec, rid } from './util.js';
import { getConfig, saveConfig } from './config.js';
import { rawStats, summarize, ONLINE_WINDOW } from './public.js';
import { cleanup } from './db.js';

export const PART_SIZE = 8 * 1024 * 1024; // R2 multipart: all parts but the last must be the same size (>= 5 MiB)
const ALLOWED_EXT = ['apk', 'xapk', 'apks', 'obb', 'zip', 'rar', '7z', 'exe', 'msi', 'dmg', 'pkg', 'deb', 'appimage', 'iso', 'tar', 'gz'];
export const FILE_TYPES = ['APK', 'ZIP', 'EXE', 'MSI', 'RAR', '7Z', 'DMG', 'OTHER'];
const TASK_KINDS = ['youtube_visit', 'youtube_subscribe', 'youtube_watch', 'youtube_like', 'youtube_comment', 'discord', 'custom'];
const FILE_KEY_RE = /^files\/[a-z0-9]{10,40}\/[A-Za-z0-9._ -]{1,150}$/;
const COVER_KEY_RE = /^covers\/[a-z0-9]{10,40}\.(jpg|png|webp)$/;

const safeJson = (v, fallback) => { try { return JSON.parse(v || ''); } catch { return fallback; } };
const adminDownload = (d, origin) => ({
  id: d.id, title: d.title, description: d.description, fileType: d.file_type, version: d.version,
  sizeBytes: d.size_bytes || 0, storage: d.storage, fileKey: d.file_key, externalUrl: d.external_url,
  originalName: d.original_name, coverKey: d.cover_key,
  coverUrl: d.cover_key ? `${origin}/v1/media/${d.cover_key}` : (d.cover_url || ''),
  shortDescription: d.short_description || '', developer: d.developer || '', releaseDate: d.release_date || '', lastUpdatedDate: d.last_updated_date || '',
  supportedDevices: safeJson(d.supported_devices, []), requirements: safeJson(d.requirements, {}), installInstructions: d.install_instructions || '', notices: d.notices || '', sortOrder: d.sort_order || 0, feedbackEnabled: d.feedback_enabled !== 0, ratingCount: d.rating_count || 0, ratingAverage: d.rating_average || 0, rating: d.rating_count === undefined ? null : { count:d.rating_count||0, average:d.rating_average||0, distribution:[d.c1||0,d.c2||0,d.c3||0,d.c4||0,d.c5||0], mine:null },
  published: !!d.published, downloadCount: d.download_count || 0, downloadClicks: d.download_clicks || 0, lastDownload: d.last_download,
  createdAt: d.created_at, updatedAt: d.updated_at
});
const extOf = name => (/\.([A-Za-z0-9]+)$/.exec(name) || [])[1]?.toLowerCase() || '';

/* ------------------------------- overview ------------------------------- */
async function overview(c) {
  const db = c.env.DB, now = nowSec();
  const s = await rawStats(c.env, { fresh: true });
  const [games, ratings, dl, fb, comp, ads, granted] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM game_stats').first(),
    db.prepare('SELECT COALESCE(SUM(rating_count),0) AS n, COALESCE(SUM(rating_sum),0) AS s FROM game_stats').first(),
    db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(published),0) AS published, COALESCE(SUM(download_clicks),0) AS clicks, COALESCE(SUM(download_count),0) AS file_requests FROM downloads').first(),
    db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(status='new'),0) AS fresh FROM feedback").first(),
    db.prepare('SELECT COUNT(*) AS n FROM task_completions').first(),
    db.prepare('SELECT status, COUNT(*) AS n FROM ad_events WHERE created_at>=? GROUP BY status').bind(now - 7 * 86400).all(),
    db.prepare("SELECT COUNT(*) AS n FROM ad_sessions WHERE status='granted' AND created_at>=?").bind(now - 7 * 86400).first()
  ]);
  const adEv = Object.fromEntries((ads.results || []).map(r => [r.status, r.n]));
  return {
    visitors: { total: s.totalVisitors, today: s.todayVisitors, online: s.online, onlineWindowSeconds: ONLINE_WINDOW },
    games: { tracked: games?.n || 0, views: s.totalViews, plays: s.totalPlays, ratingCount: ratings?.n || 0, ratingAverage: ratings?.n ? Math.round((ratings.s / ratings.n) * 100) / 100 : 0 },
    downloads: { total: dl?.total || 0, published: dl?.published || 0, clicks: dl?.clicks || 0, fileRequests: dl?.file_requests || 0 },
    feedback: { total: fb?.total || 0, new: fb?.fresh || 0 },
    tasks: { completionRecords: comp?.n || 0 },
    ads: { last7days: { completed: adEv.completed || 0, failed: adEv.failed || 0, cancelled: adEv.cancelled || 0, unlocksGranted: granted?.n || 0 } },
    status: {
      d1: true, r2: !!c.env.R2, tokenSecret: !!c.env.TOKEN_SECRET, adsPostbackSecret: !!c.env.ADS_POSTBACK_SECRET,
      timezone: c.env.STATS_TIMEZONE || 'UTC', maxUploadMb: Number(c.env.MAX_UPLOAD_MB || 2048)
    }
  };
}
async function gameStatsList(c) {
  const rows = (await c.env.DB.prepare('SELECT * FROM game_stats ORDER BY plays DESC, views DESC LIMIT 500').all()).results || [];
  return { games: rows.map(r => ({ gameId: r.game_id, views: r.views, plays: r.plays, rating: summarize(r) })) };
}
async function resetGameStats(c) {
  const id = c.params.id;
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM game_stats WHERE game_id=?').bind(id),
    c.env.DB.prepare('DELETE FROM ratings WHERE game_id=?').bind(id)
  ]);
  return { ok: true };
}

/* -------------------------------- config -------------------------------- */
const getCfg = async c => ({ config: await getConfig(c.env, { fresh: true }) });
const putCfg = async c => ({ config: await saveConfig(c.env, await readJson(c.request, 8000)) });

/* ------------------------------- downloads ------------------------------- */
async function listDownloads(c) {
  const rows = (await c.env.DB.prepare('SELECT d.*, (SELECT COUNT(*) FROM download_ratings r WHERE r.download_id=d.id) AS rating_count, (SELECT COALESCE(AVG(stars),0) FROM download_ratings r WHERE r.download_id=d.id) AS rating_average, (SELECT COALESCE(SUM(stars=1),0) FROM download_ratings r WHERE r.download_id=d.id) AS c1, (SELECT COALESCE(SUM(stars=2),0) FROM download_ratings r WHERE r.download_id=d.id) AS c2, (SELECT COALESCE(SUM(stars=3),0) FROM download_ratings r WHERE r.download_id=d.id) AS c3, (SELECT COALESCE(SUM(stars=4),0) FROM download_ratings r WHERE r.download_id=d.id) AS c4, (SELECT COALESCE(SUM(stars=5),0) FROM download_ratings r WHERE r.download_id=d.id) AS c5 FROM downloads d ORDER BY d.sort_order ASC,d.created_at DESC').all()).results || [];
  return { items: rows.map(r => adminDownload(r, c.url.origin)) };
}
async function parseDownload(c, body, ex) {
  const pick = (k, d) => (body[k] === undefined ? d : body[k]);
  const title = cleanStr(pick('title', ex?.title), 90);
  if (!title) bad('Title is required');
  const description = cleanStr(pick('description', ex?.description), 10000);
  const shortDescription = cleanStr(pick('shortDescription', ex?.short_description), 240);
  const developer = cleanStr(pick('developer', ex?.developer), 120);
  const releaseDate = cleanStr(pick('releaseDate', ex?.release_date), 20);
  const lastUpdatedDate = cleanStr(pick('lastUpdatedDate', ex?.last_updated_date), 20);
  const supportedDevices = Array.isArray(pick('supportedDevices', safeJson(ex?.supported_devices, []))) ? pick('supportedDevices', safeJson(ex?.supported_devices, [])).map(x => cleanStr(x, 40)).filter(Boolean).slice(0, 12) : [];
  const reqIn = pick('requirements', safeJson(ex?.requirements, {}));
  const requirements = {};
  if (reqIn && typeof reqIn === 'object' && !Array.isArray(reqIn)) for (const k of ['operatingSystem','processor','ram','storage','graphics','additionalSoftware']) { const v = cleanStr(reqIn[k], 180); if (v) requirements[k] = v; }
  const installInstructions = cleanStr(pick('installInstructions', ex?.install_instructions), 5000);
  const notices = cleanStr(pick('notices', ex?.notices), 3000);
  const sortOrder = toInt(pick('sortOrder', ex?.sort_order), 0, -100000, 100000);
  const feedbackEnabled = toBool(pick('feedbackEnabled', ex ? ex.feedback_enabled !== 0 : true), true) ? 1 : 0;
  const fileType = oneOf(String(pick('fileType', ex?.file_type) || '').toUpperCase(), FILE_TYPES, null);
  if (!fileType) bad('Choose a file type');
  const version = cleanStr(pick('version', ex?.version), 30);
  const published = toBool(pick('published', ex ? !!ex.published : false), false);
  const storage = oneOf(pick('storage', ex?.storage), ['r2', 'external'], null);
  if (!storage) bad('Upload a file or provide a download link');
  const rec = { title, description, short_description: shortDescription, developer, release_date: releaseDate, last_updated_date: lastUpdatedDate, supported_devices: JSON.stringify(supportedDevices), requirements: JSON.stringify(requirements), install_instructions: installInstructions, notices, sort_order: sortOrder, feedback_enabled: feedbackEnabled, file_type: fileType, version, published: published ? 1 : 0, storage, file_key: null, external_url: null, original_name: null, size_bytes: 0 };
  if (storage === 'r2') {
    const key = cleanStr(pick('fileKey', ex?.file_key), 200);
    if (!FILE_KEY_RE.test(key)) bad('Upload a file first');
    if (!c.env.R2) throw new HttpError(503, 'R2 storage is not configured', 'server_not_configured');
    const head = await c.env.R2.head(key);
    if (!head) bad('The uploaded file was not found in storage. Please upload it again.');
    rec.file_key = key; rec.size_bytes = head.size;
    rec.original_name = cleanStr(pick('originalName', ex?.original_name), 150) || key.split('/').pop();
  } else {
    rec.external_url = httpUrl(pick('externalUrl', ex?.external_url), { required: true, httpsOnly: true });
    rec.size_bytes = toInt(pick('sizeBytes', ex?.size_bytes), 0, 0, 1e12);
  }
  const coverKey = cleanStr(pick('coverKey', ex?.cover_key) || '', 120);
  if (coverKey) {
    if (!COVER_KEY_RE.test(coverKey)) bad('Invalid cover image');
    if (!(await c.env.R2.head(coverKey))) bad('The cover image was not found in storage. Please upload it again.');
    rec.cover_key = coverKey; rec.cover_url = null;
  } else {
    rec.cover_key = null;
    rec.cover_url = httpUrl(pick('coverUrl', ex?.cover_url), { httpsOnly: true });
  }
  return rec;
}
async function removeObjects(env, keys) {
  for (const k of keys) if (k) { try { await env.R2.delete(k); } catch { /* best effort */ } }
}
async function getDownloadAdmin(c) {
  const row = await c.env.DB.prepare('SELECT d.*, (SELECT COUNT(*) FROM download_ratings r WHERE r.download_id=d.id) AS rating_count, (SELECT COALESCE(AVG(stars),0) FROM download_ratings r WHERE r.download_id=d.id) AS rating_average, (SELECT COALESCE(SUM(stars=1),0) FROM download_ratings r WHERE r.download_id=d.id) AS c1, (SELECT COALESCE(SUM(stars=2),0) FROM download_ratings r WHERE r.download_id=d.id) AS c2, (SELECT COALESCE(SUM(stars=3),0) FROM download_ratings r WHERE r.download_id=d.id) AS c3, (SELECT COALESCE(SUM(stars=4),0) FROM download_ratings r WHERE r.download_id=d.id) AS c4, (SELECT COALESCE(SUM(stars=5),0) FROM download_ratings r WHERE r.download_id=d.id) AS c5 FROM downloads d WHERE d.id=?').bind(c.params.id).first();
  if (!row) throw new HttpError(404, 'Download not found', 'not_found');
  return { item: adminDownload(row, c.url.origin) };
}
async function createDownload(c) {
  const rec = await parseDownload(c, await readJson(c.request, 12000), null);
  const id = 'dl-' + rid(14), now = nowSec();
  await c.env.DB.prepare(
    `INSERT INTO downloads(id,title,description,short_description,developer,release_date,last_updated_date,supported_devices,requirements,install_instructions,notices,sort_order,feedback_enabled,file_type,version,size_bytes,storage,file_key,external_url,original_name,cover_key,cover_url,published,download_count,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`
  ).bind(id, rec.title, rec.description, rec.short_description, rec.developer, rec.release_date, rec.last_updated_date, rec.supported_devices, rec.requirements, rec.install_instructions, rec.notices, rec.sort_order, rec.feedback_enabled, rec.file_type, rec.version, rec.size_bytes, rec.storage, rec.file_key, rec.external_url, rec.original_name, rec.cover_key, rec.cover_url, rec.published, now, now).run();
  const row = await c.env.DB.prepare('SELECT * FROM downloads WHERE id=?').bind(id).first();
  return { item: adminDownload(row, c.url.origin) };
}
async function updateDownload(c) {
  const ex = await c.env.DB.prepare('SELECT * FROM downloads WHERE id=?').bind(c.params.id).first();
  if (!ex) throw new HttpError(404, 'Download not found', 'not_found');
  const rec = await parseDownload(c, await readJson(c.request, 12000), ex);
  await c.env.DB.prepare(
    `UPDATE downloads SET title=?,description=?,short_description=?,developer=?,release_date=?,last_updated_date=?,supported_devices=?,requirements=?,install_instructions=?,notices=?,sort_order=?,feedback_enabled=?,file_type=?,version=?,size_bytes=?,storage=?,file_key=?,external_url=?,original_name=?,cover_key=?,cover_url=?,published=?,updated_at=? WHERE id=?`
  ).bind(rec.title, rec.description, rec.short_description, rec.developer, rec.release_date, rec.last_updated_date, rec.supported_devices, rec.requirements, rec.install_instructions, rec.notices, rec.sort_order, rec.feedback_enabled, rec.file_type, rec.version, rec.size_bytes, rec.storage, rec.file_key, rec.external_url, rec.original_name, rec.cover_key, rec.cover_url, rec.published, nowSec(), ex.id).run();
  await removeObjects(c.env, [ex.file_key !== rec.file_key ? ex.file_key : null, ex.cover_key !== rec.cover_key ? ex.cover_key : null]);
  const row = await c.env.DB.prepare('SELECT * FROM downloads WHERE id=?').bind(ex.id).first();
  return { item: adminDownload(row, c.url.origin) };
}
async function deleteDownload(c) {
  const ex = await c.env.DB.prepare('SELECT * FROM downloads WHERE id=?').bind(c.params.id).first();
  if (!ex) throw new HttpError(404, 'Download not found', 'not_found');
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM download_feedback WHERE download_id=?').bind(ex.id), c.env.DB.prepare('DELETE FROM download_ratings WHERE download_id=?').bind(ex.id), c.env.DB.prepare('DELETE FROM downloads WHERE id=?').bind(ex.id)]);
  await removeObjects(c.env, [ex.file_key, ex.cover_key]);
  return { ok: true };
}

/* --------------------------- R2 uploads (multipart) --------------------------- */
function needR2(c) { if (!c.env.R2) throw new HttpError(503, 'R2 storage is not configured on the Worker', 'server_not_configured'); }
async function startUpload(c) {
  needR2(c);
  const b = await readJson(c.request, 2000);
  const filename = cleanStr(b.filename, 150).replace(/[^A-Za-z0-9._ -]/g, '_');
  const ext = extOf(filename), size = Number(b.size);
  if (!filename || !ALLOWED_EXT.includes(ext)) bad(`This file type is not allowed. Allowed: ${ALLOWED_EXT.join(', ')}`);
  const max = Number(c.env.MAX_UPLOAD_MB || 2048) * 1024 * 1024;
  if (!Number.isFinite(size) || size < 1) bad('File is empty');
  if (size > max) bad(`File is larger than the ${Math.round(max / 1048576)} MB upload limit`);
  const key = `files/${rid(16)}/${filename}`;
  const mp = await c.env.R2.createMultipartUpload(key, { httpMetadata: { contentType: 'application/octet-stream' } });
  return { key, uploadId: mp.uploadId, partSize: PART_SIZE, totalParts: Math.ceil(size / PART_SIZE) };
}
async function uploadPart(c) {
  needR2(c);
  const q = c.url.searchParams, key = q.get('key') || '', uploadId = q.get('uploadId') || '', n = Number(q.get('part'));
  if (!FILE_KEY_RE.test(key) || !uploadId || !Number.isInteger(n) || n < 1 || n > 10000) bad('Invalid upload part');
  const len = Number(c.request.headers.get('Content-Length') || 0);
  if (!len || len > PART_SIZE) throw new HttpError(413, 'Upload part is empty or too large', 'too_large');
  const part = await c.env.R2.resumeMultipartUpload(key, uploadId).uploadPart(n, c.request.body);
  return { partNumber: part.partNumber, etag: part.etag };
}
async function completeUpload(c) {
  needR2(c);
  const b = await readJson(c.request, 600000);
  if (!FILE_KEY_RE.test(String(b.key || '')) || !b.uploadId || !Array.isArray(b.parts) || !b.parts.length || b.parts.length > 10000) bad('Invalid upload');
  const parts = b.parts.map(p => ({ partNumber: Number(p.partNumber), etag: String(p.etag) }));
  if (parts.some(p => !Number.isInteger(p.partNumber) || p.partNumber < 1 || !p.etag)) bad('Invalid upload parts');
  const obj = await c.env.R2.resumeMultipartUpload(b.key, String(b.uploadId)).complete(parts);
  return { key: b.key, size: obj.size };
}
async function abortUpload(c) {
  needR2(c);
  const b = await readJson(c.request, 2000);
  if (FILE_KEY_RE.test(String(b.key || '')) && b.uploadId) {
    try { await c.env.R2.resumeMultipartUpload(b.key, String(b.uploadId)).abort(); } catch { /* already gone */ }
  }
  return { ok: true };
}
// Deletes an uploaded object that was never attached to a download (e.g. the admin closed the form).
async function discardObject(c) {
  needR2(c);
  const key = String((await readJson(c.request, 1000)).key || '');
  if (!FILE_KEY_RE.test(key) && !COVER_KEY_RE.test(key)) bad('Invalid storage key');
  const used = await c.env.DB.prepare('SELECT 1 AS x FROM downloads WHERE file_key=? OR cover_key=?').bind(key, key).first();
  if (!used) await c.env.R2.delete(key);
  return { ok: true, deleted: !used };
}
function sniffImage(u8) {
  if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return { ext: 'jpg', type: 'image/jpeg' };
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) return { ext: 'png', type: 'image/png' };
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 && u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) return { ext: 'webp', type: 'image/webp' };
  return null;
}
async function uploadCover(c) {
  needR2(c);
  const len = Number(c.request.headers.get('Content-Length') || 0);
  if (!len) bad('Empty image');
  if (len > 5 * 1024 * 1024) throw new HttpError(413, 'Cover image must be 5 MB or smaller', 'too_large');
  const buf = new Uint8Array(await c.request.arrayBuffer());
  if (buf.length > 5 * 1024 * 1024) throw new HttpError(413, 'Cover image must be 5 MB or smaller', 'too_large');
  const kind = sniffImage(buf);
  if (!kind) bad('Cover must be a JPG, PNG or WebP image');
  const key = `covers/${rid(20)}.${kind.ext}`;
  await c.env.R2.put(key, buf, { httpMetadata: { contentType: kind.type } });
  return { key, url: `${c.url.origin}/v1/media/${key}` };
}

/* ------------------------- download feedback moderation ------------------------- */
async function listDownloadFeedback(c) {
  const q=c.url.searchParams, status=q.get('status'), id=cleanStr(q.get('downloadId')||'',80), where=[], args=[];
  if(status==='new'||status==='reviewed'){where.push('f.status=?');args.push(status)}
  if(id){where.push('f.download_id=?');args.push(id)}
  const w=where.length?'WHERE '+where.join(' AND '):'';
  const rows=(await c.env.DB.prepare(`SELECT f.*,d.title AS download_title FROM download_feedback f LEFT JOIN downloads d ON d.id=f.download_id ${w} ORDER BY f.created_at DESC LIMIT 200`).bind(...args).all()).results||[];
  return {items:rows.map(f=>({id:f.id,downloadId:f.download_id,downloadTitle:f.download_title||f.download_id,category:f.category,message:f.message,status:f.status,createdAt:f.created_at,reviewedAt:f.reviewed_at}))};
}
async function updateDownloadFeedback(c){const b=await readJson(c.request,1000),status=oneOf(b.status,['new','reviewed'],null);if(!status)bad('Invalid feedback status');const r=await c.env.DB.prepare('UPDATE download_feedback SET status=?,reviewed_at=? WHERE id=?').bind(status,status==='reviewed'?nowSec():null,c.params.id).run();if(!r.meta?.changes)throw new HttpError(404,'Feedback not found','not_found');return {ok:true};}
async function deleteDownloadFeedback(c){await c.env.DB.prepare('DELETE FROM download_feedback WHERE id=?').bind(c.params.id).run();return {ok:true};}

/* ---------------------------------- tasks ---------------------------------- */
const adminTask = t => ({
  id: t.id, kind: t.kind, title: t.title, description: t.description, url: t.url, enabled: !!t.enabled,
  reward: t.reward, resetMode: t.reset_mode, resetHours: t.reset_hours, sortOrder: t.sort_order, completions: t.completions ?? 0
});
function parseTask(body, ex) {
  const pick = (k, d) => (body[k] === undefined ? d : body[k]);
  const kind = oneOf(pick('kind', ex?.kind), TASK_KINDS, 'custom');
  const title = cleanStr(pick('title', ex?.title), 80);
  if (!title) bad('Task title is required');
  const url = httpUrl(pick('url', ex?.url), { required: kind !== 'custom' });
  const resetMode = oneOf(pick('resetMode', ex?.reset_mode), ['inherit', 'never', 'daily', 'weekly', 'custom'], 'inherit');
  return {
    kind, title, description: cleanStr(pick('description', ex?.description), 300), url,
    enabled: toBool(pick('enabled', ex ? !!ex.enabled : true), true) ? 1 : 0,
    reward: oneOf(pick('reward', ex?.reward), ['none', 'access'], 'access'),
    reset_mode: resetMode,
    reset_hours: resetMode === 'custom' ? toInt(pick('resetHours', ex?.reset_hours), 24, 1, 8760) : null
  };
}
async function listTasks(c) {
  const rows = (await c.env.DB.prepare(
    'SELECT t.*, (SELECT COUNT(*) FROM task_completions x WHERE x.task_id=t.id) AS completions FROM tasks t ORDER BY sort_order ASC, created_at ASC'
  ).all()).results || [];
  return { tasks: rows.map(adminTask) };
}
async function createTask(c) {
  const t = parseTask(await readJson(c.request, 4000), null);
  const max = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM tasks').first();
  const id = 'task-' + rid(12), now = nowSec();
  await c.env.DB.prepare('INSERT INTO tasks(id,kind,title,description,url,enabled,reward,reset_mode,reset_hours,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, t.kind, t.title, t.description, t.url, t.enabled, t.reward, t.reset_mode, t.reset_hours, (max?.m || 0) + 10, now, now).run();
  return listTasks(c);
}
async function updateTask(c) {
  const ex = await c.env.DB.prepare('SELECT * FROM tasks WHERE id=?').bind(c.params.id).first();
  if (!ex) throw new HttpError(404, 'Task not found', 'not_found');
  const t = parseTask(await readJson(c.request, 4000), ex);
  await c.env.DB.prepare('UPDATE tasks SET kind=?,title=?,description=?,url=?,enabled=?,reward=?,reset_mode=?,reset_hours=?,updated_at=? WHERE id=?')
    .bind(t.kind, t.title, t.description, t.url, t.enabled, t.reward, t.reset_mode, t.reset_hours, nowSec(), ex.id).run();
  return listTasks(c);
}
async function deleteTask(c) {
  const id = c.params.id;
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM tasks WHERE id=?').bind(id),
    c.env.DB.prepare('DELETE FROM task_completions WHERE task_id=?').bind(id),
    c.env.DB.prepare('DELETE FROM task_opens WHERE task_id=?').bind(id)
  ]);
  return listTasks(c);
}
async function reorderTasks(c) {
  const b = await readJson(c.request, 4000);
  const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 200) : [];
  if (!ids.length) bad('No tasks to reorder');
  await c.env.DB.batch(ids.map((id, i) => c.env.DB.prepare('UPDATE tasks SET sort_order=? WHERE id=?').bind((i + 1) * 10, id)));
  return listTasks(c);
}

/* --------------------------------- feedback --------------------------------- */
const adminFeedback = f => ({ id: f.id, gameId: f.game_id, category: f.category, message: f.message, status: f.status, createdAt: f.created_at, reviewedAt: f.reviewed_at });
async function listFeedback(c) {
  const q = c.url.searchParams, where = [], args = [];
  const status = q.get('status'); if (status === 'new' || status === 'reviewed') { where.push('status=?'); args.push(status); }
  const cat = cleanStr(q.get('category') || '', 40); if (cat) { where.push('category=?'); args.push(cat); }
  const game = cleanStr(q.get('gameId') || '', 100); if (game === '__none__') where.push('game_id IS NULL'); else if (game) { where.push('game_id=?'); args.push(game); }
  const text = cleanStr(q.get('q') || '', 80); if (text) { where.push("message LIKE ? ESCAPE '\\'"); args.push('%' + text.replace(/[\\%_]/g, m => '\\' + m) + '%'); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = toInt(q.get('limit'), 25, 1, 100), offset = toInt(q.get('offset'), 0, 0, 100000);
  const [rows, total, fresh, cats, games] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM feedback ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...args, limit, offset).all(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM feedback ${w}`).bind(...args).first(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM feedback WHERE status='new'").first(),
    c.env.DB.prepare('SELECT DISTINCT category FROM feedback ORDER BY category').all(),
    c.env.DB.prepare('SELECT DISTINCT game_id FROM feedback WHERE game_id IS NOT NULL ORDER BY game_id').all()
  ]);
  return {
    items: (rows.results || []).map(adminFeedback), total: total?.n || 0, newCount: fresh?.n || 0, limit, offset,
    categories: (cats.results || []).map(r => r.category), games: (games.results || []).map(r => r.game_id)
  };
}
async function getFeedback(c) {
  const f = await c.env.DB.prepare('SELECT * FROM feedback WHERE id=?').bind(c.params.id).first();
  if (!f) throw new HttpError(404, 'Feedback not found', 'not_found');
  return { item: adminFeedback(f) };
}
async function setFeedbackStatus(c) {
  const b = await readJson(c.request, 500);
  const status = oneOf(b.status, ['new', 'reviewed'], null);
  if (!status) bad('Invalid status');
  const r = await c.env.DB.prepare('UPDATE feedback SET status=?, reviewed_at=? WHERE id=?').bind(status, status === 'reviewed' ? nowSec() : null, c.params.id).run();
  if (!(r.meta?.changes > 0)) throw new HttpError(404, 'Feedback not found', 'not_found');
  return getFeedback(c);
}
async function deleteFeedback(c) {
  await c.env.DB.prepare('DELETE FROM feedback WHERE id=?').bind(c.params.id).run();
  return { ok: true };
}
async function bulkFeedback(c) {
  const b = await readJson(c.request, 8000);
  const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 100) : [];
  const action = oneOf(b.action, ['reviewed', 'new', 'delete'], null);
  if (!ids.length || !action) bad('Choose feedback and an action');
  const db = c.env.DB;
  await db.batch(ids.map(id => action === 'delete'
    ? db.prepare('DELETE FROM feedback WHERE id=?').bind(id)
    : db.prepare('UPDATE feedback SET status=?, reviewed_at=? WHERE id=?').bind(action, action === 'reviewed' ? nowSec() : null, id)));
  return { ok: true, count: ids.length };
}
async function runCleanup(c) { await cleanup(c, true); return { ok: true }; }

export const adminRoutes = [
  ['GET', '/v1/admin/overview', overview],
  ['GET', '/v1/admin/config', getCfg],
  ['PUT', '/v1/admin/config', putCfg],
  ['GET', '/v1/admin/game-stats', gameStatsList],
  ['DELETE', '/v1/admin/game-stats/:id', resetGameStats],
  ['GET', '/v1/admin/downloads', listDownloads],
  ['GET', '/v1/admin/downloads/:id', getDownloadAdmin],
  ['POST', '/v1/admin/downloads', createDownload],
  ['PUT', '/v1/admin/downloads/:id', updateDownload],
  ['DELETE', '/v1/admin/downloads/:id', deleteDownload],
  ['GET', '/v1/admin/download-feedback', listDownloadFeedback],
  ['PUT', '/v1/admin/download-feedback/:id', updateDownloadFeedback],
  ['DELETE', '/v1/admin/download-feedback/:id', deleteDownloadFeedback],
  ['POST', '/v1/admin/uploads', startUpload],
  ['PUT', '/v1/admin/uploads/part', uploadPart],
  ['POST', '/v1/admin/uploads/complete', completeUpload],
  ['POST', '/v1/admin/uploads/abort', abortUpload],
  ['POST', '/v1/admin/uploads/discard', discardObject],
  ['PUT', '/v1/admin/cover', uploadCover],
  ['GET', '/v1/admin/tasks', listTasks],
  ['POST', '/v1/admin/tasks', createTask],
  ['PUT', '/v1/admin/tasks-order', reorderTasks],
  ['PUT', '/v1/admin/tasks/:id', updateTask],
  ['DELETE', '/v1/admin/tasks/:id', deleteTask],
  ['GET', '/v1/admin/feedback', listFeedback],
  ['POST', '/v1/admin/feedback/bulk', bulkFeedback],
  ['GET', '/v1/admin/feedback/:id', getFeedback],
  ['PUT', '/v1/admin/feedback/:id', setFeedbackStatus],
  ['DELETE', '/v1/admin/feedback/:id', deleteFeedback],
  ['POST', '/v1/admin/maintenance/cleanup', runCleanup]
];
