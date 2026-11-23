# GAMEVERSE API Worker (Cloudflare Workers + D1; external download links)

One Worker powers every "live" feature of GAMEVERSE: visitor statistics, online tracking, game analytics,
star ratings, feedback, tasks & temporary access, rewarded-ad verification and the free-download manager.

```
Browser ──(public endpoints, random visitor id)──►  Worker ──► D1 (SQL data)
Admin  ──(Firebase ID token, verified server-side)─►  Worker ──► D1 (metadata; files hosted externally)
```

* **Admin security** – every `/v1/admin/*` call must carry the signed-in administrator's *Firebase ID token*.
  The Worker verifies the RS256 signature against Google's public keys, checks issuer/audience/expiry, that the
  e-mail equals `ADMIN_EMAIL` **and** `email_verified === true`. No Firebase service account or secret is needed.
* **No secrets in the frontend.** The only value the site needs is this Worker's public URL.
* **No R2 or payment setup is used.** Download files and cover images are hosted externally; the Worker stores HTTPS URLs and issues short-lived (5 min) download tickets.

---

## 1. One-time setup

Requirements: a Cloudflare account, Node 18+, and `npx wrangler login`.

```bash
cd worker

# 1) Create the database
npx wrangler d1 create gameverse            # copy the printed database_id into wrangler.toml

# 2) Edit wrangler.toml
#    - database_id            ← from step 1
#    - ALLOWED_ORIGINS        ← your website origin(s), comma separated, e.g. https://gameverse.you.workers.dev
#    - STATS_TIMEZONE         ← IANA zone used for "today" and daily/weekly task resets (default Asia/Kolkata)
#    - FIREBASE_PROJECT_ID / ADMIN_EMAIL are pre-filled from firebase-config.js

# 3) Create the schema (and the two starter tasks)
npx wrangler d1 migrations apply gameverse --remote

# 4) Secrets (never commit these)
npx wrangler secret put TOKEN_SECRET          # required: any long random string (>= 32 chars)
npx wrangler secret put ADS_POSTBACK_SECRET   # only if you use rewarded ads

# 5) Deploy
npx wrangler deploy                           # prints https://gameverse-api.<you>.workers.dev
```

Then tell the website where the Worker lives – either:

* sign in at `#admin` → **Feature Controls → Server connection**, paste the URL, *Save & Test* (no redeploy), or
* set `API_BASE` in `firebase-config.js` and redeploy the site.

Finally publish the updated Firestore rules (they close the old open rating/feedback writes):

```bash
firebase deploy --only firestore:rules
```

### Recommended hardening
* **Security → WAF → Rate limiting rules** – e.g. 100 requests / 10 s per IP on `api.*` as an extra layer
  (the Worker already enforces per-IP and per-visitor limits stored in D1).
* If you attach the Worker to a custom domain/route on the same site, you may set `ALLOWED_ORIGINS` to that origin only.
* Local development: `npx wrangler dev` (add `http://localhost:5173` to `ALLOWED_ORIGINS`).

---

## 2. Database schema

`migrations/0001_init.sql` (base schema), `0002_seed_tasks.sql` (starter tasks), and `0003_download_details.sql` (download metadata, independent ratings/feedback and click counters) – applied with
`wrangler d1 migrations apply`. Tables:

| Table | Purpose |
|---|---|
| `settings` | JSON config (feature switches, task/ads/feedback settings) |
| `counters`, `visitors`, `visitor_days`, `daily_counts`, `online` | visitor analytics (random ids only) |
| `game_stats`, `ratings` | views, Play Now clicks, rating histogram + per-visitor rating |
| `event_dedupe`, `rate_limits` | duplicate suppression and abuse limits (expiring rows) |
| `feedback` | visitor feedback + review status |
| `downloads` | free download records, detail metadata, publication state, click and file-request counters (external HTTPS URLs only) |
| `download_ratings` | independent per-download ratings and distribution |
| `download_feedback` | download-specific reports, moderation status and anti-spam |
| `tasks`, `task_opens`, `task_completions` | task definitions and per-visitor progress |
| `access_grants` | temporary access (from tasks or rewarded ads) |
| `ad_sessions`, `ad_events` | rewarded-ad ledger (idempotent provider callbacks) |

## 3. How the counters are defined (so the numbers are honest)

* **Total visitors** – distinct random browser ids ever seen *since the Worker was deployed* (starts at 0).
* **Today's visitors** – distinct ids seen today in `STATS_TIMEZONE`.
* **Currently online** – distinct visitors with a heartbeat in the last **130 s** (heartbeat every 60 s while the tab is visible).
  Two tabs of one browser count once. Admin traffic (a request carrying the admin token), bots and the `#admin` route are excluded.
* **Page views** – one per visitor per game per 30 minutes. **Play Now clicks** – one per visitor per game per 30 s.
  These are *clicks*, not proof that a game loaded (the games run on other websites, so this cannot be known).
* **Download button clicks** – one per issued ticket request. **File requests** – requests that reach the file-serving endpoint. Neither proves the visitor received or opened the complete file.
* Ratings: one per visitor id per game (editable). Anonymous and unverified – the UI never claims otherwise.

## 4. API reference

Public (no sign-in; browser sends header `X-GV-Visitor: <random id>`):

| Method & path | Notes |
|---|---|
| `GET /v1/config` | public feature switches & settings |
| `POST /v1/ping` | visit + heartbeat |
| `GET /v1/stats` | `totalVisitors, todayVisitors, online, totalPlays, totalViews` (`null` when a feature is off) |
| `GET /v1/games` · `GET /v1/games/:id` | bulk / single game stats (+ visitor's own rating) |
| `POST /v1/games/:id/view` · `/play` · `/rate {stars}` | analytics & rating |
| `POST /v1/feedback {category,message,gameId?}` | honeypot field `website` must be empty |
| `GET /v1/downloads` · `POST /v1/downloads/:id/ticket` · `GET /v1/dl/:id?t=` | list, ticket, redirect to external file |
| `GET /v1/me` | the visitor's tasks, access state and ad session |
| `POST /v1/tasks/:id/open` · `/complete` · `POST /v1/access/claim` | task flow |
| `POST /v1/ads/session` · `GET /v1/ads/session/:sid` | rewarded-ad session |
| `GET|POST /v1/ads/postback` | **provider → server** callback (HMAC-signed) |

Admin (`Authorization: Bearer <Firebase ID token>`): `GET/PUT /v1/admin/config`, `GET /v1/admin/overview`,
`GET /v1/admin/game-stats`, `DELETE /v1/admin/game-stats/:id`, downloads CRUD (external HTTPS file and cover URLs),
tasks CRUD + `PUT /v1/admin/tasks-order`, feedback list/detail/status/delete/bulk, `POST /v1/admin/maintenance/cleanup`.

## 5. Rewarded ads – what you must provide

No ad network is bundled and none is faked. The Worker supplies the secure part – a session ledger and a signed,
idempotent server-to-server callback. To go live you need an ad provider that offers a **hosted rewarded-ad page** and
**server-to-server completion callbacks**.

1. Set the Worker secret `ADS_POSTBACK_SECRET`.
2. Admin → **Rewarded Ads**: paste the provider's launch URL containing `{sid}`, set *ads required* and *minutes of access*, switch it ON.
3. In the provider dashboard point the completion callback at `https://<worker>/v1/ads/postback` with parameters
   `sid`, `event_id` (unique per ad view), `status` (`completed|failed|cancelled`), `ts` (unix seconds) and
   `sig = hex(HMAC-SHA256(ADS_POSTBACK_SECRET, "sid=<sid>&event_id=<event_id>&status=<status>&ts=<ts>"))`.
   If your provider signs differently, adapt the small `adsPostback` function in `src/public.js`.

Until the secret **and** the launch URL exist the public site shows a clearly disabled "unavailable" card.
Only `completed` callbacks count; duplicates (same `event_id`) are ignored; failed/cancelled are logged only.

## 6. Tests

```bash
npm run test:worker      # 44 integration tests: real Worker code, real SQL (node:sqlite), signed RS256 tokens
bash tests/e2e/run.sh    # 97 browser checks (needs Playwright + Chromium)
```
The test harness uses SQLite-backed D1 and a stubbed Google key endpoint; it does **not** touch Cloudflare.
