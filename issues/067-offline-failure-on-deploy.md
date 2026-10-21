# 067: Offline reload fails on the GitHub Pages deploy

- Status: Open
- Date: 2026-10-21, Reporter: user

## Description

The user's report, verbatim:

> have a subagent investigate why the website doesn't work offline. i have
> deployed to adem482p.github.io/time. i tried reloading the page without wifi
> and it didn't work

**Observed:** with the site deployed at `https://adem482p.github.io/time/`
(a GitHub Pages project-pages **subpath** deployment), the user connected,
then lost wifi and reloaded the page. The reload failed — the site did not
render offline.

**Expected:** per the approved plan in `issues/063-offline-support.md`, after
one online session the site should be viewable without a network connection:
online loads are network-first (cache destroyed and rebuilt), and offline the
last-cached state answers every page. A reload without wifi should render the
four pages, the stylesheet, the scripts, the three vendored fonts and
`emplois.csv` from that cache.

## Root cause

The offline machinery was **never built**: the plan in
`issues/063-offline-support.md` (service worker `sw.js` + `js/register.js` +
21-URL precache, network-first) is approved but **not implemented** — this
worktree contains no `sw.js`, no `js/register.js`, and no `serviceWorker` string
anywhere in the shipped code, so **zero service workers are registered** (live
probe: `https://adem482p.github.io/time/sw.js` → **404**, confirmed). With no
service worker, the only offline mechanism is the browser's incidental HTTP
cache, and GitHub Pages serves every asset with **`cache-control: max-age=600`**
(measured on all five probed `200` URLs; the two `404` responses carry no
`cache-control`) — fresh for 10 minutes only. Chrome's reload
revalidates the navigation, which requires the network; once the entries are
stale (or the request is cache-busted) the reload needs the origin and fails
with `ERR_INTERNET_DISCONNECTED`. `issues/063-offline-support.md`'s Root cause
("a feature that was never built, not a bug") is therefore *the* cause here too,
now observed in production rather than on the dev server.

## Repro steps

**On the deployed site:**

1. With wifi, open `https://adem482p.github.io/time/` (or `/time/index.html`).
   **Observed:** renders (`2093 sessions · 132 teachers`) — the browser HTTP
   cache now holds HTML/CSS/JS/CSV, each valid for 600 s.
2. Disconnect from the network (turn off wifi).
3. Reload the same page (F5 / the reload button).
   **Observed (user):** the reload fails; the site does not render offline.
   **Measured equivalent (Playwright, see `## Discussion`):** a normal reload
   with the network down fails the navigation even *within* the 10-minute
   freshness window, because Chrome revalidates the document
   (`Cache-Control: max-age=0` request semantics) and the origin cannot answer
   → `net::ERR_INTERNET_DISCONNECTED`.
4. Any cache-busted navigation while offline (`…/time/index.html?cb=<ts>`) also
   fails outright — nothing on the origin has a cache entry for that URL key.

**Local comparison (why it looks fine in development):**

1. `cd <worktree> && python3 -m http.server 8167 --bind 127.0.0.1` (record the
   real PID from `ss -ltnp | grep 8167`; kill by PID afterwards — never
   `pkill -f`).
2. `curl -sI http://127.0.0.1:8167/index.html` → **no `Cache-Control` header**,
   only `Last-Modified` (measured; exact headers in `## Discussion` §3). Chrome
   therefore applies *heuristic* freshness — 10 % of the time since
   `Last-Modified` — a window that **grows with the checkout's age** (an hour-old
   checkout ⇒ minutes; a day-old checkout ⇒ hours), so on a long-lived local
   checkout an offline reload *appears* to work from the HTTP cache, while the
   production deploy expires after a fixed 10 minutes. See issue 063's Repro
   steps 4 for the measured local reload that renders from the heuristic cache.
3. Stop the server by its recorded PID and confirm the port is free.

## Discussion

### Investigation result (2026-10-21)

*(Reporter → Investigator fold, 067. Diagnosis only — no code changed. Live
site measured from this sandbox, which **has** network egress; all live claims
below are measured, not assumed. Local facts measured in this worktree.)*

#### 1. Deployed asset inventory (measured, `curl -sI`, HTTP/2, 2026-10-21)

| URL | status | `cache-control` | `etag` | `expires` | `content-type` | `content-length` |
|---|---|---|---|---|---|---|
| `/time/` | **200** | `max-age=600` | `"6ad80160-f37"` | +600 s | `text/html; charset=utf-8` | 3895 |
| `/time/classes.html` | **200** | `max-age=600` | `"6ad80160-fd1"` | +600 s | `text/html; charset=utf-8` | 4049 |
| `/time/styles.css` | **200** | `max-age=600` | `"6ad80160-b1c9"` | +600 s | `text/css; charset=utf-8` | 45513 |
| `/time/js/theme.js` | **200** | `max-age=600` | `"6ad80160-b485"` | +600 s | `application/javascript; charset=utf-8` | 46213 |
| `/time/emplois.csv` | **200** | `max-age=600` | `"6ad80160-4489a"` | +600 s | `text/csv; charset=utf-8` | 280730 |
| `/time/sw.js` | **404** | *(none)* | `"6abcf5c5-24a3"` | *(none)* | `text/html` (GH Pages 404 page) | 9379 |
| `/time/manifest.webmanifest` | **404** | *(none)* | `"6abcf5c5-24a3"` | *(none)* | `text/html` (GH Pages 404 page) | 9379 |
| `/time/js/register.js` (probed, plan's new file) | **404** | *(none)* | — | — | `text/html` | 9379 |
| `/time/vendor/dejavu-sans.woff2` (probed) | **200** | `max-age=600` | — | +600 s | `font/woff2` | 24516 |

Every `200` also carries `last-modified: Wed, 21 Oct 2026 00:03:44 GMT`,
`age` (edge-cache age, 10–13 s) and `vary: Accept-Encoding`; the `expires`
timestamps are exactly `now + 600 s`, confirming the `max-age` is the operative
freshness. **Confirmed, not assumed: GitHub Pages serves
`cache-control: max-age=600` on every asset** — responses are fresh for 10
minutes, after which any use must revalidate against the origin.

Deploy currency check: the live `content-length`s are byte-identical to the
files in this worktree (`index.html` 3895, `classes.html` 4049, `styles.css`
45513, `emplois.csv` 280730), `last-modified` is 2026-10-21 00:03 GMT — the
deploy is current and untransformed. Sibling paths `test/libgroups.test.js`,
`data/extract.py`, `Design.md`, `README.md` all serve (200), so the deploy is
the repository tree, with the exception that **`/time/issues/` 404s** (the
issues directory is not part of the published deploy; irrelevant to the
offline question, recorded as a deploy fact).

#### 2. The failure mechanics (the causal chain)

1. **No service worker exists or is registered.** Code side (this worktree):
   no `sw.js` file, no `js/register.js`, and
   `grep -rn "serviceWorker|navigator\.service|workbox" --include=*.html
   --include=*.js --include=*.css .` over the **entire tree** (including
   `test/`; only `.git/` skipped) returns **zero matches**, as does
   `grep -rn "caches\."` over the shipped code (`js/`, the four pages,
   `styles.css`). Live side: `/time/sw.js` → **404** (table above). Measured in
   the production browser (§4): `navigator.serviceWorker.getRegistrations()`
   → `[]`, `caches.keys()` → `[]` — the same emptiness issue 063 measured on
   the dev server. A service worker is the only web platform mechanism that can
   serve a *navigation* offline deterministically; without one, the browser's
   HTTP cache is the whole story.
2. **The HTTP cache is the only offline mechanism — and GH Pages makes it
   short-lived.** `cache-control: max-age=600` means each cached response stops
   being *fresh* 10 minutes after it was fetched. Freshness is what lets a
   browser answer a request without touching the network.
3. **Chrome's reload semantics require the network.** A normal reload (F5)
   revalidates the document — the navigation request carries
   `Cache-Control: max-age=0`, i.e. "must revalidate" — and revalidation needs
   the origin. *(That specific request header is Chrome's documented reload
   behavior, reasoned here: the network-inspection available in this sandbox
   omits cache directives from dumped request headers; the **outcome** — an
   offline reload failing even for a fresh, cached document — is measured in
   §4.)* GitHub Pages does send a validator (`etag`), which makes this
   *conditional* (usually a cheap `304` online — measured: `If-None-Match` →
   **304**), but a conditional request is still a network request. Offline it
   cannot be made at all, so the navigation fails:
   `net::ERR_INTERNET_DISCONNECTED`.
4. **Why it can *look* like it works sometimes (partial-effect nuance —
   measured, §4).** Freshness splits the outcomes into a deterministic matrix.
   **Within** the 600 s window, measured offline against the live site: a
   *navigation* (`page.goto`, i.e. typing the URL or following a link) to a
   page the browser already holds fresh **succeeds from the HTTP cache and
   renders fully** (`2093 sessions · 132 teachers`, 132 items) — no cache
   busting is applied to ordinary navigations; `fetch()` of a fresh subresource
   from a live document also returns **200** from cache. But a **reload** of
   that very same page fails with `ERR_INTERNET_DISCONNECTED`, because reload
   revalidates the document (step 3), and a navigation to a page the browser
   never fetched also fails. **Past** 600 s every entry is stale, so even the
   previously-working cells must revalidate → all fail *(reasoned from the
   measured headers, not waited out — consistent with the user's report)*.
   Net effect: on GitHub Pages offline behavior is a coin toss decided by
   "which URL" and "how long ago" — the same "browser-cache luck" issue 063
   measured locally, with a 10-minute fuse. The user's specific action —
   **reload** — is the cell that fails *always*, fresh or stale, which is why
   their attempt failed regardless of timing.

#### 3. Local dev vs production discrepancy (measured locally)

`python3 -m http.server 8271 --bind 127.0.0.1` serving this worktree, re-measured
here with `curl -sI` (killed by its recorded PID afterwards):

```
HTTP/1.0 200 OK
Server: SimpleHTTP/0.6 Python/3.14.7
Content-type: text/html
Content-Length: 3895
Last-Modified: Wed, 21 Oct 2026 00:09:51 GMT
```

— **no `Cache-Control`, no `ETag`, no `Expires`** (same as issue 063's
Reporter measured), and the same for `emplois.csv`. Chrome then applies
*heuristic* freshness — 10 % of the time since `Last-Modified` — so the local
cache lifetime is not a fixed cap but grows with the checkout's age (a checkout
committed an hour ago ⇒ ~6 min of freshness; committed a day ago ⇒ ~2.4 h).
Production is the opposite: GitHub Pages' explicit `max-age=600` caps freshness
at 10 minutes, forever, and the reload path needs revalidation regardless.
**This local/prod discrepancy is why the failure surprised the user**: what
looked like working offline support on `127.0.0.1` was never support at all —
it was per-resource heuristic-cache luck whose window happens to be wider on a
long-lived local checkout — and GitHub Pages' hard 10-minute cap plus
revalidating reloads exposed it immediately. (063's Reporter measured the local
variant: an offline local reload rendering `2093 sessions · 132 teachers` from
the heuristic cache while one never-fetched font 404'd.)

#### 4. Live reproduction in a browser (Playwright, MCP Chromium, 2026-10-21)

All against the real `https://adem482p.github.io/time/` with network egress;
offline toggled with `context.setOffline(true)`. **Measured, two runs:**

**Run 1 — the user's exact sequence (load online → offline → reload):**

| step | measured result |
|---|---|
| `goto index.html` online | renders `2093 sessions · 132 teachers`, 132 `#teacherList > li` |
| `navigator.serviceWorker.getRegistrations()` | `[]` — **no service worker on the production site** |
| `caches.keys()` | `[]` — **no Cache Storage entry** |
| normal `page.reload()` online | renders again (network available — no comparison of status codes attempted) |
| `setOffline(true)` → normal `page.reload()` | **fails: `page.reload: net::ERR_INTERNET_DISCONNECTED`** — within *seconds* of the online load, i.e. far inside the 600 s freshness window |
| DOM after the failed reload | the app document is **gone**, replaced by Chromium's error page — console log: `Fetch API cannot load chrome-error://chromewebdata/emplois.csv. URL scheme "chrome-error" is not supported` (no page, no app code running) |
| `goto index.html?cb=<ts>` offline (cache-busted) | fails: `net::ERR_INTERNET_DISCONNECTED` |
| `setOffline(false)` → reload | recovers and renders `2093 sessions · 132 teachers` again |

**Run 2 — the within-window nuance (fresh resources, no reload):**

| step (all after an online `goto index.html`, then `setOffline(true)`) | measured result |
|---|---|
| `fetch('styles.css')` from the still-live document | **200, ok** — served from the HTTP cache (fresh) |
| `fetch('emplois.csv')` from the still-live document | **200, ok** — served from the HTTP cache (fresh) |
| `goto classes.html` offline (page never fetched this session) | fails: `net::ERR_INTERNET_DISCONNECTED` |
| fresh session: online `goto index.html` → `setOffline(true)` → `goto index.html` (same URL, **navigation, not reload**) | **succeeds from cache**: renders `2093 sessions · 132 teachers`, 132 items |

This reproduces and explains the user's report deterministically: the **reload**
path always requires the network and therefore always fails offline, while the
cache can only rescue *other* navigations that are still fresh — a fragile,
timing-dependent behavior that no user should have to reason about.

#### 5. Deploy-target fit check for issue 063's plan (read-only cross-check)

The plan in `issues/063-offline-support.md` (Maintainer decision,
2026-10-20) was checked criterion-by-criterion against the measured deploy
target. **Verdict: the plan fits the GitHub Pages `/time/` deployment
unchanged; no criterion is invalidated.** Two factual notes and one latent
caution:

- **Scope under a subpath ✓** — `sw.js` published at
  `https://adem482p.github.io/time/sw.js` has a default scope of
  `/time/`, which covers all four root pages, `styles.css`, `js/`, `vendor/`
  and `emplois.csv`. A worker at `/sw.js` (impossible on GH Pages project
  pages — the user does not control `adem482p.github.io/` root) would *not*
  have been able to control `/time/` at all; the plan's root-relative-to-site
  placement is exactly right for the subpath.
- **Relative registration ✓ (consistent with the plan's own claim)** — the
  plan's `js/register.js` registers `navigator.serviceWorker.register('sw.js')`
  (a relative URL, criterion 2), and its decision text says "relative
  registration works locally and under `/time/`". Verified consistent: a
  relative URL resolves against the registering page's directory, which is
  `/` locally and `/time/` in production, giving scope = "this site" in both
  cases with zero path-prefix branching; there is no `<base>` tag on any page
  (063 measured) that could redirect the resolution. An absolute `'/sw.js'`
  would have broken production (it resolves to `adem482p.github.io/sw.js`,
  a 404 on a different, out-of-control origin) — the plan avoids it.
- **HTTPS ✓ / MIME ✓** — GitHub Pages is HTTPS-only with HSTS (measured:
  `strict-transport-security: max-age=31556952`, and
  `http://adem482p.github.io/time/` → **301** to the https URL), so every visit
  is a secure context and `navigator.serviceWorker` is exposed; `curl -sI`
  measures `.js` served as `application/javascript; charset=utf-8` and `.css`
  as `text/css` (a service worker's minimum requirement is any JS MIME, so
  this is fine).
- **SPA-less multi-page navigation ✓** — no client-side router exists; the
  four real documents + `'./'` precache cover every navigation, as 063
  criterion 6 already states.
- **No custom headers possible on GH Pages — irrelevant ✓** — GitHub Pages
  does not let a repo set response headers (no `_headers` file, no
  `_redirects`), so the site cannot shorten or lengthen `max-age` itself. The
  063 plan never relies on response headers: the service worker intercepts
  fetches *below* the HTTP cache's authority for controlled clients, so the
  `max-age=600` cap becomes harmless — offline answers come from the
  Cache Storage the worker maintains, not from the HTTP cache. (One
  interaction worth stating: the default `updateViaCache: 'imports'` means the
  browser bypasses the HTTP cache for the *main* `sw.js` script on update
  checks, so GH Pages' 600 s cache cannot delay a worker update beyond one
  session — 063 criterion 5 already relies on this, correctly.)
- **Jekyll / `.nojekyll` (measured fact)** — **`.nojekyll` does NOT exist** in
  this worktree (`ls -a`), so if this repo deploys by branch, GitHub Pages
  runs its default Jekyll build. That build *drops* underscore-prefixed files
  and directories. The repo currently contains **no** `_`-prefixed entry (only
  dotfiles `.gitignore`, `.opencode`), so nothing is being dropped today —
  and the measured byte-identical `content-length`s (§1) confirm the published
  assets are the repo's raw bytes. `sw.js`, `js/register.js` and
  `test/offline.test.js` are unaffected by Jekyll (no front matter ⇒ copied
  verbatim). **Caution to carry into 063's implementation, not a plan
  change:** any future `_`-prefixed file (e.g. a hypothetical `_data/`) would
  be silently absent from the deploy, which would make the precache's
  all-or-nothing `addAll` fail on install — adding `.nojekyll` at that point
  (or keeping the no-underscore convention) resolves it. Record kept either
  way, as instructed.
- **Nothing in 063's criteria contradicts the deploy target.** Its criterion
  5's "GitHub Pages: conditional requests usually 304" for the 280 KB CSV is
  now **measured, not assumed**: sending the measured validators back
  (`If-None-Match: "6ad80160-f37"` on `/time/`, `If-Modified-Since:
  Wed, 21 Oct 2026 00:03:44 GMT` on `/time/emplois.csv`) returns **304 Not
  Modified** both times — so an online navigation's CSV rebuild is a header
  exchange, not 280 KB of transfer, and `res.ok`-style handling in the worker
  must accept 304-derived responses the way `fetch()` normally does (it does;
  `fetch` transparently resolves conditionals).

#### 6. Why offline fundamentally cannot work today

The site is four static documents whose every dependency — `styles.css`, the
10 `<script src>` modules, the three vendored woff2 fonts and, decisively,
`emplois.csv` via `js/data.js`'s `fetch('emplois.csv')` — is resolved against
a live origin at load time, with no service worker, no Cache Storage entry and
no manifest anywhere in the code (grep: zero `serviceWorker`/`caches.`/
`workbox` hits; live `/time/sw.js` and `/time/manifest.webmanifest` both 404).
That is verbatim issue 063's Root cause ("a feature that was never built, not
a bug") now firing in production: with the origin unreachable, the outcome is
decided by whatever each response's HTTP freshness happens to be, and GitHub
Pages' `max-age=600` plus a revalidating reload means the deciding factor is
"did this URL get fetched less than 10 minutes ago AND does the browser choose
to reuse it" — a coin flip that lands on failure for the navigation itself.
**Conclusion: issue 063's plan is THE fix, and this investigation confirms its
deployment story holds under the `/time/` subpath** — relative registration,
root-of-site worker scope, HTTPS/MIME availability, no-header-dependence, and
no Jekyll interference with the three new files.

#### Recommendation

- **Implement and deploy issue 063's approved plan as written** (root `sw.js` +
  `js/register.js` + 21-URL precache, network-first online / cache-only-as-
  offline-fallback, 5 node tests, Playwright walk). It is the complete fix for
  this report: after one online session the pages render offline from Cache
  Storage, unaffected by GH Pages' 600 s HTTP cache.
- **Amends needed to 063's criteria because of the deploy facts: none.** Every
  criterion survives the `/time/` cross-check (§5). Two additions are
  recommended as *deployment notes* for the implementation entry, not as
  changes: (a) after deploying, verify on the live site that
  `https://adem482p.github.io/time/sw.js` returns **200** and
  `navigator.serviceWorker.getRegistrations()` is non-empty (063's local HTTP
  checks get a live twin); (b) keep the repo free of `_`-prefixed paths while
  `.nojekyll` is absent, or add `.nojekyll`, so the Jekyll build can never
  drop a precache URL and abort the all-or-nothing install.
- **Status of this issue stays `Open`**: it is the diagnosis record.
  Implementation rides on `issues/063-offline-support.md` after the user
  approves that plan; 067 should then be closed as fixed-by-063.

Cross-references: `issues/063-offline-support.md` (plan, Root cause,
Maintainer decision 2026-10-20) — this issue is its production observation.
