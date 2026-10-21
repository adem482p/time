# 063: Offline support via network-first service worker

- Status: Open
- Date: 2026-10-20, Reporter: user

## Description

The static timetable site should work without a live HTTP server. The caching strategy is:

- **When online**: the website should *not* use its internal cache. Instead, it should destroy any existing cache and rebuild it freshly from the network, so the site always stays updated.
- **When offline**: the website should use the previously built cache (the last cached state while online) so the pages are still viewable without a network connection.

This is the opposite of the typical "cache first, then revalidate" pattern. The cache is only used as a fallback when the user is offline; when online, the cache is continuously refreshed.

## Expected behavior

- **Online**: the website fetches fresh data from the network on every load. If a service worker cache exists from a previous online session, it is **destroyed and rebuilt** so the data is always current. The user should never see stale data while online.
- **Offline** (after a previous online session with the service worker): the service worker serves the last-cached version of `emplois.css`, the JS bundles, and the three woff2 fonts. The `emplois.csv` data itself is the one asset that must always come from the network when possible, but if the user is truly offline, the cached CSV from the last online session is used.
- **First visit online**: the service worker installs and precaches the app shell + assets. On the first online load, the network is used. Subsequent online loads destroy the old cache and rebuild it fresh from the network.

## Issue type

Feature request / infrastructure improvement. Defines the exact online/offline cache behavior the site should exhibit.

## Measured repo facts

*(Reporter measurements, HEAD 9d5e407 in this worktree, 2026-10-20. The user's
`## Description` above is filed verbatim; its empty `## Discussion` placeholder is
instantiated as this issue's `## Discussion` section at the end, and `## Issue type`
was kept with the user's block rather than after mine.)*

### The four pages and what each loads

There are exactly **four HTML pages, all at the site root**, and **no shared
include of any kind** — every page is standalone, with duplicated markup and a
duplicated `<script>` stack (measured: no `<base>` tag, no templating, no
server-side include; issue 059 documented the same "markup duplicated per page"
convention). Each page loads the same stylesheet and the inline no-op favicon:

| page | `body[data-page]` | `<link rel="stylesheet">` | scripts, in DOM order |
|---|---|---|---|
| `index.html` (Teachers) | `teachers` | `styles.css` | `js/data.js`, `js/libgroups.js`, `js/model.js`, `js/match.js`, `js/theme.js`, `js/color.js`, `vendor/kaomoji.js`, `js/teachers.js` (8) |
| `classes.html` (Classes) | `classes` | `styles.css` | `js/data.js`, `js/libgroups.js`, `js/model.js`, `js/match.js`, `js/theme.js`, `js/color.js`, `vendor/kaomoji.js`, `js/classes.js` (8) |
| `time.html` (Time) | `time` | `styles.css` | `js/data.js`, `js/libgroups.js`, `js/model.js`, `js/match.js`, `js/theme.js`, `js/color.js`, `js/app.js` (7, no kaomoji) |
| `timetable.html` (matrix) | `matrix` | `styles.css` | `js/data.js`, `js/libgroups.js`, `js/model.js`, `js/match.js`, `js/theme.js`, `js/color.js`, `js/app.js` (7, no kaomoji) |

- Script-tag line numbers: `index.html:61-68`, `classes.html:62-69`,
  `time.html:16-22`, `timetable.html:25-31`. Stylesheet link: `index.html:30`,
  `classes.html:30`, `time.html:8`, `timetable.html:8`.
- `js/` holds **9 modules** (`app`, `classes`, `color`, `data`, `libgroups`,
  `match`, `model`, `teachers`, `theme`); plus `vendor/kaomoji.js` that is
  **10 scripts total**, and the union across the four pages is all 10 (every
  module is loaded by at least one page — nothing is dead).
- **No service worker, no manifest, no registration anywhere**: grep
  `serviceWorker|manifest|navigator.service` over `*.html`, `js/*.js`,
  `styles.css` → zero matches; `curl -I /sw.js` on the dev server → `404`.

### The user's names mapped onto the real files

- **"emplois.css" → `styles.css`** (43,740 B, 784 lines). There is no
  `emplois.css`; `styles.css` is the single stylesheet linked by all four pages.
- **"the JS bundles" → the 10 plain `<script src>` files** listed above (no
  bundler, no build step — each is fetched individually).
- **"the three woff2 fonts" → exactly the three same-origin vendored files**:
  `vendor/dejavu-sans.woff2` (24,516 B), `vendor/noto-sans-kannada.woff2`
  (27,736 B), `vendor/noto-sans-symbols.woff2` (57,708 B) — 109,960 B total.
  This matches the user's count exactly. Font situation in full (measured in
  `styles.css`): **4 `@font-face` blocks + 1 comment mention (5 `@font-face`
  tokens), 6 `url(...)` font sources**:
  - same-origin (precacheable, = the user's three): the three files above
    (`styles.css:253`, `:259`, `:266`);
  - cross-origin (**not** in the user's count, see risks): Monaspace Neon from
    `cdn.jsdelivr.net` — woff2 + woff srcs (`styles.css:21-22`), and the
    Google Fonts `@import` at `styles.css:6` → `fonts.gstatic.com` woff2 files
    for **Tiny5** and **DynaPuff**.
  - Measured runtime fetches on a fresh `index.html` load (Playwright network
    log): 16 requests = 12 same-origin (page, `styles.css`, 8 scripts,
    `emplois.csv`, `vendor/dejavu-sans.woff2`) + 4 cross-origin (Google Fonts
    CSS, Tiny5 woff2, DynaPuff woff2, Monaspace Neon woff2). The Kannada and
    Symbols woff2 files are **not** fetched on a plain load (unicode-range
    gating) — they must still be precached, and the offline walk below shows
    what happens when one of them is missing from every cache.
- **`emplois.csv`**: 280,730 B at the site root, fetched by
  **`js/data.js:80` — `fetch('emplois.csv')`** — and it is the **only network
  call in the entire codebase** (grep `fetch(|XMLHttpRequest|new Image|
  import(` over the repo: the single hit in `js/`, plus a needle string in
  `test/libgroups.test.js:266` which asserts the *absence* of `fetch(` in
  `js/libgroups.js`). It is a plain same-origin GET from the page context.
- **Icons / preview art**: every page declares
  `<link rel="icon" href="data:,">` (`index.html:29`, `classes.html:29`,
  `time.html:7`, `timetable.html:7`) — an inline empty data URI, so **no icon
  file exists and no favicon request is ever made** (issue 055 documented the
  same). `assets/` holds only `preview.png` (130,148 B) and `preview.svg`
  (4,086 B), referenced **exclusively** from `og:image`/`twitter:image` meta
  tags with absolute production URLs
  (`https://adem482p.github.io/time/assets/preview.png`, `index.html:16,25`,
  `classes.html:16,25`) — no page fetches them at runtime.

### Rendered-state baselines (Playwright, server up, 2026-10-20)

| page | `#status` text | counted elements |
|---|---|---|
| `index.html` | `2093 sessions · 132 teachers` | 132 `#teacherList > li` |
| `classes.html` | `2093 sessions · 94 classes` | 94 `#classList > li` |
| `time.html` | `2093 sessions · 132 teachers` | 42 `#slotList > li` |
| `timetable.html` | `132 teachers × 6 time slots.` | 133 `#matrix tr` (1 header + 132), 924 `#matrix td` |

### Today's offline behavior and dev-server characteristics

- Fresh profile with the server running: `navigator.serviceWorker.getRegistrations()`
  → `[]`, `caches.keys()` → `[]` — **there is no cache of any kind; offline
  support today is the browser's incidental HTTP cache** ("browser-cache luck").
- `python3 -m http.server` (measured response headers): `HTTP/1.0 200 OK`,
  `Last-Modified`, **no `Cache-Control`, no `ETag`** → Chrome applies
  heuristic freshness, which is why a plain offline reload *appears* to partly
  work while hard-failing on whatever it never fetched (full evidence in
  `## Repro steps`).
- Test baseline: `node --test` → **131 pass / 0 fail** in this worktree
  (measured 2026-10-20). Existing HTML pins are presence-only
  (`indexOf !== -1`, e.g. `test/classes.test.js:426-454`,
  `test/teacher-daygroups.test.js:41,538`) — no test asserts an exact script
  count, so adding one tag per page breaks no existing test (checked).

## Root cause

This is a **feature that was never built, not a bug**: the repository has never
contained a service worker or a web app manifest (measured above — grep clean,
`sw.js` 404s, zero registrations, zero caches), so no code path exists to
persist the app shell. Consequently every page hard-requires a reachable origin:
the HTML documents, `styles.css`, all 10 scripts and the three vendored fonts
are read from the network (or from the browser's incidental heuristic HTTP
cache), and `js/data.js:80` must `fetch('emplois.csv')` over the network to
render anything at all. When the origin stops answering, the outcome is decided
by what the browser happens to have cached per resource — nondeterministic, and
measured below to drop at least one resource per reload while leaving the rest
"working", which reads as a broken site rather than an offline mode.

## Repro steps

1. `cd /home/user/.local/share/opencode/worktree/1de5bb/063-offline-plan && python3 -m http.server 8163 --bind 127.0.0.1`
   (record the real PID from `ss -ltnp | grep 8163`; kill **by PID** afterwards —
   never `pkill -f`, sibling sessions run their own servers).
2. Open `http://127.0.0.1:8163/index.html`. **Observed (server up):** status
   `2093 sessions · 132 teachers`, 132 list items; network log = 16 requests
   (12 same-origin + 4 cross-origin fonts); in the console
   `(await navigator.serviceWorker.getRegistrations()).length === 0` and
   `await caches.keys() === []` — no offline machinery exists.
3. Stop the server by its recorded PID (confirmed: port free, `curl` → `000`).
4. Reload the **same URL**. **Observed (server down, 2026-10-20):** the page
   still renders — HTML, `styles.css`, the JS stack and `emplois.csv` all came
   out of Chrome's heuristic HTTP cache (`fetch('emplois.csv')` → `200`,
   status still `2093 sessions · 132 teachers`) — but the console logged
   exactly one error:
   `[ERROR] Failed to load resource: net::ERR_CONNECTION_REFUSED @ http://127.0.0.1:8163/vendor/noto-sans-symbols.woff2`
   (a unicode-range-gated font that had never been fetched while online, so no
   cache had it). Offline behavior is therefore **per-resource browser-cache
   luck**, differing from reload to reload.
5. Any cache-busted navigation while down — `index.html?cb=<timestamp>` —
   **Observed:** hard failure, `net::ERR_CONNECTION_REFUSED at http://127.0.0.1:8163/index.html?cb=…`,
   no page at all. Playwright offline emulation
   (`context.setOffline(true)` — verified available) gives the same on a
   cache-busted URL: `net::ERR_INTERNET_DISCONNECTED at .../classes.html?off=…`.
6. Restart the server and reload: the site works again — but nothing was ever
   rebuilt or persisted as an offline copy; step 4 will keep varying per
   resource forever.

Expected after this issue: step 4/5 must render every page fully from the
service worker cache, and step 2 must always show fresh network data.

## Discussion

### Maintainer decision (2026-10-20)

**Verdict — valid, in scope, and adopted exactly as the user specified.** This
is infrastructure the project has never had (Reporter measured: no `sw.js`, no
manifest, zero registrations, zero caches), and the user's semantics are
**binding**: network-first on *every* online load for *all* same-origin assets
(CSS, JS, fonts, CSV), the cache used **only** as an offline fallback, the
existing cache **destroyed and rebuilt** while online, a precache on install,
and the first online visit served from the network. **No stale-while-revalidate
and no cache-first-then-refresh, in any form** — the user explicitly rejected
that pattern ("This is the opposite of the typical 'cache first, then
revalidate' pattern"), so no variant of it may appear in the fetch handler or
its comments, and a test pins its absence.

**Naming map (user's words → measured reality; see `## Measured repo facts`):**
`emplois.css` → **`styles.css`**; "the JS bundles" → **the 10 individual
`<script src>` files** (no bundler); "the three woff2 fonts" → **exactly the
three same-origin `vendor/*.woff2` files** (DejaVu Sans, Noto Sans Kannada,
Noto Sans Symbols — the count matches reality); `emplois.csv` → exact as
written (root, `js/data.js:80`); "icons" → **none exist** (`<link rel="icon"
href="data:,">` inline on all four pages) so nothing to precache there, and
`assets/preview.png|svg` are social-card art never fetched at runtime →
excluded from the precache.

**Architecture direction — three new files, four one-line tags.** One hand-written
`sw.js` at the site root (the repo has no build step, so the worker must be
static JS maintained by hand), plus registration in a new shared
**`js/register.js`** loaded by a new `<script src="js/register.js"></script>`
as the **last** script tag on each of the four pages. Measured: there is **no
shared include** — all four pages are standalone with duplicated markup — but
*logic* in this repo already travels as identical `<script src="js/*.js">` tags
(`data`, `libgroups`, `model`, `match`, `theme`, `color` are on all four pages).
Registration is logic, so it follows that convention: **one implementation, four
identical tags** — one place to change, one file for tests to read, and it is
itself precached. (A four-copy inline snippet was rejected: four copies of JS
that can drift, exactly the maintenance smell the duplicated-markup convention
accepts only because markup is inert.)

---

**Acceptance criteria (implementation-ready; numbered, self-contained)**

**1. New file `sw.js` at the site root, contents:**

```js
// sw.js — network-first service worker (issue 063).
// Online: every response comes from THIS load's network fetch; the cache is
// rewritten from those bytes (destroy + rebuild), never used to answer a page
// while the network works. Offline: the cache is the fallback.
// file:// is NOT supported (service workers need http/https; localhost counts).
// Dev escape hatch when the worker gets in the way (browser console):
//   navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
//   caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
var CACHE = 'emplois-v1';           // bump the suffix whenever PRECACHE or the
                                    // handler semantics change (forces a full
                                    // rebuild + wipes the old cache on activate)
var PRECACHE = [
  './',
  'index.html', 'classes.html', 'time.html', 'timetable.html',
  'styles.css',
  'js/register.js',
  'js/data.js', 'js/libgroups.js', 'js/model.js', 'js/match.js',
  'js/theme.js', 'js/color.js', 'js/teachers.js', 'js/classes.js', 'js/app.js',
  'vendor/kaomoji.js',
  'vendor/dejavu-sans.woff2', 'vendor/noto-sans-kannada.woff2',
  'vendor/noto-sans-symbols.woff2',
  'emplois.csv'
];
```

- **Exactly these 21 URLs** (measured inventory: `'./'` + the four pages —
  `'./'` and `index.html` are the same file cached under both URLs, because a
  bare-origin navigation and an `/index.html` navigation are different cache
  keys; `styles.css`; `js/register.js`; all 9 `js/*.js` modules;
  `vendor/kaomoji.js`; the three vendored woff2; `emplois.csv`). No
  `assets/preview.*`, no cross-origin URLs, no icons (none exist).
- Size: **702,406 B ≈ 686 KiB** for the 21 entries (the 280,730 B CSV is 40% of
  it) plus `js/register.js` (≲1 KB).
- **`install`:** `self.skipWaiting();` and
  `event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)))`.
  `addAll` is the precache-on-install step; it is **all-or-nothing** (any
  failing URL aborts it and writes nothing), so a failed install leaves the
  previous generation intact and the browser retries later.
- **`activate`:**
  `event.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));`
  — every non-current cache is destroyed here. Because the cache *name*
  changes whenever `PRECACHE` changes, an entry removed from the list cannot
  survive: list change ⇒ `sw.js` byte diff ⇒ new install ⇒ old cache name
  deleted on activate. That makes the "destroy" literal across generations
  without ever opening an empty-cache window.
- **`fetch`:** see criterion 3.

**2. Registration — new `js/register.js` + one tag per page.**

```html
<script src="js/register.js"></script>
```
appended as the **last element before `</body>`**, on **all four pages**
(`index.html`, `classes.html`, `time.html`, `timetable.html`) — after the
page's existing scripts, so the order stays "app scripts, then infra".
`js/register.js` (repo style: guarded, comment-headed, no build):

```js
// js/register.js — service-worker registration (issue 063).
// file:// and other non-http(s) origins have no serviceWorker API: guard + catch
// keep those a silent no-op.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js')
      .then(function (reg) { reg.update(); })   // byte-diff check every load
      .catch(function () { /* unsupported origin (e.g. file://) */ });
  });
}
```

- **Relative `'sw.js'`** ⇒ scope = the registering page's directory ⇒ the whole
  site, locally (`http://127.0.0.1:PORT/`) **and** in production
  (`https://adem482p.github.io/time/`) with no path-prefix trap; measured: no
  `<base>` tag on any page, and the four pages are the only HTML at the root,
  so the root scope controls everything.
- **`window.load`, not immediate:** the 21-request precache must not compete
  with first paint, the CSV fetch or the font loads of the visit that installs
  it.
- **`reg.update()` on every load**: the browser's own check can be as rare as
  24 h; `update()` forces a byte-diff check of `sw.js` each page load (cheap —
  unchanged bytes → no-op; `updateViaCache` defaults to `'imports'`, so the
  main script already bypasses the HTTP cache). This is the call site the
  update-flow criterion depends on.
- **Why `skipWaiting()` + `clients.claim()`:** this worker is *content-agnostic*
  — it can never serve stale bytes (network-first), so letting it take over
  immediately cannot corrupt a page; `claim` also makes the session that
  installed it controlled, so that session's own requests refresh cache entries
  (without `claim`, a first visit's post-install fetches would bypass the
  worker and the cache would only move at the *next* visit).

**3. Fetch handler algorithm (the whole semantics; same-origin GET only).**

```js
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;                                  // pass through
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                   // CDN/Google Fonts untouched
  var nav = req.mode === 'navigate';
  var served = false;
  var reply = fetch(req).then(function (res) {                       // 1) NETWORK FIRST
    served = true;
    if (!res.ok) return res;                                         // never cache 404/500
    var copy = res.clone();                                          // clone BEFORE respond
    var save = putCanonical(req, copy);                              // 2) rebuild that entry
    if (nav) save = save.then(rebuild);                              // 3) navigation ⇒ rebuild ALL
    return res;
  }).catch(function () {
    return caches.match(req, nav ? { ignoreSearch: true } : undefined)  // 4) CACHE FALLBACK
      .then(function (hit) { return hit || Response.error(); });
  });
  event.respondWith(reply);
  event.waitUntil(reply.then(function () { return save; }).catch(function () {})); // save is per-branch; see note
});
```

- **Guards:** non-GET and cross-origin requests are **not intercepted at all**
  (the browser's own stack handles them; nothing cross-origin is ever cached or
  delayed — that covers `fonts.googleapis.com`, `fonts.gstatic.com`,
  `cdn.jsdelivr.net`).
- **Network success ⇒ serve AND update the cache** — this *is* the
  "destroy and rebuild", at per-URL granularity for every response
  (`putCanonical`) and at whole-precache granularity after every online
  navigation (`rebuild` = `caches.open(CACHE).then(c => c.addAll(PRECACHE))`).
- **Only `res.ok` (2xx) responses are ever written**, and only for URLs in
  `PRECACHE` (match ignoring `search`, write under the canonical `PRECACHE`
  URL) — see criteria 4 and 9 for why writes are a closed set.
- **Network failure ⇒ `caches.match` fallback**; navigations match with
  `{ ignoreSearch: true }` so `…/index.html?utm_source=x` still resolves
  offline to the precached page; a miss yields `Response.error()` (honest
  browser error page — no fabricated shell).
- **Promise-plumbing invariants the implementer must hold** (the sketch above is
  indicative, not literal): (a) `res.clone()` happens before the body is handed
  to `respondWith`; (b) `event.waitUntil(...)` is invoked **synchronously in
  the handler** with a promise created there; (c) `rebuild` runs **only when
  the navigation was answered by the network** (`served === true`); (d) one
  shared in-flight rebuild promise, so `install`'s `addAll` and a concurrent
  navigation's rebuild do not double-fetch (and concurrent tabs do not
  stampede).
- **CSV path (verified, no `js/data.js` change):** `js/data.js:80`
  `fetch('emplois.csv')` is a plain same-origin GET from the page → passes both
  guards → **network-preferred, cached fallback falls out naturally**; the
  network response is `put` back immediately, so while online the CSV cache
  entry is refreshed on every page load, and offline the last online session's
  CSV answers. Nothing in `data.js` bypasses a service worker (no `no-store`,
  no `cache` option, no `XHR`; grep confirms it is the codebase's only fetch).

**4. "Destroy and rebuild" — what is guaranteed, what is not (the decision
asked for).** Chosen: **per-entry `cache.put` on every online response PLUS a
full `cache.addAll(PRECACHE)` after every network-served navigation**, all
writes into the versioned cache; **not** `caches.delete` + recreate per load.

- *Why not `caches.delete(CACHE)` then rebuild per load*: deleting first opens
  an empty window — any request (or a connection drop mid-rebuild) then finds
  **no cache at all**, turning a transient hiccup into a total offline failure.
  A rebuild must never be able to destroy the last good snapshot.
- *Why not per-entry-only*: on a multi-page site an entry the session never
  requested keeps its previous generation, so offline you could get **new
  `styles.css` + new JS with stale HTML** — the worst offline mix (shell/
  payload mismatch). The navigation-triggered `addAll` refreshes *all* URLs,
  including pages never visited this session, so every online navigation ends
  with a coherent fresh snapshot.
- *Why this satisfies the user's words*: `addAll` fetches all 21 and writes
  **only if all 21 succeed** — so a rebuild is effectively an atomic swap onto
  the fresh generation, and a failed rebuild leaves the previous complete
  generation untouched. "Online" therefore means: (i) every byte handed to a
  page came from that load's network request — **never** from cache while the
  network works; (ii) after every online navigation the entire cache equals a
  fresh network snapshot; (iii) the CSV is refreshed on every page load;
  (iv) across `sw.js` generations the old cache is destroyed outright
  (activate).
- *What it does **not*** **guarantee (accepted risks):** a session whose
  connection dies between navigations can leave individual entries one
  generation ahead of the rest (per-entry `put`s already ran) — mixed
  generations are then observable **only offline**, and the next online
  navigation heals them; online serving is unaffected by construction. Also
  not guaranteed: cross-origin fonts (criterion 7) and any asset outside the
  closed precache set (by design, criterion 9).
- *Explicitly rejected*: stale-while-revalidate, cache-first-then-refresh, a
  "serve cache then update in background" shortcut, and any dev/prod branching
  of the strategy — all contradict the binding semantics.

**5. Cache versioning + update flow.**

- `CACHE = 'emplois-v1'`; the header comment states: bump the suffix on any
  change to `PRECACHE` or to the handler's semantics. Bump ⇒ new `sw.js`
  bytes ⇒ browsers see a diff ⇒ `install` builds `emplois-v2` fresh from the
  network ⇒ `activate` deletes `emplois-v1` (and any other name). This is the
  destroy-and-rebuild across sessions/deploys, with no window in which no
  cache exists (the old one lives until the new one is fully built).
- Delivery of a new `sw.js` to clients: `reg.update()` on every `load`
  (criterion 2) + the browser's own periodic check (`updateViaCache` default
  bypasses the HTTP cache for the main script) + the update check that
  registration itself performs. `skipWaiting`/`clients.claim` apply it to open
  tabs immediately — safe because the worker is content-agnostic.
- **What a stale `sw.js` costs if it lingers (worst case one session):** an
  old worker still serves network-first everywhere — it can only lack a newly
  added precache URL *offline*. Stale worker + online = correct bytes; stale
  worker + offline = identical to today's behavior, never worse.

**6. Navigations.** `req.mode === 'navigate'` gets the same network-first
treatment plus the `addAll` rebuild and `ignoreSearch` fallback (criterion 3).
**No SPA/offline shell is needed** — four real HTML documents exist and all are
precached (`'./'` covers the bare origin). If `rebuild()` rejects (server half
down), it is swallowed by the `waitUntil` chain: the navigation itself was
already served.

**7. Constraints (decided, not open questions).**

- **`file://` stays unsupported** — service workers require http/https (a
  secure context; `localhost` counts). The `'serviceWorker' in navigator`
  guard plus `.catch` make it a silent no-op there; documented in the `sw.js`
  header comment (the only doc surface in scope).
- **`python3 -m http.server` dev workflow** — measured: no `Cache-Control`,
  only `Last-Modified`, so today the browser heuristically caches. Once the
  worker controls a page, **network-first makes dev *more* live, not less**
  (every load reads the file the server just served). Developer escape hatch,
  documented in the `sw.js` header (verbatim in criterion 1):
  `navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));`
  then `caches.keys().then(ks => ks.forEach(k => caches.delete(k)));`.
  **No dev-mode bypass flag** — a bypass would (a) prevent testing the worker
  on localhost, which is where it must be tested, and (b) be a maintained
  special case; the header recipe achieves the same in two console lines.
- **No build step** — `sw.js` is hand-maintained static JS and `PRECACHE` is a
  hand-written literal (no runtime list generation: deriving it would mean
  fetching and parsing the pages inside the worker — a second implementation of
  the site's own inventory). **Maintenance burden when files are added is
  automated away by test 2 below**: it derives the required URL set from the
  four pages' tags, `styles.css`'s same-origin `url(...)`s and `js/data.js`'s
  fetch, so a new module/stylesheet/font that is missing from `PRECACHE` is a
  red test rather than a silent offline hole.

**8. Scope.** `sw.js` sits at the root next to the four pages ⇒ root scope
covers all of them (measured: the four pages are the only HTML files; no
`<base>`; production is served from `/time/`, and the relative registration
follows the page directory, so no path-prefix trap exists). Subdirectories
(`data/`, `assets/`, `issues/`) are in scope but only same-origin GETs for
precached paths are ever written (criterion 9).

**9. Cache growth boundedness (closed writes, open reads).** Reads fall back
for any same-origin GET that happens to be cached; **writes are closed**: only
2xx responses whose path matches a `PRECACHE` entry are stored, and they are
stored under the **canonical `PRECACHE` URL** (search stripped). Consequences:
hard cap of **21 entries ≈ 686 KiB** regardless of query strings
(`?cb=…`, `?utm_…` collapse onto the canonical entry), no 404/500 entries, no
directory-listing or odd-path junk, no unbounded growth. This is also the
answer to "can `http.server` 404s poison the cache?" — no: `res.ok` gates it
*and* the closed set gates it, and criterion 10's node test asserts every
`PRECACHE` URL exists on disk.

**10. Test plan — node pins.** Baseline **131 pass / 0 fail** (measured in this
worktree). New file **`test/offline.test.js`** with exactly **5 `test()` blocks**
⇒ **exactly 136 pass / 0 fail** after the change (no existing assertion edited;
existing HTML pins are presence-only — verified). Tests, in repo style
(source-level pins over `sw.js`, `js/register.js`, the four pages):

1. `the service worker ships at the site root with the full lifecycle (issue 063)`
   — `sw.js` exists; contains `self.addEventListener('install'`, `'activate'`,
   `'fetch'`, `skipWaiting`, `clients.claim`, `addAll`, and `CACHE = 'emplois-v1'`.
2. `the precache covers every runtime asset and only existing files (issue 063)`
   — parse the `PRECACHE` literal out of `sw.js`; assert: it contains `'./'`;
   every other entry exists on disk (same worktree); **no `http://`/`https://`
   entries**; and every same-origin runtime reference is covered: the union of
   `<script src="…">` and `<link rel="stylesheet" href="…">` across all four
   HTML files, every same-origin `url("…")` in `styles.css`, and
   `fetch('emplois.csv')` in `js/data.js` (path only) — each must appear in the
   list. (This is the automation for criterion 7's maintenance burden.)
3. `the fetch handler is network-first with the cache as fallback only (issue 063)`
   — inside `sw.js`: the first occurrence of `fetch(` precedes the first
   occurrence of `caches.match(`; the `res.ok` gate (`res.ok`/`if (!res.ok)`)
   and the `method !== 'GET'` guard and the `origin !== self.location.origin`
   guard are present; `mode === 'navigate'` is handled; the strings
   `stale-while-revalidate` and `cache-first` appear **nowhere** in the file.
4. `every page registers the service worker through the shared module (issue 063)`
   — each of the four HTML files contains exactly one
   `src="js/register.js"` (as its last `<script>` tag: the index of
   `js/register.js` in the script-tag sequence is the last), and
   `js/register.js` contains `'serviceWorker' in navigator`,
   `serviceWorker.register('sw.js')`, `addEventListener('load'` and `.update()`.
5. `old caches are destroyed on activate and rebuild is network-driven (issue 063)`
   — the `activate` block deletes non-`CACHE` keys (`caches.delete(` present in
   the activate listener, after a `caches.keys()`), `install` precaches via
   `addAll`, and `rebuild`/`addAll` is reachable from the navigation path (the
   `nav`/`navigate` branch references it).

**11. Test plan — Playwright walk (after approval; MCP Chromium).** Serve the
worktree with `python3 -m http.server <port> --bind 127.0.0.1`, record the real
PID via `ss -ltnp` in `/tmp/opencode/063-*.pid`, kill by PID, never `pkill -f`.
Offline is toggled with `page.context().setOffline(true|false)` — recipe
verified during this report (offline navigation → `net::ERR_INTERNET_DISCONNECTED`).

1. **Fresh start:** unregister any worker + delete all caches, hard-reload
   `index.html` online → renders `2093 sessions · 132 teachers`, 132 items;
   `navigator.serviceWorker.ready` → scope `http://127.0.0.1:<port>/`;
   `caches.keys()` → `['emplois-v1']` with **21 entries**;
   `performance`/network log shows the navigation and assets served 200.
2. **Network-first proof online:** `browser_network_requests` shows
   `styles.css`, the `js/*.js` stack and `emplois.csv` each hitting the server
   with a **network 200 on every reload** (the SW cache never answers a page
   while online); confirm a second reload repeats the same 200s.
3. **Rebuild proof:** visit only `index.html` online after the install, then
   `caches.match('time.html')` → text is **byte-identical to the file on disk**
   (a page never visited this session was still rebuilt) — same check for
   `emplois.csv` (280,730 B) and `vendor/noto-sans-symbols.woff2`.
4. **Offline walk:** `setOffline(true)` → reload each of the four pages at the
   **same URL** (no cache-busting) and assert rendered + data present:
   `index.html` → status `2093 sessions · 132 teachers`, 132
   `#teacherList > li`; `classes.html` → `2093 sessions · 94 classes`, 94
   `#classList > li`; `time.html` → `2093 sessions · 132 teachers`, 42
   `#slotList > li`; `timetable.html` → `132 teachers × 6 time slots.`,
   133 `#matrix tr` / 924 `#matrix td`. Console: **0 JS errors**; permitted
   offline noise is only cross-origin font failures (criterion 7) — record them
   if they occur.
5. **CSV rule:** offline `fetch('emplois.csv')` → `res.ok === 200` served from
   cache (page renders full data); online it is a network 200 (step 2).
6. **Poison guard:** online `fetch('/nope.js')` → status 404, then
   `caches.match('/nope.js')` → `undefined`; offline `fetch('/nope.js')`
   rejects — nothing was written.
7. **Recovery:** `setOffline(false)` → reload all four → all render online with
   fresh network requests; `caches.keys()` still `['emplois-v1']`, still
   21 entries.
8. **HTTP checks:** `curl -s -o /dev/null -w '%{http_code}'` → 200 for
   `/sw.js`, `/js/register.js`, the four pages, `/styles.css`, `/emplois.csv`;
   kill the server by recorded PID and confirm dead (`ps -p`, port free).

**Allowed file list for the implementer (nothing else, anywhere):**
`sw.js` (new), `js/register.js` (new), `test/offline.test.js` (new),
`index.html`, `classes.html`, `time.html`, `timetable.html` (one script tag
each), `issues/063-offline-support.md` (this entry). No `styles.css`, no other
`js/*.js`, no `README.md`/`Design.md`, no `vendor/`, no `data/`.

**No-gos:** no stale-while-revalidate, cache-first, or background-refresh
variant anywhere; no offline SPA shell/fake HTML; no `caches.delete(CACHE)`
during a fetch handler; no caching of non-2xx or cross-origin responses; no
dev-mode bypass flag; no build step, generator, or bundler for `sw.js`; no
manifest/PWA scope creep (out of scope unless a later issue asks); no edits to
`js/data.js` (its single fetch already behaves exactly as required).

**Risks / constraints**

- **Stale `sw.js` in the browser** — mitigated by `reg.update()` per load and
  the default HTTP-cache bypass for the main script; worst case an old worker
  runs one session, and because the worker is network-first by construction it
  then only lacks *newly added* precache URLs offline — never stale bytes
  online.
- **Partial connectivity / mixed generations** — accepted (stated in
  criterion 4): per-entry `put`s may advance some URLs mid-session while an
  `addAll` aborts; observable only offline, healed by the next online
  navigation, and `addAll`'s all-or-nothing rule means the snapshot can never
  be left half-written or empty.
- **Cache growth** — bounded by the closed write set (criterion 9): ≤21
  entries, ≈686 KiB, no query-string or 404 growth.
- **`emplois.csv` cost** — 280,730 B ≈ 40% of every rebuild; a navigation
  refetches it while online (localhost: full 200 bodies; GitHub Pages:
  conditional requests usually 304). This is the direct price of the binding
  "cache continuously refreshed" rule; excluding it would violate the user's
  semantics, so it is accepted.
- **404/odd-URL poisoning** — impossible by construction: `res.ok` gate +
  closed precache set + node test 2 asserting every listed URL exists.
- **Install while offline** — `addAll` fails → no worker installed → browser
  retries; strictly no worse than today (no worker at all).
- **`file://` users** — silently unregistered (documented), unchanged from
  today's behavior.
- **Cross-origin fonts offline** — Google Fonts (DynaPuff, Tiny5) and jsdelivr
  (Monaspace Neon) are never cached; offline they fall back to the precached
  DejaVu/Noto faces and system stacks (`styles.css:292`, `:306`, `:142`) —
  degraded display glyphs possible, page still renders. Out of scope: the
  user's requirement names the three same-origin woff2 files.
- **Invariants to preserve** — `js/data.js` stays untouched; the four pages
  keep their existing script stacks and order (the registration tag is
  appended last); existing presence-only HTML pins stay green; test total goes
  131 → 136 and nothing else changes in `test/`.

**Status stays `Open`** — the user asked for a plan; implementation begins only
after they approve this entry.
