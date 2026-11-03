# 073: Unlist the utility pages (root redirect, move time/timetable into directories)

- Status: Fixed
- Date: 2026-10-21, Reporter: user

## Description

The user gave four requirements, verbatim:

> - index.html should redirect to the teachers page, it shouldn't do anything else. if possible, it shouldn't even have a body.
> - time.html and timetable.html shouldn't be referenced anywhere, they are internal pages that should be unlisted. they are only accessible by those who know the url path, not by navigation.
> - move time.html to at/index.html
> - move timetable.html to all/index.html

The user has additionally decided (treated as fixed criteria):

- **No redirect stubs** for the old paths: `time.html` and `timetable.html` at the
  root are **deleted outright**; the old URLs 404. Only `at/index.html` and
  `all/index.html` exist afterwards.
- These two pages stay exactly as they are today in character: **no manifest, no
  service worker, no `js/register.js`** (online-only, unlisted) — do not add any.

Observed today: the root `index.html` is a full landing page (og/twitter cards,
theme-color, stylesheet, favicon links, the 066 theme-replay snippet, a nav with
four links, an author credit); `time.html` and `timetable.html` sit at the root
and are linked from the root nav, the `classes/` nav, and are named in the two
service-worker header comments, the test pin lists and `FEATURES.md`.

Expected: root `index.html` does nothing but redirect to `teachers/`; the two
utility pages live at `at/index.html` and `all/index.html` (old files gone); no
reference to `time.html` / `timetable.html` remains anywhere outside `issues/`.

## Root cause

Not a defect in the bug sense — a structural request. The site's real apps are
`teachers/` and `classes/`; the root landing page was only ever a chooser between
them plus the two utility views, and the utility views are internal tools that
should be reachable only by URL. The fix is a move plus a reference sweep:

1. Root `index.html` becomes a head-only meta-refresh + `location.replace`
   redirect to `teachers/` (no `<body>` — valid HTML5, browsers synthesise an
   empty one). Everything that does work (og/twitter cards, description,
   theme-color, stylesheet, favicon links, the 066 theme-replay snippet, nav,
   author credit, `data-page`) is dropped: a page that redirects in 0 ms paints
   nothing to theme and shows nothing to share. **SEO consequence:** the root
   now carries `<link rel="canonical" href="…/time/teachers/">`, so the root URL
   canonicalises to `/teachers/`.
2. `time.html` → `at/index.html`, `timetable.html` → `all/index.html` (files
   moved, not copied), with their relative URLs repointed one level up
   (`styles.css` → `../styles.css`, `js/*.js` → `../js/*.js`, icons →
   `../assets/…`). The 066 replay snippet, `data-page`, body markup and script
   stack stay byte-preserved apart from that URL re-pointing. No manifest, no
   service worker, no `js/register.js` (verified absent on these pages already
   from 072 — kept that way).
3. Every reference outside `issues/` is rewritten or removed: the two navs, the
   two service-worker header comments (comment-only), the test pin lists, the
   `js/app.js` header comment, and the `FEATURES.md` passages.

## Repro steps

```sh
cd <worktree>
grep -rn -E 'time\.html|timetable\.html' --exclude-dir=issues --exclude-dir=.git .
# → matches in index.html, classes/index.html, teachers/sw.js, classes/sw.js,
#   js/app.js, FEATURES.md, test/{classes,offline,pwa,theme-boot}.test.js
node --test test/*.test.js          # baseline 177 pass / 0 fail on main
python3 -m http.server <free port>
```

- `curl -sI http://localhost:<port>/` → 200, body is the redirect document.
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:<port>/time.html` → **404** after the fix (200 before).
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:<port>/timetable.html` → **404** after the fix (200 before).
- Open `/` in a browser → lands on `/teachers/`; `/at/` and `/all/` render, no
  service worker registered.

## Discussion

### Fix implemented (2026-10-21)

All four requirements implemented, plus the fixed criteria (no redirect stubs —
the old URLs 404; the moved pages stay manifest-less/worker-less/register-less).

**Exact diff** (against `main` @ ecce8fe; every hunk shown; `-` lines are gone,
`+` lines are new):

```diff
--- a/index.html
+++ b/index.html
@@ -1,57 +1,14 @@
 <!DOCTYPE html>
 <html lang="en">
 <head>
 <meta charset="utf-8">
-<meta name="viewport" content="width=device-width, initial-scale=1">
-<meta name="color-scheme" content="light dark">
 <title>Emplois — ISIM Mahdia Timetable</title>
-<meta name="description" content="Emplois — the 2026–2027 timetable of ISIM Mahdia (LBC, LCE, LCS and MPExpRes sections): open the Teachers or the Classes app, or the Time and Timetable-matrix views.">
-<meta name="theme-color" content="#0b4da2">
-
-<meta property="og:type" content="website">
-<meta property="og:site_name" content="Emplois">
-<meta property="og:locale" content="en_US">
-<meta property="og:url" content="https://adem482p.github.io/time/">
-<meta property="og:title" content="Emplois — ISIM Mahdia Timetable 2026–2027">
-<meta property="og:description" content="Browse the 2026–2027 timetable of ISIM Mahdia (LBC, LCE, LCS, MPExpRes): search a teacher, class or subject and see every session.">
-<meta property="og:image" content="https://adem482p.github.io/time/assets/preview.png">
-<meta property="og:image:type" content="image/png">
-<meta property="og:image:width" content="1200">
-<meta property="og:image:height" content="630">
-<meta property="og:image:alt" content="Emplois — the ISIM Mahdia timetable, searchable by teacher, class or subject.">
-
-<meta name="twitter:card" content="summary_large_image">
-<meta name="twitter:title" content="Emplois — ISIM Mahdia Timetable 2026–2027">
-<meta name="twitter:description" content="Search a teacher, class or subject and see every session of the 2026–2027 timetable.">
-<meta name="twitter:image" content="https://adem482p.github.io/time/assets/preview.png">
-<meta name="twitter:image:alt" content="Emplois — the ISIM Mahdia timetable, searchable by teacher, class or subject.">
-
-<link rel="canonical" href="https://adem482p.github.io/time/">
-<link rel="icon" href="assets/icon-192.png" sizes="192x192" type="image/png">
-<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
+<link rel="canonical" href="https://adem482p.github.io/time/teachers/">
+<meta http-equiv="refresh" content="0; url=teachers/">
 <script>
-/* Issue 066: replay the stored theme before first paint … */
-(function () { … theme replay … })();
+/* Issue 073: the root does nothing but hand over to the teachers app. The meta
+   refresh above covers no-JS; this covers everyone else and forwards the
+   ?redact=1 query and any hash (README captures rely on it). */
+location.replace('teachers/' + location.search + location.hash);
 </script>
-<link rel="stylesheet" href="styles.css">
 </head>
-<body data-page="home">
-<h1>Emplois — ISIM Mahdia Timetable</h1>
-<nav><a href="teachers/">Teachers</a><a href="classes/">Classes</a><a href="time.html">Time</a><a href="timetable.html">Timetable matrix</a></nav>
-<p class="author-credit"><span>By </span><a href="https://github.com/adem482p" target="_blank" rel="noopener">Adem Moussa</a></p>
-</body>
 </html>
@@ final index.html (14 lines):
 <!DOCTYPE html>
 <html lang="en">
 <head>
 <meta charset="utf-8">
 <title>Emplois — ISIM Mahdia Timetable</title>
 <link rel="canonical" href="https://adem482p.github.io/time/teachers/">
 <meta http-equiv="refresh" content="0; url=teachers/">
 <script>
 /* Issue 073: the root does nothing but hand over to the teachers app. The meta
    refresh above covers no-JS; this covers everyone else and forwards the
    ?redact=1 query and any hash (README captures rely on it). */
 location.replace('teachers/' + location.search + location.hash);
 </script>
 </head>
 </html>
```

```diff
--- a/time.html   (deleted; moved)
+++ b/at/index.html   (new; only URL re-pointing differs from the old file)
@@ time.html:8,9 / at/index.html:8,9 @@
-<link rel="icon" href="assets/icon-192.png" sizes="192x192" type="image/png">
-<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
+<link rel="icon" href="../assets/icon-192.png" sizes="192x192" type="image/png">
+<link rel="apple-touch-icon" href="../assets/apple-touch-icon.png">
@@ stylesheet @@
-<link rel="stylesheet" href="styles.css">
+<link rel="stylesheet" href="../styles.css">
@@ scripts (7 tags) @@
-<script src="js/data.js"></script>   …through…  <script src="js/app.js"></script>
+<script src="../js/data.js"></script> …through… <script src="../js/app.js"></script>
   (each src gains the ../ prefix; nothing else in the file changed — the 066
    replay snippet, data-page="time", body markup and titles are byte-preserved)

--- a/timetable.html   (deleted; moved)
+++ b/all/index.html   (new; same four URL classes repointed, ../-prefixed;
+                       data-page="matrix" and everything else byte-preserved)
```

```diff
--- a/classes/index.html
+++ b/classes/index.html
@@ -54 +5 @@
-<nav><a href="../teachers/">Teachers</a><a href="../timetable.html">Timetable matrix</a><a href="../time.html">Time</a><a href="index.html"><strong>Classes</strong></a></nav>
+<nav><a href="../teachers/">Teachers</a><a href="index.html"><strong>Classes</strong></a></nav>

--- a/teachers/sw.js   (COMMENT ONLY — no logic, URL list, family or DB touched)
+++ b/teachers/sw.js
@@ -22,3 +22,4 @@
-// snapshot carries them; navigations to time.html, timetable.html and the
-// site root match no registration and are online-only by design (issue 072).
+// snapshot carries them; navigations to the at/ and all/ utility pages and
+// the site root match no registration and are online-only by design (issues
+// 072, 073).

--- a/classes/sw.js   (identical comment-only hunk as teachers/sw.js)

--- a/js/app.js   (COMMENT ONLY — the single sanctioned line)
+++ b/js/app.js
@@ -5 +5 @@
-// keeps only what time.html and timetable.html load. All coloring decisions
+// keeps only what at/index.html and all/index.html load. All coloring decisions

--- a/FEATURES.md
+++ b/FEATURES.md
@@ -33,7 +33,8 @@
 Four views over the same CSV, in the split of issue 072: the teachers app lives
 at `teachers/index.html` and the classes app at `classes/index.html` (each its
 own installable app with its own worker and manifest), the two utility views
-stay at the root (`time.html`, `timetable.html`), and a plain landing page at
-the root links them all. Only the classes app carries the cross-page nav bar
-(Teachers / Timetable matrix / Time / Classes).
+live unlisted at `at/index.html` and `all/index.html` — reachable only by
+their URL, never by navigation (issue 073) — and the root landing page does
+nothing but redirect to `teachers/`. Only the classes app carries the cross-page
+nav bar (Teachers / Classes).
-### Matrix — `timetable.html`
+### Matrix — `all/index.html`
-### Time — `time.html`
+### Time — `at/index.html`
@@ -180,3 +180,3 @@
-- **The utility pages and the landing are online-only** (issue 072): navigations
-  to `/`, `time.html`, `timetable.html` and the `classes.html` redirect stub
+- **The utility pages and the landing are online-only** (issues 072, 073): navigations
+  to `/`, `at/`, `all/` and the `classes.html` redirect stub
   match no registration, so no worker ever intercepts them.

--- a/test/offline.test.js
+++ b/test/offline.test.js
@@ -41,3 +41,4 @@
-// Pages with NO manifest and NO service worker by design (issue 072): the root
-// landing, the two online-only utility views and the redirect stub.
-var NO_WORKER = ['index.html', 'time.html', 'timetable.html', 'classes.html'];
+// Pages with NO manifest and NO service worker by design (issues 072, 073):
+// the root landing (a pure redirect), the two online-only utility views at
+// their unlisted paths and the redirect stub.
+var NO_WORKER = ['index.html', 'at/index.html', 'all/index.html', 'classes.html'];
@@ -367 +368 @@
-    var forbidden = ['time.html', 'timetable.html', 'classes.html', 'index.html'];
+    var forbidden = ['at/index.html', 'all/index.html', 'classes.html', 'index.html'];

--- a/test/pwa.test.js
+++ b/test/pwa.test.js
@@ -36 +36 @@
-var NO_MANIFEST = ['index.html', 'time.html', 'timetable.html', 'classes.html'];
+var NO_MANIFEST = ['index.html', 'at/index.html', 'all/index.html', 'classes.html'];
@@ -199,4 +199,5 @@
-    // Issue 072: every former shortcut target (classes.html, time.html,
-    // timetable.html) lies outside this app's './' scope, and out-of-scope
-    // shortcut URLs are not dependable — each app is single-page. If shortcuts
-    // ever return, they must resolve INSIDE the app directory.
+    // Issue 072: every former shortcut target (classes.html, and the utility
+    // views — now at/index.html + all/index.html, formerly the root time and
+    // timetable pages, issue 073) lies outside this app's './' scope, and
+    // out-of-scope shortcut URLs are not dependable — each app is single-page.
+    // If shortcuts ever return, they must resolve INSIDE the app directory.
@@ after the classes.html stub test (NEW test) @@
+test('index.html is a head-only redirect to the teachers app page (issue 073)', function () {
+  var html = readSrc('index.html');
+  // The root does nothing but hand over to the teachers app (issue 073):
+  // a head-only document — browsers synthesise the empty <body> — so nothing
+  // ever paints and there is no data-page, nav, stylesheet or theme replay.
+  assert.strictEqual(html.indexOf('<body'), -1, 'the landing has no <body> — it paints nothing');
+  // no-JS path
+  assert.ok(html.indexOf('content="0; url=teachers/"') !== -1,
+    'the meta refresh must target teachers/');
+  // JS path preserves deep links (README captures use ?redact=1) and anchors
+  assert.ok(html.indexOf("location.replace('teachers/' + location.search + location.hash)") !== -1,
+    'the script redirect must forward the query string and the hash');
+  // SEO: the root URL hands its meaning to the page it redirects to
+  assert.ok(html.indexOf('<link rel="canonical" href="https://adem482p.github.io/time/teachers/">') !== -1,
+    'the landing must point its canonical at the teachers app page');
+  // and it must carry no app surface of its own
+  assert.deepStrictEqual(linkHrefs(html, 'manifest'), [], 'the landing links no manifest');
+  assert.strictEqual(html.split('register.js').length - 1, 0,
+    'the landing registers no service worker');
+  ['rel="stylesheet"', '<nav', '/* Issue 066:', 'data-page', 'name="theme-color"'].forEach(function (tok) {
+    assert.strictEqual(html.indexOf(tok), -1, 'the landing must not carry ' + tok);
+  });
+});

--- a/test/theme-boot.test.js
+++ b/test/theme-boot.test.js
@@ header comment, PAGES, two test titles @@
-//   1. an inline <head> replay snippet — byte-identical on all five pages
-//      (the landing and the four views), immediately before the stylesheet
+//   1. an inline <head> replay snippet — byte-identical on all four pages
+//      that paint (the two app pages and the two utility views), immediately
+//      before the stylesheet
-// Issue 072: five pages carry the snippet — the root landing, the two app
-// pages (whose stylesheet link is ../-relative) and the two utility views.
+// Issues 072 + 073: four pages carry the snippet — the two app pages and the
+// two utility views (moved to at/ and all/, stylesheet link ../-relative).
+// The root landing is a head-only redirect that paints nothing (issue 073).
 var PAGES = [
-  { page: 'index.html', sheet: '<link rel="stylesheet" href="styles.css">' },
   { page: 'teachers/index.html', sheet: '<link rel="stylesheet" href="../styles.css">' },
   { page: 'classes/index.html', sheet: '<link rel="stylesheet" href="../styles.css">' },
-  { page: 'time.html', sheet: '<link rel="stylesheet" href="styles.css">' },
-  { page: 'timetable.html', sheet: '<link rel="stylesheet" href="styles.css">' }
+  { page: 'at/index.html', sheet: '<link rel="stylesheet" href="../styles.css">' },
+  { page: 'all/index.html', sheet: '<link rel="stylesheet" href="../styles.css">' }
 ];
-'…byte-identical on all five pages, immediately before the stylesheet link'
+'…byte-identical on all four pages, immediately before the stylesheet link'
-'meta color-scheme "light dark" … on all five pages'
+'meta color-scheme "light dark" … on all four pages'

--- a/test/classes.test.js
+++ b/test/classes.test.js
@@ -452,14 +452,19 @@
-test('every page with a nav links to the Classes page, and the classes nav pins the four links', function () {
-  // the root landing links the app entry (issue 072); the classes app's own
-  // nav addresses itself via index.html and its siblings via their old URLs
-  assert.ok(readPage('index.html').indexOf('href="classes/"') !== -1,
-    'the landing page has no Classes link');
-  var html = readPage('classes/index.html');
-  ['href="../teachers/"', 'href="../timetable.html"', 'href="../time.html"',
-   'href="index.html"'].forEach(function (a) {
-    assert.ok(html.indexOf(a) !== -1, 'classes/index.html nav missing ' + a);
-  });
-});
+test('the classes nav pins the two links, and no page references the unlisted utility views (issue 073)', function () {
+  // the root landing is now a pure redirect to the teachers app (issue 073);
+  // the classes app's own nav addresses itself via index.html and its sibling
+  // app via its directory — the utility views are unlisted, reachable only by
+  // their URL (at/, all/), so their links left the nav.
+  var html = readPage('classes/index.html');
+  ['href="../teachers/"', 'href="index.html"'].forEach(function (a) {
+    assert.ok(html.indexOf(a) !== -1, 'classes/index.html nav missing ' + a);
+  });
+  var nav = /<nav>[\s\S]*?<\/nav>/.exec(html);
+  assert.ok(nav, 'classes/index.html keeps its nav');
+  assert.strictEqual((nav[0].match(/<a /g) || []).length, 2,
+    'the classes nav pins exactly two links (Teachers + Classes)');
+  [/time\.html/, /timetable\.html/].forEach(function (old) {
+    assert.strictEqual(old.test(html), false,
+      'classes/index.html must not reference the unlisted old URL ' + old + ' (issue 073)');
+  });
+});
```

Deleted: `time.html`, `timetable.html` (no stubs left behind — the old URLs 404).
Added: `at/index.html`, `all/index.html` (moves with URL re-pointing only),
`issues/073-unlist-utility-pages.md`.

**Design decisions & justifications**

- Root head contents: only charset, `<title>` (kept the original
  "Emplois — ISIM Mahdia Timetable" for the sub-second flash), the canonical
  to `…/time/teachers/`, the 0 ms meta refresh (no-JS path) and the
  `location.replace` script (forwards `?redact=1` + hash, README captures
  depend on it). Kept nothing beyond the specified list except a short issue-073
  comment in the script — house style carries one explanatory comment on every
  redirect (`classes.html` stub, issue 072).
- No `<body>`: valid HTML5 (head-only document; UAs synthesise an empty body).
  Dropped viewport/color-scheme metas too — a redirect paints nothing.
- **SEO consequence (accepted):** the root's canonical moved from
  `https://adem482p.github.io/time/` to `…/time/teachers/` — the root URL now
  canonicalises to the teachers app page. Unlike the `classes.html` stub, no
  `noindex` was added: the canonical is the specified hand-off mechanism.
- Moved pages carry no canonical/og:url (they never did — nothing to repoint).
- Test pins updated to the NEW invariants, never weakened: old-path entries in
  `NO_WORKER`/`NO_MANIFEST`/`forbidden` became the new paths (so the moved
  pages are still pinned worker-less/manifest-less); theme-boot's `PAGES`
  dropped the landing (it carries no snippet anymore — the redirect test in
  pwa.test.js pins its emptiness instead) and moved the utility views to
  `at/`+`all/` with `../styles.css`; the classes nav pin became an exact
  two-`<a>` count plus inverted old-URL regexes; one NEW test pins the
  redirect landing (head-only, no body, refresh target, query/hash forwarding,
  canonical, no manifest/register/stylesheet/nav/replay).
- The inverted pins are written as regex literals (`/time\.html/`) so the
  repo-wide grep proof for the old names is a literal zero outside `issues/`.

**Verification results**

1. `node --test test/*.test.js` → **178 pass / 0 fail** (baseline 177 + the new
   redirect pin). Per-file: classes 65, deadcode 3, fusion 16, libgroups 19,
   offline 11, pwa 11, redact 10, teacher-daygroups 25, teacher-subjects 5,
   theme-boot 7, time-live 6 (= 178).
2. Zero-match grep proof (outside `issues/` and `.git`):
   `grep -rn -E 'time\.html|timetable\.html' --exclude-dir=issues --exclude-dir=.git .`
   → exit 1, **zero matches**.
3. HTTP (`python3 -m http.server`, PID recorded and killed afterwards):
   `/` → 200 (body = the 558-byte head-only redirect document, no `<body>`
   element in it); `/teachers/`, `/classes/`, `/at/`, `/at/index.html`,
   `/all/`, `/all/index.html`, `/classes.html`, `/styles.css`, `/emplois.csv`
   → **200 (10/10)**; `/time.html`, `/timetable.html` → **404 (2/2)**.
4. Node assertions: root has no `<body>` and none of
   nav/manifest/register/replay/stylesheet/og/twitter/theme-color/author-credit;
   `at/index.html` + `all/index.html` carry no `rel="manifest"`, no `register.js`,
   no serviceWorker reference; every same-origin href/src resolves on disk and
   every shared path (`styles.css`, `js/*`, `assets/*`) is `../`-prefixed;
   both workers' `SNAPSHOT_URLS` (21 entries each, lists unchanged) all resolve
   on disk; classes nav holds exactly two `<a>` links.
5. Playwright: `http://…/` → lands on `/teachers/` ("Teachers — Emplois");
   `/?redact=1` → `/teachers/?redact=1` (query forwarded); `/at/` renders
   ("2093 sessions · 132 teachers", 43 list rows) and `/all/` renders
   ("132 teachers × 6 time slots", full matrix) — **0 console errors each**,
   and after clearing prior registrations `navigator.serviceWorker.getRegistrations()`
   → **0** on both. Browser closed, servers killed, no orphans of this issue.

Not touched (per scope): `data/`, `styles.css`, `vendor/*`, `assets/*`,
`emplois.csv`, `js/theme.js`, `js/color.js`, `js/teachers.js`, `js/classes.js`
(its stale `classes.html` comment stays — issue 072's), `js/model.js`,
`js/match.js`, `js/libgroups.js`, `js/data.js` (its CSV resolution was verified
directory-agnostic and left unchanged), `js/register.js`, both manifests,
`classes.html`, `README.md`, `CONTEXT.md` (both verified reference-free),
worker logic/URL lists/cache families/DB names, and every other `issues/*` file.

