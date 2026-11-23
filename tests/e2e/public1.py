import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screenshots'); os.makedirs(SHOTS, exist_ok=True)
errors = []; results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond))); print(("  ✓ " if cond else "  ✗ ") + name + (f"  [{extra}]" if (extra and not cond) else ""))

# server-side setup (as admin): short task wait so the test is quick
api("PUT", "/v1/admin/config", {"tasks": {"minSeconds": 2}}, admin=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = new_context(browser); page = ctx.new_page(); watch(page, errors)
    page.goto(BASE + "/")
    page.wait_for_selector(".unlock-card", timeout=15000)
    check("fresh visitor is gated to #unlock", page.url.endswith("#unlock"))
    check("two seeded task cards shown", page.locator(".task-card").count() == 2)
    check("tasks are labelled SELF-CONFIRMED (not verified)", page.locator(".verif").count() == 2 and "SELF-CONFIRMED" in page.inner_text(".verif"))
    check("claim button disabled before tasks", page.locator("#claim-btn").is_disabled())
    check("rewarded ads card hidden while feature is off", page.locator(".ads-card").count() == 0)
    page.screenshot(path=SHOTS + "/01-unlock.png")
    for i in range(2):
        card = page.locator(".task-card").nth(i)
        with ctx.expect_page() as popup:
            card.locator("[data-open]").click()
        popup.value.close()
        c = page.locator(".task-card").nth(i)
        c.locator("[data-wait],[data-confirm]").first.wait_for()
        c.locator("[data-confirm]").wait_for(timeout=8000)
        c.locator("[data-confirm]").click()
        c.locator(".task-done").wait_for()
    check("both tasks show COMPLETED", page.locator(".task-done").count() == 2)
    check("claim enabled after all required tasks", page.locator("#claim-btn").is_enabled())
    page.screenshot(path=SHOTS + "/02-unlock-done.png")
    page.locator("#claim-btn").click()
    page.wait_for_selector(".hero, .stat-grid", timeout=10000)
    check("unlock → site opens", "#unlock" not in page.url)
    page.wait_for_selector("#gv-access-pill:not([hidden])", timeout=5000)
    check("access countdown pill visible", "ACCESS" in page.inner_text("#gv-access-pill"))
    # reload keeps access (server-side persistence)
    page.reload(); page.wait_for_selector(".hero", timeout=10000)
    check("access persists across reload (server-side)", "#unlock" not in page.url)

    # homepage stats
    page.goto(BASE + "/#home"); page.wait_for_selector("#gv-stats .stat-card")
    page.wait_for_function("[...document.querySelectorAll('#gv-stats .stat-value')].every(e=>!e.classList.contains('skel'))", timeout=8000)
    page.wait_for_timeout(1000)
    vals = {c.get_attribute("data-stat"): c.locator(".stat-value").inner_text() for c in page.locator("#gv-stats .stat-card").all()}
    check("5 stat cards present", len(vals) == 5, vals)
    check("visitor counts are real (>=1)", vals.get("totalVisitors","0") not in ("0","—") and vals.get("online","0") not in ("0","—"), vals)
    check("Games Available = published games (2)", vals.get("games") == "2", vals)
    page.screenshot(path=SHOTS + "/03-home-stats.png", full_page=False)
    page.locator("#gv-stats").screenshot(path=SHOTS + "/03b-stats.png")

    # game page
    page.goto(BASE + "/#game/game-a"); page.wait_for_selector("#rating-panel")
    page.wait_for_function("document.querySelector('#rp-count').textContent.includes('No ratings')", timeout=8000)
    check("game page: community bar + rating panel", page.locator("#community-bar").count() == 1 and page.locator(".star-pick .sp").count() == 5)
    page.locator(".sp[data-v='4']").click()
    check("submit enabled after picking a star", page.locator("#rp-submit").is_enabled())
    page.locator("#rp-submit").click()
    page.wait_for_function("document.querySelector('#rp-count').textContent.includes('Based on 1 rating')", timeout=8000)
    check("rating submitted: avg 4.0 and 1 rating", page.inner_text("#rp-avg") == "4.0" and "Based on 1 rating" in page.inner_text("#rp-count"))
    check("distribution bar for 4 stars is 100%", "100" in page.locator(".rp-row[data-n='4'] .rp-fill").get_attribute("style"))
    check("confirmation message", "Saved" in page.inner_text("#rp-msg"))
    page.locator("#community-bar").scroll_into_view_if_needed()
    page.screenshot(path=SHOTS + "/04-game.png", full_page=True)
    page.reload(); page.wait_for_selector("#rating-panel .sp.on")
    page.wait_for_function("document.querySelector('#rp-count').textContent.includes('Based on 1')")
    check("returning visitor sees their own rating", "Your rating" in page.inner_text("#rp-rate") and page.locator(".sp.on").count() == 4)
    page.locator(".sp[data-v='5']").click(); page.locator("#rp-submit").click()
    page.wait_for_function("document.querySelector('#rp-avg').textContent==='5.0'", timeout=8000)
    check("changing rating updates (still 1 rating)", "Based on 1 rating" in page.inner_text("#rp-count"))
    # play click
    page.evaluate("document.querySelector('#play-game-btn').addEventListener('click',e=>e.preventDefault())")
    page.locator("#play-game-btn").click(); page.wait_for_timeout(600)
    page.reload(); page.wait_for_function("document.querySelector('#cb-plays strong') && !document.querySelector('#cb-plays strong').classList.contains('skel')")
    check("Play Now click counted once; page view counted once despite reload", page.inner_text("#cb-plays strong") == "1" and page.inner_text("#cb-views strong") == "1", (page.inner_text("#cb-plays strong"), page.inner_text("#cb-views strong")))
    # feedback
    page.locator("#fb-msg").fill("The cover image looks stretched on my phone.")
    page.select_option("#fb-cat", "Bug report"); page.locator("#fb-send").click()
    page.wait_for_selector(".fb-done", timeout=8000)
    check("feedback success state shown", "Thank you" in page.inner_text(".fb-done"))
    d = debug()
    check("feedback persisted in database with game id", any(f["game_id"] == "game-a" and f["category"] == "Bug report" for f in d["feedback"]))
    check("exactly one rating row stored", len([r for r in d["ratings"] if r["game_id"] == "game-a"]) == 1)
    ctx.close(); browser.close()

print("\nJS errors:", errors if errors else "none")
bad = [n for n, ok in results if not ok]
print(f"\n{len(results)-len(bad)}/{len(results)} checks passed"); sys.exit(1 if bad or errors else 0)
