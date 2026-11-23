/* =====================================================================
   GAMEVERSE — Image editor, renderer and hosted-upload helper
   ---------------------------------------------------------------------
   • Non-destructive: the ORIGINAL image is hosted once; Firestore stores
     only a small JSON "fit spec" (crop, zoom, position, aspect, mode).
   • The website and the editor preview use the SAME renderer functions
     below, so what the admin sees is exactly what visitors get.
   • No canvas pixel reads → works with any hosted image URL (no CORS).
   • No Firebase Storage and no Base64 in Firestore.
   ===================================================================== */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d, a, b) => { v = Number(v); return Number.isFinite(v) ? clamp(v, a, b) : d; };
const rnd = (v, p = 2) => Math.round(v * 10 ** p) / 10 ** p;
const f4 = v => rnd(v, 4);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
export const MAX_PICK_MB = 25;       // largest file the admin may pick
const HOST_LIMIT = 9 * 1024 * 1024;  // free image hosts typically cap at 10 MB

export const FRAME = { cover: 16 / 9, screenshot: 16 / 10, heroDesktop: 2.5, heroMobile: 3 / 4 };

const ASPECTS = {
  "16:9": { v: 16 / 9, label: "16:9 landscape" },
  "16:10": { v: 1.6, label: "16:10 gallery" },
  "4:3": { v: 4 / 3, label: "4:3" },
  "1:1": { v: 1, label: "1:1 square" },
  "3:4": { v: 3 / 4, label: "3:4 portrait" },
  free: { v: null, label: "Custom crop (free)" }
};

const MODES = ["landscape", "custom", "contain", "trim", "focal", "gallery", "crop"];

/* ---------------------------------------------------------------------
   Safety: only http(s) image URLs are ever rendered / stored. Blob URLs
   are accepted only while the editor is open (local preview).
   --------------------------------------------------------------------- */
let ALLOW_BLOB = false;

export function isHttpUrl(s) {
  try { return ["http:", "https:"].includes(new URL(s).protocol); } catch { return false; }
}

/** http(s) always; blob: only while the editor is open (local preview). */
export const isRenderableUrl = s => isHttpUrl(s) || (ALLOW_BLOB && /^blob:/i.test(String(s)));

export function sanitizeSpec(raw) {
  if (!raw || typeof raw !== "object") return null;
  const src = String(raw.src || "");
  if (src.length > 2048) return null;
  if (!(isHttpUrl(src) || (ALLOW_BLOB && /^blob:/i.test(src)))) return null;
  const nw = num(raw.nat?.w, 0, 0, 100000), nh = num(raw.nat?.h, 0, 0, 100000);
  if (nw < 1 || nh < 1) return null;
  const rotate = [0, 90, 180, 270].includes(Number(raw.rotate)) ? Number(raw.rotate) : 0;
  const [rw, rh] = rotate % 180 ? [nh, nw] : [nw, nh];
  const c = raw.crop || {};
  const w = num(c.width, rw, 1, rw), h = num(c.height, rh, 1, rh);
  const x = num(c.x, 0, 0, rw - w), y = num(c.y, 0, 0, rh - h);
  const out = {
    v: 1,
    kind: String(raw.kind || "other").replace(/[^a-z]/gi, "").slice(0, 16) || "other",
    src,
    mode: MODES.includes(raw.mode) ? raw.mode : "crop",
    aspect: Object.keys(ASPECTS).includes(raw.aspect) || raw.aspect === "original" ? raw.aspect : "free",
    aspectValue: f4(w / h),
    rotate,
    crop: { x: rnd(x, 1), y: rnd(y, 1), width: rnd(w, 1), height: rnd(h, 1) },
    nat: { w: Math.round(nw), h: Math.round(nh) },
    zoom: rnd(num(raw.zoom, 1, 0.1, 20), 3),
    posX: rnd(num(raw.posX, 50, 0, 100), 2),
    posY: rnd(num(raw.posY, 50, 0, 100), 2)
  };
  if (raw.logo) out.logo = { size: rnd(num(raw.logo.size, 30, 3, 100), 2), x: rnd(num(raw.logo.x, 4, 0, 100), 2), y: rnd(num(raw.logo.y, 96, 0, 100), 2) };
  if (raw.focal) out.focal = { x: rnd(num(raw.focal.x, 50, 0, 100), 2), y: rnd(num(raw.focal.y, 50, 0, 100), 2) };
  return out;
}

/** Use a saved spec only if it was made for this exact image URL. */
export function specFor(url, spec) {
  const s = sanitizeSpec(spec);
  return s && s.src === url ? s : null;
}

const dims = s => (s.rotate % 180 ? [s.nat.h, s.nat.w] : [s.nat.w, s.nat.h]);

/* ---------------------------------------------------------------------
   Renderer (shared by website + editor preview)
   --------------------------------------------------------------------- */

/** The part of the crop that is visible inside a frame of the given aspect. */
export function computeView(s, frameAspect) {
  const { x, y, width: w, height: h } = s.crop;
  let vw = w, vh = h;
  const ca = w / h;
  if (Math.abs(ca - frameAspect) > 0.002) {
    if (ca > frameAspect) vw = h * frameAspect; else vh = w / frameAspect;
  }
  // centre inside the crop, using the saved horizontal/vertical position
  const vx = x + (w - vw) * (s.posX / 100);
  const vy = y + (h - vh) * (s.posY / 100);
  return { x: vx, y: vy, w: vw, h: vh };
}

function cropInner(s, view, alt, eager) {
  const [rw, rh] = dims(s);
  const odd = s.rotate % 180 === 90;
  const iw = odd ? (rh / rw) * 100 : 100, ih = odd ? (rw / rh) * 100 : 100;
  return `<div class="gv-stage" style="width:${f4(rw / view.w * 100)}%;height:${f4(rh / view.h * 100)}%;left:${f4(-view.x / view.w * 100)}%;top:${f4(-view.y / view.h * 100)}%">` +
    `<img class="gv-img" src="${esc(s.src)}" alt="${esc(alt)}" draggable="false" ${eager ? "" : 'loading="lazy"'} decoding="async" style="width:${f4(iw)}%;height:${f4(ih)}%;transform:translate(-50%,-50%) rotate(${s.rotate}deg)" onerror="window.gvImgFail&&gvImgFail(this)"></div>`;
}

export function focalMarkup(url, focal = { x: 50, y: 50 }, zoom = 1, alt = "") {
  const x = num(focal.x, 50, 0, 100), y = num(focal.y, 50, 0, 100), z = num(zoom, 1, 1, 4);
  return `<div class="gv-fit gv-focal"><img class="gv-img-fill" src="${esc(url)}" alt="${esc(alt)}" draggable="false" style="object-position:${x}% ${y}%;transform:scale(${z});transform-origin:${x}% ${y}%" onerror="window.gvImgFail&&gvImgFail(this)"></div>`;
}

/** Returns "" when the spec is missing/invalid so callers can fall back. */
export function fitMarkup(spec, frameAspect, alt = "", eager = false) {
  const s = sanitizeSpec(spec);
  if (!s) return "";
  if (s.focal) return focalMarkup(s.src, s.focal, s.zoom, alt);
  return `<div class="gv-fit">${cropInner(s, computeView(s, frameAspect), alt, eager)}</div>`;
}

export function logoMaxSize(aspect, frameAspect) { return Math.min(100, (100 * aspect) / frameAspect); }

export function logoBoxStyle(s, frameAspect) {
  const a = s.crop.width / s.crop.height;
  const L = s.logo || { size: 30, x: 4, y: 96 };
  const size = Math.min(L.size, logoMaxSize(a, frameAspect));
  // x/y: 0 = flush left/top, 100 = flush right/bottom, never overflows the frame
  return `width:${f4(size)}%;aspect-ratio:${f4(a)};left:${f4(L.x)}%;top:${f4(L.y)}%;transform:translate(-${f4(L.x)}%,-${f4(L.y)}%)`;
}

/** Logo overlay. Uses contain semantics: never stretched, never cut off. */
export function logoMarkup(spec, frameAspect, alt = "Logo") {
  const s = sanitizeSpec(spec);
  if (!s) return "";
  const a = s.crop.width / s.crop.height;
  const view = { x: s.crop.x, y: s.crop.y, w: s.crop.width, h: s.crop.height };
  return `<div class="gv-logo" style="${logoBoxStyle(s, frameAspect)}"><div class="gv-fit">${cropInner(s, view, alt)}</div></div>`;
}

/** Plain logo URL without a saved spec (older data): safe contain fallback. */
export function plainLogoMarkup(url, alt = "Logo") {
  if (!isHttpUrl(url)) return "";
  return `<img class="gv-logo gv-logo-plain" src="${esc(url)}" alt="${esc(alt)}" draggable="false" onerror="window.gvImgFail&&gvImgFail(this)">`;
}

if (typeof window !== "undefined") {
  window.gvImgFail = img => {
    const logo = img.closest(".gv-logo");
    if (logo) { logo.remove(); return; }
    if (img.classList.contains("gv-logo-plain")) { img.remove(); return; }
    const box = img.closest(".gv-fit");
    if (box && !box.dataset.failed) {
      box.dataset.failed = "1";
      box.className = "gv-fit gv-broken";
      box.innerHTML = '<img class="gv-img-fill" src="https://placehold.co/800x450/151b26/ffffff?text=GAMEVERSE" alt="">';
    }
  };
}

/* ---------------------------------------------------------------------
   File validation + upload to an image-hosting service (Cloudinary
   unsigned preset). Nothing is stored in Firebase Storage or Firestore.
   --------------------------------------------------------------------- */
export function validateFile(file) {
  if (!file) return "No file selected.";
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const okExt = ["jpg", "jpeg", "png", "webp"].includes(ext);
  const okType = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (!okExt || (file.type && !okType)) return "Unsupported file. Use JPG, JPEG, PNG or WebP.";
  if (file.size > MAX_PICK_MB * 1024 * 1024) return `File is too large (max ${MAX_PICK_MB} MB).`;
  if (file.size < 100) return "File looks empty or corrupted.";
  return "";
}

export function hostReady(host) {
  return !!(host && host.provider === "cloudinary" && /^[a-z0-9_-]+$/i.test(host.cloudName || "") && /^[\w.-]+$/.test(host.uploadPreset || ""));
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => (im.naturalWidth ? res(im) : rej(new Error("Image has no size")));
    im.onerror = () => rej(new Error("Image could not be loaded"));
    im.src = url;
  });
}

/** Keeps format (PNG/WebP transparency preserved); only shrinks files the host would reject. */
async function prepareFile(file) {
  if (file.size <= HOST_LIMIT) return file;
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImage(url);
    for (const side of [4096, 3072, 2048]) {
      const k = Math.min(1, side / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      const type = file.type === "image/jpeg" ? "image/jpeg" : "image/webp"; // webp keeps alpha
      const blob = await new Promise(r => c.toBlob(r, type, 0.92));
      if (blob && blob.size <= HOST_LIMIT) {
        const ext = type === "image/jpeg" ? "jpg" : "webp";
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type });
      }
    }
  } finally { URL.revokeObjectURL(url); }
  throw new Error("Image is too large to upload. Please choose a smaller file.");
}

export async function uploadToHost(file, host, onProgress) {
  if (!hostReady(host)) throw new Error("NO_HOST");
  const prepared = await prepareFile(file);
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", prepared);
    fd.append("upload_preset", host.uploadPreset);
    if (host.folder) fd.append("folder", host.folder);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${encodeURIComponent(host.cloudName)}/image/upload`);
    xhr.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const r = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && isHttpUrl(r.secure_url)) resolve({ url: r.secure_url, width: r.width, height: r.height });
        else reject(new Error(r.error?.message || "Upload was rejected by the image host."));
      } catch { reject(new Error("Unexpected response from the image host.")); }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading."));
    xhr.send(fd);
  });
}

/* ---------------------------------------------------------------------
   Editor modal
   --------------------------------------------------------------------- */
const KINDS = {
  cover: { title: "Game cover image", frame: FRAME.cover, aspects: ["16:9", "free"], def: "16:9", mode: a => (a === "free" ? "custom" : "landscape"), tabs: ["card", "featured", "page", "mobile", "ba"] },
  screenshot: { title: "Game screenshot", frame: FRAME.screenshot, aspects: ["16:10", "16:9", "4:3", "free"], def: "16:10", mode: () => "gallery", tabs: ["gallery", "page", "mobile", "ba"] },
  other: { title: "Website image", frame: FRAME.cover, aspects: ["16:9", "4:3", "1:1", "3:4", "free"], def: "16:9", mode: a => (a === "free" ? "custom" : "crop"), tabs: ["plain", "ba"] },
  logo: { title: "Game logo", frame: FRAME.cover, aspects: ["free"], def: "free", mode: () => "contain", tabs: ["card", "featured", "page", "mobile", "ba"] },
  hero: { title: "Homepage background", frame: FRAME.heroDesktop, aspects: [], def: "free", mode: () => "focal", tabs: ["desktop", "mobile", "ba"] }
};
const TAB_LABEL = { card: "Game card", featured: "Featured section", page: "Game page", mobile: "Mobile", ba: "Before / After", gallery: "Gallery", plain: "Preview", desktop: "Desktop" };

const sliderHTML = (id, label, min, max, step) =>
  `<label class="ie-sl"><span>${label}<b data-out="${id}"></b></span><input type="range" data-sl="${id}" min="${min}" max="${max}" step="${step}"></label>`;

/**
 * openImageEditor({ kind, file?, src?, spec?, ctx, guard, upload, title? })
 *  → Promise<{ src, spec } | null>
 */
export async function openImageEditor(opts) {
  const { kind, file, ctx = {}, guard, upload } = opts;
  const K = KINDS[kind] || KINDS.other;
  if (guard) await guard();                       // admin-only, verified before anything opens

  let localUrl = null;
  let src = opts.src || "";
  if (file) { localUrl = URL.createObjectURL(file); src = localUrl; }
  ALLOW_BLOB = true;

  let im;
  try { im = await loadImage(src); }
  catch (e) { ALLOW_BLOB = false; if (localUrl) URL.revokeObjectURL(localUrl); throw e; }
  const nat = { w: im.naturalWidth, h: im.naturalHeight };

  /* ---------- state ---------- */
  const prev = opts.spec && !file && sanitizeSpec(opts.spec)?.src === src ? sanitizeSpec(opts.spec) : null;
  const st = {
    rot: prev?.rotate || 0,
    aspect: prev && K.aspects.includes(prev.aspect) ? prev.aspect : K.def,
    crop: null,
    logoMode: prev?.mode === "trim" ? "trim" : "contain",
    logo: prev?.logo ? { ...prev.logo } : { size: 30, x: 4, y: 96 },
    focal: prev?.focal ? { ...prev.focal } : { x: 50, y: 50 },
    hz: prev?.focal ? prev.zoom : 1,
    bg: "cover",
    tab: K.tabs[0],
    busy: false
  };
  const R = () => (st.rot % 180 ? [nat.h, nat.w] : [nat.w, nat.h]);
  const aspectVal = () => (kind === "logo" && st.logoMode === "contain" ? nat.w / nat.h : (ASPECTS[st.aspect]?.v ?? null));
  const fullCrop = () => { const [rw, rh] = R(); return { x: 0, y: 0, w: rw, h: rh }; };
  function defaultCrop(A) {
    const [rw, rh] = R();
    if (!A) return fullCrop();
    let w = Math.min(rw, rh * A), h = w / A;
    return { x: (rw - w) / 2, y: (rh - h) / 2, w, h };           // centred, largest possible
  }
  if (prev && prev.mode !== "contain" && prev.mode !== "focal") {
    st.crop = { x: prev.crop.x, y: prev.crop.y, w: prev.crop.width, h: prev.crop.height };
  } else st.crop = defaultCrop(kind === "logo" ? null : aspectVal());

  /* ---------- DOM ---------- */
  const opener = document.activeElement;
  const root = document.createElement("div");
  root.className = "ie-overlay";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Image editor");
  const isCropKind = kind !== "hero";
  root.innerHTML = `
  <div class="ie-modal">
    <header class="ie-head">
      <div><div class="eyebrow">IMAGE EDITOR</div><h2>${esc(opts.title || K.title)}</h2>
        <small class="ie-sub">${file ? esc(file.name) + " · local file, uploaded when you save" : "Hosted image"} · ${nat.w}×${nat.h}px</small></div>
      <button type="button" class="ie-x" data-ie="cancel" aria-label="Close editor">✕</button>
    </header>
    <div class="ie-body">
      <section class="ie-edit">
        <div class="ie-stage" tabindex="0" aria-label="Edit area. Arrow keys move, plus and minus zoom."></div>
        <div class="ie-toolbar">
          ${kind === "logo" ? `<div class="ie-seg" role="group" aria-label="Logo mode"><button type="button" data-logomode="contain">CONTAIN (default)</button><button type="button" data-logomode="trim">TRIM / CROP</button></div>
          <div class="ie-seg" role="group" aria-label="Preview background"><button type="button" data-bg="cover">ON COVER</button><button type="button" data-bg="check">TRANSPARENT</button><button type="button" data-bg="dark">DARK</button></div>` : ""}
          ${kind !== "hero" && K.aspects.length > 1 ? `<label class="ie-sel">ASPECT <select data-aspect>${K.aspects.map(a => `<option value="${a}">${ASPECTS[a].label}</option>`).join("")}</select></label>` : ""}
          <span data-cropOnly class="ie-tools">
            <button type="button" class="btn btn-small" data-act="zoomout" title="Zoom out" aria-label="Zoom out">－</button>
            <button type="button" class="btn btn-small" data-act="zoomin" title="Zoom in" aria-label="Zoom in">＋</button>
            ${kind !== "logo" ? `<button type="button" class="btn btn-small" data-act="rotl" title="Rotate left" aria-label="Rotate left">⟲</button><button type="button" class="btn btn-small" data-act="rotr" title="Rotate right" aria-label="Rotate right">⟳</button>` : ""}
            <button type="button" class="btn btn-small" data-act="center">CENTER</button>
          </span>
          <button type="button" class="btn btn-small" data-act="reset">RESET</button>
        </div>
        <div class="ie-controls">
          <div data-grp="crop">${sliderHTML("zoom", kind === "logo" ? "Logo crop zoom" : "Zoom", 1, 8, 0.01)}${sliderHTML("px", "Horizontal position", 0, 100, 0.1)}${sliderHTML("py", "Vertical position", 0, 100, 0.1)}</div>
          <div data-grp="logo">${sliderHTML("lsize", "Logo size", 5, 100, 0.5)}${sliderHTML("lx", "Logo horizontal position", 0, 100, 0.1)}${sliderHTML("ly", "Logo vertical position", 0, 100, 0.1)}</div>
          <div data-grp="hero">${sliderHTML("hz", "Zoom", 1, 3, 0.01)}${sliderHTML("fx", "Focal point — horizontal", 0, 100, 0.1)}${sliderHTML("fy", "Focal point — vertical", 0, 100, 0.1)}</div>
        </div>
        <p class="ie-hint" data-hint></p>
      </section>
      <aside class="ie-preview">
        <div class="ie-pv-head"><strong>LIVE PREVIEW</strong><small>Exactly as it will appear on the website</small></div>
        <div class="ie-pv-tabs" role="tablist">${K.tabs.map(t => `<button type="button" role="tab" data-tab="${t}">${TAB_LABEL[t]}</button>`).join("")}</div>
        <div class="ie-pv-body"></div>
      </aside>
    </div>
    <footer class="ie-foot">
      <div class="ie-status" data-status role="status" aria-live="polite"></div>
      <div class="ie-prog hidden"><span></span></div>
      <div class="row-actions"><button type="button" class="btn" data-ie="cancel">CANCEL</button><button type="button" class="btn btn-primary" data-ie="save">${file ? "UPLOAD &amp; SAVE" : "SAVE"}</button></div>
    </footer>
  </div>`;
  document.body.appendChild(root);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const $ = s => root.querySelector(s);
  const $$ = s => [...root.querySelectorAll(s)];
  const stage = $(".ie-stage");
  const pvBody = $(".ie-pv-body");
  const statusEl = $("[data-status]");
  const sl = {}; $$("[data-sl]").forEach(i => (sl[i.dataset.sl] = i));
  const out = {}; $$("[data-out]").forEach(o => (out[o.dataset.out] = o));
  const setStatus = (m, bad) => { statusEl.textContent = m || ""; statusEl.classList.toggle("bad", !!bad); };

  /* ---------- spec from state (the single source of truth) ---------- */
  function buildSpec(srcOverride, natOverride) {
    const n = natOverride || nat;
    const k = n.w / nat.w;
    let crop, mode = K.mode(st.aspect), aspect = st.aspect, zoom = 1, posX = 50, posY = 50;
    const [rw, rh] = R();
    if (kind === "hero") {
      crop = { x: 0, y: 0, w: rw, h: rh }; zoom = st.hz; aspect = "free"; posX = st.focal.x; posY = st.focal.y;
    } else if (kind === "logo" && st.logoMode === "contain") {
      crop = { x: 0, y: 0, w: rw, h: rh }; mode = "contain"; aspect = "original";
    } else {
      crop = st.crop; if (kind === "logo") mode = "trim";
      zoom = zoomOf(); posX = posOf("x"); posY = posOf("y");
    }
    const spec = {
      v: 1, kind, src: srcOverride || src, mode, aspect, aspectValue: f4(crop.w / crop.h),
      rotate: st.rot,
      crop: { x: crop.x * k, y: crop.y * k, width: crop.w * k, height: crop.h * k },
      nat: { w: n.w, h: n.h }, zoom, posX, posY
    };
    if (kind === "logo") spec.logo = { ...st.logo };
    if (kind === "hero") spec.focal = { ...st.focal };
    return sanitizeSpec(spec);
  }

  /* ---------- crop maths ---------- */
  const minSize = () => { const [rw, rh] = R(); return { w: Math.max(16, rw * 0.03), h: Math.max(16, rh * 0.03) }; };
  function zoomOf() { const [rw, rh] = R(); return clamp(Math.max(rw / st.crop.w, rh / st.crop.h), 1, 999); }
  function posOf(ax) {
    const [rw, rh] = R(); const c = st.crop;
    const range = ax === "x" ? rw - c.w : rh - c.h;
    return range > 0.5 ? (ax === "x" ? c.x : c.y) / range * 100 : 50;
  }
  function setZoom(z) {
    const [rw, rh] = R(); const c = st.crop; const A = c.w / c.h;
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    const full = Math.min(rw, rh * A);
    let w = full / clamp(z, 1, 8), h = w / A;
    const m = minSize();
    if (w < m.w) { w = m.w; h = w / A; }
    if (h < m.h) { h = m.h; w = h * A; }
    c.w = w; c.h = h; c.x = clamp(cx - w / 2, 0, rw - w); c.y = clamp(cy - h / 2, 0, rh - h);
  }
  function setPos(ax, pct) {
    const [rw, rh] = R(); const c = st.crop;
    if (ax === "x") c.x = (pct / 100) * (rw - c.w); else c.y = (pct / 100) * (rh - c.h);
  }
  function applyAspect(key) {
    st.aspect = key;
    const A = ASPECTS[key]?.v;
    const [rw, rh] = R(); const c = st.crop;
    if (!A) return;                                               // free: keep the box as is
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    let w = Math.min(c.w, rw), h = w / A;
    if (h > rh) { h = rh; w = h * A; }
    if (w > rw) { w = rw; h = w / A; }
    c.w = w; c.h = h; c.x = clamp(cx - w / 2, 0, rw - w); c.y = clamp(cy - h / 2, 0, rh - h);
  }
  function rotate(dir) {
    const [rw, rh] = R(); const c = st.crop;
    const nrot = (st.rot + (dir > 0 ? 90 : 270)) % 360;
    let n;
    if (dir > 0) n = { x: rh - (c.y + c.h), y: c.x, w: c.h, h: c.w };          // 90° clockwise
    else n = { x: c.y, y: rw - (c.x + c.w), w: c.h, h: c.w };                   // 90° counter-clockwise
    st.rot = nrot;
    st.crop = ASPECTS[st.aspect]?.v ? defaultCrop(ASPECTS[st.aspect].v) : n;   // locked ratios re-centre
  }

  /* ---------- stage controllers ---------- */
  let canvas, cropEl, logoFrame, logoBox, marker, ro;
  const fullSpecFor = () => sanitizeSpec({ v: 1, src, mode: "crop", rotate: st.rot, nat, crop: { x: 0, y: 0, width: R()[0], height: R()[1] } });

  function stageKind() { return kind === "hero" ? "focal" : kind === "logo" && st.logoMode === "contain" ? "frame" : "crop"; }
  let mountedKind = null, mountedRot = null;

  function mountStage() {
    const sk = stageKind();
    mountedKind = sk; mountedRot = st.rot;
    if (sk === "crop" || sk === "focal") {
      const fs = fullSpecFor();
      const view = { x: 0, y: 0, w: R()[0], h: R()[1] };
      stage.innerHTML = `<div class="ie-canvas">${cropInner(fs, view, "Editing image", true)}` +
        (sk === "crop"
          ? `<div class="ie-crop" data-cropbox><span class="ie-grid"></span><i class="ie-h ie-h-nw" data-h="nw"></i><i class="ie-h ie-h-ne" data-h="ne"></i><i class="ie-h ie-h-sw" data-h="sw"></i><i class="ie-h ie-h-se" data-h="se"></i></div>`
          : `<i class="ie-marker" data-marker aria-label="Focal point"></i>`) + `</div>`;
      canvas = stage.querySelector(".ie-canvas"); cropEl = stage.querySelector("[data-cropbox]"); marker = stage.querySelector("[data-marker]");
      wireCanvas(sk);
    } else {
      stage.innerHTML = `<div class="ie-lframe" data-bgmode="${st.bg}"><div class="ie-lbg"></div><div class="gv-logo ie-lbox" data-lbox tabindex="0" aria-label="Logo — drag to position"></div></div>`;
      logoFrame = stage.querySelector(".ie-lframe"); logoBox = stage.querySelector("[data-lbox]");
      wireLogoFrame();
    }
    fitStage();
  }

  function fitStage() {
    const sk = mountedKind;
    const W = stage.clientWidth - 24, H = stage.clientHeight - 24;
    if (W <= 0 || H <= 0) return;
    if (sk === "frame") {
      const fa = K.frame; let w = Math.min(W, H * fa), h = w / fa;
      logoFrame.style.width = w + "px"; logoFrame.style.height = h + "px";
    } else {
      const [rw, rh] = R(); const s = Math.min(W / rw, H / rh);
      canvas.style.width = rw * s + "px"; canvas.style.height = rh * s + "px";
    }
  }

  function wireCanvas(sk) {
    let drag = null;
    const rect = () => canvas.getBoundingClientRect();
    const toNat = e => { const r = rect(), [rw, rh] = R(); return { x: (e.clientX - r.left) / r.width * rw, y: (e.clientY - r.top) / r.height * rh }; };
    canvas.addEventListener("pointerdown", e => {
      if (st.busy) return;
      if (sk === "focal") {
        drag = { type: "focal" };
        canvas.setPointerCapture(e.pointerId); e.preventDefault();
        const p = toNat(e), [rw, rh] = R();
        st.focal = { x: clamp(p.x / rw * 100, 0, 100), y: clamp(p.y / rh * 100, 0, 100) }; changed(); return;
      }
      const h = e.target.dataset?.h;
      const inBox = !!e.target.closest("[data-cropbox]");
      if (!inBox) {                                                // click outside: move box there
        const p = toNat(e), c = st.crop, [rw, rh] = R();
        c.x = clamp(p.x - c.w / 2, 0, rw - c.w); c.y = clamp(p.y - c.h / 2, 0, rh - c.h); changed();
      }
      drag = { type: h ? "resize" : "move", h, orig: { ...st.crop }, sx: e.clientX, sy: e.clientY };
      canvas.setPointerCapture(e.pointerId); e.preventDefault(); stage.focus({ preventScroll: true });
    });
    canvas.addEventListener("pointermove", e => {
      if (!drag) return;
      const [rw, rh] = R();
      if (drag.type === "focal") {
        const p = toNat(e);
        st.focal = { x: clamp(p.x / rw * 100, 0, 100), y: clamp(p.y / rh * 100, 0, 100) }; changed(); return;
      }
      const k = rw / rect().width;
      const o = drag.orig, c = st.crop;
      if (drag.type === "move") {
        c.x = clamp(o.x + (e.clientX - drag.sx) * k, 0, rw - o.w);
        c.y = clamp(o.y + (e.clientY - drag.sy) * k, 0, rh - o.h);
      } else {
        const p = toNat(e); const sx = drag.h.includes("e") ? 1 : -1, sy = drag.h.includes("s") ? 1 : -1;
        const ax = sx > 0 ? o.x : o.x + o.w, ay = sy > 0 ? o.y : o.y + o.h;
        const m = minSize(); const A = aspectVal();
        const availW = sx > 0 ? rw - ax : ax, availH = sy > 0 ? rh - ay : ay;
        let w = sx * (p.x - ax), h = sy * (p.y - ay);
        if (A) {
          w = Math.max(w, h * A);
          w = clamp(w, Math.max(m.w, m.h * A), Math.max(m.w, Math.min(availW, availH * A)));
          h = w / A;
        } else { w = clamp(w, m.w, Math.max(m.w, availW)); h = clamp(h, m.h, Math.max(m.h, availH)); }
        c.w = w; c.h = h; c.x = sx > 0 ? ax : ax - w; c.y = sy > 0 ? ay : ay - h;
      }
      changed();
    });
    const end = e => { if (drag) { drag = null; try { canvas.releasePointerCapture(e.pointerId); } catch {} } };
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
    if (sk === "crop") canvas.addEventListener("wheel", e => { e.preventDefault(); setZoom(zoomOf() * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); changed(); }, { passive: false });
  }

  function wireLogoFrame() {
    let drag = null;
    logoBox.addEventListener("pointerdown", e => {
      if (st.busy) return;
      const fr = logoFrame.getBoundingClientRect(), bx = logoBox.getBoundingClientRect();
      drag = { sx: e.clientX, sy: e.clientY, ox: st.logo.x, oy: st.logo.y, fw: fr.width - bx.width, fh: fr.height - bx.height };
      logoBox.setPointerCapture(e.pointerId); e.preventDefault(); logoBox.focus({ preventScroll: true });
    });
    logoBox.addEventListener("pointermove", e => {
      if (!drag) return;
      st.logo.x = drag.fw > 1 ? clamp(drag.ox + (e.clientX - drag.sx) / drag.fw * 100, 0, 100) : 50;
      st.logo.y = drag.fh > 1 ? clamp(drag.oy + (e.clientY - drag.sy) / drag.fh * 100, 0, 100) : 50;
      changed();
    });
    const end = e => { drag = null; try { logoBox.releasePointerCapture(e.pointerId); } catch {} };
    logoBox.addEventListener("pointerup", end); logoBox.addEventListener("pointercancel", end);
    logoBox.addEventListener("keydown", e => {
      const d = e.shiftKey ? 5 : 1; let used = true;
      if (e.key === "ArrowLeft") st.logo.x = clamp(st.logo.x - d, 0, 100);
      else if (e.key === "ArrowRight") st.logo.x = clamp(st.logo.x + d, 0, 100);
      else if (e.key === "ArrowUp") st.logo.y = clamp(st.logo.y - d, 0, 100);
      else if (e.key === "ArrowDown") st.logo.y = clamp(st.logo.y + d, 0, 100);
      else used = false;
      if (used) { e.preventDefault(); changed(); }
    });
  }

  /* ---------- sync UI from state ---------- */
  let raf = 0;
  function changed() { cancelAnimationFrame(raf); raf = requestAnimationFrame(refresh); }

  function refresh() {
    const sk = stageKind();
    if (sk !== mountedKind || st.rot !== mountedRot) mountStage();
    const [rw, rh] = R(); const c = st.crop;
    if (sk === "crop" && cropEl) {
      Object.assign(cropEl.style, { left: c.x / rw * 100 + "%", top: c.y / rh * 100 + "%", width: c.w / rw * 100 + "%", height: c.h / rh * 100 + "%" });
    }
    if (sk === "focal" && marker) { marker.style.left = st.focal.x + "%"; marker.style.top = st.focal.y + "%"; }
    if (sk === "frame") paintLogoFrame();

    // groups
    const showCrop = kind !== "hero" && !(kind === "logo" && st.logoMode === "contain");
    $("[data-grp=crop]").classList.toggle("hidden", !showCrop);
    $("[data-grp=logo]").classList.toggle("hidden", kind !== "logo");
    $("[data-grp=hero]").classList.toggle("hidden", kind !== "hero");
    const co = $("[data-cropOnly]"); if (co) co.classList.toggle("hidden", !showCrop);
    $$("[data-logomode]").forEach(b => b.classList.toggle("on", b.dataset.logomode === st.logoMode));
    $$("[data-bg]").forEach(b => b.classList.toggle("on", b.dataset.bg === st.bg));
    const asel = $("[data-aspect]"); if (asel) asel.value = st.aspect;
    $$("[data-tab]").forEach(b => { b.classList.toggle("on", b.dataset.tab === st.tab); b.setAttribute("aria-selected", b.dataset.tab === st.tab); });

    const set = (id, v, txt) => { if (sl[id]) { sl[id].value = v; } if (out[id]) out[id].textContent = txt; };
    if (showCrop) {
      set("zoom", clamp(zoomOf(), 1, 8), ` ${zoomOf().toFixed(2)}×`);
      set("px", posOf("x"), ` ${posOf("x").toFixed(0)}%`); set("py", posOf("y"), ` ${posOf("y").toFixed(0)}%`);
    }
    if (kind === "logo") {
      const a = logoAspect(), mx = logoMaxSize(a, K.frame);
      sl.lsize.max = String(Math.max(5, Math.floor(mx))); st.logo.size = Math.min(st.logo.size, mx);
      set("lsize", st.logo.size, ` ${st.logo.size.toFixed(0)}%`); set("lx", st.logo.x, ` ${st.logo.x.toFixed(0)}%`); set("ly", st.logo.y, ` ${st.logo.y.toFixed(0)}%`);
    }
    if (kind === "hero") {
      set("hz", st.hz, ` ${st.hz.toFixed(2)}×`); set("fx", st.focal.x, ` ${st.focal.x.toFixed(0)}%`); set("fy", st.focal.y, ` ${st.focal.y.toFixed(0)}%`);
    }
    $("[data-hint]").textContent = hintText(sk);
    renderPreview();
  }

  const logoAspect = () => (st.logoMode === "contain" ? nat.w / nat.h : st.crop.w / st.crop.h);

  function hintText(sk) {
    if (sk === "crop") return "Drag the box to reposition · drag a corner to resize · mouse wheel or sliders to zoom · arrow keys nudge.";
    if (sk === "frame") return "Drag the logo to position it. Contain mode never stretches or cuts off your logo — transparent PNG/WebP is kept as is.";
    return "Click or drag on the image to set the focal point (the area that always stays visible). Use zoom for a closer view.";
  }

  function paintLogoFrame() {
    const s = buildSpec();
    // backdrop
    const bgEl = logoFrame.querySelector(".ie-lbg");
    logoFrame.dataset.bgmode = st.bg;
    if (st.bg === "cover") {
      const g = ctx.game || {};
      const cs = g.cover ? specFor(g.cover, g.coverFit) : null;
      bgEl.innerHTML = cs ? fitMarkup(cs, K.frame, "", true) : g.cover && isHttpUrl(g.cover) ? `<div class="gv-fit"><img class="gv-img-fill" src="${esc(g.cover)}" alt=""></div>` : "";
    } else bgEl.innerHTML = "";
    logoBox.style.cssText = logoBoxStyle(s, K.frame);
    if (!logoBox.dataset.sig || logoBox.dataset.sig !== `${s.rotate}|${s.crop.x}|${s.crop.y}|${s.crop.width}|${s.crop.height}`) {
      logoBox.dataset.sig = `${s.rotate}|${s.crop.x}|${s.crop.y}|${s.crop.width}|${s.crop.height}`;
      logoBox.innerHTML = `<div class="gv-fit">${cropInner(s, { x: s.crop.x, y: s.crop.y, w: s.crop.width, h: s.crop.height }, "Logo", true)}</div>`;
    }
  }

  /* ---------- previews ---------- */
  function draftGame() {
    const g = { ...(ctx.game || {}) };
    g.screenshots = [...(g.screenshots || [])]; g.screenshotFit = [...(g.screenshotFit || [])];
    const s = buildSpec(localUrl || src);
    if (kind === "cover") { g.cover = s.src; g.coverFit = s; }
    else if (kind === "logo") { g.logo = s.src; g.logoFit = s; }
    else if (kind === "screenshot") {
      const i = Number.isInteger(ctx.index) && ctx.index >= 0 ? ctx.index : g.screenshots.length;
      g.screenshots[i] = s.src; g.screenshotFit[i] = s;
    }
    if (!g.cover) g.cover = "https://placehold.co/1000x560/151b26/ffffff?text=COVER";
    g.title = g.title || "Your game title"; g.shortDescription = g.shortDescription || "Short description appears here.";
    g.published = true;
    return g;
  }
  const scaled = (html, w, cls = "") => `<div class="ie-scale ${cls}" data-w="${w}"><div class="ie-scale-in" style="width:${w}px">${html}</div></div>`;

  function renderPreview() {
    const Rn = ctx.render || {};
    const t = st.tab; let html = "";
    const g = kind === "hero" || kind === "other" ? null : draftGame();
    const s = buildSpec(localUrl || src);
    if (kind === "hero") {
      const h = { ...(ctx.hero || {}), heroImage: s.src, heroFit: s };
      if (t === "desktop") html = scaled(Rn.hero ? Rn.hero(h) : "", 1440);
      else if (t === "mobile") html = `<div class="ie-phone-wrap">${scaled(`<div class="ie-force-mobile">${Rn.hero ? Rn.hero(h) : ""}</div>`, 390, "ie-phone")}</div>`;
    } else if (t === "card") html = scaled(`<div class="ie-card-wrap">${Rn.card(g)}</div>`, 380);
    else if (t === "featured") {
      const others = (ctx.others || []).slice(0, 2);
      html = scaled(`<div class="game-grid ie-feat">${[g, ...others].map(x => Rn.card(x)).join("")}</div>`, 1100);
    } else if (t === "gallery") {
      const shots = (g.screenshots || []).map((u, i) => ({ u, sp: g.screenshotFit?.[i] }));
      html = scaled(`<div class="ie-gal-wrap"><div class="screenshots ie-gal">${shots.map(x => `<div class="gv-shot">${fitMarkup(specFor(x.u, x.sp), FRAME.screenshot, "Screenshot", true) || `<img class="gv-img-fill" src="${esc(x.u)}" alt="">`}</div>`).join("")}</div></div>`, 700);
    } else if (t === "page") html = scaled(`<main class="page-shell container ie-page">${Rn.detail(g)}</main>`, 1100);
    else if (t === "mobile") html = `<div class="ie-phone-wrap">${scaled(`<div class="ie-force-mobile ie-page"><div class="container" style="padding:14px 0">${Rn.card(g)}</div><main class="page-shell container" style="padding:10px 0 20px">${Rn.detail(g)}</main></div>`, 390, "ie-phone")}</div>`;
    else if (t === "plain") {
      const fa = s.aspectValue;
      html = scaled(`<div class="ie-plain" style="aspect-ratio:${fa}">${fitMarkup(s, fa, "", true)}</div>`, 520);
    } else if (t === "ba") html = beforeAfter(s, g);
    pvBody.innerHTML = html;
    pvBody.querySelectorAll("a").forEach(a => a.removeAttribute("href"));
    applyScales();
  }

  function beforeAfter(s, g) {
    let fa = K.frame, after;
    if (kind === "hero") { fa = FRAME.heroDesktop; after = fitMarkup(s, fa, "", true); }
    else if (kind === "logo") {
      const cs = g.cover ? specFor(g.cover, g.coverFit) : null;
      const back = cs ? fitMarkup(cs, fa, "", true) : "";
      after = `${back}${logoMarkup(s, fa)}`;
    } else if (kind === "other") { fa = s.aspectValue; after = fitMarkup(s, fa, "", true); }
    else after = fitMarkup(s, fa, "", true);
    const before = `<div class="gv-fit gv-orig"><img class="gv-img-contain" src="${esc(src)}" alt="Original"></div>`;
    return `<div class="ie-ba"><figure><div class="ie-ba-frame ie-checker" style="aspect-ratio:${fa}">${before}</div><figcaption>BEFORE · original image</figcaption></figure><figure><div class="ie-ba-frame" style="aspect-ratio:${fa}">${after}</div><figcaption>AFTER · on the website</figcaption></figure></div>`;
  }

  function applyScales() {
    pvBody.querySelectorAll(".ie-scale").forEach(el => {
      const w = Number(el.dataset.w), inner = el.firstElementChild;
      const k = Math.min(1, el.clientWidth / w || 1);
      inner.style.transform = `scale(${k})`;
      el.style.height = Math.ceil(inner.offsetHeight * k) + "px";
    });
  }

  /* ---------- events ---------- */
  root.addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b || st.busy) return;
    if (b.dataset.tab) { st.tab = b.dataset.tab; refresh(); return; }
    if (b.dataset.bg) { st.bg = b.dataset.bg; refresh(); return; }
    if (b.dataset.logomode) {
      st.logoMode = b.dataset.logomode;
      st.crop = st.logoMode === "trim" ? fullCrop() : fullCrop();
      st.aspect = "free"; mountedKind = null; if (logoBox) logoBox.dataset.sig = ""; refresh(); return;
    }
    const a = b.dataset.act;
    if (a === "zoomin") setZoom(zoomOf() * 1.15);
    else if (a === "zoomout") setZoom(zoomOf() / 1.15);
    else if (a === "rotl") rotate(-1);
    else if (a === "rotr") rotate(1);
    else if (a === "center") { const [rw, rh] = R(); st.crop.x = (rw - st.crop.w) / 2; st.crop.y = (rh - st.crop.h) / 2; }
    else if (a === "reset") {
      st.rot = 0; st.hz = 1; st.focal = { x: 50, y: 50 }; st.logo = { size: 30, x: 4, y: 96 };
      if (kind === "logo") { st.logoMode = "contain"; st.aspect = "free"; st.crop = fullCrop(); }
      else { st.aspect = K.def; st.crop = defaultCrop(ASPECTS[st.aspect]?.v ?? null); }
      mountedKind = null; if (logoBox) logoBox.dataset.sig = "";
    } else if (b.dataset.ie === "cancel") return close(null);
    else if (b.dataset.ie === "save") return save();
    else return;
    refresh();
  });
  root.addEventListener("change", e => {
    if (e.target.matches("[data-aspect]")) { applyAspect(e.target.value); refresh(); }
  });
  root.addEventListener("input", e => {
    const id = e.target.dataset?.sl; if (!id) return;
    const v = Number(e.target.value);
    if (id === "zoom") setZoom(v); else if (id === "px") setPos("x", v); else if (id === "py") setPos("y", v);
    else if (id === "lsize") st.logo.size = v; else if (id === "lx") st.logo.x = v; else if (id === "ly") st.logo.y = v;
    else if (id === "hz") st.hz = v; else if (id === "fx") st.focal.x = v; else if (id === "fy") st.focal.y = v;
    changed();
  });
  stage.addEventListener("keydown", e => {
    if (stageKind() !== "crop") return;
    const [rw, rh] = R(), c = st.crop, d = e.shiftKey ? 0.05 : 0.01; let used = true;
    if (e.key === "ArrowLeft") c.x = clamp(c.x - rw * d, 0, rw - c.w);
    else if (e.key === "ArrowRight") c.x = clamp(c.x + rw * d, 0, rw - c.w);
    else if (e.key === "ArrowUp") c.y = clamp(c.y - rh * d, 0, rh - c.h);
    else if (e.key === "ArrowDown") c.y = clamp(c.y + rh * d, 0, rh - c.h);
    else if (e.key === "+" || e.key === "=") setZoom(zoomOf() * 1.1);
    else if (e.key === "-") setZoom(zoomOf() / 1.1);
    else used = false;
    if (used) { e.preventDefault(); changed(); }
  });
  const onKey = e => {
    if (e.key === "Escape" && !st.busy) { e.stopPropagation(); close(null); }
    if (e.key === "Tab") {                                          // focus trap
      const f = $$("button:not([disabled]),select,input,[tabindex='0']").filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener("keydown", onKey, true);
  ro = new ResizeObserver(() => { fitStage(); applyScales(); });
  ro.observe(stage); ro.observe(pvBody);

  /* ---------- finish ---------- */
  let resolveFn;
  const done = new Promise(r => (resolveFn = r));
  function close(result) {
    ro.disconnect(); cancelAnimationFrame(raf);
    document.removeEventListener("keydown", onKey, true);
    root.remove(); document.body.style.overflow = prevOverflow;
    ALLOW_BLOB = false;
    if (localUrl) URL.revokeObjectURL(localUrl);
    try { opener?.focus?.(); } catch {}
    resolveFn(result);
  }

  async function save() {
    try {
      if (guard) await guard();                                     // re-verify admin right before saving
      let finalSrc = src, finalNat = nat;
      if (file) {
        if (!upload) throw new Error("NO_HOST");
        st.busy = true; root.classList.add("busy");
        const bar = $(".ie-prog"); bar.classList.remove("hidden");
        setStatus("Uploading image to your image host…");
        const r = await upload(file, p => { bar.firstElementChild.style.width = Math.round(p * 100) + "%"; });
        finalSrc = r.url;
        if (r.width && r.height) finalNat = { w: r.width, h: r.height };
      }
      const spec = buildSpec(finalSrc, finalNat);
      if (!spec) throw new Error("Could not build image settings.");
      close({ src: finalSrc, spec });
    } catch (e) {
      st.busy = false; root.classList.remove("busy"); $(".ie-prog")?.classList.add("hidden");
      setStatus(e.message === "NO_HOST"
        ? "No image host is configured. Add your Cloudinary details in Admin → Image Library & Hosting, or paste a hosted image URL instead."
        : (e.message || "Save failed."), true);
    }
  }

  mountStage();
  refresh();
  requestAnimationFrame(() => { fitStage(); applyScales(); stage.focus({ preventScroll: true }); });
  return done;
}
