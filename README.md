# GAMEVERSE

Gaming directory + community platform. Vanilla JS / Vite front end, Firebase (Auth + Firestore for games & site
settings), Cloudflare Worker + D1 for everything that must be shared, persistent or secure. Download files and cover images use external HTTPS URLs; no R2 bucket or payment setup is required.

## What's included

| Area | Where |
|---|---|
| Website | `index.html`, `app.js`, `ui-public.js`, `core.js`, `api.js`, `styles.css`, `features.css` |
| Admin panel (`#admin`) | `app.js` (games, homepage, media, ads) + `ui-admin.js`, `ui-admin-downloads.js` |
| API Worker, SQL schema | `worker/` (see `worker/README.md`) |
| Firebase rules | `firestore.rules`, `storage.rules` |
| Tests | `worker/test/`, `tests/e2e/` |

### Features
* **Free Download Details** – two-step library → individual details page; cover, short/full descriptions, version, dates, developer, supported devices, manually entered requirements, install guide and notices; free download button; admin preview, publish/unpublish, ordering, edit/delete and external HTTPS file and cover-image URLs.
* **Independent download ratings and feedback** – separate per-download rating totals/distribution and visitor rating, download-specific issue reports, per-download feedback switch, admin moderation and rate limits.
* **Download click analytics** – button/ticket requests are counted separately from file requests; neither is represented as proof that a visitor completed a download. No payments anywhere.
* **Visitor statistics** – total / today / currently online, persisted in D1, shown on the homepage; refreshes don't inflate it.
* **In-site game player (Feature 1)** – two-page game details/player flow, same-tab iframe player, fullscreen/exit/loading state, manually configured PC/mobile controls; Manage Games includes bulk HTTPS embed URL setup for existing games (provider embedding is not guaranteed).
* **Game pages** – cover, category, description, community rating, Play Now clicks, page views, rating panel (average, 5→1 histogram,
  accessible star picker, edit your rating) and feedback form.
* **Game analytics** – page views and Play Now clicks (separate, de-duplicated); per-game table in the admin.
* **Feedback** – categories, honeypot, rate limits, duplicate detection; admin inbox with filters, search, detail view, reviewed status, bulk actions, delete.
* **Tasks & access** – admin-configurable tasks (YouTube visit/subscribe/watch/like/comment, Discord, custom), required vs optional,
  ordering, per-task reset override, global reset (never/daily/weekly/custom), self-confirmation with a server-enforced wait.
  Optional unlock gate for the whole site (UI level) or for downloads only (enforced on the server).
* **Rewarded ads** – secure ledger + signed callback; shows a disabled state until a provider is configured (see `worker/README.md` §5).
* **Feature Controls** – ON/OFF switch for every feature, enforced by the Worker (not just hidden in the UI).
* UI: responsive (mobile menu, tablet, desktop), toasts, confirmation dialogs, skeleton loaders, empty/error states, reduced-motion support.

## Setup in 4 steps
1. `npm install` (Vite). Firebase config is already in `firebase-config.js`.
2. Deploy the Worker – follow **`worker/README.md`** (D1, secrets, migrations, `wrangler deploy`).
3. Connect: admin → *Feature Controls → Server connection* (or set `API_BASE` in `firebase-config.js`).
4. `firebase deploy --only firestore:rules`, then `npm run build` and deploy the site the way you do today
   (the build output in `dist/` is unchanged in structure; the Worker is a separate deployment).

Existing games, homepage/contact/ads/media settings, Cloudinary image hosting and Firebase login are preserved. The Games admin tab includes a one-click action to copy every existing HTTPS game URL into that game’s HTTPS embed URL and enable the in-site player. Test each host; iframe blocking is controlled by the external provider, and you can disable individual games after testing.
Old Firestore download entries can be imported from the Download Manager ("Import as external links").

## What changed vs. the previous version
* `analytics-worker/` was replaced by the full `worker/` (the old endpoints were unauthenticated).
* Firestore `ratings` / `feedback` no longer accept public writes (rules updated); the old star `<select>` and
  localStorage-only task gate were replaced by the server-backed versions. Legacy Firestore ratings/feedback are **not** migrated.
* Admin tabs: *Community Settings* → **Tasks & Access**; new **Rewarded Ads**; *Overview* now includes analytics.

## Testing status (honest summary)
Verified in this environment:
* ✅ JavaScript syntax checks pass for the changed front-end and Worker modules.
* ✅ **44 Worker integration tests** pass – real Worker code against real SQL (SQLite), real RS256 token verification,
  external-link download flow and D1 integration.
* ⚠️ Browser-level desktop/mobile visual testing was not run in this environment. The older Playwright admin download scenario still describes R2 uploads and must be updated before using that browser suite.

**Not** verified (could not be, offline sandbox) – please check after deploying:
* ⚠️ `npm run build` could not run because Vite is not installed in this environment (`vite: not found`). Run `npm install` then `npm run build`.
* ⚠️ Browser-level desktop/mobile visual testing and behaviour on the real Cloudflare runtime (D1/Workers limits), real Firebase Auth/Firestore (the browser tests use a stub SDK), and `firestore.rules`.
* ⚠️ Rewarded ads with a real ad provider (only the server logic was tested with simulated, correctly-signed callbacks).

## Honest limitations
* **Tasks are self-confirmed.** YouTube/Discord actions are not verified with their APIs and the UI says so ("SELF-CONFIRMED").
* **Play Now clicks ≠ gameplay.** Games open on other websites; a load cannot be detected. The UI labels them as clicks.
* **Ratings are anonymous and unverified.** One per browser id per game; a determined person clearing storage is limited only by IP rate limits.
* **Site-wide unlock gate is a UI gate**: it can't protect external game URLs. Use *Downloads only* for server-enforced gating.
* Total visitors start at 0 when the Worker is deployed; there's no imported baseline (no fake numbers).
* Each active visitor causes ~1–3 D1 writes per minute (heartbeat). Free-plan limits (100k writes/day) fit a small site; raise the interval in `api.js` if needed.
* Not implemented: CAPTCHA (honeypot + rate limits are used; Turnstile can be added), YouTube/Discord verification, an ad network.
