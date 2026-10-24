"""Headless check of the deployed app: real Supabase mode shows sign-in; with a (fake) signed-in session and the
car_ tables missing, the One-time setup screen shows and the setup SQL can be fetched.
usage: /workspace/.venv-pw/bin/python tests/live_check.py https://eipselligkered-hash.github.io/car/"""
import sys, json, base64, time
from playwright.sync_api import sync_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "https://eipselligkered-hash.github.io/car/"
res = []
def ok(n, c): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", headless=True)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, locale="en-IE")
    pg = ctx.new_page(); errs = []; reqs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("request", lambda r: reqs.append(r.url))
    pg.goto(BASE); pg.wait_for_selector(".login")
    ok("live: sign-in screen", "Send sign-in email" in pg.inner_text("#view"))
    ok("live: no page errors", not errs)
    pg.wait_for_timeout(1500)
    ok("live: service worker registered", pg.evaluate("navigator.serviceWorker.getRegistrations().then(r=>r.length)") >= 1)
    pg.screenshot(path="screenshots/live-login.png")
    # fake session -> tables missing -> setup screen
    ctx2 = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, locale="en-IE", service_workers="block")
    b64 = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
    exp = int(time.time()) + 3600
    tok = b64({"alg": "HS256", "typ": "JWT"}) + "." + b64({"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated", "exp": exp}) + ".x"
    sess = {"access_token": tok, "refresh_token": "r", "expires_at": exp, "expires_in": 3600, "token_type": "bearer", "user": {"id": "00000000-0000-0000-0000-000000000001", "email": "test@example.com"}}
    ctx2.add_init_script(f"localStorage.setItem('car-auth', {json.dumps(json.dumps(sess))})")
    ctx2.route("**/rest/v1/**", lambda r: r.fulfill(status=404, content_type="application/json", body='{"code":"PGRST205","message":"Could not find the table \'public.car_items\' in the schema cache"}'))
    ctx2.route("**/realtime/**", lambda r: r.abort())
    pg2 = ctx2.new_page(); pg2.goto(BASE); pg2.wait_for_selector(".setup")
    ok("setup screen when tables missing", "One-time setup" in pg2.inner_text("#view"))
    sql = pg2.evaluate("fetch('supabase/setup.sql').then(r=>r.text())")
    ok("setup SQL served", "create table if not exists public.car_items" in sql)
    pg2.screenshot(path="screenshots/live-setup.png")
    # Supabase code path against an in-memory PostgREST stand-in: seed on first sign-in, tick, reload
    ctx3 = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, locale="en-IE", service_workers="block")
    ctx3.add_init_script(f"localStorage.setItem('car-auth', {json.dumps(json.dumps(sess))})")
    db, log = {t: [] for t in ["car_items", "car_dates", "car_checks", "car_wash", "car_jobs"]}, []
    state = {"jobs_missing": False}
    from urllib.parse import urlparse, parse_qs
    def rest(route):
        r = route.request; u = urlparse(r.url); t = u.path.rsplit("/", 1)[-1]; q = parse_qs(u.query); log.append(f"{r.method} {t} {u.query}")
        if not r.headers.get("authorization", "").endswith(tok): return route.fulfill(status=401, body="{}")
        if t == "car_jobs" and state["jobs_missing"]: return route.fulfill(status=404, content_type="application/json", body='{"code":"PGRST205","message":"Could not find the table \'public.car_jobs\' in the schema cache"}')
        rows = db[t]; match = lambda x: all(x.get(k[0:]) == v[0][3:] for k, v in q.items() if v[0].startswith("eq."))
        if r.method == "GET": return route.fulfill(status=200, content_type="application/json", body=json.dumps(rows))
        if r.method == "POST":
            new = json.loads(r.post_data); new = new if isinstance(new, list) else [new]
            for n in new:
                assert n.get("owner_id") == sess["user"]["id"], "owner_id"
                n.setdefault("started_at", "2026-10-24T10:00:00Z") if t == "car_checks" else None
                if t == "car_checks": n.setdefault("results", {}); n.setdefault("missing", []); n.setdefault("completed_on", None)
                if not any(x["id"] == n["id"] for x in rows): rows.append(n)
            return route.fulfill(status=201, content_type="application/json", body=json.dumps(new[0] if "single" in r.headers.get("accept", "") or "vnd.pgrst.object" in r.headers.get("accept", "") else new))
        if r.method == "PATCH":
            patch = json.loads(r.post_data); hit = [x for x in rows if match(x)]; [x.update(patch) for x in hit]
            return route.fulfill(status=200, content_type="application/json", body=json.dumps(hit[0] if hit else {}))
        if r.method == "DELETE": db[t] = [x for x in rows if not match(x)]; return route.fulfill(status=204, body="")
    ctx3.route("**/rest/v1/**", rest); ctx3.route("**/realtime/**", lambda r: r.abort())
    pg3 = ctx3.new_page(); e3 = []; pg3.on("pageerror", lambda e: e3.append(str(e)))
    pg3.goto(BASE + "?tab=kit&today=2026-10-24"); pg3.wait_for_selector(".stats")
    ok("supabase path: seeded 45 items / 7 dates / 6 wash / 14 jobs", (len(db["car_items"]), len(db["car_dates"]), len(db["car_wash"]), len(db["car_jobs"])) == (45, 7, 6, 14))
    ok("seed used upsert ignore-duplicates", any("on_conflict=id" in l for l in log))
    pg3.locator(".item", has_text="Compact umbrella").locator("[data-tick=packed]").tap(); pg3.wait_for_timeout(500)
    um = [x for x in db["car_items"] if x["name"] == "Compact umbrella"][0]
    ok("supabase path: tick saved (have+packed)", um["have"] and um["packed"])
    pg3.reload(); pg3.wait_for_selector(".stats"); ok("supabase path: no re-seed duplicates", len(db["car_items"]) == 45)
    ok("supabase path: tick shown after reload", "1/45" in pg3.inner_text(".stats"))
    pg3.click("[data-tab=jobs]"); pg3.wait_for_selector(".item.job")
    pg3.locator(".item.job", has_text="Charge to 100%").locator("[data-job-done]").tap(); pg3.wait_for_timeout(500)
    ok("supabase path: job Done saved", [x for x in db["car_jobs"] if x["title"].startswith("Charge")][0]["last_done"] == "2026-10-24")
    # database set up with the OLD setup.sql (no car_jobs): other tabs keep working, Car jobs shows the update card
    state["jobs_missing"] = True
    pg3.reload(); pg3.wait_for_selector(".stats"); pg3.click("[data-tab=jobs]"); pg3.wait_for_selector(".setup"); ok("old DB: Car jobs shows update card", "one quick update" in pg3.inner_text("#view"))
    pg3.click("[data-tab=kit]"); pg3.wait_for_selector(".stats"); ok("old DB: Kit still works", "1/45" in pg3.inner_text(".stats"))
    ok("supabase path: no page errors", not e3)
    b.close()
sys.exit(0 if all(res) else 1)
