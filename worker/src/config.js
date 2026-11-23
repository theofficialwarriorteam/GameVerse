import { HttpError, bad, cleanStr, toBool, toInt, oneOf, nowSec, startOfDayMs, startOfWeekMs } from './util.js';

export const FEATURE_KEYS = ['downloads', 'visitorStats', 'onlineTracking', 'gameAnalytics', 'homepageStats', 'ratings', 'feedback', 'tasks', 'rewardedAds'];

export const DEFAULT_CONFIG = {
  features: {
    downloads: true, visitorStats: true, onlineTracking: true, gameAnalytics: true,
    homepageStats: true, ratings: true, feedback: true, tasks: true, rewardedAds: false
  },
  // site      = visitors must hold temporary access (tasks or rewarded ads) to browse the site UI
  // downloads = only the download page requires access (enforced server-side with download tickets)
  // off       = nothing is gated
  access: { scope: 'site' },
  tasks: { resetMode: 'daily', resetHours: 24, accessHours: 24, minSeconds: 8 },
  ads: { adsRequired: 3, unlockMinutes: 60, providerName: '', launchUrl: '' },
  feedback: { categories: ['Bug report', 'Broken game link', 'Suggestion', 'Game request', 'Other'], maxLength: 1000 }
};

export function sanitizeConfig(input, base = DEFAULT_CONFIG) {
  input = input && typeof input === 'object' ? input : {};
  const f = input.features || {}, a = input.access || {}, t = input.tasks || {}, ad = input.ads || {}, fb = input.feedback || {};
  const out = { features: {}, access: {}, tasks: {}, ads: {}, feedback: {} };
  for (const k of FEATURE_KEYS) out.features[k] = toBool(f[k], base.features[k]);
  out.access.scope = oneOf(a.scope, ['site', 'downloads', 'off'], base.access.scope);
  out.tasks.resetMode = oneOf(t.resetMode, ['never', 'daily', 'weekly', 'custom'], base.tasks.resetMode);
  out.tasks.resetHours = toInt(t.resetHours, base.tasks.resetHours, 1, 8760);
  out.tasks.accessHours = toInt(t.accessHours, base.tasks.accessHours, 1, 8760);
  out.tasks.minSeconds = toInt(t.minSeconds, base.tasks.minSeconds, 0, 300);
  out.ads.adsRequired = toInt(ad.adsRequired, base.ads.adsRequired, 1, 10);
  out.ads.unlockMinutes = toInt(ad.unlockMinutes, base.ads.unlockMinutes, 5, 1440);
  out.ads.providerName = cleanStr(ad.providerName, 60, base.ads.providerName);
  let launch = ad.launchUrl === undefined ? base.ads.launchUrl : cleanStr(ad.launchUrl, 1000);
  if (launch) {
    if (!launch.includes('{sid}')) bad('Ad launch URL must contain the {sid} placeholder');
    let u; try { u = new URL(launch.replace('{sid}', 'test')); } catch { bad('Ad launch URL is not a valid URL'); }
    if (u.protocol !== 'https:') bad('Ad launch URL must start with https://');
  }
  out.ads.launchUrl = launch;
  let cats = Array.isArray(fb.categories) ? fb.categories : base.feedback.categories;
  cats = [...new Set(cats.map(c => cleanStr(c, 40)).filter(c => c.length >= 2))].slice(0, 10);
  out.feedback.categories = cats.length ? cats : base.feedback.categories;
  out.feedback.maxLength = toInt(fb.maxLength, base.feedback.maxLength, 100, 2000);
  return out;
}

let cache = { v: null, at: 0 };
export async function getConfig(env, { fresh = false } = {}) {
  const ttl = Number(env.CONFIG_CACHE_SECONDS ?? 10) * 1000;
  if (!fresh && cache.v && Date.now() - cache.at < ttl) return cache.v;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='config'").first();
  let stored = {};
  try { stored = row ? JSON.parse(row.value) : {}; } catch { /* fall back to defaults */ }
  const v = sanitizeConfig(stored, DEFAULT_CONFIG);
  cache = { v, at: Date.now() };
  return v;
}
export async function saveConfig(env, input) {
  const current = await getConfig(env, { fresh: true });
  const next = sanitizeConfig(input, current);
  await env.DB.prepare("INSERT INTO settings(key,value,updated_at) VALUES('config',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(JSON.stringify(next), nowSec()).run();
  cache = { v: next, at: Date.now() };
  return next;
}
export const resetConfigCache = () => { cache = { v: null, at: 0 }; };

// ---- task reset periods ----
function effective(task, cfg) {
  const own = task.reset_mode && task.reset_mode !== 'inherit';
  return {
    mode: own ? task.reset_mode : cfg.tasks.resetMode,
    hours: own ? (task.reset_hours || cfg.tasks.resetHours) : cfg.tasks.resetHours
  };
}
// Start (in seconds) of the period a completion must fall inside to still count.
export function periodStartSec(task, cfg, tz, nowMs = Date.now()) {
  const { mode, hours } = effective(task, cfg);
  if (mode === 'never') return 0;
  if (mode === 'daily') return Math.floor(startOfDayMs(tz, nowMs) / 1000);
  if (mode === 'weekly') return Math.floor(startOfWeekMs(tz, nowMs) / 1000);
  return Math.floor(nowMs / 1000) - hours * 3600;
}
// When a completion made at completedAt (seconds) stops counting; null = never.
export function resetsAtSec(task, cfg, tz, completedAt) {
  const { mode, hours } = effective(task, cfg);
  if (mode === 'never') return null;
  if (mode === 'custom') return completedAt + hours * 3600;
  const startMs = mode === 'daily' ? startOfDayMs(tz, completedAt * 1000) : startOfWeekMs(tz, completedAt * 1000);
  return Math.floor(startMs / 1000) + (mode === 'daily' ? 86400 : 7 * 86400);
}
