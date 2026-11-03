# 068: Installable PWA — web app manifest + install prompt on Chrome Android

- Status: Fixed
- Date: 2026-10-21, Reporter: user

## Description

**Observed.** The user tested the deployed site
(`https://adem482p.github.io/time/`) and confirmed offline support (issue 063)
works. However, Chrome on Android offers no way to install the site as an app:
there is no web app manifest, so the "Install app" / "Add to Home screen"
entry never appears with an app name and icon, and the site cannot run in a
standalone window.

**Expected.** The site is installable on Chrome Android: a web app manifest
linked from every page, real app icons (including a maskable one), and
Chrome's install affordance appearing — while the existing offline behavior
(issue 063's network-first service worker) stays fully intact.

## Root cause

Feature that was never built: issue 063 explicitly scoped out the manifest
("no manifest/PWA scope creep — out of scope unless a later issue asks"), so
the repository ships a service worker but no install surface. This issue is
that follow-up.

## Repro steps

1. Serve locally: `cd <worktree> && python3 -m http.server 8168`
2. Open `http://127.0.0.1:8168/index.html` in Chrome on Android (or desktop
   Chrome) — **observed:** ⋮ menu has no "Install app" entry; no manifest is
   fetched.
3. Expected after this issue: every page links `manifest.json`, Chrome fetches
   and parses it, and the ⋮ menu shows "Install app" (plus the omnibox install
   affordance once engagement heuristics are met); installing yields a
   standalone window with the Emplois icon, and offline behavior is unchanged.

## Discussion

### Planner decision (2026-10-21)

*(Folded planner+implementer run on `fix/068-installable-pwa`; worktree based on
main @ 2e2ba9e. This entry records the design; the implementation entry below it
carries the diff and verification.)*

**Verdict — valid, in scope, adopted.** The repo already has the hard half of a
PWA (issue 063's network-first service worker); installability on Chrome
Android only needs the declarative half: a manifest, real icons, and page links.
The design below adds **zero new JavaScript** — the manifest is declarative
data, which is the version of this feature that removes the need for special
cases instead of accumulating them.

**Decided design (each choice justified):**

1. **`manifest.json` at the site root — not `manifest.webmanifest`.** Chrome
   rejects a manifest whose MIME type is not JSON-ish. This repo has no server
   config (no build step, no backend): GitHub Pages and `python3 -m http.server`
   reliably serve `*.json` as `application/json` (measured: the dev server sends
   `Content-type: application/json`), while `.webmanifest` can fall through to
   `application/octet-stream` on minimal static hosts. The filename *is* the
   fix. Pinned by test 6.
2. **Fields:**
   - `name` "Emplois — ISIM Mahdia Timetable" / `short_name` "Emplois" /
     `description` = the index page's own meta description (one copy of the
     site's canonical self-description).
   - `start_url: "./"`, `scope: "./"` — relative, so they work at the repo root
     and under the production subpath `/time/` (issue 067's lesson: no leading
     `/` anywhere). `"./"` also lands on the bare-origin URL that is already
     precached, so the cold offline start of the installed app is a cache hit.
   - `display: "standalone"` — the point of the issue: the app gets its own
     window. No `display_override`: nothing here needs windowed/tablet
     special-casing.
   - `orientation: "any"` — nothing in the four pages constrains orientation;
     locking it (e.g. portrait) would be a special case imposed on the matrix
     page, which benefits from width.
   - `theme_color: "#0b4da2"` — the authored `<meta name="theme-color">` default
     on index/classes and the seed of the default "ISIM Blue" preset. It is the
     chrome color before JS runs; `js/theme.js` continues to overwrite the meta
     at runtime with the applied surface (unchanged behavior; issue 066 owns
     the theme-timing story and is not touched). Pinned equal to the author meta
     by test 1.
   - `background_color: "#ffffff"` — the light surface the pages actually paint
     before `theme.js` applies (`styles.css` bakes white fallbacks; issue 066
     documents this). The splash color should match the real cold-start paint,
     not an aspirational one.
   - `categories: ["education"]`, `lang: "en"` — honest, cheap.
   - **No `id`** — it would default to `start_url` anyway; an explicit value
     that equals the default is a maintained nothing.
   - **`shortcuts`** to `classes.html`, `time.html`, `timetable.html` — a
     timetable app's core workflows are "jump to my class / to now / to the
     matrix"; on Android these surface in the launcher long-press menu. Six
     lines of JSON, no icons (OS uses the app icon), and their targets are
     pinned to real files by test 4. If the maintainer wants an even leaner
     manifest, these three entries are the safe first cut.
3. **Icons — new source art, generated PNGs, committed (no build step).** The
   existing `assets/preview.svg` is a 1200×630 social card, unusable as an app
   icon. New `assets/icon.svg` follows the repo's established
   source-art-then-generate convention (`preview.svg` → `preview.png`): the
   ISIM Blue gradient (same `#0b4da2 → #052455` stops as the preview art) with
   a geometric white "E" for Emplois and the wordmark's `#7fb2ff` accent bar
   underneath. `assets/icon-maskable.svg` is the same mark scaled 0.75 about
   the canvas centre: the glyph's farthest point sits ≈145 px from centre, well
   inside the maskable safe zone (inner 80 % circle, radius 204.8 px on a 512
   canvas). PNGs generated once with `rsvg-convert` and committed:
   `icon-192.png` (any), `icon-512.png` (any), `icon-maskable-512.png`
   (maskable, opaque RGB — no alpha, verified via PIL and pinned at the IHDR
   byte level by test 3), `apple-touch-icon.png` (180×180, opaque; iOS applies
   its own corner mask, so none is baked in).
4. **Favicon: the `data:,` placeholder is replaced on all four pages.** The
   empty data URI existed only because *no icon file existed* (issue 055
   documented exactly that). Its reason is now gone; keeping it would preserve
   a placeholder for a condition that no longer holds. The favicon points at
   the already-precached 192 px icon (the simple mark downscales cleanly — no
   extra 32 px file to maintain).
5. **No `beforeinstallprompt` capture, no in-page install button.** With this
   manifest + the existing service worker, Chrome's own affordances appear:
   the ⋮ menu "Install app" entry and the omnibox install icon. A custom button
   would add: a new JS module, duplicated button markup on four pages, pressed/
   dismissed state to persist, and permanent special cases for browsers that
   never fire the event (iOS Safari). That is the accumulation this project's
   convention rejects, for zero capability gain — the native UI is localized by
   the browser and costs nothing to maintain. Verified below: Chrome's own
   verdict via CDP `Page.getInstallabilityErrors` returns **zero errors**.
6. **Where the logic lives: nowhere new.** No `js/install.js`, no changes to
   `js/register.js`. The only per-page change is three inert `<link>` tags —
   markup, which this repo's duplicated-per-page convention explicitly accepts;
   logic would have travelled as a shared `<script>` (063's precedent) but
   there is none to travel.
7. **Precache + generation bump (063 invariants held).** The five new URLs
   (`manifest.json` + four icons) join `PRECACHE` (21 → 26) so the offline
   install is self-consistent: the favicon and manifest answer offline, and the
   closed-write-set rule keeps them refreshable online. Per `sw.js`'s own header
   rule, `CACHE` is bumped `emplois-v1` → `emplois-v2`, so every existing
   install atomically rebuilds the new snapshot and destroys the old
   generation on activate. Handler semantics are untouched.
8. **One pin in `test/offline.test.js` is de-hardcoded** (allowed-file list
   amendment, recorded here): the 063 suite pinned the literal
   `CACHE = 'emplois-v1'`, which would turn *any* legitimate generation bump
   red — the very maintenance action the sw.js header prescribes. It now pins
   the invariant (`/CACHE = 'emplois-v\d+'/`, "a versioned cache name exists")
   with a comment. No other existing assertion changed.
9. **iOS scope kept cheap:** `apple-touch-icon` link only. The apple standalone
   meta tags (`apple-mobile-web-app-capable` etc.) change Safari UX in ways
   this issue neither requires nor can verify here; the site works correctly in
   Safari tabs without them.
10. **`time.html`/`timetable.html` do NOT get an author
    `<meta name="theme-color">`.** Adding one would change `js/theme.js`'s
    `detectSystemSeed()` behavior on those pages (the meta is read as the
    "System" preset seed), i.e. it would reach into issues 059/066 territory.
    The manifest's `theme_color` covers the standalone window chrome on every
    page without that side effect.

**Sibling boundaries respected:** `js/theme.js`, `styles.css`,
`test/theme-boot.test.js` (issue 066), `test/*` files owned by 054, issue 067's
files, `data/`, `README.md`, `Design.md` — untouched.

### Fix implemented (2026-10-21)

Implementer run on `fix/068-installable-pwa`. Files changed: 6 modified, 9 new
(4 binary PNGs + 5 text). No git operations performed — diff generated with
plain `diff -u` against the clean base worktree.

**Verification (this run).**

- *Node suite:* baseline **154 pass / 0 fail** (this worktree, pre-change) →
  **160 pass / 0 fail** after the change (`node --test test/*.test.js`; the
  glob form, per repo note). 6 new `test()` blocks in `test/pwa.test.js`:
  1. manifest ships with the installability fields (real `JSON.parse`, hex
     format checks, `theme_color` ↔ author meta agreement);
  2. every page links manifest + icons exactly once and no page keeps `data:,`;
  3. icons are real PNGs — IHDR bytes parsed, declared sizes match actual
     dimensions, ≥192 any, ≥512 any, ≥512 maskable with **color type 2 (opaque
     RGB, no alpha)**, apple-touch-icon exactly 180×180;
  4. manifest/scope/icon/shortcut URLs all relative (subpath-safe), shortcut
     targets exist on disk and are one of the four pages;
  5. `PRECACHE` covers the manifest and every icon referenced by the manifest
     or the pages (derived), entries exist on disk, and `'emplois-v1'` no
     longer appears in `sw.js` (the bump happened with the list change);
  6. manifest and icon filenames keep `.json`/`.png` extensions (MIME trap).
- *HTTP (dev server `python3 -m http.server 8168`, PID-file in
  `/tmp/opencode/068-server*.pid`, killed by PID, port confirmed dead → 000):*
  `curl` → **200** for `manifest.json`, `assets/icon-192.png`,
  `assets/icon-512.png`, `assets/icon-maskable-512.png`,
  `assets/apple-touch-icon.png`, all four pages, `sw.js`, `js/register.js`,
  `styles.css`; `manifest.json` served as **`application/json`**.
- *PIL (real decode, not metadata copy):* all four PNGs open as RGB at the
  declared sizes; corner pixels are the gradient's exact endpoint colors
  (`#0b4da2` top, `#052455` bottom) — full-bleed opaque, safe for masking.
- *Playwright walk (MCP Chromium, server up):*
  1. **Manifest fetched and parsed by the browser** on `index.html`:
     request `manifest.json` → 200 (`application/json`), all fields read back
     through `fetch` + `JSON.parse` in-page (name, `./` start_url/scope,
     standalone, the three icons with purposes, three shortcuts).
  2. **Installability:** CDP `Page.getInstallabilityErrors` → **`[]`** (zero
     errors — Chrome considers the page installable; this is Chrome's own
     verdict, the strongest signal obtainable without a device).
  3. **Offline invariant (063) intact under the new generation:**
     `caches.keys()` → `['emplois-v2']` with exactly **26 entries** (the old
     21 + manifest + 4 icons). With `context.setOffline(true)`:
     `index.html` reload → `2093 sessions · 132 teachers`, 132 list items;
     `timetable.html` reload → `132 teachers × 6 time slots.`; in-page
     `fetch('manifest.json')` → 200 from cache (parsed, `short_name` "Emplois");
     `fetch('assets/icon-512.png')` → 200, 3041 B from cache. Back online: all
     four pages render their full baselines with the manifest/icon links.
  4. **Console:** 0 errors, 0 warnings on every page, online and offline.
- *Merge-compatibility simulation (no git; file overlay on a copy of the
  current main tree, which by then contained issue 066):* current main passes
  **161** tests; main + this fix (HTML resolution: keep 066's meta+inline
  script, swap the favicon line for the three links) passes **167 / 0 fail**.
  Expect **167** as the post-merge total (161 main + 6 new).

**Exact diff (6 modified files):**

```diff
--- a/index.html
+++ b/index.html
@@
-<link rel="icon" href="data:,">
+<link rel="manifest" href="manifest.json">
+<link rel="icon" href="assets/icon-192.png" sizes="192x192" type="image/png">
+<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
--- a/classes.html
+++ b/classes.html
@@
-<link rel="icon" href="data:,">
+<link rel="manifest" href="manifest.json">
+<link rel="icon" href="assets/icon-192.png" sizes="192x192" type="image/png">
+<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
--- a/time.html
+++ b/time.html
@@
-<link rel="icon" href="data:,">
+<link rel="manifest" href="manifest.json">
+<link rel="icon" href="assets/icon-192.png" sizes="192x192" type="image/png">
+<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
--- a/timetable.html
+++ b/timetable.html
@@
-<link rel="icon" href="data:,">
+<link rel="manifest" href="manifest.json">
+<link rel="icon" href="assets/icon-192.png" sizes="192x192" type="image/png">
+<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
--- a/sw.js
+++ b/sw.js
@@
-var CACHE = 'emplois-v1';           // bump the suffix whenever PRECACHE or the
+var CACHE = 'emplois-v2';           // bump the suffix whenever PRECACHE or the
@@
 var PRECACHE = [
   './',
   'index.html', 'classes.html', 'time.html', 'timetable.html',
   'styles.css',
+  'manifest.json',
+  'assets/icon-192.png', 'assets/icon-512.png',
+  'assets/icon-maskable-512.png', 'assets/apple-touch-icon.png',
   'js/register.js',
@@
-// navigation's rebuild and concurrent tabs await the SAME run, so the 21 URLs
+// navigation's rebuild and concurrent tabs await the SAME run, so the 26 URLs
--- a/test/offline.test.js
+++ b/test/offline.test.js
@@ -44,9 +44,15 @@
   ["self.addEventListener('install'", "self.addEventListener('activate'",
    "self.addEventListener('fetch'", 'skipWaiting', 'clients.claim',
-   'addAll', "CACHE = 'emplois-v1'"].forEach(function (tok) {
+   'addAll'].forEach(function (tok) {
     assert.ok(src.indexOf(tok) !== -1, 'sw.js must contain ' + tok);
   });
+  // Pin the invariant, not the generation number: the sw.js header prescribes
+  // bumping the suffix whenever PRECACHE or the handler semantics change, so
+  // hard-coding a generation here would turn every legitimate bump red
+  // (issue 068 bumped emplois-v1 -> emplois-v2 alongside the PRECACHE change).
+  assert.ok(/CACHE = 'emplois-v\d+'/.test(src),
+    'sw.js must declare a versioned cache name');
 });
```

**New files (9):**

- `manifest.json` (1,049 B) — verbatim:

```json
{
  "name": "Emplois — ISIM Mahdia Timetable",
  "short_name": "Emplois",
  "description": "Browse the 2026–2027 timetable of ISIM Mahdia (LBC, LCE, LCS, MPExpRes sections): search a teacher, class or subject and see every session.",
  "lang": "en",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "any",
  "theme_color": "#0b4da2",
  "background_color": "#ffffff",
  "categories": ["education"],
  "icons": [
    { "src": "assets/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "assets/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "assets/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "Classes — class week grid", "short_name": "Classes", "url": "classes.html" },
    { "name": "Time — who teaches when", "short_name": "Time", "url": "time.html" },
    { "name": "Timetable matrix", "short_name": "Timetable", "url": "timetable.html" }
  ]
}
```

- `assets/icon.svg` (1,083 B) — source art, verbatim:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <!-- App icon source (issue 068): generate the committed PNGs with
       rsvg-convert -w <s> -h <s> assets/icon.svg -o assets/icon-<s>.png
       (also the source for assets/apple-touch-icon.png at 180).
       Full-bleed ISIM Blue gradient (same stops as assets/preview.svg) with a
       geometric white "E" for Emplois and the wordmark's light-blue accent
       bar underneath. Purpose "any": the OS masks it; no baked rounding. -->
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b4da2"/>
      <stop offset="1" stop-color="#052455"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g fill="#ffffff">
    <rect x="156" y="84" width="44" height="284"/>
    <rect x="156" y="84" width="200" height="44"/>
    <rect x="156" y="204" width="160" height="44"/>
    <rect x="156" y="324" width="200" height="44"/>
  </g>
  <rect x="156" y="406" width="140" height="22" rx="11" fill="#7fb2ff"/>
</svg>
```

- `assets/icon-maskable.svg` (1,148 B) — same mark inside
  `transform="translate(256 256) scale(0.75) translate(-256 -256)"` over the
  full-bleed gradient (safe-zone rationale in the planner entry above).
- `assets/icon-192.png` (1,406 B), `assets/icon-512.png` (3,041 B),
  `assets/icon-maskable-512.png` (2,806 B), `assets/apple-touch-icon.png`
  (1,431 B) — binary, generated by `rsvg-convert` from the two SVGs, PIL-
  verified (RGB, opaque, exact sizes).
- `test/pwa.test.js` (9,982 B) — the 6 test blocks named in the verification
  list above; full source in the worktree.
- `issues/068-installable-pwa.md` — this file.

**Status stays `Open` until the main agent merges** (per AGENTS.md, the
`Open → Fixed` flip happens at merge time).

**Risks / notes for the maintainer review:**

1. **Base skew with current main (most important).** This worktree was cut from
   main @ 2e2ba9e (154 tests) as instructed, but main has since advanced: the
   `clean` worktree now contains issue 066's merged fix (161 tests). The
   rebase will hit **textual conflicts in all four HTML heads** (066 inserted
   `<meta name="color-scheme">` + an inline replay script immediately adjacent
   to the `data:,` line this fix replaces). Resolution is mechanical and was
   **simulated without git: keep both** — 066's meta + script and this fix's
   three link tags — and the merged tree passes **167 / 0 fail**. `sw.js`,
   `test/offline.test.js` and all other files diverge only in the ways shown in
   the diff (066 touched none of them). Post-merge expected total: **167**.
2. **`test/offline.test.js` pin edit** — the only existing assertion changed,
   deliberately (de-hardcoded generation number, invariant preserved). If the
   maintainer objects, the fallback is reverting to the exact
   `CACHE = 'emplois-v2'` token, at the cost of re-breaking on every future
   bump.
3. **Favicon reuses the 192 px icon** rather than shipping a dedicated 32 px
   favicon; the mark is simple enough to downscale, and the file is already
   precached. Crisper tab icons are a one-file follow-up if desired.
4. **Manifest `theme_color` is static (#0b4da2) while the runtime meta follows
   the applied theme** (066/059 behavior, untouched). The standalone window
   chrome may briefly disagree with a non-blue theme; fixing that would mean
   rewriting the manifest at runtime — a special case this design rejects.
5. **iOS is best-effort** (icon link only, no standalone meta) — by decision 9
   above, revisit only if iOS usage motivates it.
6. **Nothing here touches siblings:** `js/theme.js`, `styles.css`,
   `test/theme-boot.test.js` (066), 054/067 surfaces, `data/`, `README.md`,
   `Design.md` — all untouched; no git commands were run.

### Maintainer decision (2026-10-21)

**Verdict — Approve.** The design is the right shape for this codebase and the
implementation matches it, verified independently (nothing below was taken on
the implementer's word). The core architectural call — **declarative data only,
zero new JavaScript** — is exactly this project's convention applied honestly:
055's favicon ruling was explicitly written as "a real icon later only swaps
the href", 063 scoped the manifest out as "unless a later issue asks", and this
issue is that ask. The manifest, icons and three `<link>` tags are inert data
that travels in the duplicated-per-page markup the repo already accepts;
capturing `beforeinstallprompt` to build a custom install button would have
added a new JS module, button markup on four pages, persisted pressed/dismissed
state, and a permanent iOS-Safari no-op branch — maintained special cases for
zero capability gain, since Chrome's own install UI (⋮ menu, omnibox icon)
delivers the feature for free. I confirmed that UI is not hypothetical:
CDP `Page.getInstallabilityErrors` from this run returns **`[]`**.

**Design points ruled on (each checked against the repo, not the entry):**

1. **`manifest.json` (not `.webmanifest`) — right.** Measured on the dev
   server: `Content-type: application/json`. There is no server config in this
   repo to lean on, so the filename must be the guarantee; `*.json` is served
   correctly by both GitHub Pages and `python3 -m http.server`, and test 6 pins
   the extension so the trap cannot come back. (067's live probe of
   `/time/manifest.webmanifest` 404'd only because the file never existed —
   GH Pages' `.webmanifest` MIME was never measured; `.json` sidesteps the
   unknown entirely.)
2. **Relative `start_url`/`scope`/icon/shortcut URLs — right, and verified in
   the browser:** under the dev origin they resolve to
   `http://127.0.0.1:PORT/` and `/assets/…`; the same relative resolution lands
   under `https://adem482p.github.io/time/`, the 067 constraint. Test 4 pins
   "no root-absolute, no protocol URLs" as a first-class assertion.
3. **Icons — verified with PIL (real decode):** `icon-192.png` 192×192,
   `icon-512.png` 512×512, `icon-maskable-512.png` 512×512,
   `apple-touch-icon.png` 180×180, all mode **RGB (opaque, no alpha)**, all four
   corners exactly the gradient endpoints `#0b4da2`/`#052455` — full-bleed,
   safe for OS masking. Maskable safe-zone claim checked numerically: the
   farthest glyph pixel sits **149 px** from centre vs the 204.8 px inner-80%
   circle, i.e. comfortable margin after `scale(0.75)`. The source art
   (`assets/icon.svg`, `assets/icon-maskable.svg`, regenerating command in the
   SVG comment) follows the repo's `preview.svg` → `preview.png`
   source-art-then-generate convention, committed PNGs included (no build step).
4. **`theme_color: #0b4da2` — sane.** Equal to the authored
   `<meta name="theme-color">` on index/classes (pinned by test 1), the seed of
   the default ISIM Blue preset; `js/theme.js` keeps overwriting the meta at
   runtime exactly as before — 066's timing story untouched. Correctly **no**
   author meta was added to `time.html`/`timetable.html`: I confirmed
   `detectSystemSeed()` reads any non-`data-theme-engine` author meta as the
   "System" preset seed, so adding one would have silently changed 059/066
   behavior on those two pages. Manifest `theme_color` covers the standalone
   chrome instead — the right layer.
5. **`background_color: #ffffff` — acceptable, one nuance recorded.** The
   brief's premise that `styles.css` has no `prefers-color-scheme` block is
   **stale**: issue 066 (merged after this branch was cut) added a dark-scheme
   block at `styles.css:21`. So a dark-scheme user's cold start paints dark
   while the manifest splash is white — a brief splash/paint mismatch. This is
   not worth a change request: the manifest cannot be made conditional without
   runtime rewriting (a special case this design rightly rejects), the light
   surface *is* the unconditional default every `var()` fallback bakes, and the
   cost is a splash-only flash. Recorded as a known, accepted limitation.
6. **Favicon `data:,` → `assets/icon-192.png` — right, and the documented
   intent of 055.** The empty URI existed only because no icon file existed;
   its reason is gone. File exists (curl 200), it is already precached, and no
   `/favicon.ico` regression is possible (the `rel="icon"` link still
   suppresses the probe).
7. **Three shortcuts — keep.** Six lines of declarative JSON for a timetable
   app's three real destinations, no icons to maintain (OS reuses the app
   icon), targets pinned to the four pages and to disk by test 4 — so a page
   rename turns red instead of shipping a dead launcher entry. Declarative data
   this cheap is not "scope creep"; creep would be the JS this design avoids.
8. **The `test/offline.test.js` edit is legitimate — blessed, not a weakened
   test.** The removed token pinned the literal `CACHE = 'emplois-v1'`, which
   directly fights `sw.js`'s own header rule ("bump the suffix whenever
   PRECACHE or the handler semantics change"): the prescribed maintenance action
   would turn the suite red. The old pin never enforced "bump on change" for
   future edits either (it enforced today's string), so no future-behavior
   coverage is lost. The replacement pins the invariant (`/CACHE =
   'emplois-v\d+'/`) and is paired with a *stronger* check in `test/pwa.test.js`
   5 (`'emplois-v1'` must be gone from `sw.js`), so this change's bump is
   actually enforced — the original pin alone never was. This approves the
   allowed-file-list amendment recorded in the planner entry.
9. **Service-worker invariants — held.** `diff -ru` shows `sw.js` touched only
   in three places: `v1`→`v2`, `PRECACHE` +5 URLs (21 → 26), comment 21→26.
   The fetch handler, `putCanonical`, install/activate are byte-identical to
   main. Browser-side: `caches.keys()` → `['emplois-v2']` **only** (old
   generation destroyed), the cache holds exactly **26 entries** incl.
   `manifest.json` + all 4 icons; offline reloads render `2093 sessions · 132
   teachers` (132 items) on index and `132 teachers × 6 time slots.` on the
   matrix, and `fetch('/manifest.json')` answers 200 (`short_name: "Emplois"`)
   from cache — the installed app's cold offline start is a hit, as designed.
10. **The `### Fix implemented` entry is honest.** I compared its diff against
    a fresh `diff -ru` of the two trees: all six modified-file hunks match
    exactly; the new-file list (9) matches; the verbatim `manifest.json` and
    `assets/icon.svg` quotes match the files on disk.

**Verification performed by this run (all in the 068 worktree):**

- `node --test test/*.test.js` → **167 pass / 0 fail** (main baseline measured
  at **161 / 0** in the `clean` worktree → +6 = the new `test/pwa.test.js`
  blocks, exactly as expected). The `node --test test/` glob-broken note stands.
- Served `python3 -m http.server 8268` (PID recorded, killed by PID after):
  curl **200** for `manifest.json` (**`Content-type: application/json`**), all
  four PNGs, all four pages, `sw.js`, `js/register.js`, `styles.css`.
- PIL: sizes/modes/corner colors and maskable safe-zone distance, above.
- Playwright (MCP Chromium, all four pages): manifest link present exactly once
  → fetched 200 `application/json` → parsed in-page (name, `./`
  start_url/scope resolving to the origin root, three icons resolving to
  `/assets/…`); favicon is the real icon, `data:,` absent; **0 console errors,
  0 warnings** per page; SW registered; offline + cache checks as in point 9;
  back-online reload renders the full baseline. CDP installability → `[]`.
- Scope discipline: `diff -ru` between `clean` (main @ b6b6cd0) and this
  worktree lists exactly **4 modified HTML files + `sw.js` +
  `test/offline.test.js`** and the new `manifest.json`, 6 `assets/*` files,
  `test/pwa.test.js`, `issues/068-installable-pwa.md`. `js/theme.js`,
  `styles.css`, `test/theme-boot.test.js`, `data/`, `README.md`, `Design.md`
  and every `issues/*.md` except 068 are **byte-identical** between the trees
  (066 `Status: Fixed`, 054/067 `Status: Open`, untouched). The four heads keep
  066's meta + inline replay script alongside this fix's three links — the
  keep-both rebase resolution is correct and tested green.

**Could not verify:** real-device Android install UX (no device here — the CDP
installability verdict is the strongest available signal); GitHub Pages behavior
after an actual deploy under `/time/` (reasoned from 067 + relative-URL tests,
same evidence base the merged 067 fix shipped on); Chrome's engagement
heuristics for the omnibox prompt (out of our control by definition).

**Acceptance criteria for the merge (coordinator/implementer — all are
already met by this tree; they are the conditions under which it lands):**

1. Merge with the keep-both head resolution already present in this worktree:
   066's `<meta name="color-scheme">` + inline replay script **and** the three
   new links (`manifest`, `icon`, `apple-touch-icon`) in each of the four
   heads; no `data:,` may survive anywhere.
2. Post-merge test total must be **167 pass / 0 fail** via
   `node --test test/*.test.js` (161 main + 6 new); zero edits to any other
   existing test beyond the blessed `test/offline.test.js` pin de-hardcoding.
3. `sw.js` must keep exactly the three sanctioned changes (`emplois-v2`,
   `PRECACHE` = the 26 URLs incl. `manifest.json` + 4 icons, comment 21→26);
   the fetch handler and install/activate logic byte-identical to main.
4. Sibling boundary stays closed at merge: `js/theme.js`, `styles.css`,
   `test/theme-boot.test.js` (066), 054/067 files, `data/`, `README.md`,
   `Design.md`, all `issues/*.md` except 068 — zero diffs.
5. The full `diff -ru` against post-merge main must contain only: 4 HTML files,
   `sw.js`, `test/offline.test.js`, `manifest.json`, `assets/icon.svg`,
   `assets/icon-maskable.svg`, `assets/icon-192.png`, `assets/icon-512.png`,
   `assets/icon-maskable-512.png`, `assets/apple-touch-icon.png`,
   `test/pwa.test.js`, `issues/068-installable-pwa.md`.
6. Flip `Status: Open` → `Fixed` in this file at merge, per AGENTS.md.
7. No follow-up JS may ride along: no `beforeinstallprompt` capture, no
   install button, no runtime manifest rewriting (theme/splash divergence in
   risks 4/5 above stays accepted-as-is unless a future issue files it).

**Risks / constraints (regressions to guard, invariants to preserve):**

- **Offline (063) is the crown jewel:** network-first semantics unchanged;
  `CACHE` must remain the sole cache key (`['emplois-v2']`), the old `v1`
  generation must never reappear, and the cache must hold 26 entries with the
  install surface inside. Any future `PRECACHE` change must bump the suffix —
  the sw.js header rule, now enforced by the invariant pin instead of a literal.
- **Subpath deploy:** no root-absolute or protocol URL may enter the manifest,
  the icon links or any new file — `https://adem482p.github.io/time/` breaks
  silently otherwise (067's lesson). Test 4/6 are the tripwires; do not delete
  them to make a future change pass.
- **Test-count discipline:** 167 is the number; a different total at rebase
  time means an unexpected file crept in or an assertion was lost — stop and
  diff.
- **MIME trap:** the manifest must stay `manifest.json` (never `.webmanifest`)
  and icons stay `.png` — pinned by test 6 for a reason this repo cannot fix
  server-side.
- **Theme/manifest divergence accepted:** static `theme_color` #0b4da2 vs
  runtime meta following the applied theme, and white splash for
  dark-scheme users — both are recorded limitations, not defects; "fixing"
  either means runtime manifest/meta special cases and is explicitly out of
  scope (criterion 7).
- **iOS stays best-effort** (apple-touch-icon link only); revisit only on
  actual iOS usage (decision 9 stands).
