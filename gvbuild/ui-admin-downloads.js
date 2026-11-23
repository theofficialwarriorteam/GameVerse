// Admin → Download Manager: external HTTPS downloads and externally hosted cover images.
import { state, $, $$, esc, toast, confirmDialog, openModal, fmtBytes, fmtNum, setBusy, sleep, isValidUrl } from './core.js';
import { api, apiBase, ApiError } from './api.js';

const A = (path, opts = {}) => api(path, { auth: 'admin', ...opts });
const EXT_TYPE = { apk: 'APK', xapk: 'APK', apks: 'APK', zip: 'ZIP', tar: 'ZIP', gz: 'ZIP', rar: 'RAR', '7z': '7Z', exe: 'EXE', msi: 'MSI', dmg: 'DMG' };
const TYPES = ['APK', 'ZIP', 'EXE', 'MSI', 'RAR', '7Z', 'DMG', 'OTHER'];
const ACCEPT = '.apk,.xapk,.apks,.obb,.zip,.rar,.7z,.exe,.msi,.dmg,.pkg,.deb,.appimage,.iso,.tar,.gz';
const enc = encodeURIComponent;

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
  root.innerHTML = `<div class="panel"><div class="panel-head"><div><h3>FREE DOWNLOAD MANAGER</h3><p class="section-sub">Add free downloads using external HTTPS links and externally hosted cover images. No file storage or payment setup is required.</p></div><button class="btn btn-primary btn-small" id="dl-new">＋ NEW DOWNLOAD</button></div>
   <div class="mini-stats"><div><strong>${items.length}</strong><span>total</span></div><div><strong>${items.filter(i => i.published).length}</strong><span>published</span></div><div><strong>${fmtNum(totalDl)}</strong><span>downloads started</span></div></div>
   ${legacy.length ? `<div class="notice">You have <b>${legacy.length}</b> download${legacy.length > 1 ? 's' : ''} from the old Firestore list. <button class="link-btn" id="dl-import">Import as external links</button></div>` : ''}
   <div class="toolbar"><input id="adl-q" class="field search" type="search" placeholder="Search by title, version or type…" aria-label="Search downloads"><select id="adl-status" class="field" style="max-width:160px"><option value="">All status</option><option value="pub">Published</option><option value="draft">Unpublished</option></select><select id="adl-type" class="field" style="max-width:150px"><option value="">All types</option>${TYPES.map(t => `<option>${t}</option>`).join('')}</select></div>
   <div id="adl-list"></div></div>`;
  const paint = () => {
    const q = ui.q.toLowerCase();
    const list = items.filter(i => (!ui.type || i.fileType === ui.type) && (!ui.status || (ui.status === 'pub') === i.published) && `${i.title} ${i.version} ${i.fileType} ${i.description}`.toLowerCase().includes(q));
    $('#adl-list').innerHTML = !items.length ? '<div class="empty state-box"><h3>No downloads yet</h3><p>Click “NEW DOWNLOAD” to upload your first free file.</p></div>'
      : !list.length ? '<div class="empty state-box"><h3>No matches</h3><p>Try another search or filter.</p></div>'
      : `<div class="table-wrap"><table class="gv-table"><thead><tr><th>Download</th><th>Type</th><th>Size</th><th>Source</th><th>Download clicks</th><th>Rating</th><th>Published</th><th></th></tr></thead><tbody>${list.map(i => `<tr><td><div class="cell-media"><span class="thumb-sm" style="${i.coverUrl ? `background-image:url('${esc(i.coverUrl)}')` : ''}"></span><div><strong>${esc(i.title)}</strong><small>${i.version ? 'v' + esc(i.version.replace(/^v/i, '')) : 'no version'}</small></div></div></td><td><span class="pill">${esc(i.fileType)}</span></td><td>${i.sizeBytes ? fmtBytes(i.sizeBytes) : '—'}</td><td>External link</td><td>${fmtNum(i.downloadClicks)}</td><td>${i.ratingCount ? `${Number(i.ratingAverage).toFixed(1)} / 5 (${fmtNum(i.ratingCount)})` : '—'}</td><td><label class="switch" title="Publish / unpublish"><input type="checkbox" data-pub="${i.id}" ${i.published ? 'checked' : ''}><span class="slider"></span></label></td><td class="row-actions"><button class="btn btn-small" data-preview="${i.id}">PREVIEW</button><button class="btn btn-small" data-edit="${i.id}">EDIT</button><button class="btn btn-small btn-danger" data-del="${i.id}">DELETE</button></td></tr>`).join('')}</tbody></table></div>`;
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
      if (!await confirmDialog(`“${it.title}” and its download listing will be permanently deleted. This can’t be undone.`, { title: 'Delete download?', confirmText: 'Delete', danger: true })) return;
      setBusy(del, true, '…');
      try { await A(`/v1/admin/downloads/${enc(it.id)}`, { method: 'DELETE' }); toast('Download deleted.', 'success'); refresh(); } catch (err) { setBusy(del, false); toast(err.message, 'error'); }
    }
  };

  /* ------------------------------ create / edit form ------------------------------ */
  function openForm(item) {
    const m = openModal(`<h3>${item ? 'EDIT DOWNLOAD' : 'NEW FREE DOWNLOAD'}</h3>
     <form id="dl-form" class="form-grid" novalidate>
      <div class="form-row full"><label for="df-title">Title *</label><input id="df-title" class="field" name="title" maxlength="90" required value="${esc(item?.title || '')}"></div>
      <div class="form-row full"><label for="df-short">Short description</label><input id="df-short" class="field" name="shortDescription" maxlength="240" value="${esc(item?.shortDescription || '')}"><label for="df-desc">Full description</label><textarea id="df-desc" class="field" name="description" maxlength="10000" rows="4">${esc(item?.description || '')}</textarea></div>
      <div class="form-row"><label for="df-type">File type *</label><select id="df-type" class="field" name="fileType">${TYPES.map(t => `<option ${t === (item?.fileType || 'APK') ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="form-row"><label for="df-ver">Version</label><input id="df-ver" class="field" name="version" maxlength="30" value="${esc(item?.version || '')}"></div>
      <div class="form-row"><label for="df-dev">Developer / publisher</label><input id="df-dev" class="field" name="developer" maxlength="120" value="${esc(item?.developer || '')}"></div>
      <div class="form-row"><label for="df-rel">Release date</label><input id="df-rel" class="field" name="releaseDate" type="date" value="${esc(item?.releaseDate || '')}"></div>
      <div class="form-row"><label for="df-updated">Last updated date</label><input id="df-updated" class="field" name="lastUpdatedDate" type="date" value="${esc(item?.lastUpdatedDate || '')}"></div>
      <div class="form-row"><label for="df-order">Display order (lower first)</label><input id="df-order" class="field" name="sortOrder" type="number" value="${Number(item?.sortOrder || 0)}"></div>
      <div class="form-row full"><label for="df-devices">Supported devices (one per line)</label><textarea id="df-devices" class="field" name="supportedDevices" rows="3">${esc((item?.supportedDevices || []).join('\n'))}</textarea></div>
      <div class="form-row full"><h4>System requirements (only filled fields are shown)</h4></div>
      ${[['operatingSystem','Operating system'],['processor','Processor'],['ram','RAM'],['storage','Storage space'],['graphics','Graphics'],['additionalSoftware','Additional software']].map(([k,l])=>`<div class="form-row"><label>${l}</label><input class="field" name="req_${k}" value="${esc(item?.requirements?.[k] || '')}"></div>`).join('')}
      <div class="form-row full"><label for="df-install">Installation instructions</label><textarea id="df-install" class="field" name="installInstructions" rows="4" maxlength="5000">${esc(item?.installInstructions || '')}</textarea></div>
      <div class="form-row full"><label for="df-notices">Important notices</label><textarea id="df-notices" class="field" name="notices" rows="3" maxlength="3000">${esc(item?.notices || '')}</textarea></div>
      <div class="form-row full"><label for="df-url">Download link (HTTPS) *</label><input id="df-url" class="field" name="externalUrl" type="url" required placeholder="https://…" value="${esc(item?.externalUrl || '')}"><small class="muted-note">Host the file on GitHub Releases or another trusted file host, then paste its direct download URL.</small></div>
      <div class="form-row"><label for="df-size">File size (MB, optional)</label><input id="df-size" class="field" name="sizeMb" type="number" min="0" step="0.1" value="${item?.sizeBytes ? (item.sizeBytes / 1048576).toFixed(1) : ''}"></div>
      <div class="form-row full"><label for="df-cover-url">Cover image URL (HTTPS, optional)</label><input id="df-cover-url" class="field" name="coverUrl" type="url" placeholder="https://…" value="${esc(item?.coverUrl || '')}"><small class="muted-note">Use an image hosted on Cloudinary or another image host.</small></div>
      <div class="form-row full"><label class="check"><input type="checkbox" name="feedbackEnabled" ${item ? (item.feedbackEnabled ? 'checked' : '') : 'checked'}> Enable feedback for this download</label></div>
      <div class="form-row full"><label class="check"><input type="checkbox" name="published" ${item ? (item.published ? 'checked' : '') : 'checked'}> Publish (visible to visitors)</label></div>
      <div class="form-row full"><div class="fb-err" id="df-err" role="alert"></div><div class="gv-modal-actions"><button type="button" class="btn btn-ghost" id="df-cancel">CANCEL</button><button type="submit" class="btn btn-primary" id="df-save">${item ? 'SAVE CHANGES' : 'CREATE DOWNLOAD'}</button></div></div>
     </form>`, { wide: true });
    const el = m.el, q = s => el.querySelector(s), err = msg => { q('#df-err').textContent = msg || ''; };
    q('#df-cancel').onclick = () => m.close();
    q('#dl-form').onsubmit = async e => {
      e.preventDefault(); err('');
      const fd = new FormData(e.currentTarget);
      const requirements = {}; for (const k of ['operatingSystem','processor','ram','storage','graphics','additionalSoftware']) { const v=String(fd.get('req_'+k)||'').trim(); if(v) requirements[k]=v; }
      const url = String(fd.get('externalUrl') || '').trim(), coverUrl = String(fd.get('coverUrl') || '').trim();
      if (!url || !/^https:\/\//i.test(url) || !isValidUrl(url)) return err('Enter a valid HTTPS download link.');
      if (coverUrl && (!/^https:\/\//i.test(coverUrl) || !isValidUrl(coverUrl))) return err('Enter a valid HTTPS cover image URL or leave it blank.');
      const body = { title:String(fd.get('title')||'').trim(), shortDescription:String(fd.get('shortDescription')||'').trim(), description:String(fd.get('description')||'').trim(), fileType:fd.get('fileType'), version:String(fd.get('version')||'').trim(), developer:String(fd.get('developer')||'').trim(), releaseDate:String(fd.get('releaseDate')||''), lastUpdatedDate:String(fd.get('lastUpdatedDate')||''), supportedDevices:String(fd.get('supportedDevices')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean), requirements, installInstructions:String(fd.get('installInstructions')||'').trim(), notices:String(fd.get('notices')||'').trim(), sortOrder:Number(fd.get('sortOrder')||0), feedbackEnabled:fd.has('feedbackEnabled'), published:fd.has('published'), storage:'external', externalUrl:url, sizeBytes:Math.round((Number(fd.get('sizeMb'))||0)*1048576), coverUrl };
      if (!body.title) return err('Please enter a title.');
      const btn = q('#df-save'); setBusy(btn, true, 'SAVING…');
      try { await A(item ? `/v1/admin/downloads/${enc(item.id)}` : '/v1/admin/downloads', { method:item ? 'PUT' : 'POST', body }); m.close(); toast(item ? 'Download updated.' : 'Download created.', 'success'); refresh(); }
      catch (e2) { setBusy(btn, false); err(e2.message); }
    };
  }
}
