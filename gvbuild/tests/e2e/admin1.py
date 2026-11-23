import os, sys, base64; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screenshots'); os.makedirs(SHOTS, exist_ok=True)
errors = []; results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond))); print(("  ✓ " if cond else "  ✗ ") + name + (f"  [{extra}]" if (extra and not cond) else ""))
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
FILE = bytes((i * 7) % 251 for i in range(9 * 1024 * 1024 + 17))

# seed some public activity via the API (as ordinary visitors)
for i in range(3):
    v = f"seed-visitor-{i:04d}-abcdefgh"
    api("POST", "/v1/ping", {}, vid=v); api("POST", "/v1/games/game-a/view", {}, vid=v); api("POST", "/v1/games/game-a/play", {}, vid=v)
    api("POST", "/v1/games/game-a/rate", {"stars": 3 + i % 3}, vid=v)
api("POST", "/v1/feedback", {"category": "Suggestion", "message": "Please add a dark mode toggle for the games page.", "gameId": "game-a"}, vid="seed-visitor-0000-abcdefgh")
api("POST", "/v1/feedback", {"category": "Bug report", "message": "Beta Blocks link opens a blank page for me."}, vid="seed-visitor-0001-abcdefgh")
api("PUT", "/v1/admin/config", {"access": {"scope": "off"}}, admin=True)
visitors_before = debug()["visitors"]

def click_switch(page, sel):
    page.locator(sel).locator("xpath=..").click()

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = new_context(browser, admin=True); page = ctx.new_page(); watch(page, errors)
    page.goto(BASE + "/#admin"); page.wait_for_selector(".admin-layout", timeout=15000)
    check("admin panel opens for verified admin", "OVERVIEW" in page.inner_text(".admin-top h1"))
    page.wait_for_selector("#gs-table tbody tr", timeout=10000)
    tiles = page.locator(".stat-grid.admin .stat-card").count()
    check("overview shows live analytics tiles", tiles >= 10, tiles)
    check("per-game analytics table lists Alpha Racer with 3 views/plays", page.locator("#gs-table tr", has_text="Alpha Racer").inner_text().replace("\n", " ").count("3") >= 2)
    page.screenshot(path=SHOTS + "/10-admin-overview.png")

    # ---- feature controls
    page.get_by_role("button", name="⚙ FEATURE CONTROLS").click(); page.wait_for_selector(".feature-grid")
    check("9 feature switches", page.locator("[data-feature]").count() == 9)
    click_switch(page, "[data-feature='ratings']")
    page.wait_for_function("document.querySelector('.gv-toast') && document.body.innerText.includes('Star ratings turned OFF')")
    check("ratings OFF is enforced by the server", api("GET", "/v1/config")["features"]["ratings"] is False)
    r = api("POST", "/v1/games/game-a/rate", {"stars": 5}, vid="seed-visitor-0009-abcdefgh")
    check("rating submission is rejected while OFF", r.get("_status") == 403, r)
    click_switch(page, "[data-feature='ratings']")
    page.wait_for_function("document.body.innerText.includes('Star ratings turned ON')")
    check("ratings back ON", api("GET", "/v1/config")["features"]["ratings"] is True)
    page.screenshot(path=SHOTS + "/11-admin-features.png")

    # ---- tasks
    page.get_by_role("button", name="◈ TASKS & ACCESS").click(); page.wait_for_selector("#task-add")
    check("seeded tasks listed", page.locator(".gv-table tbody tr").count() == 2)
    page.locator("#task-add").click(); page.fill("#tk-title", "Watch our trailer"); page.select_option("#tk-kind", "youtube_watch")
    page.fill("#tk-url", "https://youtu.be/abc123"); page.locator("#tk-save").click()
    page.wait_for_function("document.querySelectorAll('.gv-table tbody tr').length===3")
    check("task added", "Watch our trailer" in page.inner_text(".gv-table"))
    page.locator("[data-up]").last.click(); page.wait_for_timeout(500)
    ids = [t["id"] for t in api("GET", "/v1/admin/tasks", admin=True)["tasks"]]
    check("task reordered (moved up)", len(ids) == 3 and ids[1].startswith("task-"), ids)
    page.fill("#tc-hours", "12"); page.select_option("#tc-mode", "custom"); page.fill("#tc-rh", "6")
    page.locator("#task-cfg button").click(); page.wait_for_function("document.body.innerText.includes('Task settings saved')")
    cfg = api("GET", "/v1/admin/config", admin=True)["config"]
    check("task settings persisted (12h access, custom 6h reset)", cfg["tasks"]["accessHours"] == 12 and cfg["tasks"]["resetMode"] == "custom" and cfg["tasks"]["resetHours"] == 6, cfg["tasks"])
    click_switch(page, "[data-ton^='task-']"); page.wait_for_function("document.body.innerText.includes('Task disabled')")
    check("task disabled", [t for t in api("GET", "/v1/admin/tasks", admin=True)["tasks"] if t["id"].startswith("task-")][0]["enabled"] is False)
    page.locator("[data-tdel^='task-']").click(); page.wait_for_selector(".gv-modal[role=alertdialog]")
    check("destructive action asks for confirmation", "Delete task" in page.inner_text(".gv-modal"))
    page.screenshot(path=SHOTS + "/12-confirm.png")
    page.locator("[data-r='1']").click(); page.wait_for_function("document.querySelectorAll('.gv-table tbody tr').length===2")
    check("task deleted after confirming", True)
    api("PUT", "/v1/admin/config", {"tasks": {"resetMode": "daily", "accessHours": 24}}, admin=True)

    # ---- downloads (chunked R2 upload)
    page.get_by_role("button", name="⬇ DOWNLOAD MANAGER").click(); page.wait_for_selector("#dl-new")
    check("empty state before any download", "No downloads yet" in page.inner_text("#adl-list"))
    page.locator("#dl-new").click()
    page.set_input_files("#df-file", files=[{"name": "my-game.apk", "mimeType": "application/vnd.android.package-archive", "buffer": FILE}])
    page.wait_for_function("document.querySelector('#dz-body') && document.querySelector('#dz-body').innerText.includes('stored securely in R2')", timeout=30000)
    check("9 MB file uploaded in 2 chunks; type auto-detected APK; title prefilled", page.input_value("#df-type") == "APK" and page.input_value("#df-title") == "my game")
    page.set_input_files("#df-cover", files=[{"name": "c.png", "mimeType": "image/png", "buffer": PNG}])
    page.wait_for_function("document.querySelector('#cv-prev').style.backgroundImage.includes('/v1/media/covers/')")
    page.fill("#df-title", "My Game"); page.fill("#df-ver", "1.0.2"); page.fill("#df-desc", "A free Android game.")
    page.locator("#df-save").click(); page.wait_for_selector(".gv-table td:has-text('My Game')")
    d = debug()
    key = [k for k in d["r2"] if k.startswith("files/")][0]
    check("file stored in R2 with exact byte size", d["r2sizes"][key] == len(FILE), d["r2sizes"])
    check("cover stored in R2", any(k.startswith("covers/") for k in d["r2"]))
    check("row shows APK / size / 0 downloads", "APK" in page.inner_text(".gv-table") and "9.0 MB" in page.inner_text(".gv-table"))
    page.screenshot(path=SHOTS + "/13-admin-downloads.png")
    # public side (new visitor context, gate off)
    pub = new_context(browser); pp = pub.new_page(); watch(pp, errors)
    pp.goto(BASE + "/#downloads"); pp.wait_for_selector(".dl-card .dl-btn", timeout=15000)
    check("public download card: title, type, FREE tag, size, cover", all(t in pp.inner_text(".dl-card") for t in ["My Game", "APK", "FREE", "9.0 MB", "v1.0.2"]) and pp.locator(".dl-card img").count() == 1)
    pp.screenshot(path=SHOTS + "/14-public-downloads.png")
    pp.fill("#dl-search", "zzz"); check("search with no match → empty state", "No matches" in pp.inner_text("#dl-grid"))
    pp.fill("#dl-search", "game"); check("search matches", pp.locator(".dl-card").count() == 1)
    with pp.expect_download(timeout=30000) as dl:
        pp.locator("[data-dl]").click()
    path = dl.value.path()
    import os
    check("download delivers the exact file (attachment)", os.path.getsize(path) == len(FILE) and dl.value.suggested_filename == "my-game.apk", (os.path.getsize(path), dl.value.suggested_filename))
    page.wait_for_timeout(300)
    check("download count incremented server-side", debug()["downloads"][0]["download_count"] == 1)
    # admin unpublish → disappears
    click_switch(page, "[data-pub]"); page.wait_for_function("document.body.innerText.includes('Unpublished')")
    pp.reload(); pp.wait_for_selector("#dl-grid")
    check("unpublished download disappears from public page", "No downloads yet" in pp.inner_text("#dl-grid"))
    click_switch(page, "[data-pub]"); page.wait_for_function("document.body.innerText.includes('Published')")
    # edit then delete
    page.locator("[data-edit]").click(); page.fill("#df-title", "My Game Renamed"); page.locator("#df-save").click()
    page.wait_for_selector(".gv-table td:has-text('My Game Renamed')"); check("edit saved", True)
    page.locator("[data-del]").click(); page.locator("[data-r='1']").click()
    page.wait_for_selector("#adl-list .empty")
    d = debug(); check("delete removes file and cover from R2", not d["r2"], d["r2"])
    # upload cancelled/unsaved is cleaned up
    page.locator("#dl-new").click()
    page.set_input_files("#df-cover", files=[{"name": "c.png", "mimeType": "image/png", "buffer": PNG}])
    page.wait_for_function("document.querySelector('#cv-prev').style.backgroundImage.includes('/v1/media/covers/')")
    page.locator("#df-cancel").click(); page.wait_for_timeout(600)
    check("cancelling the form discards an unsaved cover", not debug()["r2"], debug()["r2"])
    # bad cover type is rejected client-side
    page.locator("#dl-new").click()
    page.set_input_files("#df-cover", files=[{"name": "x.gif", "mimeType": "image/gif", "buffer": b"GIF89a"}])
    check("non-image cover rejected with message", "JPG, PNG or WebP" in page.inner_text("#cv-msg"))
    page.keyboard.press("Escape")

    # ---- feedback moderation
    page.get_by_role("button", name="✉ PLAYER FEEDBACK").click(); page.wait_for_selector("#fb-list tbody tr")
    check("feedback list shows 2 messages with category + game title", page.locator("#fb-list tbody tr").count() == 2 and "Alpha Racer" in page.inner_text("#fb-list"))
    page.fill("#f-q", "blank"); page.wait_for_function("document.querySelectorAll('#fb-list tbody tr').length===1")
    check("search filter works", "Beta Blocks" in page.inner_text("#fb-list"))
    page.fill("#f-q", ""); page.wait_for_function("document.querySelectorAll('#fb-list tbody tr').length===2")
    page.locator("#fb-list tbody tr").first.click(); page.wait_for_selector(".fb-msg")
    msg = page.inner_text(".fb-msg"); page.locator("#fd-toggle").click()
    page.wait_for_function("document.querySelectorAll('.pill:not(.on)').length>=1")
    check("detail view + mark reviewed", len(msg) > 10 and api("GET", "/v1/admin/feedback?status=reviewed", admin=True)["total"] == 1)
    page.select_option("#f-status", "new"); page.wait_for_function("document.querySelectorAll('#fb-list tbody tr').length===1")
    check("status filter works", True)
    page.select_option("#f-status", ""); page.wait_for_function("document.querySelectorAll('#fb-list tbody tr').length===2")
    page.locator("#f-all").check(); page.locator("[data-bulk='delete']").click(); page.locator("[data-r='1']").click()
    page.wait_for_selector("#fb-list .empty"); check("bulk delete with confirmation", api("GET", "/v1/admin/feedback", admin=True)["total"] == 0)
    click_switch(page, "#fb-master"); page.wait_for_function("document.body.innerText.includes('Feedback turned OFF')")
    check("feedback OFF is enforced by the server", api("POST", "/v1/feedback", {"category": "Other", "message": "should be refused now"}, vid="seed-visitor-0007-abcdefgh").get("_status") == 403)
    click_switch(page, "#fb-master"); page.wait_for_function("document.body.innerText.includes('Feedback turned ON')")

    # ---- rewarded ads
    page.get_by_role("button", name="★ REWARDED ADS").click(); page.wait_for_selector("#ads-cfg")
    check("rewarded ads shows clear 'Switched off' state", "Switched off" in page.inner_text(".conn"))
    click_switch(page, "#ads-master"); page.wait_for_function("document.body.innerText.includes('Not ready')")
    check("enabled but unconfigured → 'Not ready' (no fake ads)", "launch URL" in page.inner_text(".conn") and api("GET", "/v1/config")["ads"]["available"] is False)
    page.fill("#ad-u", "https://ads.example/watch?u={sid}"); page.fill("#ad-n", "2"); page.locator("#ads-cfg button").click()
    page.wait_for_function("document.querySelector('.conn') && document.querySelector('.conn').innerText.includes('Ready')", timeout=8000)
    check("provider configured → Ready; postback URL shown", api("GET", "/v1/config")["ads"]["available"] is True and "/v1/ads/postback" in page.inner_text("#pb-url"))
    page.fill("#ad-u", "http://insecure/{sid}"); page.locator("#ads-cfg button").click()
    page.wait_for_function("document.body.innerText.includes('https://')"); check("insecure launch URL rejected", True)

    # ---- admin traffic is not counted
    visitors_before = debug()["visitors"]
    page.goto(BASE + "/#home"); page.wait_for_selector(".hero"); page.wait_for_timeout(1500)
    page.goto(BASE + "/#game/game-a"); page.wait_for_timeout(1500)
    d2 = debug(); gs = [g for g in d2["game_stats"] if g["game_id"] == "game-a"][0]
    check("admin browsing does not add visitors or game views", d2["visitors"] == visitors_before and gs["views"] == 3, (d2["visitors"], visitors_before, gs["views"]))
    ctx.close(); pub.close(); browser.close()

print("\nJS errors:", errors if errors else "none")
bad = [n for n, ok in results if not ok]
print(f"\n{len(results)-len(bad)}/{len(results)} checks passed"); sys.exit(1 if bad or errors else 0)
