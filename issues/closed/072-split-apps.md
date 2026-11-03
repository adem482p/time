# 072: Split the teachers page and the classes page into two independently installable apps

- Status: Fixed
- Date: 2026-10-21, Reporter: user

## Description

The user's request, verbatim:

> Separate the teachers page and the classes page more deeply: separate service
> workers, separate manifests, each installed as its own app. They just happen
> to share a domain, reference some of the same libraries, and share some lines
> of code which we intentionally keep duplicated for the time being.

**Observed:** the site is one installable app. `index.html` (teachers),
`classes.html` (classes), `time.html` and `timetable.html` all link the same
root `manifest.json` (name "Emplois — ISIM Mahdia Timetable", `start_url: "./"`,
`scope: "./"`) and all register the same root `sw.js` through the shared
`js/register.js` (`register('sw.js')`, default scope = the registering page's
directory = the site root on every page). Installing from any page yields a
single installed app; there is no way to install the classes page as its own
app with its own service worker and its own offline snapshot.

**Expected:** `index.html` and `classes.html` become two apps: each with its
own web app manifest and its own service worker, each appearing separately in
the browser's installed-app list, each taking its own offline snapshot, each
opening on its own page. They keep sharing the origin, `js/*`, `vendor/*`,
`styles.css`, `assets/*` and `emplois.csv`; code that is deliberately
duplicated stays duplicated.

## Root cause

Not a defect — the single-app shape is exactly what issues 063/068/070 built.
The split runs into a hard browser constraint: **a service-worker registration
is keyed by its scope, and only one registration can exist per scope per
origin.** Both apps would register with the site root as scope, and the second
registration would silently replace the first. The ways to keep every URL in
place are closed: `Service-Worker-Allowed` cannot be sent by GitHub Pages (no
server configuration, per issue 067's constraints) and there is no build step
to generate anything. Two separate workers therefore need two separate
scopes, which on a static host means two separate directories — at least one
page's URL has to change.

## Repro steps

1. `python3 -m http.server` in the repo root; open `http://localhost:8000/`.
2. DevTools → Application → Manifest: one manifest ("Emplois — ISIM Mahdia
   Timetable") is linked by every page; Application → Service Workers: one
   registration (`sw.js`, scope `/`).
3. Repeat on `http://localhost:8000/classes.html` — same manifest, same worker.
4. There is no arrangement of the current files in which the classes page
   installs as a second, separate app: any second `sw.js` registering with
   `scope: './'` replaces the first.

## Discussion

### Maintainer decision (2026-10-21)

**1. Verdict / decision — the asymmetric split (Option C).** The teachers app
keeps the site root; the classes app moves into a directory of its own. This
is the standard static-host multi-app arrangement: *the root is the site and
its front-door app; every additional app gets a directory that is its whole
world.* A third app later = another directory, zero edits to the root app —
a repeatable convention, not a special case.

**URL map (before → after):**

| URL | After | Served by |
|---|---|---|
| `/time/` (= `index.html`) | unchanged — teachers app shell + `start_url` | root worker, scope `/time/` |
| `/time/index.html`, `/time/time.html`, `/time/timetable.html` | unchanged | root worker |
| `/time/classes.html` | **redirect stub** → `./classes/` (preserves `?…` query + hash) | root worker |
| `/time/classes/` (NEW, `classes/index.html`) | classes app shell + `start_url` | classes worker, scope `/time/classes/` |
| `/time/manifest.json`, `/time/sw.js` | unchanged paths, teachers-app content | — |
| `/time/classes/manifest.json`, `/time/classes/sw.js` | NEW | — |
| shared: `/time/styles.css`, `/time/js/*`, `/time/vendor/*`, `/time/assets/*`, `/time/emplois.csv` | unchanged | root worker outside `/time/classes/`, classes worker inside it |

**Files:** created `classes/index.html` (the moved page), `classes/manifest.json`,
`classes/sw.js`; rewritten `classes.html` (redirect stub); modified `sw.js`
(teachers worker), `manifest.json` (teachers manifest), `js/data.js` (CSV URL
resolution, below), `js/register.js` (header comment only — the registration
call is unchanged: from `/time/classes/` it resolves to `/time/classes/sw.js`
with default scope `/time/classes/`), `test/pwa.test.js`, `test/offline.test.js`,
`test/theme-boot.test.js`, `test/classes.test.js`, `FEATURES.md` (targeted
sections only). Deleted: nothing (`classes.html` survives as the stub).
`index.html` needs **zero** changes.

**Two workers.** Registrations are keyed by scope and browsers match a client
to the **longest scope prefix**, so the two registrations coexist: the root
worker (`/time/sw.js`, scope `/time/`) controls everything except
`/time/classes/**` once the classes registration exists; the classes worker
(`/time/classes/sw.js`, scope `/time/classes/`) controls its directory.
`Service-Worker-Allowed` is not needed — each script's default max scope is
its own directory, and narrower-than-sibling nesting is the plain static-host
pattern. Each worker is the current `sw.js` body (network-first, "last
snapshot" model, issue 063+070 semantics preserved verbatim) parameterized
only by its app: URL list, cache family, status database, header comment.
Deliberate duplication sanctioned by the user; the two files differ in
~15 lines.

- Root/teachers `SNAPSHOT_URLS` (25 URLs): `'./'`, `index.html`,
  `classes.html` (the stub — old bookmarks must redirect offline too),
  `time.html`, `timetable.html`, `styles.css`, `manifest.json`, the four
  `assets/icon*` PNGs, `js/register.js`, `js/data.js`, `js/libgroups.js`,
  `js/model.js`, `js/match.js`, `js/theme.js`, `js/color.js`, `js/teachers.js`,
  `js/app.js`, `vendor/kaomoji.js`, the three `vendor/*.woff2`, `emplois.csv`.
  (`js/classes.js` leaves the root list — no root page loads it any more.)
- Classes `SNAPSHOT_URLS` (22 URLs): `'./'`, `index.html`, `manifest.json`,
  `../styles.css`, `../assets/icon-192.png`, `../assets/icon-512.png`,
  `../assets/icon-maskable-512.png`, `../assets/apple-touch-icon.png`,
  `../js/register.js`, `../js/data.js`, `../js/libgroups.js`, `../js/model.js`,
  `../js/match.js`, `../js/theme.js`, `../js/color.js`, `../js/classes.js`,
  `../vendor/kaomoji.js`, `../vendor/dejavu-sans.woff2`,
  `../vendor/noto-sans-kannada.woff2`, `../vendor/noto-sans-symbols.woff2`,
  `../emplois.csv`. (`../` URLs resolve against `/time/classes/sw.js` to the
  shared files; CSS `url(...)` fonts resolve against `/time/styles.css`, so
  both snapshots end up holding the same absolute font URLs.)

**Cache and status isolation (the 070 semantics, per app).** Cache Storage and
IndexedDB are per-origin, shared between workers — so 070's "erase *every*
cache" must become "erase *this app's* snapshot family", or one app's reconnect
would destroy the other app's snapshot:

- Teachers cache family `emplois-teachers-snapshot-v1`; classes
  `emplois-classes-snapshot-v1`. Both are new names ⇒ both start at v1.
- Each worker's `activate` and `eraseSnapshot` act only on keys with its own
  family prefix (`emplois-teachers-snapshot-` / `emplois-classes-snapshot-`);
  the classes worker can never delete the teachers' snapshot or vice versa.
- The teachers worker additionally deletes the legacy pre-split cache
  `emplois-snapshot-v1` by exact name on activate (one-time upgrade cleanup —
  existing installs carry it).
- Status record per app: IndexedDB `emplois-teachers-status` (root) /
  `emplois-classes-status` (classes), both version 2, key `last-online`, same
  guarded best-effort plumbing. A shared record would let one app's reconnect
  swallow the other app's erase+retake transition (the second app to come
  online would read `online` and never erase), so per-app it is.
- The erase-then-retake chain, the shared in-flight `take`, the `no-cache`
  revalidation, the `res.ok` gate, `ignoreSearch` on navigations, skipWaiting/
  claim and the wholesale-only write invariant are all unchanged, per worker.

**Two manifests, two installed apps.** `id` defaults to `start_url`, so with
`start_url: "./"` in each directory the identities are `/time/` (teachers) and
`/time/classes/` (classes) — distinct, therefore two entries in the
installed-app list, and the pre-split install keeps its identity (`/time/`
unchanged ⇒ it becomes/relabels as the Teachers app; nothing orphans).

- Teachers `manifest.json`: `id: "./"`, `start_url: "./"`, `scope: "./"`,
  name "Emplois — Teachers — ISIM Mahdia Timetable", short_name "Teachers";
  icons `assets/icon-192.png`, `assets/icon-512.png`,
  `assets/icon-maskable-512.png` (shared 069 set, byte-identical files);
  shortcuts retargeted: Classes → `classes/`, Time → `time.html`, Timetable →
  `timetable.html` (all in-scope). Same `display`/`orientation`/colors/`lang`/
  `categories` as today; `theme_color` stays `#0b4da2`, matching every page's
  author `<meta name="theme-color">`.
- Classes `classes/manifest.json`: `id: "./"`, `start_url: "./"`,
  `scope: "./"`, name "Emplois — Classes — ISIM Mahdia Timetable",
  short_name "Classes", same colors/fields, icons `../assets/…` (same files),
  **no shortcuts** (shortcut URLs outside the app's scope are not
  dependable; the app has one page anyway).
- Both apps distinguish by **name**, not icon art: generating per-app icons is
  design work out of this issue's scope, and 069 pins the logo set as-is.

**Page wiring.** The moved classes page keeps every head/body pattern and
re-points its relative URLs one level up: stylesheet `../styles.css`, icons
`../assets/…`, scripts `../js/*.js` + `../vendor/kaomoji.js` (still ending
with the shared `js/register.js` tag), manifest link `manifest.json` (its own,
in-directory), nav `../index.html` / `../timetable.html` / `../time.html` /
self `index.html`; canonical + og:url become
`https://adem482p.github.io/time/classes/`. The redirect stub at
`classes.html` is a minimal page: `<link rel="canonical">` to the new URL,
`<meta name="robots" content="noindex">`, a `<meta http-equiv="refresh"
content="0; url=./classes/">` for no-JS and a
`location.replace('./classes/' + location.search + location.hash)` script so
`?redact=1` deep links survive the move; no manifest link, no registration.

**One shared-library change — `js/data.js`.** `fetch('emplois.csv')` is
document-relative; from `/time/classes/` it would 404, and duplicating the CSV
would break the single-source-of-truth invariant. Fix generically: capture
`document.currentScript` at parse time (classic sync scripts ⇒ non-null; guard
`typeof document` so the vm test sandboxes keep working) and fetch
`new URL('../emplois.csv', <captured src>).href` — both apps load `js/data.js`
from `/time/js/`, so one rule serves both, today and for any future app
directory. No `<base>` trickery (it would hijack `register.js`'s relative
`'sw.js'` resolution), no per-page configuration.

**2. Reasoning.** The hard constraint is scope-keyed registrations. Option B
(keep all URLs, two workers) is impossible: two root-scope registrations
replace each other, and the "one worker filtering navigations between two
apps" variant is one worker wearing two hats — it contradicts the user's
explicit requirement and reintroduces the shared-everything coupling the
request exists to remove. Option A (move *both* apps into `teachers/` +
`classes/`, root becomes a redirect) buys nothing the asymmetric split lacks:
it breaks the canonical, bookmarked, og:url'd `/time/` front door with an
extra redirect hop, and leaves `time.html`/`timetable.html` needing an owner
anyway. The asymmetric split touches exactly one public URL
(`/time/classes.html` → `/time/classes/`, kept alive by a redirect stub that
even works offline through the root snapshot), keeps the canonical teachers
URL and the pre-split installed app's identity, and gives the classes app a
scope that is unambiguously its own. `time.html`/`timetable.html` belong to
the root worker's scope and snapshot — they are shared utility views reached
from the classes app's nav via `../`, and offline they answer from the root
snapshot; a cross-app link offline never dead-ends because *both* snapshots
plus the redirect stub are served by their respective workers via
longest-prefix matching. Maintainability: the per-app differences are
confined to three declared constants per worker (URL list, cache prefix,
status DB) and the manifests; everything else is shared-by-location
(`../js`, `../vendor`, `../assets`, `styles.css`), so the "intentionally
duplicated" worker files stay thin and the divergence is visible at the top
of each file. The test suite's derived-coverage machinery (pages → scripts →
snapshot list) keeps working per app, so a future asset missing from a
snapshot still goes red instead of becoming a silent offline hole.

**3. Acceptance criteria** (mechanical; baseline `main` @ 7460721 is
**173 pass / 0 fail**; expected after this change: **176 pass / 0 fail** —
`test/offline.test.js` 9 → 10, `test/pwa.test.js` 8 → 10, all other files
keep their counts):

1. **Created `classes/index.html`** — byte-preserving move of the current
   `classes.html` body/head with ONLY these differences: stylesheet
   `../styles.css`; icon/apple-touch links `../assets/icon-192.png` /
   `../assets/apple-touch-icon.png`; scripts `../js/data.js`, `../js/libgroups.js`,
   `../js/model.js`, `../js/match.js`, `../js/theme.js`, `../js/color.js`,
   `../vendor/kaomoji.js`, `../js/classes.js`, `../js/register.js` (still the
   LAST script tag); manifest link stays `href="manifest.json"` (now the
   in-directory one); nav becomes
   `<a href="../index.html">Teachers</a><a href="../timetable.html">Timetable matrix</a><a href="../time.html">Time</a><a href="index.html"><strong>Classes</strong></a>`;
   canonical and og:url become `https://adem482p.github.io/time/classes/`.
2. **Rewritten `classes.html` (redirect stub)**: contains
   `url=./classes/` in a meta refresh, a `location.replace('./classes/' +
   location.search + location.hash)` script, the canonical link to
   `https://adem482p.github.io/time/classes/`, `noindex`; carries NO
   `rel="manifest"` link and NO `js/register.js` script.
3. **Created `classes/sw.js`** — the current `sw.js` semantics verbatim
   (install/activate/fetch lifecycle, `skipWaiting`, `clients.claim`,
   `inflight`/`share`, `noteOnline`/`noteOffline` chain order, `cache:
   'no-cache'`, `res.ok` gate, `ignoreSearch` on navigations, wholesale-only
   writes: exactly two `caches.open` sites and two `addAll` calls) with:
   `SNAPSHOT = 'emplois-classes-snapshot-v1'`; the 22-URL `SNAPSHOT_URLS`
   listed above; `eraseSnapshot` and the activate cleanup restricted to keys
   with prefix `emplois-classes-snapshot-` (a filter, never "delete all");
   status DB `emplois-classes-status` (version 2, key `last-online`); header
   comment describing the snapshot model and that this worker owns
   `/time/classes/` only. It must NOT contain the strings `emplois-teachers`,
   `emplois-snapshot-v1`, or any root-relative URL (no `index.html`-at-root
   entries).
4. **Modified `sw.js` (teachers worker)**: same semantics; `SNAPSHOT =
   'emplois-teachers-snapshot-v1'`; the 25-URL list above (classes.html stub
   kept, `js/classes.js` dropped); activate + erase filtered to prefix
   `emplois-teachers-snapshot-` **plus** one-time exact-name deletion of the
   legacy `'emplois-snapshot-v1'`; status DB `emplois-teachers-status`; header
   comment updated (teachers app + root-scope site worker; sibling worker in
   `classes/sw.js` owns its directory). It must NOT contain `emplois-classes`.
5. **`manifest.json` (teachers)**: add `"id": "./"`; name
   "Emplois — Teachers — ISIM Mahdia Timetable", short_name "Teachers";
   shortcut URLs `classes/`, `time.html`, `timetable.html`; everything else
   (`start_url`/`scope` `./`, colors, display, orientation, lang, categories,
   the three icons) unchanged.
6. **Created `classes/manifest.json`**: `id: "./"`, `start_url: "./"`,
   `scope: "./"`, name "Emplois — Classes — ISIM Mahdia Timetable",
   short_name "Classes", same lang/display/orientation/theme_color/
   background_color/categories as the teachers manifest, description
   mirroring the classes page's meta description, icons
   `../assets/icon-192.png`, `../assets/icon-512.png`,
   `../assets/icon-maskable-512.png` (no shortcuts).
7. **`js/data.js`**: captures its own script URL at parse time behind a
   `typeof document !== 'undefined'` guard and `loadStore` fetches
   `new URL('../emplois.csv', <script src>).href`, falling back to plain
   `'emplois.csv'` when no script URL is available (vm sandboxes). No other
   change; the vm-loaded suites must keep passing untouched semantics.
8. **`js/register.js`**: the line `navigator.serviceWorker.register('sw.js')`
   stays byte-identical; only the header comment may be extended to say each
   page registers the worker of its own directory (issue 072).
9. **`test/offline.test.js` → 10 tests**, parameterized over
   `APPS = [{ name:'teachers', dir:'', sw:'sw.js' }, { name:'classes', dir:'classes/', sw:'classes/sw.js' }]`:
   lifecycle tokens + versioned-name pin per worker; snapshot coverage per
   worker with **relative-URL resolution against the worker's directory**
   (derived set = that app's pages' script/stylesheet/manifest/icon links +
   `styles.css` same-origin `url(...)`s resolved to site-root-relative +
   `js/data.js`'s CSV target `emplois.csv`); network-first semantics per
   worker (including the banned-string pins); every page (now including
   `classes/index.html`) ends with its app's register script (suffix-match
   `js/register.js`); activate key-filter + install `share(`/`addAll` per
   worker; IndexedDB per worker (`emplois-teachers-status` /
   `emplois-classes-status`); erase-then-retake chain per worker with the pin
   **inverted**: the erase MUST filter to the own-family prefix (update the
   old "no filter — ALL storage torn down" assertion and its comment);
   wholesale-only per worker; vocabulary per worker. **New 10th test**: the
   two workers' teardown families and status databases are disjoint —
   root declares `emplois-teachers-snapshot-v\d+`, contains
   `'emplois-snapshot-v1'` exactly as a teardown target and never
   `emplois-classes`; classes declares `emplois-classes-snapshot-v\d+`, never
   `emplois-teachers` and never the legacy name.
10. **`test/pwa.test.js` → 10 tests**: manifest-fields test parameterized over
    both manifests (all current field pins, `start_url`/`scope` `'./'`,
    `id` `'./'`, theme_color == each page's author meta); every page links
    exactly ONE manifest and real icons — pins compare **hrefs resolved
    against the page's directory**, asserting the three root pages resolve to
    root `manifest.json`/`assets/…` and the classes page resolves to
    `classes/manifest.json` and `../assets/…` (the classes page must NOT link
    the root manifest); icon PNG/IHDR/maskable checks parameterized over both
    manifests with icon srcs resolved against the manifest's directory;
    shortcut test: teachers shortcuts resolve (with `classes/` mapping to
    `classes/index.html` on disk) and stay inside the app's scope, classes
    manifest has no shortcuts; per-app snapshot-covers-manifest-and-icons
    test; the `.json`-MIME test over both manifests; the 069 safe-zone and
    ISIMa-provenance tests unchanged. **New 9th test**: the redirect stub
    (tokens `url=./classes/`, `location.search`, `location.hash`,
    `noindex`, canonical to `/time/classes/`, no manifest link, no
    register.js). **New 10th test**: distinct installed-app identities — both
    manifests declare `id: "./"`, the two manifest files are different
    directories, and the two `short_name`s differ.
11. **`test/theme-boot.test.js`**: `PAGES` becomes `['index.html',
    'classes/index.html', 'time.html', 'timetable.html']`; the stylesheet
    literal is per page (`styles.css` at root, `../styles.css` on the classes
    page); all 7 tests keep their names and semantics (byte-identical replay
    snippet on all four pages still required).
12. **`test/classes.test.js`** (count stays 65): every `readPage('classes.html')`
    → `readPage('classes/index.html')`; the structure test's script stack
    uses the `../`-prefixed srcs; the canonical pin becomes
    `https://adem482p.github.io/time/classes/`; the nav test pins the four
    links above (Teachers `../index.html`, `../timetable.html`, `../time.html`,
    self `index.html` with `<strong>Classes</strong>`).
13. **`FEATURES.md`**: update only the passages the split invalidates — the
    "only `classes.html` carries the nav bar" line (now
    `classes/index.html`), the "Offline: the snapshot model" section (two
    workers, per-app snapshot families, family-scoped erase+retake, per-app
    status DBs, per-app URL-list sizes instead of "the 26 URLs"), the
    "Installable app" section (two apps "Teachers" and "Classes", distinct
    ids/names, classes at `/time/classes/`, `classes.html` redirect note, no
    shortcuts on the classes app), and the `classes.html`-remembers-the-last-
    class path reference. Do not restructure the docs.
14. **Verification** (implementer, no browser): `node --test test/*.test.js`
    → **176 pass / 0 fail**; `python3 -m http.server` + `curl -s -o /dev/null
    -w '%{http_code}'` → 200 for `/`, `/index.html`, `/classes.html` (stub),
    `/classes/`, `/classes/index.html`, `/classes/manifest.json`,
    `/classes/sw.js`, `/time.html`, `/timetable.html`, `/styles.css`,
    `/js/data.js`, `/emplois.csv`; node spot-assertions: each manifest
    JSON.parses; each `SNAPSHOT_URLS` entry exists on disk relative to its
    worker's directory; the classes page's every same-origin href/src
    resolves to an existing file.
15. **Sibling boundary — do NOT touch**: `data/`, `README.md`, `CONTEXT.md`,
    `styles.css`, `js/theme.js`, `js/color.js`, `js/teachers.js`,
    `js/classes.js`, `js/app.js`, `js/model.js`, `js/match.js`,
    `js/libgroups.js`, `js/data.js` beyond criterion 7, `vendor/*`,
    `assets/*`, `emplois.csv`, `index.html`, `time.html`, `timetable.html`,
    `issues/*` except `072-split-apps.md`, and no git operations of any kind.

**4. Risks / constraints to guard:**

- **Nested-scope takeover is spec behavior, unverified in a browser here.**
  The whole design rests on registrations coexisting under nested scopes with
  longest-scope-prefix winning, `clients.claim()` being unable to steal a
  client from the sibling registration, and the classes worker taking control
  of `/time/classes/` from the second navigation onward (the first load runs
  under the root worker — harmless: both are network-first online). After
  deploy, verify on Chrome Android: two entries in the installed-apps list,
  each opening its own page, each surviving an offline reload.
- **070 regression**: the erase+retake must stay wholesale and transition-
  driven, but now family-scoped — the classic bug to guard is one worker's
  reconnect erasing the sibling's snapshot (impossible by construction once
  both teardowns are prefix-filtered; keep the disjointness test green).
- **Subpath `/time/`**: every new relative URL (`../…` in the classes app,
  `classes/` in the teachers shortcut, the stub's `./classes/`) must stay
  relative — no root-absolute or protocol URLs anywhere (issue 067's lesson);
  the existing `isRelative` pins must be applied to the new manifests too.
- **Offline cross-app navigation**: root snapshot must keep the `classes.html`
  stub and the classes snapshot must keep its own page + shared libs +
  `../emplois.csv`, or an offline cross-link dead-ends; the derived-coverage
  tests are the mechanical guard.
- **`?redact=1` deep links**: the stub must forward query + hash; snapshot
  fallback already ignores search on navigations — don't regress that pin.
- **Existing installs**: pre-split installed app keeps id `/time/` (relabeled
  "Teachers", not orphaned); the legacy `emplois-snapshot-v1` cache must be
  cleaned by the teachers worker's activate.
- **Docs/links**: FEATURES.md passages named in criterion 13; README carries
  no page URLs (screenshot asset paths only) and stays untouched.

**Request (settled by coordinator or user; recommended default given):**
confirm that breaking the public `/time/classes.html` URL is acceptable.
Recommended: **yes** — the stub keeps every old link working (online and
offline), no page outside this repo links it, and the alternative (Option A)
breaks more URLs, not fewer. Also accept-by-default: app names "Emplois —
Teachers — ISIM Mahdia Timetable" / "Emplois — Classes — ISIM Mahdia Timetable"
and the directory name `classes/`. No other open questions — no second
maintainer round is needed if these defaults stand.

---

### Plan (2026-10-21) — strict two-directory split per the user's direction; supersedes the decision above

Written by the folded planner + implementer for this issue. **The user chose the
strict structure, which supersedes the asymmetric Option C decided above**: both
apps move into a directory of their own, the root becomes a manifest-less,
worker-less landing page, and `time.html`/`timetable.html` keep their files but
lose the manifest link and the registration script (accepted by the user as
online-only). The parts of the analysis above that remain true are reused as
is: the scope-keying constraint from the Root cause (two registrations with the
same scope replace each other), per-app cache-family isolation, per-app IndexedDB
status DBs, the generic `js/data.js` CSV-path fix, the redirect-stub technique
with query+hash forwarding, subpath safety (every URL relative — issue 067),
and the expectation that tests are re-parameterized to pin the NEW invariants
rather than weakened. The acceptance criteria below replace the superseded
entry's criterion list; its still-applicable risks are restated at the end.

**Spec research done for this plan (why the strict shape is sound).** W3C
Service Workers, *Handle Fetch*: **non-subresource requests (navigations) are
matched to a registration by the request URL's scope**, but **subresource
requests are routed to the requesting client's own controlling worker** ("If
client's active service worker is non-null, set registration to client's active
service worker's containing registration"). Consequences that shape this
design:

- A page under `teachers/` controlled by `teachers/sw.js` fetches
  `../styles.css`, `../js/*`, `../emplois.csv` — those URLs sit outside the
  worker's scope, yet they reach ITS fetch handler (client-controller routing),
  so each app worker can serve the shared root assets from its own snapshot.
  `addAll('../styles.css')` works from the worker too: the Cache API has no
  scope restriction and resolves entries against the worker's script URL.
- **Navigations** to `time.html`, `timetable.html`, the root `/` and the
  `classes.html` stub match **no** registration under the strict shape → never
  intercepted → online-only by construction. That is exactly the regression the
  user accepted for the utility pages and the necessary shape of a plain root.
- On **pre-split devices** an orphaned root-scope registration survives (its
  script `/sw.js` now 404s, and a failed update leaves the old worker active,
  per spec); it keeps answering root-scope navigations network-first (harmless
  online) until unregistered client-side. Longest-prefix matching lets the new
  per-directory registrations take over the app directories from the first
  successful `register()` on.

**URL map (before → after)** — production serves the site from `/time/`; paths
below are repo-relative:

| URL | Before | After |
|---|---|---|
| `/`, `/index.html` | teachers app shell (root manifest + root worker) | **landing page**: no manifest, no worker; links to both apps + both utility pages |
| `/teachers/` (NEW, `teachers/index.html`) | — | teachers app: `teachers/manifest.json`, `teachers/sw.js`, scope `./` |
| `/classes/` (NEW, `classes/index.html`) | — | classes app: `classes/manifest.json`, `classes/sw.js`, scope `./` |
| `/classes.html` | classes app shell | **redirect stub** → `./classes/` (forwards `?…` + hash; no manifest, no worker) |
| `/time.html`, `/timetable.html` | manifest + worker | same files minus the manifest link and minus `js/register.js` → online-only |
| `/manifest.json`, `/sw.js` | the single app's artifacts | **deleted** (they become the two apps' files) |
| shared: `/styles.css`, `/js/*`, `/vendor/*`, `/assets/*`, `/emplois.csv` | root | unchanged, referenced `../`-relatively from the app directories |

**Decisions.**

1. **Landing at the root, not a redirect.** A redirect to `teachers/` would
   strand anyone looking for the classes app (the teachers page carries no nav
   bar) and break the canonical, og:url'd front door `/time/`. The landing is
   plain HTML — no manifest link, no `js/register.js`, no body scripts — with
   the standard head (charset/viewport/color-scheme/theme-color, og/twitter
   cards, the issue-066 replay snippet, `styles.css`) and four links: Teachers,
   Classes, Time, Timetable matrix. It inherits the CSS dark fallback, so it is
   scheme-correct with zero JS of its own.
2. **`classes.html` survives as a no-JS + JS redirect stub** (technique as in
   the superseded decision): `meta refresh 0; url=./classes/`, canonical to
   `https://adem482p.github.io/time/classes/`, `noindex`, and
   `location.replace('./classes/' + location.search + location.hash)` so
   `?redact=1` deep links and hashes survive; no manifest link, no
   registration. Justification: the URL lives in old shortcuts/bookmarks and
   costs ~15 lines; under the no-root-artifacts rule it is a plain page exactly
   as prescribed. No other old path needs a stub: `/` and `/index.html` still
   exist (as the landing), `time.html`/`timetable.html` keep their paths, and
   root `manifest.json`/`sw.js` are fetch artifacts nobody bookmarks.
3. **Per-app worker identity (caches, DB, legacy cleanup).** Both workers are
   the issue-063/070 body verbatim, parameterized by three declared constants:
   - `SNAPSHOT_PREFIX = 'emplois-teachers-snapshot-'` / `'emplois-classes-snapshot-'`
     with `SNAPSHOT = SNAPSHOT_PREFIX + 'v1'` (each is a new family → starts at
     v1).
   - `eraseSnapshot()` and the activate cleanup act **only on keys carrying the
     own family prefix** (never "delete all") — two workers share one origin's
     Cache Storage, so a family-filtered teardown is the isolation the
     superseded decision already established; its test pin "no filter — ALL
     storage torn down" is inverted to "MUST filter to the own prefix".
   - Status DB `emplois-teachers-status` / `emplois-classes-status` (version 2,
     key `last-online`, same guarded best-effort plumbing) — a shared record
     would let one app's reconnect swallow the other app's erase+retake
     transition (the second app to come online would read `online` and never
     erase).
   - The teachers worker additionally deletes the legacy root snapshot
     `'emplois-snapshot-v1'` **by exact name** on activate: existing installs
     carry it, no root worker survives to clean it, and removing it stops a
     stale root worker from serving pre-split content offline (e.g. the old
     full `classes.html` instead of the redirect stub).
   - Unchanged per worker: the erase-then-retake chain, `inflight`/`share`,
     `no-cache` + the `res.ok` gate, `ignoreSearch` on navigations,
     wholesale-only writes (exactly two `caches.open`, two `addAll` per file),
     skipWaiting/clients.claim.
4. **Snapshot URL lists** — each relative to its own worker, 21 entries each,
   every entry exists on disk:
   - teachers: `'./'`, `index.html`, `manifest.json`, `../styles.css`, the four
     `../assets/icon*.png`, `../js/register.js`, `../js/data.js`,
     `../js/libgroups.js`, `../js/model.js`, `../js/match.js`, `../js/theme.js`,
     `../js/color.js`, `../js/teachers.js`, `../vendor/kaomoji.js`, the three
     `../vendor/*.woff2`, `../emplois.csv`.
   - classes: the same shape with `../js/classes.js` in place of
     `../js/teachers.js`.
   - **Excluded on purpose:** `../time.html`, `../timetable.html`, the landing
     and the `classes.html` stub — navigations to those URLs match no
     registration under this structure (Handle Fetch, above), so snapshotting
     them would be dead weight; the user made the utility pages online-only.
     Each app's derived coverage (its own page's script/stylesheet/manifest/icon
     links + `styles.css` same-origin `url(...)`s + data.js's CSV target, all
     normalized to site-root paths) must be a subset of its worker's list — the
     mechanical guard against silent offline holes.
5. **Two manifests, distinct identities.** `id`/`start_url`/`scope` all `"./"` →
   ids `…/time/teachers/` and `…/time/classes/` → two entries in the
   installed-apps list. Names exactly as chosen by the user: **"Emplois —
   Enseignants"** / **"Enseignants"** and **"Emplois — Classes"** /
   **"Classes"**. Same colors/lang/display/orientation/categories as today;
   `theme_color #0b4da2` still equals each page's author meta. Icons: the
   shared 069 set via `../assets/icon-192.png`, `../assets/icon-512.png`,
   `../assets/icon-maskable-512.png` (generating per-app icon art is out of
   scope). **No shortcuts in either manifest**: every former shortcut target
   (`classes.html`, `time.html`, `timetable.html`) lies outside both `./`
   scopes, and out-of-scope shortcut URLs are not dependable — the reasoning
   this thread's superseded decision already accepted for the classes manifest;
   each app has a single page anyway. Honest casualty: the **pre-split
   installed app orphans** — its id `…/time/` and manifest URL `/manifest.json`
   no longer exist, so the old launcher entry goes dead and the user installs
   the two new apps afresh (nothing can preserve an id whose manifest 404s).
6. **Page wiring.** `teachers/index.html` and `classes/index.html` are
   byte-preserving moves with only URL re-pointing: stylesheet `../styles.css`,
   icons `../assets/…`, scripts `../js/…` + `../vendor/kaomoji.js`
   (`js/register.js` stays the LAST script), the manifest link keeps the literal
   `manifest.json` (now the in-directory one), canonical/og:url become
   `https://adem482p.github.io/time/teachers/` and `…/time/classes/`. The
   classes nav becomes
   `<a href="../teachers/">Teachers</a><a href="../timetable.html">Timetable matrix</a><a href="../time.html">Time</a><a href="index.html"><strong>Classes</strong></a>`
   — the Teachers link addresses the app entry (each snapshot carries `'./'`
   for exactly this); the utility links keep their old targets.
7. **`js/register.js`**: `navigator.serviceWorker.register('sw.js')` stays
   byte-identical — from `teachers/` and `classes/` it resolves to that
   directory's worker with default scope; only the header comment is extended to
   say each page registers the worker of its own directory (issue 072). The tag
   loads on the two app pages only; root landing and `time.html`/
   `timetable.html` drop it.
8. **`js/data.js` CSV fix (generic, one rule serves both apps).** Capture
   `document.currentScript.src` at parse time behind a
   `typeof document !== 'undefined'` guard and fetch
   `new URL('../emplois.csv', <that URL>)` — `js/data.js` always loads from
   `js/`, so `../emplois.csv` resolves to the site root from any page
   directory; fall back to plain `'emplois.csv'` when no script URL exists (the
   vm test sandboxes, which never define `document`). No `<base>` (it would
   hijack register.js's relative `'sw.js'`), no CSV duplication (single source
   of truth), no per-page configuration. Both paths get exercised in node: with
   a stubbed `document.currentScript` and with none.
9. **`time.html` / `timetable.html`**: exactly today's files minus
   `<link rel="manifest" href="manifest.json">` (its target disappears — it
   would 404) and minus `<script src="js/register.js">`; everything else
   untouched, per the user's instruction.
10. **Tests re-parameterized to pin the NEW invariants** (baseline `main` @
    7460721 = **173 pass / 0 fail**; expected after: **177** —
    `offline.test.js` 9 → 11, `pwa.test.js` 8 → 10, every other file keeps its
    count):
    - `test/offline.test.js` → 11, per-worker over the two apps
      (`teachers/…`, `classes/…`): lifecycle + versioned-name pin; snapshot
      coverage with **resolution against the worker's directory** (derived set
      = that app page's tags + `styles.css` `url(...)`s + data.js CSV target,
      normalized to site-root paths); network-first semantics + banned strings
      per worker; register tag last on the two app pages and **zero** register
      tags on landing/`time`/`timetable`/stub; activate key-filter + legacy
      exact-name delete (teachers only) + install `share(`/`addAll` per worker;
      per-worker status DB; the erase-then-retake chain with the pin
      **inverted** (the erase MUST filter to the own family prefix);
      wholesale-only per worker; vocabulary per worker. **Two new tests:**
      (a) family/DB disjointness (teachers declares its own family, contains
      `'emplois-snapshot-v1'` only as a teardown target, never
      `emplois-classes`; classes declares its family, never `emplois-teachers`
      nor the legacy name); (b) neither snapshot lists pages outside its app
      (no `time.html`/`timetable.html`/landing/other-app/stub entries).
    - `test/pwa.test.js` → 10: manifest fields per app (all current pins + `id:
      './'` + the user's exact names, `theme_color` == each page's author meta);
      every page's manifest/icon hrefs compared **resolved against the page's
      directory** (app pages → their own manifest + root assets; landing,
      `time`, `timetable`, stub → ZERO manifest links); PNG/IHDR + maskable
      checks per manifest with icon srcs resolved against the manifest's
      directory; shortcuts → both manifests carry none (the scope decision,
      pinned); per-app snapshot-covers-manifest-and-icons; the `.json`-MIME test
      per app page; the 069 safe-zone and provenance tests unchanged in
      semantics. **Two new tests:** (a) distinct installed-app identities —
      two manifests, two directories, different `short_name`s, exact
      user-chosen names; (b) the `classes.html` stub tokens (`url=./classes/`,
      `location.search`, `location.hash`, `noindex`, canonical `/time/classes/`,
      no manifest link, no register.js).
    - `test/theme-boot.test.js`: `PAGES` → all five pages (the landing carries
      the same replay snippet) with a **per-page stylesheet literal**
      (`styles.css` at root, `../styles.css` in the app dirs); all 7 tests keep
      their names and semantics.
    - `test/classes.test.js` (count stays 65): `classes.html` →
      `classes/index.html`; `../`-prefixed script stack; canonical/og →
      `…/time/classes/`; nav pins for the four links above.
    - `test/teacher-daygroups.test.js`: reads `teachers/index.html` now.
11. **Docs**: `FEATURES.md` only — the "only `classes.html` carries the nav"
    line, the two view headings, the offline section (two workers/scopes,
    21-URL lists, family-scoped erase+retake + legacy cleanup, per-app status
    DBs, utility pages online-only), the installable-app section (two apps,
    exact names, distinct ids, no shortcuts, stub note), and the
    `classes.html`-remembers passage. `README.md`, `CONTEXT.md` and
    `data/README.md` carry no page-path references (grep-verified) → untouched.

**Risks carried into implementation:** the orphaned root registration on
pre-split devices (persisted by spec, removable only client-side); the orphaned
pre-split launcher entry (its manifest 404s — honest orphan, reinstall
required); offline *cross-app* navigation only works once the target app has
been visited once (its registration must exist — a first-time offline visit to
an unvisited app fails at the navigation, as any uncached first visit does);
`js/classes.js`'s line-59 comment still says "classes.html" (sibling file,
off-limits to this issue — reported, not edited); the shared fonts are stored
once per app snapshot (double storage per origin — the price of two
independent apps); and device-level verification (two launcher entries, offline
reload per app, installability) needs a real browser/deploy — attempted here
with Playwright against a local server and reported in the fix entry.

### Fix implemented (2026-10-21)

Written by the fresh implementer run that took over from an interrupted run
which looped on failing tests. Its leftovers were audited against the Plan
entry above (criteria win over whatever the dead run did), the plan was
implemented as written, and everything below was verified in place. No git
operations were performed — the changes are uncommitted for the main agent to
merge.

**What the interrupted run had already done correctly (audited, kept as-is).**
- `teachers/{index.html,manifest.json,sw.js}` and
  `classes/{index.html,manifest.json,sw.js}` created per plan decisions 3–7:
  byte-preserving page moves with `../`-re-pointed stylesheet/icons/scripts,
  the manifest link kept as the literal `manifest.json`, `js/register.js` last,
  canonical/og:url `…/time/teachers/` and `…/time/classes/`, and the classes
  nav exactly `<a href="../teachers/">Teachers</a><a href="../timetable.html">Timetable
  matrix</a><a href="../time.html">Time</a><a href="index.html"><strong>Classes</strong></a>`;
  manifests with the user's exact names ("Emplois — Enseignants"/"Enseignants",
  "Emplois — Classes"/"Classes"), `id`/`start_url`/`scope` `"./"`, the shared
  069 icons via `../assets/…`, no shortcuts; both workers the issue-063/070
  body parameterized by `SNAPSHOT_PREFIX` (`emplois-teachers-snapshot-` /
  `emplois-classes-snapshot-`, each `+ 'v1'`), per-app status DBs
  (`emplois-teachers-status` / `emplois-classes-status`, version 2, key
  `last-online`), 21-entry `SNAPSHOT_URLS` each, family-filtered `eraseSnapshot`
  and activate cleanup, and the teachers-only legacy `emplois-snapshot-v1`
  exact-name delete.
- Root `manifest.json` and `sw.js` deleted; root `index.html` replaced by the
  plain landing (no manifest link, no register.js, no body scripts; replay
  snippet + color-scheme meta + four links); `classes.html` replaced by the
  no-JS + JS redirect stub; `time.html` / `timetable.html` minus the manifest
  link and minus `js/register.js` (decision 9).
- `js/register.js`: `navigator.serviceWorker.register('sw.js')` byte-identical,
  header comment extended (decision 7). `js/data.js`: `document.currentScript`
  capture + `new URL('../emplois.csv', SCRIPT_URL)` with the plain
  `'emplois.csv'` fallback for vm sandboxes (decision 8).
- `test/offline.test.js` fully restructured to the plan's 11 tests (lifecycle +
  versioned-name pin; derived snapshot coverage resolved against the worker's
  own directory; data.js exercised with and without `document.currentScript`;
  register-last on app pages + zero register tags on landing/time/timetable/
  stub; family-filtered activate + legacy exact-name delete; per-app status DB;
  the INVERTED erase pin — erase MUST filter to the own family; wholesale-only;
  vocabulary; family/DB disjointness; no snapshot lists pages outside its app).
  Audited pin-by-pin: strong, no weakened assertions — kept verbatim.
- `test/pwa.test.js` restructured to the plan's 10 tests (per-app manifest
  fields incl. `id: './'` and the exact names, `theme_color` == each page's
  author meta; manifest/icon hrefs resolved against each page's directory with
  ZERO manifest links on landing/time/timetable/stub; PNG/IHDR + maskable
  checks with icon srcs resolved against the manifest's directory; no
  shortcuts on either manifest; per-app snapshot-covers-manifest-and-icons;
  `.json` MIME per app page; the distinct-identities and stub-tokens tests).
  Kept, with one real defect fixed (below).

**Defects found in the leftovers and fixed by this run (the 10 failures).**
1. `test/pwa.test.js` — REAL DEFECT in the interrupted run's test code: the PNG
   filter-4 (Paeth) predictor in `decodePngRgb` computed `p = cur[x−bpp]`
   (i.e. `a`) instead of the spec's `p = a + b − c`, with `pb`/`pc` derived
   from that wrong `p`. Every Paeth-filtered row reconstructed as garbage,
   measuring phantom ink 282.1 px from centre and failing the issue-069
   safe-zone pin — the icon itself is fine. Fixed to the spec Paeth
   (`p = a + b − c`; nearest of `a`/`b`/`c`); the real icon then measures
   ink 19 301 px, maxDist 184.1 ≤ 204.8, corners full-bleed background. The
   069 test keeps its semantics and now pins them with a correct decoder.
2. `test/theme-boot.test.js` — incomplete re-pointing (2 failures): `PAGES`
   still listed `classes.html` (now the redirect stub) and only four pages.
   Re-parameterized per plan criterion 10: five `{page, sheet}` entries with a
   per-page stylesheet literal (`styles.css` at root, `../styles.css` in the
   app dirs); the two test names and the header comment say "all five pages"
   instead of the stale "all four" (the re-pointing the brief sanctions; the
   assertions and semantics are unchanged).
3. `test/classes.test.js` — incomplete re-pointing (5 failures): structure
   test now reads `classes/index.html` with the `../`-prefixed script stack,
   `../vendor/kaomoji.js` and the canonical pin `…/time/classes/`; the nav test
   now pins the landing's `href="classes/"` plus the four pinned classes-nav
   links; the nav-chrome, tooltip (059) and clear-X/back-arrow (060, 064) tests
   read `classes/index.html`. Count stays 65; every assertion kept, only
   paths/prefixes/pinned strings re-pointed.
4. `test/teacher-daygroups.test.js` — incomplete re-pointing (2 failures):
   `INDEX_SRC` now reads `teachers/index.html` (assertion message updated).
   Count stays 25.
5. `FEATURES.md` — never touched by the interrupted run; criterion-11 passages
   now written: the views intro (two apps + online-only utility pages +
   landing), the two view headings (`teachers/index.html`,
   `classes/index.html`), the offline section (two workers/scopes, 21-URL
   lists, family-scoped erase + retake, legacy exact-name cleanup, per-app
   status DBs, utility pages + landing online-only, register.js on app pages
   only), the installable-app section (two apps, exact names, distinct ids,
   no shortcuts, redirect-stub note, orphaned pre-split entry) and the
   class-remembers passage.

**Verification results.**
- Tests: `node --test test/*.test.js` → **177 pass / 0 fail** — exactly the
  plan's expected total. Per-file: classes 65, deadcode 3, fusion 16,
  libgroups 19, offline 11, pwa 10, redact 10, teacher-daygroups 25,
  teacher-subjects 5, theme-boot 7, time-live 6.
- Dev server `python3 -m http.server 8123` (PID recorded, killed afterwards —
  port confirmed closed, no orphan): curl **200** for `/`, `/index.html`,
  `/teachers/`, `/teachers/index.html`, `/teachers/manifest.json`
  (`application/json`), `/teachers/sw.js`, `/classes/`, `/classes/index.html`,
  `/classes/manifest.json` (`application/json`), `/classes/sw.js`,
  `/classes.html`, `/time.html`, `/timetable.html`, `/styles.css`,
  `/js/data.js`, `/emplois.csv`.
- Node spot-assertions: both manifests parse (identity fields `id/start_url/
  scope = "./"`, exact names); every entry of each worker's 21-URL
  `SNAPSHOT_URLS` exists on disk relative to that worker's directory; every
  same-origin href/src in `teachers/index.html` (13) and `classes/index.html`
  (17) resolves to an existing file; landing, `time.html`, `timetable.html`
  and the `classes.html` stub carry no manifest link and no `js/register.js`.
- Playwright against the local server: **0 console errors** on every page
  (`/`, `/teachers/`, `/classes/`, `/classes.html` → lands on `/classes/`,
  `/time.html`, `/timetable.html`); manifest per page: app pages → their
  OWN directory's manifest, landing/time/timetable → none; CDP
  `Page.getInstallabilityErrors` → **`[]`** on both app pages. Clean-slate
  registration proof (after wiping the shared profile's leftovers, which
  included a stale root-scope registration and an `emplois-v2` cache from an
  earlier serve of the pre-split tree on this port): `/`, `/time.html`,
  `/timetable.html` → **no registration**; `/teachers/` → exactly scope
  `…/teachers/`; `/classes/` → `…/teachers/` + `…/classes/`. Stub live check:
  `/classes.html?redact=1#anchor` → `/classes/?redact=1#anchor`. Legacy
  cleanup live check: seeded cache `emplois-snapshot-v1`, dropped the
  teachers registration, revisited `/teachers/` → the legacy cache is
  deleted; only the two per-family v1 snapshots remain.

**Could not verify / honest notes.**
- Device-level behaviour (two launcher entries, installed-app offline reload
  per app, real install prompt) needs a deployed origin and a real profile;
  the CDP installability check and the clean-slate registration proof above
  are the closest local proxies.
- The plan's orphan risks behave exactly as predicted: the stale root-scope
  registration observed in the test profile survived (its `/sw.js` now 404s)
  and is removable only client-side via the documented console escape hatch;
  a pre-split installed entry orphans (its id/manifest URL no longer exist).
- Flagged, not edited (off-limits sibling files): `js/classes.js` line 59
  still says "classes.html" (the plan's known casualty), and
  `test/teacher-subjects.test.js` line 23's header comment still says
  "classes.html's <script> tags".
- `FEATURES.md`'s "All four pages read `emplois.csv`" line was left as-is: it
  refers to the four views (all still CSV-reading) and is not one of the
  plan's targeted passages.
- The final total matches the plan's expected 177 exactly; no test was
  weakened — every assertion of the 069 safe-zone test, the inverted erase
  pin and the zero-register pins exists and pins the NEW invariants.

### Maintainer decision (2026-10-21, review)

**Verdict: Approve.** The final tree is the strict two-directory split the
user chose, implemented as the governing `### Plan (2026-10-21)` specifies,
with the 063/070 offline semantics preserved verbatim per worker and the
test suite re-parameterized to pin the NEW invariants (no assertion was
weakened). I reviewed the whole diff against `main` @ ed561b6 file by file,
re-ran every verification independently (including the live browser checks),
and confirm the fix entry's results. The interrupted-run story does not
affect the verdict: I judged only the final tree, and separately confirmed
its claim about the maskable-icon failure (below).

**Architectural direction (unchanged from the plan, endorsed).** The strict
shape is the right long-term convention: *a root landing that is the
site's front door, and one directory per app — page, manifest and worker
together — with shared code referenced `../`-relatively.* A third app later
is another directory, zero edits to the existing ones. The per-app worker
divergence is confined to three declared constants (family prefix, status
DB, URL list) plus the teachers-only legacy cleanup, so the deliberately
duplicated workers stay thin and their divergence is visible at the top of
each file. The generic `js/data.js` fix (resolve the CSV against the
script's own URL) is the one shared-library change worth its size: one rule,
no per-page configuration, no `<base>`, no CSV duplication, and the vm
sandboxes keep the old document-relative path as an honest fallback. The
tests keep the derived-coverage machinery (pages → tags → snapshot list,
resolved against each worker's directory), so a future asset missing from a
snapshot still goes red instead of becoming a silent offline hole — that
machinery, not the URL lists themselves, is the durable guard.

**What I verified independently (exact results).**
1. `node --test test/*.test.js` in the review tree → **177 pass / 0 fail**.
   Per-file: classes 65, deadcode 3, fusion 16, libgroups 19, offline 11,
   pwa 10, redact 10, teacher-daygroups 25, teacher-subjects 5, theme-boot 7,
   time-live 6 — matches the fix entry and the plan's expected total
   (baseline 173: offline 9→11, pwa 8→10, everything else unchanged).
2. Dev server (`python3 -m http.server`, PID recorded, killed; port confirmed
   closed afterwards): **200** for `/`, `/index.html`, `/teachers/`,
   `/teachers/index.html`, `/teachers/manifest.json` (`application/json`),
   `/teachers/sw.js`, `/classes/`, `/classes/index.html`,
   `/classes/manifest.json` (`application/json`), `/classes/sw.js`,
   `/classes.html`, `/time.html`, `/timetable.html`, `/styles.css`,
   `/js/data.js`, `/emplois.csv`.
3. Isolation: both workers declare `SNAPSHOT_PREFIX` (`emplois-teachers-
   snapshot-` / `emplois-classes-snapshot-`, each + `v1`) and per-app status
   DBs (`emplois-teachers-status` / `emplois-classes-status`, version 2, key
   `last-online`); `eraseSnapshot` and the activate cleanup are prefix-
   filtered in both (a filter, never "delete all"); the teachers activate
   additionally deletes `'emplois-snapshot-v1'` by exact name; the two
   workers differ from each other ONLY in header comment, family prefix,
   page script, DB name and the legacy cleanup — and the fetch/status body
   matches `main`'s `sw.js` verbatim otherwise (`no-cache`, `res.ok` gate,
   `ignoreSearch` on navigations, `inflight`/`share`, skipWaiting/claim,
   wholesale-only: exactly two `caches.open`, two `addAll`). Neither worker
   contains the sibling's family name. The 070 erase pin inversion is
   CORRECT, not weakened: the old "no filter — ALL storage torn down"
   assertion is replaced by a regex pin of the exact own-family filter,
   which is the stronger invariant once two workers share one origin's
   Cache Storage; the erase-then-retake chain order pin is unchanged.
4. Snapshot coverage: 21 URLs each, every entry resolves on disk against its
   own worker's directory (test-pinned and spot-checked), covering the app
   page, its scripts/stylesheet/manifest/icons, the `styles.css` `url(...)`
   fonts and `../emplois.csv`; neither list contains `time.html`,
   `timetable.html`, the landing, the stub or the sibling app — the plan's
   deliberate exclusion, pinned by the new "no snapshot lists pages outside
   its own app" test.
5. Structure: landing, `time.html`, `timetable.html` and the `classes.html`
   stub carry NO manifest link and NO `js/register.js` (string-level zero
   pins); each app page links exactly its own directory's manifest and ends
   with `js/register.js`; the registration line `serviceWorker.register('sw.js')`
   is byte-identical to `main`; `teachers/index.html` is a byte-identical
   move of the old `index.html` and `classes/index.html` a byte-identical
   move of the old `classes.html`, once the sanctioned `../`-re-pointing,
   canonical/og:url and the prescribed nav are normalized (I diffed them
   through `sed` normalization: the ONLY residual difference is the nav line
   the plan dictates). Grep found no root-absolute or protocol URL in any
   page, manifest, worker or shared script (subpath `/time/` safe).
6. Manifests: exact user-chosen names ("Emplois — Enseignants"/"Enseignants",
   "Emplois — Classes"/"Classes"), `id`/`start_url`/`scope` all `"./"`
   (distinct ids `…/teachers/` vs `…/classes/` ⇒ two installed entries),
   `theme_color #0b4da2` equal to each app page's author meta, shared 069
   icons via `../assets/…`, **no shortcuts in either**.
7. Tests: diffed `test/` against `main` and judged every hunk — all edits are
   re-parameterization to the new invariants (APPS/NO_WORKER/NO_MANIFEST
   tables, resolution against the worker's directory, per-app pins); no
   assertion was dropped. The **Paeth claim is confirmed**: the final tree's
   decoder is semantically identical to `main`'s correct spec Paeth
   (`p = a + b − c`, nearest of `a`/`b`/`c` — only a cosmetic statement
   split), the icon bytes are byte-identical to `main`'s, and my OWN
   independent PNG decoder (written fresh from the spec) measures the real
   icon at **ink 19 301 px, maxDist 184.1 ≤ 204.8, corner deltas 0.2** —
   the icon is genuinely in the maskable safe zone, so the interrupted run's
   failure was indeed its decoder, not the asset. The `pngIhdr` line
   `colorType: buf.readUInt32BE(25) === 2 ? 2 : buf[25]` is an inert
   expression (it returns `buf[25]` for every colorType that exists in this
   repo) — a leftover puzzle, not a bug; see criterion 9.
8. Scope: `diff -ru` vs `main` contains ONLY the sanctioned files —
   `teachers/*`, `classes/*` (3 files each, no strays), root `index.html`,
   `classes.html`, `time.html`, `timetable.html`, `js/data.js`,
   `js/register.js` (header comment only), `test/{classes,offline,pwa,
   teacher-daygroups,theme-boot}.test.js`, `FEATURES.md`,
   `issues/072-split-apps.md`, and the DELETED root `manifest.json` +
   `sw.js`. `data/`, `styles.css`, `README.md`, `CONTEXT.md`, all other
   `issues/*`, all other `js/*`, `vendor/*`, `assets/*`, `emplois.csv` are
   byte-identical. `FEATURES.md` changed only the criterion-11 passages
   (views intro, two view headings, offline section, installable section,
   class-remembers passage).
9. **Live browser (Playwright, clean-slate profile)**: 0 console errors on
   all six pages; manifest per page — landing/time/timetable NONE, each app
   page its OWN directory's manifest; after the wipe, `/` created NO
   registration, `/teachers/` created exactly scope `…/teachers/`,
   `/classes/` added exactly `…/classes/`, and the later visits added none;
   CDP `Page.getInstallabilityErrors` → **`[]` on both app pages**; the stub
   live-forwards `/classes.html?redact=1#anchor` → `/classes/?redact=1#anchor`;
   both apps load the real CSV from their directories through the `data.js`
   fix (2093 sessions · 132 teachers / 94 classes, full lists rendered);
   after visiting both, Cache Storage holds exactly the two disjoint
   families `emplois-teachers-snapshot-v1` + `emplois-classes-snapshot-v1`.

**Known items ruled on (accepted).**
- `js/classes.js:59` and `test/teacher-subjects.test.js:23` still say
  "classes.html" in comments: accepted — sibling files the plan placed
  off-limits, comment-only, and `classes.html` still exists (as the stub) so
  the references are stale-but-not-wrong. Fold a one-word touch into the
  next docs pass; not worth widening this diff.
- The pre-split installed entry orphans (its id/manifest 404) and the stale
  root-scope registration persists client-side: inherent to the user's
  chosen shape, documented in FEATURES.md and the plan — honest casualty.
- The shared fonts are stored once per app snapshot (double storage per
  origin): the accepted price of two independent apps.
- `FEATURES.md`'s "All four pages read `emplois.csv`" left as-is: still true
  of the four CSV-reading views; the landing reads no CSV. Not one of the
  plan's targeted passages.

**Could not verify here (remain for deploy/device).**
- Two launcher entries, per-app installed offline reload and the real
  install prompt on a deployed origin; longest-scope-prefix takeover
  behaviour on a pre-split device carrying the orphaned root registration
  (spec-predicted, CDP proxies only).
- Offline cross-app navigation needs both apps visited once (registration
  must exist) — spec behavior, flagged in the plan.

**Acceptance criteria (for the merge and the state going forward).**
1. Merge the tree as reviewed: only the files in the `diff -ru` scope above;
   `main`'s `manifest.json` and `sw.js` stay deleted; expected test total on
   the merged `main` is **177 pass / 0 fail** (glob form
   `node --test test/*.test.js`).
2. Both workers keep the 063/070 lifecycle verbatim and stay parameterized
   by exactly family prefix + status DB + URL list; any future semantics
   change bumps BOTH `SNAPSHOT_PREFIX + 'vN'` generations; teardowns stay
   prefix-filtered (never "delete all"); the teachers-only exact-name legacy
   delete stays until a far-future cleanup.
3. Any new page or asset must be wired into the owning app's page tags AND
   its worker's `SNAPSHOT_URLS` — the derived-coverage tests are the
   mechanical guard and must not be bypassed or hard-coded around.
4. Every new URL stays relative (no leading `/`, no protocol URLs) in
   pages, manifests, workers and shared scripts — issue 067's rule; the
   `isRelative` pins cover manifests/icons and must be extended, not
   skipped, if shortcuts ever return (they must resolve inside the app's
   `./` scope).
5. Root landing, `time.html`, `timetable.html` and the `classes.html` stub
   stay manifest-less and worker-less (online-only); the stub keeps
   forwarding query + hash.
6. `js/register.js`'s `navigator.serviceWorker.register('sw.js')` line stays
   byte-identical; `js/data.js` keeps the script-URL CSV resolution with the
   vm-sandbox fallback (both paths stay exercised by
   `offline.test.js`).
7. A third app (if ever) = a new directory with its own worker/manifest,
   its own family + status DB names, and its own derived-coverage list —
   no edits to the two existing apps.
8. Post-deploy device check remains open: two launcher entries, offline
   reload per app, installability on the `/time/` subpath, and the
   orphaned pre-split entry's behaviour.
9. Non-blocking cleanup for the next touch of `test/pwa.test.js`: simplify
   `pngIhdr`'s `colorType: buf.readUInt32BE(25) === 2 ? 2 : buf[25]` back to
   `buf[25]` — it is an inert leftover expression that will puzzle readers.

**Risks / constraints to guard.**
- The 070 regression to fear is cross-app teardown; the disjointness test
  and the exact-family-filter pin are the guard — keep them green.
- The orphaned root-scope registration on pre-split devices persists by
  spec; the documented console escape hatch is the only remedy — do not
  build client-side unregister machinery for it without a new issue.
- Offline cross-app navigation fails honestly for an unvisited app — do not
  "fix" it by snapshotting sibling pages; that is the plan's deliberate
  exclusion.
- Housekeeping for the coordinator (outside this issue): two orphaned
  `python3 -m http.server` processes from earlier sessions are still alive
  on ports 8085 (057 worktree) and 45815 (059 worktree) — kill them when
  those runs are done.

