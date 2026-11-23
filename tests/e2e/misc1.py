import os, sys, hmac, hashlib, time; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screenshots'); os.makedirs(SHOTS, exist_ok=True)
errors = []; results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond))); print(("  ✓ " if cond else "  ✗ ") + name + (f"  [{extra}]" if (extra and not cond) else ""))
def postback(sid, event, status="completed"):
    ts = str(int(time.time())); msg = f"sid={sid}&event_id={event}&status={status}&ts={ts}"
    sig = hmac.new(b"e2e-ads", msg.encode(), hashlib.sha256).hexdigest()
    import urllib.parse
    return json.loads(urllib.request.urlopen(f"{API}/v1/ads/postback?" + urllib.parse.urlencode({"sid": sid, "event_id": event, "status": status, "ts": ts, "sig": sig})).read())
def no_overflow(page): return page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")

api("PUT", "/v1/admin/config", {"tasks": {"minSeconds": 1}}, admin=True)
api("POST", "/v1/admin/downloads", {"title": "Sample Game Pack", "description": "Long description " * 20, "fileType": "ZIP", "version": "2.1", "storage": "external", "externalUrl": "https://files.example.com/p.zip", "sizeBytes": 52428800, "published": True}, admin=True)

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------- mobile: gate + navigation ----------
    ctx = new_context(browser, mobile=True); page = ctx.new_page(); watch(page, errors)
    page.goto(BASE + "/"); page.wait_for_selector(".unlock-card")
    check("mobile: unlock screen fits (no horizontal scroll)", no_overflow(page))
    page.screenshot(path=SHOTS + "/20-mobile-unlock.png")
    # complete tasks quickly through the API for this visitor id so we can browse
    vid = page.evaluate("localStorage.getItem('gv_visitor_id')")
    for t in ["seed-youtube", "seed-discord"]:
        api("POST", f"/v1/tasks/{t}/open", {}, vid=vid)
    time.sleep(1.3)
    for t in ["seed-youtube", "seed-discord"]:
        api("POST", f"/v1/tasks/{t}/complete", {}, vid=vid)
    api("POST", "/v1/access/claim", {}, vid=vid)
    page.goto(BASE + "/#home"); page.reload(); page.wait_for_selector(".hero", timeout=10000)
    check("mobile: hamburger visible, desktop nav hidden", page.locator("#menu-btn").is_visible() and not page.locator("#main-nav").is_visible())
    page.locator("#menu-btn").click(); page.wait_for_selector("#main-nav.open")
    names = page.locator("#main-nav a").all_inner_texts()
    check("mobile menu lists Home/Games/Downloads/Tasks/Contact", all(n in names for n in ["HOME", "GAMES", "DOWNLOADS", "TASKS", "CONTACT"]), names)
    page.screenshot(path=SHOTS + "/21-mobile-menu.png")
    page.locator("#main-nav a", has_text="DOWNLOADS").click(); page.wait_for_selector(".dl-card")
    check("menu link navigates and closes the menu", "#downloads" in page.url and not page.locator("#main-nav.open").count())
    for route in ["#home", "#games", "#game/game-a", "#downloads", "#tasks", "#contact"]:
        page.goto(BASE + "/" + route); page.wait_for_timeout(1300)
        check(f"mobile 390px: {route} has no horizontal overflow", no_overflow(page))
    page.goto(BASE + "/#home"); page.wait_for_selector("#gv-stats"); page.wait_for_timeout(1500)
    page.locator("#gv-stats").screenshot(path=SHOTS + "/22-mobile-stats.png")
    page.goto(BASE + "/#game/game-a"); page.wait_for_selector("#rating-panel"); page.wait_for_timeout(1200)
    page.screenshot(path=SHOTS + "/23-mobile-game.png", full_page=True)
    page.goto(BASE + "/#downloads"); page.wait_for_selector(".dl-card"); page.screenshot(path=SHOTS + "/24-mobile-downloads.png", full_page=True)

    # ---------- two tabs of one visitor = one online visitor ----------
    t2 = ctx.new_page(); t2.goto(BASE + "/#home"); t2.wait_for_selector(".hero"); page.goto(BASE + "/#home"); page.wait_for_timeout(1500)
    d = debug(); check("same visitor in two tabs counts once as online", d["online"] == 1 and d["visitors"] == 1, (d["online"], d["visitors"]))
    t2.close(); ctx.close()

    # ---------- tablet ----------
    ctx = new_context(browser, tablet=True); page = ctx.new_page(); watch(page, errors)
    page.goto(BASE + "/"); page.wait_for_selector(".unlock-card")
    vid = page.evaluate("localStorage.getItem('gv_visitor_id')")
    api("PUT", "/v1/admin/config", {"access": {"scope": "off"}}, admin=True)
    for route in ["#home", "#games", "#game/game-a", "#downloads", "#tasks"]:
        page.goto(BASE + "/" + route); page.wait_for_timeout(1300)
        check(f"tablet 820px: {route} has no horizontal overflow", no_overflow(page))
    page.goto(BASE + "/#home"); page.wait_for_timeout(1200); page.screenshot(path=SHOTS + "/25-tablet-home.png")
    ctx.close()

    # ---------- homepage stat switches + error/retry state ----------
    ctx = new_context(browser); page = ctx.new_page(); watch(page, errors)
    page.goto(BASE + "/#home"); page.wait_for_selector("#gv-stats .stat-card"); page.wait_for_timeout(800)
    check("homepage stats visible when ON", page.locator("#gv-stats .stat-card").count() == 5)
    api("PUT", "/v1/admin/config", {"features": {"onlineTracking": False}}, admin=True)
    page.reload(); page.wait_for_selector("#gv-stats .stat-card"); page.wait_for_timeout(1000)
    check("'online' card disappears when online tracking is OFF (no fake number)", page.locator("[data-stat='online']").count() == 0 and page.locator("#gv-stats .stat-card").count() == 4)
    api("PUT", "/v1/admin/config", {"features": {"onlineTracking": True, "homepageStats": False}}, admin=True)
    page.reload(); page.wait_for_selector(".hero"); page.wait_for_timeout(800)
    check("homepage stats section hidden when switch is OFF", page.locator("#gv-stats").count() == 0)
    api("PUT", "/v1/admin/config", {"features": {"homepageStats": True}}, admin=True)
    page.route("**/v1/stats", lambda r: r.abort())
    page.reload(); page.wait_for_selector("#stats-retry", timeout=15000)
    check("stats failure → honest error state (dashes, retry button, no invented values)", "—" in page.inner_text("#gv-stats") and "unavailable" in page.inner_text("#stats-note"))
    page.screenshot(path=SHOTS + "/26-stats-error.png")
    page.unroute("**/v1/stats"); page.locator("#stats-retry").click()
    page.wait_for_function("!document.querySelector('#stats-retry')", timeout=10000)
    check("retry recovers", page.locator("[data-stat='totalVisitors'] .stat-value").inner_text() not in ("—", ""))
    ctx.close()

    # ---------- rewarded ads in the browser ----------
    api("PUT", "/v1/admin/config", {"access": {"scope": "site"}, "features": {"rewardedAds": True}, "ads": {"launchUrl": "", "adsRequired": 2}}, admin=True)
    ctx = new_context(browser); page = ctx.new_page(); watch(page, errors)
    page.goto(BASE + "/"); page.wait_for_selector(".unlock-card")
    check("ads enabled but provider missing → clearly disabled card", page.locator(".ads-card.disabled").count() == 1 and page.locator(".ads-card button").is_disabled() and "aren’t available" in page.inner_text(".ads-card"))
    page.screenshot(path=SHOTS + "/27-ads-disabled.png")
    api("PUT", "/v1/admin/config", {"ads": {"launchUrl": "https://ads.example/watch?u={sid}", "adsRequired": 2, "unlockMinutes": 60}}, admin=True)
    page.reload(); page.wait_for_selector("#ads-btn")
    check("provider configured → 'Watch ad' offered", "WATCH 2 ADS" in page.inner_text(".ads-card").upper() or "watch 2 ads" in page.inner_text(".ads-card").lower())
    with ctx.expect_page() as popup:
        page.locator("#ads-btn").click()
    popup.value.close()
    page.wait_for_function("document.querySelector('#ads-status') && document.querySelector('#ads-status').innerText.includes('Waiting')", timeout=8000)
    vid = page.evaluate("localStorage.getItem('gv_visitor_id')")
    sid = api("POST", "/v1/ads/session", {}, vid=vid)["sid"]
    check("clicking Watch Ad alone grants nothing", page.locator(".unlock-card").count() == 1 and api("GET", "/v1/me", vid=vid)["access"]["granted"] is False)
    postback(sid, "evt-1", "failed"); postback(sid, "evt-2", "cancelled"); postback(sid, "evt-3")
    page.wait_for_function("document.querySelector('#ads-status') && document.querySelector('#ads-status').innerText.includes('1 of 2')", timeout=9000)
    check("UI shows only the verified ad (failed/cancelled not counted)", True)
    postback(sid, "evt-3")  # duplicate callback
    check("duplicate callback ignored", api("GET", f"/v1/ads/session/{sid}", vid=vid)["completed"] == 1)
    postback(sid, "evt-4")
    page.wait_for_function("!document.querySelector('.unlock-card')", timeout=9000)
    check("after the provider confirms 2 ads the site unlocks", "#unlock" not in page.url)
    page.wait_for_selector("#gv-access-pill:not([hidden])"); txt = page.inner_text("#gv-access-pill")
    check("remaining unlock time displayed (~1 hour)", "ACCESS" in txt and ("59:" in txt or "1h" in txt), txt)
    # access expiry
    me = api("GET", "/v1/me", vid=vid); check("grant source is 'ads'", me["access"]["source"] == "ads")
    ctx.close()

    # ---------- backend not connected: honest, non-breaking ----------
    ctx = new_context(browser, api_url=""); page = ctx.new_page(); watch(page, errors)
    page.goto(BASE + "/"); page.wait_for_selector(".hero", timeout=12000)
    check("API not configured: site opens (no gate, no crash)", "#unlock" not in page.url)
    page.wait_for_timeout(800)
    check("API not configured: stats show an unavailable note, not fake numbers", "not available" in page.inner_text("#gv-stats") and page.locator("[data-stat='games'] .stat-value").inner_text() == "2")
    page.goto(BASE + "/#downloads"); page.wait_for_selector(".state-box"); check("API not configured: downloads shows an explanation", "aren’t available" in page.inner_text(".state-box"))
    page.goto(BASE + "/#game/game-a"); page.wait_for_selector("#rating-panel"); page.wait_for_timeout(600)
    check("API not configured: rating panel shows unavailable state", "not available" in page.inner_text("#rp-count"))
    ctx.close(); browser.close()

print("\nJS errors:", errors if errors else "none")
bad = [n for n, ok in results if not ok]
print(f"\n{len(results)-len(bad)}/{len(results)} checks passed"); sys.exit(1 if bad or errors else 0)
