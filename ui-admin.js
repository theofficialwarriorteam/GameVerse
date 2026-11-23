// Admin feature panels backed by the GAMEVERSE API Worker.
import { state, $, $$, esc, toast, confirmDialog, openModal, fmtNum, timeAgo, setBusy, isValidUrl } from './core.js';
import { api, apiBase, apiConfigured, loadConfig } from './api.js';
import { mountDownloads } from './ui-admin-downloads.js';
import { configureAudio, previewMusic, stopPreview, toggleMusicPlayback, toggleMusicMute } from './audio.js';

const A = (path, opts = {}) => api(path, { auth: 'admin', ...opts });
const enc = encodeURIComponent;
const sw = (attrs, checked) => `<label class="switch"><input type="checkbox" ${attrs} ${checked ? 'checked' : ''}><span class="slider"></span></label>`;
const gameTitle = id => state.games.find(g => g.id === id)?.title || null;

const FEATURES = [
  ['downloads', 'Download manager', 'Public Downloads page and download links.'],
  ['visitorStats', 'Visitor analytics', 'Counts unique visitors (total and today).'],
  ['onlineTracking', 'Online visitor tracking', 'Live “currently online” counter (heartbeat based).'],
  ['gameAnalytics', 'Game analytics', 'Page views and Play Now clicks per game.'],
  ['homepageStats', 'Homepage statistics', 'Show the statistics section on the homepage.'],
  ['ratings', 'Star ratings', 'Community ratings on game pages.'],
  ['feedback', 'Feedback', 'Visitor feedback forms.'],
  ['tasks', 'Task system', 'Community tasks and completion tracking.'],
  ['rewardedAds', 'Rewarded ads', 'Temporary access after verified rewarded ads (needs an ad provider).']
];

function setup(root, rerender) {
  root.innerHTML = `<div class="panel state-box"><h3>Connect the GameVerse server</h3><p>${apiConfigured() ? 'The server did not respond.' : 'These features run on a Cloudflare Worker that hasn’t been connected yet.'} Follow <b>worker/README.md</b> to deploy it, then paste its URL here.</p><form id="api-form" class="inline-form"><input class="field" name="url" type="url" required placeholder="https://gameverse-api.yourname.workers.dev" value="${esc(state.settings.features?.statsApiUrl || '')}"><button class="btn btn-primary btn-small">SAVE &amp; CONNECT</button></form></div>`;
  $('#api-form').onsubmit = async e => {
    e.preventDefault(); const url = new FormData(e.currentTarget).get('url').trim().replace(/\/+$/, '');
    if (!/^https:\/\//.test(url) && !/^http:\/\/localhost/.test(url)) return toast('Enter the https:// URL of your Worker.', 'error');
    state.settings.features = { ...(state.settings.features || {}), statsApiUrl: url };
    try { await rerender.persist(); await loadConfig(); toast(state.apiStatus === 'ok' ? 'Connected to the GameVerse server.' : 'Saved, but the server did not answer yet.', state.apiStatus === 'ok' ? 'success' : 'error'); rerender(); } catch { /* persist already toasted */ }
  };
}
const failBox = (root, e, rerender) => { if (!root.isConnected) return; root.innerHTML = `<div class="panel state-box"><h3>Couldn’t load this section</h3><p>${esc(e.message)}</p>${e.status === 401 ? '<p>Your session may have expired — log out and sign in again.</p>' : ''}<button class="btn btn-small" id="retry">TRY AGAIN</button></div>`; root.querySelector('#retry').onclick = rerender; };

export async function mountAdminFeature(tab, rerender) {
  const root = $('#admin-feature-root'); if (!root) return;
  if (tab !== 'features' && state.apiStatus !== 'ok') {
    if (apiConfigured()) await loadConfig();
    if (state.apiStatus !== 'ok') return setup(root, rerender);
  }
  try {
    if (tab === 'overview') return await overview(root, rerender);
    if (tab === 'downloads') return await mountDownloads(root, { persist: rerender.persist, rerender });
    if (tab === 'tasks') return await tasks(root, rerender);
    if (tab === 'features') return await features(root, rerender);
    if (tab === 'rewarded') return await rewarded(root, rerender);
    if (tab === 'feedback') return await feedback(root, rerender);
    if (tab === 'audio') return await audioSettings(root, rerender);
  } catch (e) { failBox(root, e, rerender); }
}


/* ============================ background music & UI sound ============================ */
async function audioSettings(root, rerender) {
  const { config: cfg } = await A('/v1/admin/config');
  const a = { enabled:false, musicUrl:'', musicTitle:'', musicVolume:35, uiSoundsEnabled:true, uiSoundsVolume:22, ...(cfg.audio||{}) };
  root.innerHTML = `<div class="panel">
    <h3>BACKGROUND MUSIC &amp; SOUND SETTINGS</h3>
    <p class="section-sub">Manage website music and interface sounds. Website audio is automatically silent inside the GameVerse game player.</p>
    <form id="gv-audio-form" class="form-grid">
      <div class="form-row full"><label for="gv-audio-file">UPLOAD BACKGROUND MUSIC (MP3 · MAX 15 MB)</label><input class="field" id="gv-audio-file" type="file" accept=".mp3,audio/mpeg"><small class="muted-note left">Uploads use your existing Cloudinary image-host configuration. No R2 or paid storage is added.</small></div>
      <div class="form-row full"><label for="gv-audio-url">OR EXTERNAL HTTPS MP3 URL</label><input class="field" id="gv-audio-url" name="musicUrl" type="url" placeholder="https://example.com/music.mp3" value="${esc(a.musicUrl)}"></div>
      <div class="form-row full"><label for="gv-audio-title">MUSIC TITLE / FILENAME</label><input class="field" id="gv-audio-title" name="musicTitle" maxlength="120" value="${esc(a.musicTitle)}" placeholder="GameVerse background music"></div>
      <div class="form-row"><label class="check-row"><input type="checkbox" name="enabled" ${a.enabled?'checked':''}> Background music ON</label></div>
      <div class="form-row"><label for="gv-audio-volume">DEFAULT MUSIC VOLUME <output id="gv-audio-vol-out">${a.musicVolume}%</output></label><input class="field" id="gv-audio-volume" name="musicVolume" type="range" min="0" max="100" value="${a.musicVolume}"></div>
      <div class="form-row"><label class="check-row"><input type="checkbox" name="uiSoundsEnabled" ${a.uiSoundsEnabled?'checked':''}> UI sound effects ON</label></div>
      <div class="form-row"><label for="gv-ui-volume">UI SOUND VOLUME <output id="gv-ui-vol-out">${a.uiSoundsVolume}%</output></label><input class="field" id="gv-ui-volume" name="uiSoundsVolume" type="range" min="0" max="100" value="${a.uiSoundsVolume}"></div>
      <div class="form-row full"><div class="row-actions"><button type="button" class="btn btn-small" id="gv-audio-preview">▶ PREVIEW MUSIC</button><button type="button" class="btn btn-small" id="gv-audio-stop">■ STOP PREVIEW</button><button type="button" class="btn btn-small" id="gv-audio-live">▶ / ❚❚ WEBSITE MUSIC</button><button type="button" class="btn btn-small" id="gv-audio-mute">MUTE / UNMUTE</button></div><small id="gv-audio-current" class="muted-note left">Current track: ${esc(a.musicTitle || (a.musicUrl ? 'Background music' : 'No music uploaded'))}</small></div>
      <div class="form-row full"><div class="row-actions"><button class="btn btn-primary" type="submit">SAVE AUDIO SETTINGS</button><button class="btn btn-ghost" type="button" id="gv-audio-reset">RESTORE DEFAULTS</button></div></div>
    </form>
  </div>
  <div class="panel"><h3>PLAYER AUDIO RULE</h3><p class="section-sub">When a visitor enters #play/<game-id>, GameVerse pauses its background music and disables all website sound effects. On exit, music resumes only if it was playing before the game opened. Game audio is not controlled.</p></div>`;
  const form = $('#gv-audio-form'), file = $('#gv-audio-file'), url = $('#gv-audio-url'), title = $('#gv-audio-title');
  const musicVol = $('#gv-audio-volume'), uiVol = $('#gv-ui-volume');
  musicVol.oninput = () => { $('#gv-audio-vol-out').textContent = `${musicVol.value}%`; configureAudio({...a,musicVolume:+musicVol.value,uiSoundsVolume:+uiVol.value}); };
  uiVol.oninput = () => { $('#gv-ui-vol-out').textContent = `${uiVol.value}%`; configureAudio({...a,musicVolume:+musicVol.value,uiSoundsVolume:+uiVol.value}); };
  async function uploadSelectedAudio(){
    const f=file.files?.[0]; if(!f)return url.value.trim()||a.musicUrl;
    if(f.size>15*1024*1024||!(f.type==='audio/mpeg'||/\.mp3$/i.test(f.name)))throw new Error('Choose an MP3 file up to 15 MB.');
    const h=state.settings.imageHost||{},cloud=String(h.cloudName||'').trim(),preset=String(h.uploadPreset||'').trim();
    if(!cloud||!preset)throw new Error('Configure Cloudinary in Image Library & Hosting before uploading MP3 files. You can still use an HTTPS MP3 URL.');
    toast('Uploading audio…');const fd=new FormData();fd.append('file',f);fd.append('upload_preset',preset);if(h.folder)fd.append('folder',`${h.folder}/audio`);
    const r=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/video/upload`,{method:'POST',body:fd});const d=await r.json();
    if(!r.ok||!d.secure_url)throw new Error(d.error?.message||'Audio upload failed.');
    url.value=d.secure_url;title.value=f.name;$('#gv-audio-current').textContent=`Uploaded: ${f.name}`;file.value='';return d.secure_url;
  }
  $('#gv-audio-preview').onclick = async () => {
    try { const src=await uploadSelectedAudio(); if(!/^https:\/\//i.test(src))return toast('Add an HTTPS MP3 URL or upload a file first.','error'); previewMusic(src); }
    catch(e){toast(e.message,'error');}
  };
  $('#gv-audio-stop').onclick = stopPreview;
  $('#gv-audio-live').onclick = async () => { const playing=await toggleMusicPlayback(); toast(playing?'Website music playing.':'Website music paused.', 'info'); };
  $('#gv-audio-mute').onclick = () => { const unmuted=toggleMusicMute(); toast(unmuted?'Website music unmuted.':'Website music muted.', 'info'); };
  $('#gv-audio-reset').onclick = async () => {
    form.elements.enabled.checked=false; url.value=''; title.value=''; musicVol.value=35; uiVol.value=22;
    form.elements.uiSoundsEnabled.checked=true; musicVol.oninput();uiVol.oninput();
    try { const r=await A('/v1/admin/config',{method:'PUT',body:{audio:{enabled:false,musicUrl:'',musicTitle:'',musicVolume:35,uiSoundsEnabled:true,uiSoundsVolume:22}}}); configureAudio(r.config.audio); toast('Audio settings restored to defaults.','success'); rerender(); } catch(e){toast(e.message,'error');}
  };
  form.onsubmit = async e => {
    e.preventDefault(); let src=url.value.trim();
    try { if(file.files?.[0])src=await uploadSelectedAudio(); } catch(err){return toast(err.message,'error');}
    if(src && !/^https:\/\//i.test(src))return toast('Music URL must start with HTTPS.','error');
    const body={audio:{enabled:form.elements.enabled.checked,musicUrl:src,musicTitle:title.value.trim(),musicVolume:+musicVol.value,uiSoundsEnabled:form.elements.uiSoundsEnabled.checked,uiSoundsVolume:+uiVol.value}};
    try { const r=await A('/v1/admin/config',{method:'PUT',body}); configureAudio(r.config.audio); stopPreview(); toast('Audio settings saved successfully.','success'); rerender(); }
    catch(err){toast(err.message,'error');}
  };
}

/* ============================ overview & analytics ============================ */
async function loadDownloadFeedback() {
  const box = $('#dlfb-admin'); if (!box) return;
  box.innerHTML = `<h3>DOWNLOAD FEEDBACK</h3><p class="section-sub">Reports and comments linked to individual downloads.</p><div class="toolbar"><select id="dlfb-status" class="field"><option value="">All status</option><option value="new">New</option><option value="reviewed">Reviewed</option></select><select id="dlfb-item" class="field"><option value="">All downloads</option></select></div><div id="dlfb-list"></div>`;
  let all = [];
  try { const [r, ds] = await Promise.all([A('/v1/admin/download-feedback'), A('/v1/admin/downloads')]); all = r.items; $('#dlfb-item').innerHTML = '<option value="">All downloads</option>' + ds.items.map(d => `<option value="${esc(d.id)}">${esc(d.title)}</option>`).join(''); }
  catch (e) { $('#dlfb-list').innerHTML = `<p class="fb-err">${esc(e.message)}</p>`; return; }
  const draw = () => { const status = $('#dlfb-status').value, item = $('#dlfb-item').value, rows = all.filter(f => (!status || f.status === status) && (!item || f.downloadId === item)); $('#dlfb-list').innerHTML = rows.length ? `<div class="table-wrap"><table class="gv-table"><thead><tr><th>Status</th><th>Download</th><th>Category</th><th>Message</th><th>Received</th><th>Actions</th></tr></thead><tbody>${rows.map(f => `<tr><td>${f.status === 'new' ? 'NEW' : 'REVIEWED'}</td><td>${esc(f.downloadTitle)}</td><td>${esc(f.category)}</td><td>${esc(f.message)}</td><td>${timeAgo(f.createdAt)}</td><td><button class="btn btn-small" data-dlfb-review="${esc(f.id)}">${f.status === 'new' ? 'REVIEW' : 'MARK NEW'}</button> <button class="btn btn-small btn-danger" data-dlfb-delete="${esc(f.id)}">DELETE</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No download feedback matches.</div>'; };
  $('#dlfb-status').onchange = draw; $('#dlfb-item').onchange = draw;
  box.onclick = async e => { const rv = e.target.closest('[data-dlfb-review]'), del = e.target.closest('[data-dlfb-delete]'); if (rv) { const f = all.find(x => x.id === rv.dataset.dlfbReview); try { await A(`/v1/admin/download-feedback/${enc(f.id)}`, { method: 'PUT', body: { status: f.status === 'new' ? 'reviewed' : 'new' } }); toast('Download feedback updated.', 'success'); loadDownloadFeedback(); } catch (err) { toast(err.message, 'error'); } } if (del) { if (!await confirmDialog('Delete this download feedback?', { danger: true, confirmText: 'Delete' })) return; try { await A(`/v1/admin/download-feedback/${enc(del.dataset.dlfbDelete)}`, { method: 'DELETE' }); toast('Feedback deleted.', 'success'); loadDownloadFeedback(); } catch (err) { toast(err.message, 'error'); } } };
  draw();
}

async function overview(root, rerender) {
  root.innerHTML = '<div class="stat-grid admin">' + Array(8).fill('<div class="stat-card"><div class="stat-body"><span class="stat-label skel">xxxxxxxx</span><strong class="stat-value skel">0000</strong></div></div>').join('') + '</div>';
  const [o, gs] = await Promise.all([A('/v1/admin/overview'), A('/v1/admin/game-stats')]);
  if (!root.isConnected) return; // the admin switched tabs while loading
  const warn = [];
  if (!o.status.tokenSecret) warn.push('TOKEN_SECRET is not set — download links and ticketing will fail. Run <code>wrangler secret put TOKEN_SECRET</code>.');
  if (!o.status.externalDownloadsOnly) warn.push('External download links are the only supported download source.');
  const tile = (label, val, sub) => `<div class="stat-card"><div class="stat-body"><span class="stat-label">${label}</span><strong class="stat-value">${val}</strong><small>${sub || ''}</small></div></div>`;
  const stats = Object.fromEntries(gs.games.map(g => [g.gameId, g]));
  const rows = [...state.games.map(g => ({ id: g.id, title: g.title, live: true, s: stats[g.id] })), ...gs.games.filter(g => !state.games.some(x => x.id === g.gameId)).map(g => ({ id: g.gameId, title: g.gameId, live: false, s: g }))];
  root.innerHTML = `${warn.map(w => `<div class="notice warn">${w}</div>`).join('')}
   <div class="stat-grid admin">
    ${tile('Total visitors', fmtNum(o.visitors.total), 'unique browsers')}${tile("Today's visitors", fmtNum(o.visitors.today), `time zone: ${esc(o.status.timezone)}`)}${tile('Online now', fmtNum(o.visitors.online), `active in last ${Math.round(o.visitors.onlineWindowSeconds / 60 * 10) / 10} min`)}
    ${tile('Game page views', fmtNum(o.games.views), 'deduplicated per visitor')}${tile('Play Now clicks', fmtNum(o.games.plays), 'not verified gameplay')}${tile('Ratings', fmtNum(o.games.ratingCount), o.games.ratingCount ? `average ${o.games.ratingAverage.toFixed(2)} / 5` : 'none yet')}
    ${tile('Download button clicks', fmtNum(o.downloads.clicks), `${o.downloads.published} of ${o.downloads.total} published · ${fmtNum(o.downloads.fileRequests)} file requests`)}${tile('New feedback', fmtNum(o.feedback.new), `${o.feedback.total} total`)}
    ${tile('Task completions', fmtNum(o.tasks.completionRecords), 'self-confirmed, active records')}${tile('Ad unlocks (7d)', fmtNum(o.ads.last7days.unlocksGranted), `${o.ads.last7days.completed} verified · ${o.ads.last7days.failed} failed · ${o.ads.last7days.cancelled} cancelled`)}${tile('Games in library', state.games.length, `${state.games.filter(g => g.published).length} published`)}
   </div>
   <div class="panel"><div class="panel-head"><div><h3>PER-GAME ANALYTICS</h3><p class="section-sub">Views count once per visitor per 30 min. Play Now clicks ignore double-clicks. Admin and bot traffic is excluded.</p></div><input id="gs-q" class="field search" style="max-width:240px" type="search" placeholder="Filter games…" aria-label="Filter games"></div><div id="gs-table"></div></div>`;
  const paint = () => {
    const q = $('#gs-q').value.trim().toLowerCase();
    const list = rows.filter(r => r.title.toLowerCase().includes(q)).sort((a, b) => (b.s?.plays || 0) - (a.s?.plays || 0));
    $('#gs-table').innerHTML = list.length ? `<div class="table-wrap"><table class="gv-table"><thead><tr><th>Game</th><th>Page views</th><th>Play Now clicks</th><th>Rating</th><th>Ratings</th><th></th></tr></thead><tbody>${list.map(r => `<tr><td><strong>${esc(r.title)}</strong>${r.live ? '' : '<small>no longer in library</small>'}</td><td>${fmtNum(r.s?.views || 0)}</td><td>${fmtNum(r.s?.plays || 0)}</td><td>${r.s?.rating.count ? r.s.rating.average.toFixed(2) : '—'}</td><td>${fmtNum(r.s?.rating.count || 0)}</td><td>${r.s ? `<button class="btn btn-small btn-danger" data-reset="${esc(r.id)}">RESET</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No games match.</div>';
  };
  paint(); $('#gs-q').oninput = paint;
  $('#gs-table').onclick = async e => {
    const b = e.target.closest('[data-reset]'); if (!b) return;
    if (!await confirmDialog('This permanently deletes this game’s views, plays and all of its ratings.', { title: 'Reset statistics?', confirmText: 'Reset', danger: true })) return;
    try { await A(`/v1/admin/game-stats/${enc(b.dataset.reset)}`, { method: 'DELETE' }); toast('Statistics reset.', 'success'); rerender(); } catch (err) { toast(err.message, 'error'); }
  };
}

/* ================================ feature controls ================================ */
async function features(root, rerender) {
  const connected = apiConfigured();
  let cfg = null, status = null;
  if (connected && state.apiStatus === 'ok') { try { [cfg, status] = await Promise.all([A('/v1/admin/config').then(r => r.config), A('/v1/admin/overview').then(r => r.status)]); } catch (e) { toast(e.message, 'error'); } }
  if (!root.isConnected) return;
  root.innerHTML = `<div class="panel"><h3>SERVER CONNECTION</h3><p class="section-sub">Ratings, analytics, feedback, tasks, downloads and rewarded ads run on your GAMEVERSE Cloudflare Worker.</p>
   <div class="conn ${cfg ? 'ok' : 'bad'}"><span class="live-dot ${cfg ? '' : 'off'}"></span>${cfg ? 'Connected' : connected ? 'Not reachable' : 'Not connected'}${status ? ` · External links only · TOKEN_SECRET ${status.tokenSecret ? 'set' : 'MISSING'}` : ''}</div>
   <form id="api-form" class="inline-form"><input class="field" name="url" type="url" placeholder="https://gameverse-api.yourname.workers.dev" aria-label="Worker URL" value="${esc(state.settings.features?.statsApiUrl || '')}"><button class="btn btn-primary btn-small">SAVE &amp; TEST</button></form></div>
   ${cfg ? `<div class="panel"><h3>FEATURE ON / OFF</h3><p class="section-sub">Every switch saves instantly and takes effect on the public site within seconds (server-enforced, not just hidden).</p><div class="feature-grid">${FEATURES.map(([k, t, d]) => `<div class="feature-card"><div><strong>${t}</strong><small>${d}</small></div>${sw(`data-feature="${k}"`, cfg.features[k])}</div>`).join('')}</div></div>` : ''}`;
  $('#api-form').onsubmit = async e => {
    e.preventDefault(); const url = new FormData(e.currentTarget).get('url').trim().replace(/\/+$/, '');
    if (url && !/^https:\/\//.test(url) && !/^http:\/\/localhost/.test(url)) return toast('Enter the https:// URL of your Worker.', 'error');
    state.settings.features = { ...(state.settings.features || {}), statsApiUrl: url };
    try { await rerender.persist(); await loadConfig(); toast(state.apiStatus === 'ok' ? 'Connected to the GameVerse server.' : 'Saved, but the server did not answer.', state.apiStatus === 'ok' ? 'success' : 'error'); rerender(); } catch { /* toasted */ }
  };
  root.onchange = async e => {
    const i = e.target.closest('[data-feature]'); if (!i) return;
    i.disabled = true;
    try { const r = await A('/v1/admin/config', { method: 'PUT', body: { features: { [i.dataset.feature]: i.checked } } }); cfg = r.config; await loadConfig(); toast(`${FEATURES.find(f => f[0] === i.dataset.feature)[1]} turned ${i.checked ? 'ON' : 'OFF'}.`, 'success'); }
    catch (err) { i.checked = !i.checked; toast(err.message, 'error'); }
    i.disabled = false;
  };
}

/* ================================ tasks & access ================================ */
const KINDS = { youtube_visit: ['Visit our YouTube channel', 'Open our channel on YouTube.'], youtube_subscribe: ['Subscribe to our channel', 'Subscribe so you never miss a new game.'], youtube_watch: ['Watch a video', 'Watch one of our latest videos.'], youtube_like: ['Like a video', 'Give our latest video a like.'], youtube_comment: ['Comment on a video', 'Leave a comment on our latest video.'], discord: ['Join our Discord', 'Join the community server.'], custom: ['', ''] };
const KIND_LABEL = { youtube_visit: 'YouTube · visit', youtube_subscribe: 'YouTube · subscribe', youtube_watch: 'YouTube · watch', youtube_like: 'YouTube · like', youtube_comment: 'YouTube · comment', discord: 'Discord', custom: 'Custom' };
async function tasks(root, rerender) {
  const [{ config: cfg }, { tasks: list0 }] = await Promise.all([A('/v1/admin/config'), A('/v1/admin/tasks')]);
  if (!root.isConnected) return;
  let list = list0;
  const draw = () => {
    root.innerHTML = `<div class="panel"><div class="panel-head"><div><h3>TASK SYSTEM</h3><p class="section-sub">Visitors complete tasks and confirm them. Because YouTube and Discord actions can’t be checked automatically, tasks are <b>self-confirmed</b> — the site says so honestly. A short wait after opening the link makes blind clicking harder.</p></div><div class="master"><span>${cfg.features.tasks ? 'ON' : 'OFF'}</span>${sw('id="tasks-master"', cfg.features.tasks)}</div></div>
     <form id="task-cfg" class="form-grid">
      <div class="form-row"><label for="tc-scope">Unlock gate</label><select id="tc-scope" class="field" name="scope"><option value="site" ${cfg.access.scope === 'site' ? 'selected' : ''}>Whole site — visitors need access to browse</option><option value="downloads" ${cfg.access.scope === 'downloads' ? 'selected' : ''}>Downloads only — enforced on the server</option><option value="off" ${cfg.access.scope === 'off' ? 'selected' : ''}>Off — tasks are optional</option></select><small class="hint">Only tasks marked “Required” count toward the unlock.</small></div>
      <div class="form-row"><label for="tc-hours">Access lasts (hours)</label><input id="tc-hours" class="field" type="number" min="1" max="8760" name="accessHours" value="${cfg.tasks.accessHours}"></div>
      <div class="form-row"><label for="tc-mode">Completion resets</label><select id="tc-mode" class="field" name="resetMode">${[['never', 'Never'], ['daily', 'Daily (midnight)'], ['weekly', 'Weekly (Monday)'], ['custom', 'Custom interval']].map(([v, t]) => `<option value="${v}" ${cfg.tasks.resetMode === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="form-row" id="tc-custom" ${cfg.tasks.resetMode === 'custom' ? '' : 'hidden'}><label for="tc-rh">Custom interval (hours)</label><input id="tc-rh" class="field" type="number" min="1" max="8760" name="resetHours" value="${cfg.tasks.resetHours}"></div>
      <div class="form-row"><label for="tc-min">Minimum seconds before confirming</label><input id="tc-min" class="field" type="number" min="0" max="300" name="minSeconds" value="${cfg.tasks.minSeconds}"></div>
      <div class="form-row full"><button class="btn btn-primary btn-small">SAVE TASK SETTINGS</button></div></form></div>
     <div class="panel"><div class="panel-head"><h3>TASKS</h3><button class="btn btn-primary btn-small" id="task-add">＋ ADD TASK</button></div>
      ${list.length ? `<div class="table-wrap"><table class="gv-table"><thead><tr><th>Task</th><th>Reward</th><th>Resets</th><th>Done</th><th>On</th><th>Order</th><th></th></tr></thead><tbody>${list.map((t, i) => `<tr><td><strong>${esc(t.title)}</strong><small>${KIND_LABEL[t.kind] || t.kind} · ${esc((t.url || '').replace(/^https?:\/\//, '').slice(0, 38))}</small></td><td><span class="pill ${t.reward === 'access' ? 'on' : ''}">${t.reward === 'access' ? 'Required' : 'Optional'}</span></td><td>${t.resetMode === 'inherit' ? 'default' : t.resetMode === 'custom' ? t.resetHours + 'h' : t.resetMode}</td><td>${fmtNum(t.completions)}</td><td>${sw(`data-ton="${t.id}"`, t.enabled)}</td><td class="row-actions"><button class="btn btn-small" data-up="${t.id}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button class="btn btn-small" data-down="${t.id}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button></td><td class="row-actions"><button class="btn btn-small" data-tedit="${t.id}">EDIT</button><button class="btn btn-small btn-danger" data-tdel="${t.id}">DELETE</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty state-box"><h3>No tasks yet</h3><p>Add a task such as “Join our Discord”.</p></div>'}</div>`;
    $('#tc-mode').onchange = e => { $('#tc-custom').hidden = e.target.value !== 'custom'; };
    $('#tasks-master').onchange = async e => { try { await A('/v1/admin/config', { method: 'PUT', body: { features: { tasks: e.target.checked } } }); cfg.features.tasks = e.target.checked; await loadConfig(); toast(`Task system turned ${e.target.checked ? 'ON' : 'OFF'}.`, 'success'); draw(); } catch (err) { e.target.checked = !e.target.checked; toast(err.message, 'error'); } };
    $('#task-cfg').onsubmit = async e => {
      e.preventDefault(); const d = new FormData(e.currentTarget);
      try { const r = await A('/v1/admin/config', { method: 'PUT', body: { access: { scope: d.get('scope') }, tasks: { accessHours: +d.get('accessHours'), resetMode: d.get('resetMode'), resetHours: +d.get('resetHours') || cfg.tasks.resetHours, minSeconds: +d.get('minSeconds') } } }); Object.assign(cfg, r.config); await loadConfig(); toast('Task settings saved.', 'success'); } catch (err) { toast(err.message, 'error'); }
    };
    $('#task-add').onclick = () => form(null);
  };
  const setList = r => { list = r.tasks; draw(); };
  root.onchange = async e => {
    const i = e.target.closest('[data-ton]'); if (!i) return; i.disabled = true;
    try { setList(await A(`/v1/admin/tasks/${enc(i.dataset.ton)}`, { method: 'PUT', body: { enabled: i.checked } })); toast(i.checked ? 'Task enabled.' : 'Task disabled.', 'success'); } catch (err) { i.checked = !i.checked; i.disabled = false; toast(err.message, 'error'); }
  };
  root.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const move = async (id, d) => { const ids = list.map(t => t.id), i = ids.indexOf(id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; try { setList(await A('/v1/admin/tasks-order', { method: 'PUT', body: { ids } })); } catch (err) { toast(err.message, 'error'); } };
    if (b.dataset.up) move(b.dataset.up, -1); else if (b.dataset.down) move(b.dataset.down, 1);
    else if (b.dataset.tedit) form(list.find(t => t.id === b.dataset.tedit));
    else if (b.dataset.tdel) {
      const t = list.find(x => x.id === b.dataset.tdel);
      if (!await confirmDialog(`“${t.title}” and all visitors’ progress on it will be deleted.`, { title: 'Delete task?', confirmText: 'Delete', danger: true })) return;
      try { setList(await A(`/v1/admin/tasks/${enc(t.id)}`, { method: 'DELETE' })); toast('Task deleted.', 'success'); } catch (err) { toast(err.message, 'error'); }
    }
  };
  function form(t) {
    const m = openModal(`<h3>${t ? 'EDIT TASK' : 'ADD TASK'}</h3><form id="tk-form" class="form-grid" novalidate>
      <div class="form-row"><label for="tk-kind">Task type</label><select id="tk-kind" class="field" name="kind">${Object.keys(KINDS).map(k => `<option value="${k}" ${(t?.kind || 'custom') === k ? 'selected' : ''}>${KIND_LABEL[k]}</option>`).join('')}</select></div>
      <div class="form-row"><label for="tk-reward">Reward</label><select id="tk-reward" class="field" name="reward"><option value="access" ${(t?.reward || 'access') === 'access' ? 'selected' : ''}>Required for access unlock</option><option value="none" ${t?.reward === 'none' ? 'selected' : ''}>Optional (no unlock reward)</option></select></div>
      <div class="form-row full"><label for="tk-title">Title *</label><input id="tk-title" class="field" name="title" maxlength="80" required value="${esc(t?.title || '')}"></div>
      <div class="form-row full"><label for="tk-desc">Description</label><textarea id="tk-desc" class="field" name="description" maxlength="300" rows="2">${esc(t?.description || '')}</textarea></div>
      <div class="form-row full"><label for="tk-url">Task link</label><input id="tk-url" class="field" name="url" type="url" placeholder="https://…" value="${esc(t?.url || '')}"></div>
      <div class="form-row"><label for="tk-rm">Reset interval</label><select id="tk-rm" class="field" name="resetMode">${[['inherit', 'Use the global setting'], ['never', 'Never'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['custom', 'Custom hours']].map(([v, l]) => `<option value="${v}" ${(t?.resetMode || 'inherit') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="form-row" id="tk-rh-row" ${t?.resetMode === 'custom' ? '' : 'hidden'}><label for="tk-rh">Hours</label><input id="tk-rh" class="field" name="resetHours" type="number" min="1" max="8760" value="${t?.resetHours || 24}"></div>
      <div class="form-row full"><label class="check"><input type="checkbox" name="enabled" ${t ? (t.enabled ? 'checked' : '') : 'checked'}> Enabled</label></div>
      <div class="form-row full"><div class="fb-err" id="tk-err" role="alert"></div><div class="gv-modal-actions"><button type="button" class="btn btn-ghost" id="tk-cancel">CANCEL</button><button class="btn btn-primary" id="tk-save">${t ? 'SAVE' : 'ADD TASK'}</button></div></div></form>`);
    const q = s => m.el.querySelector(s);
    q('#tk-cancel').onclick = m.close; q('#tk-rm').onchange = e => { q('#tk-rh-row').hidden = e.target.value !== 'custom'; };
    q('#tk-kind').onchange = e => { const [ti, de] = KINDS[e.target.value]; if (!q('#tk-title').value.trim() && ti) q('#tk-title').value = ti; if (!q('#tk-desc').value.trim() && de) q('#tk-desc').value = de; };
    q('#tk-form').onsubmit = async e => {
      e.preventDefault(); const d = new FormData(e.currentTarget), url = String(d.get('url')).trim();
      if (!String(d.get('title')).trim()) return (q('#tk-err').textContent = 'Please enter a title.');
      if (url && !isValidUrl(url)) return (q('#tk-err').textContent = 'Enter a valid link starting with https://');
      if (!url && d.get('kind') !== 'custom') return (q('#tk-err').textContent = 'This task type needs a link.');
      const body = { kind: d.get('kind'), title: d.get('title'), description: d.get('description'), url, reward: d.get('reward'), enabled: d.has('enabled'), resetMode: d.get('resetMode'), resetHours: +d.get('resetHours') || 24 };
      setBusy(q('#tk-save'), true, 'SAVING…');
      try { setList(await A(t ? `/v1/admin/tasks/${enc(t.id)}` : '/v1/admin/tasks', { method: t ? 'PUT' : 'POST', body })); m.close(); toast(t ? 'Task updated.' : 'Task added.', 'success'); }
      catch (err) { setBusy(q('#tk-save'), false); q('#tk-err').textContent = err.message; }
    };
  }
  draw();
}

/* ================================== rewarded ads ================================== */
async function rewarded(root, rerender) {
  const [{ config: cfg }, { status, ads }] = await Promise.all([A('/v1/admin/config'), A('/v1/admin/overview').then(o => ({ status: o.status, ads: o.ads.last7days }))]);
  if (!root.isConnected) return;
  const reasons = [];
  if (!cfg.ads.launchUrl) reasons.push('Add the ad launch URL from your provider');
  if (!status.adsPostbackSecret) reasons.push('Set the ADS_POSTBACK_SECRET Worker secret');
  const ready = cfg.features.rewardedAds && !reasons.length;
  const pb = apiBase() + '/v1/ads/postback';
  root.innerHTML = `<div class="panel"><div class="panel-head"><div><h3>REWARDED ADS &amp; TEMPORARY ACCESS</h3><p class="section-sub">Visitors who watch the required number of ads get temporary access. A reward is granted <b>only</b> when your ad provider confirms completion to the server — a button click on the website can never grant access.</p></div><div class="master"><span>${cfg.features.rewardedAds ? 'ON' : 'OFF'}</span>${sw('id="ads-master"', cfg.features.rewardedAds)}</div></div>
    <div class="conn ${ready ? 'ok' : 'bad'}"><span class="live-dot ${ready ? '' : 'off'}"></span>${ready ? 'Ready — visitors can unlock with ads' : cfg.features.rewardedAds ? 'Not ready: ' + reasons.join(' · ') : 'Switched off — visitors see no ad option'}</div>
    <form id="ads-cfg" class="form-grid">
     <div class="form-row"><label for="ad-n">Ads required</label><input id="ad-n" class="field" type="number" min="1" max="10" name="adsRequired" value="${cfg.ads.adsRequired}"></div>
     <div class="form-row"><label for="ad-m">Access lasts (minutes)</label><input id="ad-m" class="field" type="number" min="5" max="1440" name="unlockMinutes" value="${cfg.ads.unlockMinutes}"><small class="hint">60 = one hour. Access expires automatically.</small></div>
     <div class="form-row"><label for="ad-p">Provider name</label><input id="ad-p" class="field" name="providerName" maxlength="60" placeholder="e.g. YourAdNetwork" value="${esc(cfg.ads.providerName)}"></div>
     <div class="form-row full"><label for="ad-u">Ad launch URL (must contain <code>{sid}</code>)</label><input id="ad-u" class="field" name="launchUrl" type="url" placeholder="https://provider.example/watch?user={sid}" value="${esc(cfg.ads.launchUrl)}"></div>
     <div class="form-row full"><button class="btn btn-primary btn-small">SAVE AD SETTINGS</button></div></form></div>
   <div class="panel"><h3>HOW VERIFICATION WORKS</h3>
    <ol class="how"><li>The visitor presses <b>Watch ad</b>. The server creates a session id (<code>sid</code>) and opens your launch URL with <code>{sid}</code> filled in.</li><li>After the ad finishes, <b>your provider’s server calls the postback URL below</b>. The server checks the HMAC signature, ignores duplicate <code>event_id</code>s and counts only <code>status=completed</code>. Failed and cancelled ads are logged but never counted.</li><li>After ${cfg.ads.adsRequired} verified ad${cfg.ads.adsRequired > 1 ? 's' : ''}, access is granted for ${cfg.ads.unlockMinutes} minutes.</li></ol>
    <div class="form-row"><label>Postback URL (GET or POST)</label><div class="copy-row"><code id="pb-url">${esc(pb)}</code><button class="btn btn-small" id="pb-copy">COPY</button></div></div>
    <p class="section-sub">Parameters: <code>sid</code>, <code>event_id</code> (unique per ad view), <code>status</code> (<code>completed</code> | <code>failed</code> | <code>cancelled</code>), <code>ts</code> (unix seconds, ±10 min), <code>sig</code>.<br>Signature: <code>sig = hex(HMAC-SHA256(ADS_POSTBACK_SECRET, "sid=…&amp;event_id=…&amp;status=…&amp;ts=…"))</code>.</p>
    <div class="notice">No ad network is built in. This works with any provider that offers a hosted rewarded-ad page and server-to-server callbacks — you may need a small adapter to match your provider’s signature format. Until it is configured, visitors only see a clearly disabled option.</div>
    <div class="mini-stats"><div><strong>${ads.completed}</strong><span>verified (7d)</span></div><div><strong>${ads.failed}</strong><span>failed (7d)</span></div><div><strong>${ads.cancelled}</strong><span>cancelled (7d)</span></div><div><strong>${ads.unlocksGranted}</strong><span>unlocks (7d)</span></div></div></div>`;
  $('#pb-copy').onclick = async () => { try { await navigator.clipboard.writeText(pb); toast('Postback URL copied.', 'success'); } catch { toast('Copy failed — select the URL manually.', 'error'); } };
  $('#ads-master').onchange = async e => { try { await A('/v1/admin/config', { method: 'PUT', body: { features: { rewardedAds: e.target.checked } } }); await loadConfig(); toast(`Rewarded ads turned ${e.target.checked ? 'ON' : 'OFF'}.`, 'success'); rerender(); } catch (err) { e.target.checked = !e.target.checked; toast(err.message, 'error'); } };
  $('#ads-cfg').onsubmit = async e => {
    e.preventDefault(); const d = new FormData(e.currentTarget);
    try { await A('/v1/admin/config', { method: 'PUT', body: { ads: { adsRequired: +d.get('adsRequired'), unlockMinutes: +d.get('unlockMinutes'), providerName: d.get('providerName'), launchUrl: String(d.get('launchUrl')).trim() } } }); await loadConfig(); toast('Rewarded ad settings saved.', 'success'); rerender(); }
    catch (err) { toast(err.message, 'error'); }
  };
}

/* ================================== feedback ================================== */
async function feedback(root, rerender) {
  const { config: cfg } = await A('/v1/admin/config');
  if (!root.isConnected) return;
  const ui = { status: '', category: '', gameId: '', q: '', offset: 0, sel: new Set() };
  root.innerHTML = `<div class="panel"><div class="panel-head"><div><h3>PLAYER FEEDBACK</h3><p class="section-sub">Messages from visitors. Anti-spam: rate limits, duplicate detection and a hidden honeypot field.</p></div><div class="master"><span>${cfg.features.feedback ? 'ON' : 'OFF'}</span>${sw('id="fb-master"', cfg.features.feedback)}</div></div>
    <details class="settings-fold"><summary>Feedback settings</summary><form id="fb-cfg" class="form-grid"><div class="form-row full"><label for="fc-cats">Categories (one per line)</label><textarea id="fc-cats" class="field" rows="5" name="cats">${esc(cfg.feedback.categories.join('\n'))}</textarea></div><div class="form-row"><label for="fc-max">Max message length</label><input id="fc-max" class="field" type="number" min="100" max="2000" name="maxLength" value="${cfg.feedback.maxLength}"></div><div class="form-row full"><button class="btn btn-small btn-primary">SAVE</button></div></form></details>
    <div class="toolbar"><input id="f-q" class="field search" type="search" placeholder="Search messages…" aria-label="Search feedback"><select id="f-status" class="field" style="max-width:150px"><option value="">All status</option><option value="new">New</option><option value="reviewed">Reviewed</option></select><select id="f-cat" class="field" style="max-width:190px"><option value="">All categories</option></select><select id="f-game" class="field" style="max-width:200px"><option value="">All games</option><option value="__none__">General (no game)</option></select></div>
    <div id="fb-bulk" class="bulk" hidden></div><div id="fb-list" aria-live="polite"></div><div id="fb-pager" class="pager"></div></div><div id="dlfb-admin" class="panel"></div>`;
  let data = { items: [], total: 0 };
  const load = async () => {
    $('#fb-list').innerHTML = '<div class="skel line"></div><div class="skel line"></div><div class="skel line"></div>';
    const p = new URLSearchParams({ limit: 20, offset: ui.offset, ...(ui.status && { status: ui.status }), ...(ui.category && { category: ui.category }), ...(ui.gameId && { gameId: ui.gameId }), ...(ui.q && { q: ui.q }) });
    try { data = await A('/v1/admin/feedback?' + p); } catch (e) { $('#fb-list').innerHTML = `<div class="empty state-box"><h3>Couldn’t load feedback</h3><p>${esc(e.message)}</p><button class="btn btn-small" id="f-retry">TRY AGAIN</button></div>`; $('#f-retry').onclick = load; return; }
    if (!root.isConnected || !$('#f-cat')) return; // panel was replaced while loading
    const keepCat = $('#f-cat').value, keepGame = $('#f-game').value;
    $('#f-cat').innerHTML = '<option value="">All categories</option>' + [...new Set([...cfg.feedback.categories, ...data.categories])].map(c => `<option ${c === keepCat ? 'selected' : ''}>${esc(c)}</option>`).join('');
    $('#f-game').innerHTML = '<option value="">All games</option><option value="__none__">General (no game)</option>' + data.games.map(g => `<option value="${esc(g)}" ${g === keepGame ? 'selected' : ''}>${esc(gameTitle(g) || g)}</option>`).join('');
    $('#f-game').value = ui.gameId; draw();
  };
  const draw = () => {
    $('#fb-list').innerHTML = !data.items.length ? `<div class="empty state-box"><h3>${data.total === 0 && !ui.q && !ui.status && !ui.category && !ui.gameId ? 'No feedback yet' : 'No matches'}</h3><p>${data.total === 0 && !ui.q && !ui.status && !ui.category && !ui.gameId ? 'When visitors send feedback it appears here.' : 'Try different filters.'}</p></div>`
      : `<div class="table-wrap"><table class="gv-table fb-table"><thead><tr><th><input type="checkbox" id="f-all" aria-label="Select all" ${data.items.length && data.items.every(f => ui.sel.has(f.id)) ? 'checked' : ''}></th><th>Status</th><th>Category</th><th>Message</th><th>Game</th><th>Received</th></tr></thead><tbody>${data.items.map(f => `<tr class="clickable ${f.status === 'new' ? 'unread' : ''}" data-open="${f.id}"><td><input type="checkbox" data-sel="${f.id}" ${ui.sel.has(f.id) ? 'checked' : ''} aria-label="Select"></td><td><span class="pill ${f.status === 'new' ? 'on' : ''}">${f.status === 'new' ? 'NEW' : 'REVIEWED'}</span></td><td>${esc(f.category)}</td><td class="snip">${esc(f.message.slice(0, 110))}${f.message.length > 110 ? '…' : ''}</td><td>${f.gameId ? esc(gameTitle(f.gameId) || f.gameId) : '—'}</td><td>${timeAgo(f.createdAt)}</td></tr>`).join('')}</tbody></table></div>`;
    const from = data.total ? ui.offset + 1 : 0, to = ui.offset + data.items.length;
    $('#fb-pager').innerHTML = data.total > 20 ? `<span>${from}–${to} of ${data.total}</span><button class="btn btn-small" id="pg-prev" ${ui.offset ? '' : 'disabled'}>← PREV</button><button class="btn btn-small" id="pg-next" ${to < data.total ? '' : 'disabled'}>NEXT →</button>` : `<span>${data.total} message${data.total === 1 ? '' : 's'}</span>`;
    bulk();
  };
  const bulk = () => { const b = $('#fb-bulk'); b.hidden = !ui.sel.size; b.innerHTML = ui.sel.size ? `<strong>${ui.sel.size} selected</strong><button class="btn btn-small" data-bulk="reviewed">MARK REVIEWED</button><button class="btn btn-small btn-danger" data-bulk="delete">DELETE</button>` : ''; };
  const act = async (fn, ok) => { try { await fn(); toast(ok, 'success'); ui.sel.clear(); await load(); } catch (e) { toast(e.message, 'error'); } };
  root.addEventListener('input', e => { if (e.target.id === 'f-q') { clearTimeout(ui.t); ui.t = setTimeout(() => { ui.q = e.target.value.trim(); ui.offset = 0; load(); }, 300); } });
  root.addEventListener('change', async e => {
    const t = e.target;
    if (t.id === 'f-status') { ui.status = t.value; ui.offset = 0; load(); } else if (t.id === 'f-cat') { ui.category = t.value; ui.offset = 0; load(); } else if (t.id === 'f-game') { ui.gameId = t.value; ui.offset = 0; load(); }
    else if (t.id === 'f-all') { data.items.forEach(f => t.checked ? ui.sel.add(f.id) : ui.sel.delete(f.id)); draw(); }
    else if (t.dataset.sel) { t.checked ? ui.sel.add(t.dataset.sel) : ui.sel.delete(t.dataset.sel); bulk(); }
    else if (t.id === 'fb-master') { try { await A('/v1/admin/config', { method: 'PUT', body: { features: { feedback: t.checked } } }); await loadConfig(); toast(`Feedback turned ${t.checked ? 'ON' : 'OFF'}.`, 'success'); rerender(); } catch (err) { t.checked = !t.checked; toast(err.message, 'error'); } }
  });
  root.addEventListener('submit', async e => {
    if (e.target.id !== 'fb-cfg') return; e.preventDefault(); const d = new FormData(e.target);
    try { const r = await A('/v1/admin/config', { method: 'PUT', body: { feedback: { categories: String(d.get('cats')).split('\n'), maxLength: +d.get('maxLength') } } }); Object.assign(cfg, r.config); await loadConfig(); toast('Feedback settings saved.', 'success'); load(); } catch (err) { toast(err.message, 'error'); }
  });
  root.addEventListener('click', async e => {
    const bk = e.target.closest('[data-bulk]'), row = e.target.closest('[data-open]');
    if (e.target.id === 'pg-prev') { ui.offset = Math.max(0, ui.offset - 20); load(); } else if (e.target.id === 'pg-next') { ui.offset += 20; load(); }
    else if (bk) {
      const ids = [...ui.sel];
      if (bk.dataset.bulk === 'delete' && !await confirmDialog(`Permanently delete ${ids.length} message${ids.length > 1 ? 's' : ''}?`, { title: 'Delete feedback?', confirmText: 'Delete', danger: true })) return;
      act(() => A('/v1/admin/feedback/bulk', { method: 'POST', body: { ids, action: bk.dataset.bulk } }), bk.dataset.bulk === 'delete' ? 'Feedback deleted.' : 'Marked as reviewed.');
    } else if (row && !e.target.closest('input')) detail(row.dataset.open);
  });
  function detail(id) {
    const f = data.items.find(x => x.id === id); if (!f) return;
    const m = openModal(`<h3>FEEDBACK DETAILS</h3><dl class="detail"><dt>Category</dt><dd>${esc(f.category)}</dd><dt>Game</dt><dd>${f.gameId ? esc(gameTitle(f.gameId) || f.gameId) : 'General'}</dd><dt>Received</dt><dd>${new Date(f.createdAt * 1000).toLocaleString()}</dd><dt>Status</dt><dd>${f.status === 'new' ? 'New' : 'Reviewed ' + (f.reviewedAt ? timeAgo(f.reviewedAt) : '')}</dd></dl><div class="fb-msg">${esc(f.message)}</div><div class="gv-modal-actions"><button class="btn btn-danger" id="fd-del">DELETE</button><button class="btn" id="fd-toggle">${f.status === 'new' ? 'MARK REVIEWED' : 'MARK AS NEW'}</button><button class="btn btn-ghost" id="fd-close">CLOSE</button></div>`);
    const q = s => m.el.querySelector(s);
    q('#fd-close').onclick = m.close;
    q('#fd-toggle').onclick = async () => { try { await A(`/v1/admin/feedback/${enc(f.id)}`, { method: 'PUT', body: { status: f.status === 'new' ? 'reviewed' : 'new' } }); m.close(); toast('Feedback updated.', 'success'); load(); } catch (err) { toast(err.message, 'error'); } };
    q('#fd-del').onclick = async () => { if (!await confirmDialog('This message will be permanently deleted.', { title: 'Delete feedback?', confirmText: 'Delete', danger: true })) return; try { await A(`/v1/admin/feedback/${enc(f.id)}`, { method: 'DELETE' }); m.close(); toast('Feedback deleted.', 'success'); load(); } catch (err) { toast(err.message, 'error'); } };
  }
  load();
  loadDownloadFeedback();
}
