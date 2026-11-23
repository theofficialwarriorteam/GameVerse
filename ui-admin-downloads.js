// Admin → Download Manager: list, search/filter, create/edit with chunked R2 upload, publish, delete.
import { state, $, $$, esc, toast, confirmDialog, openModal, fmtBytes, fmtNum, setBusy, sleep, isValidUrl } from './core.js';
import { api, apiBase, ApiError } from './api.js';

const A = (path, opts = {}) => api(path, { auth: 'admin', ...opts });
const EXT_TYPE = { apk: 'APK', xapk: 'APK', apks: 'APK', zip: 'ZIP', tar: 'ZIP', gz: 'ZIP', rar: 'RAR', '7z': '7Z', exe: 'EXE', msi: 'MSI', dmg: 'DMG' };
const TYPES = ['APK', 'ZIP', 'EXE', 'MSI', 'RAR', '7Z', 'DMG', 'OTHER'];
const ACCEPT = '.apk,.xapk,.apks,.obb,.zip,.rar,.7z,.exe,.msi,.dmg,.pkg,.deb,.appimage,.iso,.tar,.gz';
const enc = encodeURIComponent;

/* ------------------------------ uploads ------------------------------ */
function putPart(url, blob, token, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Authorization', 'Bearer ' + token);
    x.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded);
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch { /* ignore */ } x.status < 300 ? resolve(j) : reject(new ApiError(j.error || `Upload failed (${x.status})`, x.status, j.code)); };
    x.onerror = () => reject(new ApiError('Network error during upload.', 0, 'network'));
    x.onabort = () => reject(new ApiError('Upload cancelled.', 0, 'aborted'));
    signal.addEventListener('abort', () => x.abort(), { once: true });
    x.send(blob);
  });
}
async function uploadFile(file, { onProgress, signal }) {
  const init = await A('/v1/admin/uploads', { method: 'POST', body: { filename: file.name, size: file.size } });
  const parts = []; let done = 0;
  try {
    for (let i = 0; i < init.totalParts; i++) {
      const blob = file.slice(i * init.partSize, (i + 1) * init.partSize);
      for (let tries = 0; ; ) {
        try {
          const token = await state.fb.auth.currentUser.getIdToken();
          const url = `${apiBase()}/v1/admin/uploads/part?key=${enc(init.key)}&uploadId=${enc(init.uploadId)}&part=${i + 1}`;
          parts.push(await putPart(url, blob, token, l => onProgress((done + l) / file.size), signal));
          break;
        } catch (e) {
          if (e.code === 'aborted' || ++tries >= 3 || (e.status >= 400 && e.status < 500 && e.status !== 429)) throw e;
          await sleep(800 * tries);
        }
      }
      done += blob.size; onProgress(done / file.size);
    }
    const r = await A('/v1/admin/uploads/complete', { method: 'POST', body: { key: init.key, uploadId: init.uploadId, parts }, timeout: 60000 });
    return { key: r.key, size: r.size };
  } catch (e) {
    A('/v1/admin/uploads/abort', { method: 'POST', body: { key: init.key, uploadId: init.uploadId } }).catch(() => {});
    throw e;
  }
}
async function uploadCover(file) {
  const token = await state.fb.auth.currentUser.getIdToken();
  let res;
  try { res = await fetch(apiBase() + '/v1/admin/cover', { method: 'PUT', headers: { Authorization: 'Bearer ' + token }, body: file }); }
  catch { throw new ApiError('Could not reach the server.', 0, 'network'); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(j.error || 'Cover upload failed', res.status, j.code);
  return j;
}
const discard = key => key && A('/v1/admin/uploads/discard', { method: 'POST', body: { key } }).catch(() => {});

/* ------------------------------ list ------------------------------ */
export async function mountDownloads(root, { persist, rerender }) {
  root.innerHTML = '<div class="panel"><div class="skel line w40"></div><div class="skel line"></div><div class="skel line"></div></div>';
  let items;
  const load = async () => { items = (await A('/v1/admin/downloads')).items; };
  try { await load(); } catch (e) { root.innerHTML = `<div class="panel state-box"><h3>Couldn’t load downloads</h3><p>${esc(e.message)}</p><button class="btn btn-small" id="dl-retry">TRY AGAIN</button></div>`; $('#dl-retry').onclick = rerender; return; }
  if (!root.isConnected) return;
  const ui = { q: '', status: '', type: '' };
  const legacy = (state.settings?.downloads?.items || []).filter(i => isValidUrl(i.url));
  const totalDl = items.reduce((n, i) => n + (i.downloadClicks || 0), 0);
  root.innerHTML = `<div class="panel"><div class="panel-head"><div><h3>FREE DOWNLOAD MANAGER</h3><p class="section-sub">Upload APK, ZIP, EXE and other files to your private R2 storage, or link to an external file. Every download is free.</p></div><button class="btn btn-primary btn-small" id="dl-new">＋ NEW DOWNLOAD</button></div>
   <div class="mini-stats"><div><strong>${items.length}</strong><span>total</span></div><div><strong>${items.filter(i => i.published).length}</strong><span>published</span></div><div><strong>${fmtNum(totalDl)}</strong><span>downloads started</span></div></div>
   ${legacy.length ? `<div class="notice">You have <b>${legacy.length}</b> download${legacy.length > 1 ? 's' : ''} from the old Firestore list. <button class="link-btn" id="dl-import">Import as external links</button></div>` : ''}
   <div class="toolbar"><input id="adl-q" class="field search" type="search" placeholder="Search by title, version or type…" aria-label="Search downloads"><select id="adl-status" class="field" style="max-width:160px"><option value="">All status</option><option value="pub">Published</option><option value="draft">Unpublished</option></select><select id="adl-type" class="field" style="max-width:150px"><option value="">All types</option>${TYPES.map(t => `<option>${t}</option>`).join('')}</select></div>
   <div id="adl-list"></div></div>`;
  const paint = () => {
    const q = ui.q.toLowerCase();
    const list = items.filter(i => (!ui.type || i.fileType === ui.type) && (!ui.status || (ui.status === 'pub') === i.published) && `${i.title} ${i.version} ${i.fileType} ${i.description}`.toLowerCase().includes(q));
    $('#adl-list').innerHTML = !items.length ? '<div class="empty state-box"><h3>No downloads yet</h3><p>Click “NEW DOWNLOAD” to upload your first free file.</p></div>'
      : !list.length ? '<div class="empty state-box"><h3>No matches</h3><p>Try another search or filter.</p></div>'
      : `<div class="table-wrap"><table class="gv-table"><thead><tr><th>Download</th><th>Type</th><th>Size</th><th>Source</th><th>Download clicks</th><th>Rating</th><th>Published</th><th></th></tr></thead><tbody>${list.map(i => `<tr><td><div class="cell-media"><span class="thumb-sm" style="${i.coverUrl ? `background-image:url('${esc(i.coverUrl)}')` : ''}"></span><div><strong>${esc(i.title)}</strong><small>${i.version ? 'v' + esc(i.version.replace(/^v/i, '')) : 'no version'}</small></div></div></td><td><span class="pill">${esc(i.fileType)}</span></td><td>${i.sizeBytes ? fmtBytes(i.sizeBytes) : '—'}</td><td>${i.storage === 'r2' ? 'Uploaded (R2)' : 'External link'}</td><td>${fmtNum(i.downloadClicks)}</td><td>${i.ratingCount ? `${Number(i.ratingAverage).toFixed(1)} / 5 (${fmtNum(i.ratingCount)})` : '—'}</td><td><label class="switch" title="Publish / unpublish"><input type="checkbox" data-pub="${i.id}" ${i.published ? 'checked' : ''}><span class="slider"></span></label></td><td class="row-actions"><button class="btn btn-small" data-preview="${i.id}">PREVIEW</button><button class="btn btn-small" data-edit="${i.id}">EDIT</button><button class="btn btn-small btn-danger" data-del="${i.id}">DELETE</button></td></tr>`).join('')}</tbody></table></div>`;
  };
  paint();
  $('#adl-q').oninput = e => { ui.q = e.target.value.trim(); paint(); };
  $('#adl-status').onchange = e => { ui.status = e.target.value; paint(); };
  $('#adl-type').onchange = e => { ui.type = e.target.value; paint(); };
  $('#dl-new').onclick = () => openForm(null);
  const refresh = async () => { await load(); rerender(); };
  if (legacy.length) $('#dl-import').onclick = async e => {
    setBusy(e.target, true, 'Importing…'); let ok = 0;
    for (const l of legacy) {
      try { await A('/v1/admin/downloads', { method: 'POST', body: { title: l.title, description: l.description || '', fileType: String(l.fileType || 'OTHER').toUpperCase().replace(/^(ANDROID|APK).*/, 'APK'), version: '', storage: 'external', externalUrl: l.url, coverUrl: isValidUrl(l.image) && l.image.startsWith('https:') ? l.image : '', published: !!l.published } }); ok++; }
      catch (err) { toast(`“${l.title}”: ${err.message}`, 'error'); }
    }
    if (ok) { state.settings.downloads.items = []; try { await persist(); } catch { /* keep going */ } toast(`Imported ${ok} download${ok > 1 ? 's' : ''}.`, 'success'); }
    refresh();
  };
  root.onchange = async e => {
    const sw = e.target.closest('[data-pub]'); if (!sw) return;
    sw.disabled = true;
    try { await A(`/v1/admin/downloads/${enc(sw.dataset.pub)}`, { method: 'PUT', body: { published: sw.checked } }); toast(sw.checked ? 'Published — now visible to visitors.' : 'Unpublished — hidden from visitors.', 'success'); items.find(i => i.id === sw.dataset.pub).published = sw.checked; }
    catch (err) { sw.checked = !sw.checked; toast(err.message, 'error'); }
    sw.disabled = false;
  };
  root.onclick = async e => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]'), preview = e.target.closest('[data-preview]');
    if (preview) { window.location.hash = `#download-preview/${encodeURIComponent(preview.dataset.preview)}`; return; }
    if (ed) openForm(items.find(i => i.id === ed.dataset.edit));
    if (del) {
      const it = items.find(i => i.id === del.dataset.del);
      if (!await confirmDialog(`“${it.title}” and its uploaded file and cover will be permanently deleted. This can’t be undone.`, { title: 'Delete download?', confirmText: 'Delete', danger: true })) return;
      setBusy(del, true, '…');
      try { await A(`/v1/admin/downloads/${enc(it.id)}`, { method: 'DELETE' }); toast('Download deleted.', 'success'); refresh(); } catch (err) { setBusy(del, false); toast(err.message, 'error'); }
    }
  };

  /* ------------------------------ create / edit form ------------------------------ */
  function openForm(item) {
    const S = { mode: item?.storage || 'r2', fileKey: item?.fileKey || null, originalName: item?.originalName || '', sizeBytes: item?.sizeBytes || 0, coverKey: item?.coverKey || null, coverUrl: item?.coverUrl || '', newKeys: [], uploading: false, ctl: null };
    const m = openModal(`<h3>${item ? 'EDIT DOWNLOAD' : 'NEW FREE DOWNLOAD'}</h3>
     <form id="dl-form" class="form-grid" novalidate>
      <div class="form-row full"><label for="df-title">Title *</label><input id="df-title" class="field" name="title" maxlength="90" required value="${esc(item?.title || '')}"></div>
      <div class="form-row full"><label for="df-short">Short description</label><input id="df-short" class="field" name="shortDescription" maxlength="240" placeholder="Short card description" value="${esc(item?.shortDescription || '')}"><label for="df-desc">Full description</label><textarea id="df-desc" class="field" name="description" maxlength="10000" rows="4">${esc(item?.description || '')}</textarea></div>
      <div class="form-row"><label for="df-type">File type *</label><select id="df-type" class="field" name="fileType">${TYPES.map(t => `<option ${t === (item?.fileType || 'APK') ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="form-row"><label for="df-ver">Version</label><input id="df-ver" class="field" name="version" maxlength="30" placeholder="e.g. 1.0.2" value="${esc(item?.version || '')}"></div>
      <div class="form-row"><label for="df-dev">Developer / publisher</label><input id="df-dev" class="field" name="developer" maxlength="120" value="${esc(item?.developer || '')}"></div>
      <div class="form-row"><label for="df-rel">Release date</label><input id="df-rel" class="field" name="releaseDate" type="date" value="${esc(item?.releaseDate || '')}"></div>
      <div class="form-row"><label for="df-updated">Last updated date</label><input id="df-updated" class="field" name="lastUpdatedDate" type="date" value="${esc(item?.lastUpdatedDate || '')}"></div>
      <div class="form-row"><label for="df-order">Display order (lower first)</label><input id="df-order" class="field" name="sortOrder" type="number" value="${Number(item?.sortOrder || 0)}"></div>
      <div class="form-row full"><label for="df-devices">Supported devices (one per line)</label><textarea id="df-devices" class="field" name="supportedDevices" rows="3" placeholder="Windows PC&#10;Android&#10;Linux">${esc((item?.supportedDevices || []).join('\n'))}</textarea></div>
      <div class="form-row full"><h4>System requirements (only filled fields are shown)</h4></div>
      ${[['operatingSystem','Operating system'],['processor','Processor'],['ram','RAM'],['storage','Storage space'],['graphics','Graphics'],['additionalSoftware','Additional software']].map(([k,l])=>`<div class="form-row"><label>${l}</label><input class="field" name="req_${k}" value="${esc(item?.requirements?.[k] || '')}"></div>`).join('')}
      <div class="form-row full"><label for="df-install">Installation instructions</label><textarea id="df-install" class="field" name="installInstructions" rows="4" maxlength="5000">${esc(item?.installInstructions || '')}</textarea></div>
      <div class="form-row full"><label for="df-notices">Important notices</label><textarea id="df-notices" class="field" name="notices" rows="3" maxlength="3000">${esc(item?.notices || '')}</textarea></div>
      <div class="form-row full"><label>File source</label><div class="seg"><button type="button" data-mode="r2" class="${S.mode === 'r2' ? 'on' : ''}">Upload a file</button><button type="button" data-mode="external" class="${S.mode === 'external' ? 'on' : ''}">External download link</button></div></div>
      <div class="form-row full" id="src-r2" ${S.mode === 'r2' ? '' : 'hidden'}><div class="dropzone" id="dz"><input type="file" id="df-file" accept="${ACCEPT}" hidden><div id="dz-body"></div></div></div>
      <div id="src-ext" class="full form-grid" style="grid-column:1/-1" ${S.mode === 'external' ? '' : 'hidden'}><div class="form-row full"><label for="df-url">Download link (https)</label><input id="df-url" class="field" name="externalUrl" type="url" placeholder="https://…" value="${esc(item?.externalUrl || '')}"></div><div class="form-row"><label for="df-size">File size (MB, optional)</label><input id="df-size" class="field" name="sizeMb" type="number" min="0" step="0.1" value="${item && item.storage === 'external' && item.sizeBytes ? (item.sizeBytes / 1048576).toFixed(1) : ''}"></div></div>
      <div class="form-row full"><label>Cover image (JPG, PNG or WebP, max 5 MB)</label><div class="cover-pick"><div class="cover-prev" id="cv-prev"></div><div><input type="file" id="df-cover" accept="image/png,image/jpeg,image/webp" hidden><button type="button" class="btn btn-small" id="cv-btn">CHOOSE COVER</button> <button type="button" class="btn btn-small btn-ghost" id="cv-clear">REMOVE</button><div class="muted-note left" id="cv-msg"></div></div></div></div>
      <div class="form-row full"><label class="check"><input type="checkbox" name="feedbackEnabled" ${item ? (item.feedbackEnabled ? 'checked' : '') : 'checked'}> Enable feedback for this download</label></div>
      <div class="form-row full"><label class="check"><input type="checkbox" name="published" ${item ? (item.published ? 'checked' : '') : 'checked'}> Publish (visible to visitors)</label></div>
      <div class="form-row full"><div class="fb-err" id="df-err" role="alert"></div><div class="gv-modal-actions"><button type="button" class="btn btn-ghost" id="df-cancel">CANCEL</button><button type="submit" class="btn btn-primary" id="df-save">${item ? 'SAVE CHANGES' : 'CREATE DOWNLOAD'}</button></div></div>
     </form>`, { wide: true, onClose: () => { S.ctl?.abort(); S.newKeys.splice(0).forEach(discard); } });
    const el = m.el, q = s => el.querySelector(s), err = msg => { q('#df-err').textContent = msg || ''; };
    const paintFile = (progress) => {
      const b = q('#dz-body');
      if (S.uploading) b.innerHTML = `<strong>Uploading… ${Math.round(progress * 100)}%</strong><div class="progress"><span style="width:${progress * 100}%"></span></div><button type="button" class="btn btn-small btn-ghost" id="dz-cancel">CANCEL UPLOAD</button>`;
      else if (S.fileKey) b.innerHTML = `<strong>${esc(S.originalName)}</strong><small>${fmtBytes(S.sizeBytes)} · stored securely in R2</small><button type="button" class="btn btn-small" id="dz-pick">REPLACE FILE</button>`;
      else b.innerHTML = `<strong>Drop a file here or click to browse</strong><small>APK, ZIP, EXE, MSI, RAR, 7Z, DMG and more</small><button type="button" class="btn btn-small" id="dz-pick">CHOOSE FILE</button>`;
      q('#dz-pick')?.addEventListener('click', e => { e.stopPropagation(); q('#df-file').click(); });
      q('#dz-cancel')?.addEventListener('click', e => { e.stopPropagation(); S.ctl?.abort(); });
    };
    const paintCover = () => { q('#cv-prev').style.backgroundImage = S.coverUrl ? `url('${S.coverUrl}')` : ''; q('#cv-prev').classList.toggle('empty', !S.coverUrl); q('#cv-clear').hidden = !S.coverUrl; };
    paintFile(0); paintCover();
    el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { S.mode = b.dataset.mode; el.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b)); q('#src-r2').hidden = S.mode !== 'r2'; q('#src-ext').hidden = S.mode !== 'external'; });
    const startUpload = async file => {
      if (!file) return;
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!ACCEPT.split(',').includes('.' + ext)) { err('That file type is not allowed.'); return; }
      err(''); if (S.fileKey && S.newKeys.includes(S.fileKey)) { discard(S.fileKey); S.newKeys = S.newKeys.filter(k => k !== S.fileKey); }
      S.uploading = true; S.ctl = new AbortController(); q('#df-save').disabled = true; paintFile(0);
      if (EXT_TYPE[ext]) q('#df-type').value = EXT_TYPE[ext];
      if (!q('#df-title').value.trim()) q('#df-title').value = file.name.replace(/\.[^.]+$/, '').replace(/[._-]+/g, ' ').trim();
      try {
        const r = await uploadFile(file, { signal: S.ctl.signal, onProgress: p => paintFile(p) });
        S.fileKey = r.key; S.originalName = file.name; S.sizeBytes = r.size; S.newKeys.push(r.key); toast('File uploaded.', 'success');
      } catch (e) { S.fileKey = null; if (e.code !== 'aborted') err(e.message); }
      S.uploading = false; S.ctl = null; q('#df-save').disabled = false; paintFile(1);
    };
    q('#df-file').onchange = e => { startUpload(e.target.files[0]); e.target.value = ''; };
    const dz = q('#dz');
    dz.onclick = () => { if (!S.uploading) q('#df-file').click(); };
    dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
    dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); if (!S.uploading) startUpload(e.dataTransfer.files[0]); };
    q('#cv-btn').onclick = () => q('#df-cover').click();
    q('#df-cover').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { q('#cv-msg').textContent = 'Choose a JPG, PNG or WebP image.'; return; }
      if (f.size > 5 * 1024 * 1024) { q('#cv-msg').textContent = 'The image must be 5 MB or smaller.'; return; }
      q('#cv-msg').textContent = 'Uploading cover…';
      try { const r = await uploadCover(f); if (S.coverKey && S.newKeys.includes(S.coverKey)) discard(S.coverKey); S.coverKey = r.key; S.coverUrl = r.url; S.newKeys.push(r.key); q('#cv-msg').textContent = ''; paintCover(); }
      catch (e2) { q('#cv-msg').textContent = e2.message; }
    };
    q('#cv-clear').onclick = () => { if (S.coverKey && S.newKeys.includes(S.coverKey)) discard(S.coverKey); S.coverKey = null; S.coverUrl = ''; paintCover(); };
    q('#df-cancel').onclick = () => m.close(); // onClose aborts running uploads and discards unsaved files
    q('#dl-form').onsubmit = async e => {
      e.preventDefault(); err('');
      const fd = new FormData(e.currentTarget);
      const requirements = {}; for (const k of ['operatingSystem','processor','ram','storage','graphics','additionalSoftware']) { const v=String(fd.get('req_'+k)||'').trim(); if(v) requirements[k]=v; }
      const body = { title: String(fd.get('title')).trim(), shortDescription: String(fd.get('shortDescription')||'').trim(), description: String(fd.get('description')).trim(), fileType: fd.get('fileType'), version: String(fd.get('version')).trim(), developer:String(fd.get('developer')||'').trim(), releaseDate:String(fd.get('releaseDate')||''), lastUpdatedDate:String(fd.get('lastUpdatedDate')||''), supportedDevices:String(fd.get('supportedDevices')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean), requirements, installInstructions:String(fd.get('installInstructions')||'').trim(), notices:String(fd.get('notices')||'').trim(), sortOrder:Number(fd.get('sortOrder')||0), feedbackEnabled: fd.has('feedbackEnabled'), published: fd.has('published'), storage: S.mode, coverKey: S.coverKey || '', coverUrl: S.coverKey ? '' : (S.coverUrl || '') };
      if (!body.title) return err('Please enter a title.');
      if (S.mode === 'r2') { if (!S.fileKey) return err('Please upload a file first.'); body.fileKey = S.fileKey; body.originalName = S.originalName; }
      else {
        const url = String(fd.get('externalUrl')).trim();
        if (!/^https:\/\//i.test(url) || !isValidUrl(url)) return err('Enter a valid download link that starts with https://');
        body.externalUrl = url; body.sizeBytes = Math.round((Number(fd.get('sizeMb')) || 0) * 1048576);
      }
      const btn = q('#df-save'); setBusy(btn, true, 'SAVING…');
      try {
        await A(item ? `/v1/admin/downloads/${enc(item.id)}` : '/v1/admin/downloads', { method: item ? 'PUT' : 'POST', body });
        S.newKeys.length = 0; m.close(); toast(item ? 'Download updated.' : 'Download created.', 'success'); refresh();
      } catch (e2) { setBusy(btn, false); err(e2.message); }
    };
  }
}
