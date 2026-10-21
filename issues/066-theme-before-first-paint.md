# 066: Apply the stored theme before first paint

- Status: Fixed
Date: 2026-10-21 · Reporter/Maintainer: folded subagent (planning only — no code changed)

## Description

**Observed.** With a stored preset, and/or with the OS scheme set to dark, the page
first paints with the *unthemed fallback* colors — light surface `#fff`, ink
`#1b1b1b`, ISIM-Blue accents, UA `color-scheme: normal` (`styles.css` bakes a hex
fallback into every `var(--md-*)` use; there is **no `prefers-color-scheme`
block anywhere in `styles.css`** — light/dark exists only because `js/theme.js`
computes dark tone tables and writes inline `color-scheme`) — and only later
jumps to the stored theme. Measured in Chromium (Playwright MCP, this session):

- Flash is timing-dependent, not guaranteed. On warm localhost (all resources
  instant, remote Google-Fonts `@import` reachable) `apply()` consistently beat
  first-contentful-paint by **19–40 ms** across 24 measured combinations
  (`index/timetable` × `stored-Ember/stored-Monochrome/first-visit` ×
  `light/dark`; e.g. index stored-Ember light: FCP 748.0 ms, style write
  714.5 ms). The remote font `@import` (~380 ms) delays first paint past
  script execution, masking the race on fast links.
- The flash appears whenever the last body script's fetch/eval lands after
  first paint — the normal case for a first visit on a real network (cold
  cache, ~190 KB of 8 synchronous `<body>` scripts, slow mobile CPU).
  Controlled reproduction (fonts CDN blocked; last page script stalled
  800 ms; Ember stored) — **flash window = FCP → theme apply, on every page,
  both schemes**:

  | page            | scheme | FCP (ms) | apply (ms) | flash (ms) |
  |-----------------|--------|---------:|-----------:|-----------:|
  | index.html      | light  | 136.0    | 846.8      | **710.8**  |
  | index.html      | dark   | 120.0    | 850.6      | **730.6**  |
  | classes.html    | light  | 156.0    | 854.0      | **698.0**  |
  | classes.html    | dark   | 160.0    | 843.4      | **683.4**  |
  | time.html       | light  | 108.0    | 845.3      | **737.3**  |
  | time.html       | dark   | 80.0     | 845.9      | **765.9**  |
  | timetable.html  | light  | 128.0    | 847.4      | **719.4**  |
  | timetable.html  | dark   | 112.0    | 847.8      | **735.8**  |

  With the last script stalled 2500 ms (index, dark, Ember) the window grew to
  **2.13 s** (FCP 420 ms → apply 2550 ms). Screenshot of the frozen flash frame
  (`/tmp/opencode/066-stall-1200ms.png`, index, dark scheme, Ember stored):
  white surface, black heading, static default gradient on the `#themeCycle`
  square — i.e. the light default look on a dark-scheme Ember user.

- What differs at first paint vs after apply (read via `getComputedStyle` at
  the style-attribute Mutation vs final): all ~41 written properties — the 37
  `--md-*` roles, 3 `--pal-*` swatch colors, and `color-scheme`
  (`normal` → `light`/`dark`). E.g. index dark/Ember: `--md-primary`
  `` (unset) → `#FFB4A9`, body background `rgb(255,255,255)` → `rgb(26,17,16)`.
- **First visit, light scheme:** fallback look ≈ default ISIM Blue light, so no
  *wrong-theme* flash by definition (a subtle `#fff` → `#F9F9FF` surface settle
  still occurs at apply). **First visit, dark scheme:** the light→dark flash
  occurs with the same ~0.7 s window — the scheme dimension flashes even with
  empty storage, because the CSS fallbacks are light-only.

**Expected.** The stored preset *and* the system scheme are effective at first
paint on every page; no intermediate wrong-color frame is ever presented. A
first-visit dark-scheme user also sees a dark first frame (scheme correct at
worst; preset is the default by definition).

## Root cause

Theme application is scheduled at `DOMContentLoaded` — `js/theme.js:980-987`
(`autoInit` defers `init()` while `readyState === 'loading'`, which it always is
because the script tags sit at the end of `<body>`) — i.e. *after* the
render-blocking stylesheet has produced a first paint with the static hex
fallbacks, whenever any of the 8 synchronous body scripts is still fetching at
that moment (Chromium paints during a parser block on a pending sync script;
reproduced above). Nothing pre-`<head>`-end knows the theme: the full state
lives in `localStorage['emplois-theme']` (`{"preset":"<name>"}` today, written
by `writeState` at `theme.js:898`), the 15 presets are resolved through ~46 KB
of HCT math, and the scheme is decided in JS (`systemDark()` via `matchMedia`)
rather than being expressible in CSS the browser can resolve before paint.

## Repro steps

1. `python3 -m http.server 8123` in the repo root (kill by PID when done).
2. Install a stored preset: open `http://localhost:8123/index.html`, click
   `#themeCycle` until the label (aria-label) shows a non-default preset, e.g.
   `Ember`. Verify `localStorage['emplois-theme']` = `{"preset":"Ember"}`.
3. Playwright observation method (this is also the future no-flash proof):
   - `context = browser.newContext({colorScheme: 'dark'})`;
   - `page.addInitScript`: install a `PerformanceObserver` (`paint`,
     `buffered:true`) recording `first-contentful-paint.startTime`, and a
     `MutationObserver` on `document` (`subtree:true, attributes:true,
     attributeFilter:['style']`) recording `performance.now()` of the first
     `<html>` style-attribute write (= `apply()`), each snapshotting
     `getComputedStyle(document.documentElement).getPropertyValue('--md-primary')`
     and `document.body`'s background;
   - reproduce the stall: `page.route('**/js/<last-page-script>', r =>
     new Promise(res => setTimeout(res, 800)).then(() => r.continue()))` and
     abort the fonts CDNs (`fonts.googleapis.com|fonts.gstatic.com|cdn.jsdelivr.net`)
     so the stylesheet chain cannot mask the race;
   - reload: FCP ≈ 80–160 ms shows the light fallback frame; the theme write
     arrives ≈ 840–855 ms ⇒ the numbers in the table above. Freezing the frame:
     same route with `r.abort()` for all `**/*.js` and `page.screenshot()`.
4. First-visit dark: fresh context, no storage, same recipe → same light flash.

## Discussion

### Maintainer decision (2026-10-21)

Verdict: **valid, in scope, fix before first paint** — but the plan is not the
obvious "move the script to the head". The engine cannot be recomputed
pre-paint without shipping ~46 KB of HCT math render-blocking in every page;
therefore the theme's *applied outputs* must be persisted and **replayed**, and
the scheme dimension must additionally get a CSS-native fallback so even a
first visit paints the right scheme. Implementation-ready plan below.

#### Chosen approach — output-replay inline script (design space A, hardened) + CSS dark fallback

1. **Persist the applied output, both schemes.** `theme.js` gains one pure
   helper `varsFor(opts)` (single writer): it turns a theme role map into the
   exact property map `apply()` writes — 37 `--md-<kebab-role>` + `--pal-primary`
   + `--pal-secondary` + `--pal-tertiary` + `color-scheme` (41 keys). On every
   `applyState()` (which already runs for scheme changes and clicks), persist:

   ```json
   {"preset":"Ember",
    "vars":{"light":{"--md-primary":"#904A41", "...": "...", "color-scheme":"light"},
            "dark": {"--md-primary":"#FFB4A9", "...": "...", "color-scheme":"dark"}}}
   ```

   The opposite-scheme map comes from one extra `createTheme({...opts, dark: !dark})`
   call at apply time (off the critical path, ms-scale; HCT caches per palette).
   Storage key stays `emplois-theme`; `preset` keeps its current meaning
   (`readState`/cycleIndex restore untouched). Blob size ~2.6 KB.

2. **Byte-identical inline replay in `<head>` of all four pages**, placed
   immediately *before* `<link rel="stylesheet" href="styles.css">` (a line
   that exists byte-identically in all four pages):

   ```html
   <script>
   /* Issue 066: replay the stored theme before first paint — js/theme.js persists
      the applied --md- and --pal- custom properties per scheme; write them
      verbatim so the first frame is already themed. Idempotent: theme.js writes
      the same values again. (Never write a literal star-slash inside this
      comment — it would terminate it early.) */
   (function () {
     try {
       var s = JSON.parse(localStorage.getItem('emplois-theme') || 'null');
       if (!s || !s.vars) return;             /* first visit / old shape: CSS defaults */
       var d = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
       var v = s.vars[d ? 'dark' : 'light'];
       if (!v) return;
       var st = document.documentElement.style;
       for (var k in v) if (v.hasOwnProperty(k)) st.setProperty(k, v[k]);
     } catch (e) { /* corrupt/unavailable storage: default theme */ }
   })();
   </script>
   ```

   ~0.9 KB with comments (934 bytes as written above), ES5 (matches repo style), zero network requests, executes before
   the stylesheet fetch starts — the classic pre-paint snippet, browser-agnostic.

3. **Scheme flash for the no-storage population**: add `<meta name="color-scheme"
   content="light dark">` right after the viewport meta (byte-identical line
   already present in all four pages), and one **additive** block at the top of
   `styles.css`:

   ```css
   @media (prefers-color-scheme: dark) {
     :root { --md-surface: /* ISIM Blue dark, tone 6 N */; --md-on-surface: …; /* the 22 roles styles.css consumes */ }
   }
   ```

   covering exactly the 22 `--md-*` roles `styles.css` uses (all currently have
   inline hex fallbacks; the `:root` values win when the media query matches, so
   **no existing rule is touched**). Values = `createTheme` output for the
   default ISIM Blue preset with `dark: true`, pasted once, pinned by test (see
   below) so they cannot drift from the engine. This fixes the first-visit dark
   flash and gives no-JS dark users a sane default. The `<html style>` written
   by the inline replay overrides the media-query block where a stored theme
   exists (inline style beats stylesheet), so the two layers compose cleanly.

#### Ownership, handoff, idempotence

- Inline script owns exactly one thing: `documentElement` custom properties +
  `color-scheme` before first paint. It never sets flags, never touches
  `TT.theme`, never persists.
- `theme.js` keeps owning compute, persistence, `#themeCycle`, `data-tip`
  (059), `syncMeta`, and the scheme `change` listener. Its `apply()` writes the
  *same* property names with the *same* values as the replay → double-apply is
  a visual no-op; no coordination flag is needed. If storage changed in another
  tab between paint and `DOMContentLoaded`, `applyState()` overwrites in the
  same frame budget — identical to today's cross-tab behaviour.
- Migration: existing `{"preset":"Ember"}` (no `vars`) → inline script no-ops →
  CSS dark/light defaults show → first `applyState()` rewrites storage in the
  new shape; from the second load on, zero flash. No read-side breakage:
  `readState` only reads `p.preset` (tolerant of extra fields today).

#### Rejected alternatives (with reasons)

- **(B) Sync head `<script src="js/theme-boot.js">`** (or a split theme.js
  apply-half): adds a *render-blocking network request* before first paint — a
  cold-cache FCP regression, exactly when the flash matters most — plus a second
  parse/eval; and to avoid shipping the 46 KB HCT engine pre-paint it still
  needs the output-replay data. Inline costs 0 requests.
- **(C) Static inline critical `<style>` per preset**: no build step; 15
  presets × 2 schemes = 30 hand-maintained blocks → guaranteed drift. A
  runtime-written `<style>` is just variant A with more moving parts.
- **Recompute at inline (name→opts map + full engine inline)**: 46 KB inline,
  render-blocking, duplicated map drifts from `PRESETS`.
- **Store preset *name* only and resolve inline**: same recompute problem.
  Storing outputs makes drift structurally impossible: what was applied is what
  replays, including the dynamic "System" preset and any future contrast/
  variant option.
- **`content-visibility`/hidden-until-JS**: harms FCP and accessibility for a
  problem that a 375-byte replay solves.
- **CSS-only (dark fallback block alone)**: fixes the scheme dimension for the
  default palette only; the stored-preset dimension — the binding ask — stays.

#### Test plan (all `node --test`, no browser in CI)

Pins (node, new file `test/theme-boot.test.js`, following the existing
`readPage` HTML-string-pin pattern):

1. Inline block present, **byte-identical across all four pages**, positioned
   before the stylesheet link; `<meta name="color-scheme" content="light dark">`
   present in all four.
2. Inline replay logic executed in a `vm` sandbox with stub
   `documentElement.style`/`localStorage`/`matchMedia`: dark picked when
   `matchMedia(...).matches` is true and light when false; old storage shape
   and corrupt JSON and *throwing* `localStorage` → zero writes, no throw.
3. `theme.js` persistence contract: after `applyState`-equivalent apply for
   preset `Ember` (and `Monochrome` for the variant path), storage contains
   `vars.light` and `vars.dark`, each with all 37 `--md-*` + 3 `--pal-*` +
   `color-scheme`, values equal to `createTheme` outputs for the matching
   scheme (`color-scheme` = `light`/`dark` accordingly).
4. `readState` backward compatibility: `{"preset":"Ember"}` (old shape) still
   resolves the preset; the new shape resolves it too.
5. CSS dark-fallback drift pin: every `--md-*` role in the new
   `prefers-color-scheme: dark` block equals
   `createTheme({primary:'#0b4da2', secondary:'#4b5f7d', tertiary:'#7c5260', dark:true})`.

Playwright no-flash proof (manual/optional-CI, documented in the issue — the
repo's test runner is browserless): the Repro recipe above, asserted instead of
observed: for every page × {Ember, first-visit} × {light, dark}: (a) at the
first `<html>` style write / at FCP, computed `--md-primary` equals the stored
preset's value (or the CSS fallback for first visit) **and** `color-scheme`
equals the system scheme; (b) under the 800 ms last-script stall + blocked
fonts, FCP still shows the correct scheme and preset — i.e. `apply` time ≤ FCP
for stored themes, and no frame ever shows fallback-for-dark. Regression
checks: `?redact=1` boot parse unchanged (`redact.test.js`), 059 tooltip pins
still green, `title` no-JS fallback still in markup.

#### Risks / constraints

- **Drift inline ↔ engine**: eliminated for the replay (output-replay, single
  writer `varsFor`) and mechanically pinned for the CSS dark block (test 5).
- **Storage unavailable** (private mode, `file://`): both sides already
  try/catch; behaviour degrades to today's default theme.
- **Old-shape storage**: one last transitional (today's) load, then upgraded.
- **Sync inline cost**: ~0.9 KB inline (934 bytes as written), sub-millisecond eval, before the stylesheet
  request — negligible; the four copies are pinned byte-identical.
- **CSP**: none is served today (GitHub Pages); if one is ever added, the
  inline script needs `'unsafe-inline'` or its hash — note for the future.
- **Cross-tab**: ≤1 frame of stale replay, overwritten at `DOMContentLoaded`;
  unchanged from today.
- **First-visit *light***: `#fff` → `#F9F9FF` surface settle remains (imperceptible;
  a matching light `:root` block is a possible follow-up, out of scope here).
- **Safari/Firefox paint timing not measured** (Chromium only here); the fix is
  the browser-canonical pre-paint mechanism and does not depend on any engine's
  paint scheduling.

#### Expected test total

Baseline **re-verified this run**: `node --test "test/*.test.js"` →
**149 pass / 0 fail / 0 skipped** (note: `node --test test/` does *not* glob on
this Node 22 and must not be used as the count command). Ruling on the delta:
the plan adds **7** node tests → expected merged total **156 / 156 / 0**. The
implementer must re-run the baseline before starting, report the post-fix total,
and justify any deviation from 156 rather than silently landing on another
number. The Playwright proof stays outside the node total.

`Status: Open` — the user asked for a plan; implementation starts only after
approval of this decision.

### Fix implemented (2026-10-21)

Implementer run on `fix/066-theme-early` (worktree at the pre-063 main tip,
149 tests). **Discovery:** the previous implementer run was cancelled mid-flight
and left a partial, uncommitted artifact set — `js/theme.js` modified, the four
HTML heads modified (meta + inline replay), `styles.css` with an appended dark
block, **no `test/theme-boot.test.js`, no verification, no entry**. This run
audited every inherited artifact against the numbered criteria, **fixed one**
(the CSS block position, see below), **wrote the missing test file and all
verification**, and records it here.

**Inherited (audited, kept as written):** the `js/theme.js` changes (pure
`varsFor` single writer, `apply()` driven by it, `applyState()` persisting
`state.vars = {light, dark}`, `schemeVars` helper, `readState` untouched) and
the four HTML heads (`<meta name="color-scheme" content="light dark">` after the
viewport meta; the replay `<script>` byte-identical across all four pages —
same md5 — immediately before the single stylesheet link, and byte-identical to
the decision's snippet as extracted from this file; 902 bytes incl. tags; the
decision's "934 bytes" was its own off-by-32 count of the same bytes).
**Written (this run):** `test/theme-boot.test.js` (the plan's 7 tests), the
relocation of the CSS block, the Playwright proof, and this entry.

**Audit finding — the one inherited artifact fixed.** The dead run had appended
the `@media (prefers-color-scheme: dark)` block at the **end** of `styles.css`.
That breaks the existing pin in `redact.test.js` ("the block is appended at the
end of styles.css" — `css.slice(close + 1).trim() === ''` after `.redact {`):
measured **148 pass / 1 fail**. The binding decision text for this issue says
the block goes "**at the top of `styles.css`**" — and that placement is the only
one consistent with the plan's own "no pinned fact should change" ruling (an
end-append makes 156 impossible without editing the redact pin, which the plan
forbade). Per "the criteria win", the block was **moved to the top**, after the
`@import` line (CSS requires `@import` to precede every other at-rule; placing
the `@media` block before it would silently disable the Google-Fonts import).
Position is functionally irrelevant to the cascade here — `styles.css` defines
no `:root` custom properties elsewhere, every `--md-*` use is a `var()`
fallback — and the `.redact` pin is untouched: **149 restored**. Everything else
in the dead run's output matched the criteria as written.

#### Checklist (decision's numbered test-plan pins / key rulings)

1. **Inline replay byte-identical ×4, before the stylesheet link; `meta
   color-scheme` ×4 — met** (inherited, audited + pinned by test 1/2). One
   stylesheet link per page; the snippet sits immediately before it on all four;
   all four snippets share one md5 and equal the decision's snippet byte-for-byte;
   the meta sits on the line right after the viewport meta on all four.
2. **Replay logic — met** (inherited, pinned by tests 3/4 in a `vm` sandbox):
   dark map picked when `matchMedia('(prefers-color-scheme: dark)').matches`,
   light when false, light when `matchMedia` is absent; first visit / old shape
   / corrupt JSON / missing live map / throwing `localStorage` → zero writes,
   no throw.
3. **Persistence contract — met** (inherited, pinned by test 5 via a real
   `init()` on a stub DOM): after apply for `Ember` and `Monochrome` (variant
   path), storage holds `vars.light` and `vars.dark`, each exactly 41 keys (37
   `--md-*` + 3 `--pal-*` + `color-scheme`), the `--md-*` values strictly equal
   to `createTheme` output for the matching scheme, and the applied scheme's map
   equal key-for-key to what `apply()` wrote on `<html>` (replay = apply →
   double-apply is a visual no-op). 059's `aria-label`/`data-tip` writes are
   asserted still inside `applyState`.
4. **`readState` backward compatibility — met** (inherited + pinned by test 6):
   old shape `{"preset":"Ember"}` still resolves the preset and is upgraded to
   the 41+41 maps on the first apply; the new shape resolves it too and
   re-persists complete maps.
5. **CSS dark-fallback drift pin — met** (block written by the dead run,
   verified + pinned by test 7): exactly ONE `@media (prefers-color-scheme:
   dark)` block, defining exactly the 22 `--md-*` roles `styles.css` consumes
   (set equality, all of them `var()` fallbacks — no existing rule touched, no
   other `--md-*` definition anywhere), every value equal to
   `createTheme({primary:'#0b4da2', secondary:'#4b5f7d', tertiary:'#7c5260',
   dark:true})` (0 mismatches), positioned at the top after the `@import`.
   `meta color-scheme: light dark` ×4 pairs with it.
6. **Preserved surfaces — met** (audited + walked): `?redact=1` boot parse
   unchanged (`TT.data.redacted() === true` in Chromium, redact suite green);
   the static no-JS `title` fallback still in markup and still retired at init
   (`title: null` after load, `data-tip`/`aria-label` intact); preset cycling
   works (3 clicks ISIM Blue → Ember observed, storage follows); body ends
   untouched — sibling 063's `<script src="js/register.js">` line merges
   independently.

#### Verification (this run)

- *Totals:* baseline re-verified **149 pass / 0 fail / 0 cancelled / 0 skipped**
  (this branch's base, the pre-063 main tip). After the fix, **both**
  `node --test` and `node --test "test/*.test.js"` → **156 / 156 / 0** (exactly
  +7 from `test/theme-boot.test.js`; zero existing tests edited — the final
  tree's 9 pre-existing test files are byte-identical to base). Note for the
  merge: main moved during this run (063 merged → its tree now totals 154);
  the post-merge expectation for this branch is **161 / 161 / 0**.
- *No-flash proof* (Chromium 153 via Playwright, controlled stall per the
  repro: fonts CDNs aborted, last body script stalled 800 ms, FCP via buffered
  `PerformanceObserver`, first `<html>` style write via `MutationObserver`
  `attributeFilter:['style']`; servers `python3 -m http.server` on 8123 (this
  worktree) and 8124 (the pristine pre-063 tree for BEFORE), **killed by
  recorded PID**). **BEFORE** (clean tree, Ember stored old-shape) — flash
  window = FCP → apply, on every page and both schemes:

  | page | scheme | FCP (ms) | apply (ms) | flash (ms) |
  |---|---|---:|---:|---:|
  | index.html | light | 304.0 | 887.9 | **583.9** |
  | index.html | dark | 336.0 | 909.2 | **573.2** |
  | classes.html | light | 308.0 | 917.9 | **609.9** |
  | classes.html | dark | 308.0 | 901.6 | **593.6** |
  | time.html | light | 204.0 | 907.6 | **703.6** |
  | time.html | dark | 176.0 | 908.0 | **732.0** |
  | timetable.html | light | 276.0 | 899.0 | **623.0** |
  | timetable.html | dark | 268.0 | 919.5 | **651.5** |

  Frozen BEFORE frame (all `*.js` aborted, dark scheme, Ember stored): `--md-primary`
  unset, 0 inline props, body background `rgb(255,255,255)`, `color-scheme:
  normal` on all 8 combos — the light default on a dark-scheme Ember user
  (`/tmp/opencode/066-BEFORE-frozen-dark-ember.png`).

  **AFTER** (this worktree, real installed Ember storage — captured by cycling
  `#themeCycle` on a fresh context, which itself verified the fresh-visitor
  install: `{"preset":"ISIM Blue","vars":{light:41,dark:41}}`, then upgrade on
  click): the first `<html>` style write (the inline replay) lands **before**
  FCP on all 8 combos, and at that instant all **41 props and `color-scheme`
  equal the stored map for the live scheme** (0 missing, 0 wrong):

  | page | scheme | replay write (ms) | FCP (ms) | lead (ms) |
  |---|---|---:|---:|---:|
  | index.html | light | 62.8 | 316.0 | **253.2** |
  | index.html | dark | 59.6 | 276.0 | **216.4** |
  | classes.html | light | 48.2 | 320.0 | **271.8** |
  | classes.html | dark | 55.3 | 300.0 | **244.7** |
  | time.html | light | 60.0 | 172.0 | **112.0** |
  | time.html | dark | 45.0 | 196.0 | **151.0** |
  | timetable.html | light | 59.4 | 260.0 | **200.6** |
  | timetable.html | dark | 45.9 | 316.0 | **270.1** |

  Frozen AFTER frame (`*.js` aborted — only the inline replay ran): on all 8
  combos the page state **is** the themed first frame — 41/41 inline props
  exactly equal to the stored scheme map, body background = Ember surface
  (`rgb(255,248,246)` light / `rgb(26,17,16)` dark), computed `--md-primary`
  `#904A41`/`#FFB4A9`, computed `color-scheme` = the system scheme
  (`/tmp/opencode/066-AFTER-frozen-dark-ember.png` — dark Ember frame, vs the
  white frame above; `-light-ember.png` also captured).

- *First-visit dark:* frozen first frame on all four pages: surface `#111318`,
  body background `rgb(17,19,24)` — dark from the very first frame via the CSS
  block alone (`/tmp/opencode/066-AFTER-frozen-dark-firstvisit.png`); after
  load the engine settles to the identical surface (0 visible change).
- *No-JS:* contexts with `javaScriptEnabled:false`, both schemes: zero page
  errors; dark scheme paints the CSS-block dark frame (screenshots
  `066-AFTER-nojs-{dark,light}.png`).
- *Handoff / idempotence:* after load the 41 inline props still equal the
  stored map exactly (0 missing, 0 wrong); the `DOMContentLoaded` `apply()`
  produced **no second style mutation at all** (identical serialization →
  MutationObserver saw one write) — the double-apply is an observable no-op.
  Cycling continues to work; storage keeps its 41+41 maps on every click.
- *Old-shape migration:* `{"preset":"Ember"}` loads once transitional (default
  frame by design), `applyState` upgrades storage to the new shape in place
  (preset preserved, 41-key light map present, Ember dark surface applied on
  the dark scheme); from the next load the replay covers it.
- *Regression probes:* `?redact=1` boot → `TT.data.redacted() === true`, no
  errors; button after load → `aria-label`/`data-tip` = `Theme: Ember —
  click to change`, `title` = `null`; **zero page JS errors in every scenario**.
- *HTTP:* `curl` → **200** for `/index.html`, `/classes.html`, `/time.html`,
  `/timetable.html`, `/styles.css`, `/js/theme.js`; both servers confirmed
  dead by PID (`ps` empty, `curl` refused).
- *Tests:* new file `test/theme-boot.test.js`, exactly the plan's 7 `test()`
  blocks (snippet byte-identity+position; meta placement; vm replay positive;
  vm replay negative; persistence contract; readState compat; CSS drift pin).

**Exact diff of this fix (7 files):**

```diff
diff --git a/js/theme.js b/js/theme.js
@@ -755,10 +755,51 @@
 
   function kebab(role) { return role.replace(/([A-Z])/g, '-$1').toLowerCase(); }
 
+  // The exact property map apply() writes on <html>: the 37 --md-<kebab-role>
+  // roles + the 3 display-only --pal-* swatches + color-scheme (41 keys).
+  // Pure (no DOM) — the single writer of that vocabulary: apply() applies this
+  // map to the document, and applyState() persists the light and dark maps so
+  // the inline <head> replay script (issue 066) can rewrite them verbatim
+  // before first paint, with drift structurally impossible.
+  function varsFor(opts) {
+    opts = opts || {};
+    var theme = createTheme(opts);
+    var out = {};
+    for (var i = 0; i < ROLE_ORDER.length; i++) {
+      var role = ROLE_ORDER[i];
+      out['--md-' + kebab(role)] = theme[role];
+    }
+    // Display-only swatch colors for #themeCycle, mirroring AOSP ThemePicker's
+    // quadrant-circle preview: secondary/tertiary at AOSP's bright preview tones
+    // (L*85 light / L*35 dark, L*70), primary as the snapped identity seed.
+    // --md-* above is left untouched.
+    var seedPrimary = opts.primary || PRESETS[0].primary;
+    var pals = buildPalettes({
+      primary: seedPrimary,
+      secondary: opts.secondary,
+      tertiary: opts.tertiary,
+      error: opts.error,
+      variant: opts.variant
+    });
+    var dark = !!opts.dark;
+    out['--pal-secondary'] = pals.S.hex(dark ? 35 : 85);
+    out['--pal-primary'] = snapPalette(seedPrimary, SOLID_PALETTE);
+    out['--pal-tertiary'] = pals.T.hex(70);
+    out['color-scheme'] = dark ? 'dark' : 'light';
+    return out;
+  }
+
   // Compute the roles and write them as CSS custom properties on <html>.
+  // The same names and values the inline replay script writes, so a replayed
+  // frame and this write are visually identical — double-apply is a no-op.
   function apply(opts) {
     opts = opts || {};
-    var theme = createTheme(opts);
+    var vars = varsFor(opts);
+    var theme = {};
+    for (var i = 0; i < ROLE_ORDER.length; i++) {
+      var role = ROLE_ORDER[i];
+      theme[role] = vars['--md-' + kebab(role)];
+    }
     current.primary = opts.primary || null;
     current.secondary = opts.secondary || null;
     current.tertiary = opts.tertiary || null;
@@ -768,27 +809,7 @@
     current.variant = opts.variant || null;
     if (typeof document !== 'undefined' && document && document.documentElement) {
       var style = document.documentElement.style;
-      for (var i = 0; i < ROLE_ORDER.length; i++) {
-        var role = ROLE_ORDER[i];
-        style.setProperty('--md-' + kebab(role), theme[role]);
-      }
-      // Display-only swatch colors for #themeCycle, mirroring AOSP ThemePicker's
-      // quadrant-circle preview: secondary/tertiary at AOSP's bright preview tones
-      // (L*85 light / L*35 dark, L*70), primary as the snapped identity seed.
-      // --md-* above is left untouched.
-      var seedPrimary = opts.primary || PRESETS[0].primary;
-      var pals = buildPalettes({
-        primary: seedPrimary,
-        secondary: opts.secondary,
-        tertiary: opts.tertiary,
-        error: opts.error,
-        variant: opts.variant
-      });
-      var palDark = !!opts.dark;
-      style.setProperty('--pal-secondary', pals.S.hex(palDark ? 35 : 85));
-      style.setProperty('--pal-primary', snapPalette(seedPrimary, SOLID_PALETTE));
-      style.setProperty('--pal-tertiary', pals.T.hex(70));
-      style.setProperty('color-scheme', current.dark ? 'dark' : 'light');
+      for (var k in vars) if (vars.hasOwnProperty(k)) style.setProperty(k, vars[k]);
     }
     return theme;
   }
@@ -881,7 +902,10 @@
     } catch (e) { /* no head */ }
   }
 
-  // ---- persisted state (only the chosen preset; scheme comes from the system)
+  // ---- persisted state: the chosen preset plus the replay maps (issue 066) --
+  // The scheme itself still comes from the system at apply/replay time; what
+  // is stored next to the preset is the *applied output* per scheme (varsFor),
+  // so the inline <head> script can replay the live scheme before first paint.
 
   function readState() {
     var s = { preset: null };
@@ -936,10 +960,24 @@
       btnEl.setAttribute('data-tip', desc);
     }
     syncMeta(theme.surface);
+    // Persist the applied output for BOTH schemes: the inline <head> replay
+    // script (issue 066) rewrites the live one before first paint on the next
+    // load. The opposite-scheme map costs one extra varsFor call (ms-scale,
+    // off the critical path — this runs at DOMContentLoaded or on a click).
+    state.vars = { light: schemeVars(opts, false), dark: schemeVars(opts, true) };
     writeState(state);
     return theme;
   }
 
+  // The same opts with `dark` overridden — to compute and persist the
+  // opposite scheme's property map alongside the applied one.
+  function schemeVars(opts, dark) {
+    var o = {};
+    for (var k in opts) if (opts.hasOwnProperty(k)) o[k] = opts[k];
+    o.dark = dark;
+    return varsFor(o);
+  }
+
   function init() {
     if (inited) return state;
     if (typeof document === 'undefined' || !document || !document.getElementById) return null;
diff --git a/styles.css b/styles.css
@@ -4,6 +4,46 @@
    fallback so the page still looks right if js/theme.js is absent. No
    page-specific JS styling; state class names come only from TT.color. */
 @import url('https://fonts.googleapis.com/css2?family=DynaPuff:wght@400..700&family=Tiny5&display=swap');
+
+/* ---- dark scheme before js/theme.js runs (issue 066) ------------------
+   Until the engine applies at DOMContentLoaded (and always for no-JS
+   visitors) every var(--md-*) use falls back to its baked light hex. This
+   ONE additive block gives prefers-color-scheme: dark a correct ISIM Blue
+   dark frame from the very first paint, paired with each page's
+   <meta name="color-scheme" content="light dark">. The values are exactly
+   createTheme({primary:#0b4da2, secondary:#4b5f7d, tertiary:#7c5260,
+   dark:true}) for the 22 --md-* roles styles.css consumes (all of them are
+   var() fallbacks, so no existing rule is touched); a stored preset
+   replayed inline on <html> overrides these, so the layers compose.
+   Pinned against the engine by test/theme-boot.test.js. Placed at the top
+   (per the issue-066 decision) yet after the @import, which CSS requires
+   to precede every other at-rule. */
+@media (prefers-color-scheme: dark) {
+  :root {
+    --md-primary: #ADC6FF;
+    --md-on-primary: #102F60;
+    --md-primary-container: #2B4678;
+    --md-on-primary-container: #D8E2FF;
+    --md-secondary: #BCC7DC;
+    --md-on-secondary: #263141;
+    --md-secondary-container: #3D4758;
+    --md-on-secondary-container: #D8E3F8;
+    --md-tertiary: #EFB8C9;
+    --md-on-tertiary: #492532;
+    --md-tertiary-container: #633B49;
+    --md-on-tertiary-container: #FFD9E3;
+    --md-surface: #111318;
+    --md-on-surface: #E2E2E9;
+    --md-on-surface-variant: #C4C6D0;
+    --md-surface-container-lowest: #0C0E13;
+    --md-surface-container: #1E1F25;
+    --md-surface-container-high: #282A2F;
+    --md-outline: #8E9099;
+    --md-outline-variant: #44474F;
+    --md-inverse-surface: #E2E2E9;
+    --md-inverse-on-surface: #2F3036;
+  }
+}
 /* ---- search monospace (issue 001) ----------------------------------------
    The ghost completion overlay sits behind the transparent input and measures
    the prefix hint to shift the caret (--ghost-pre). Proportional fonts make
diff --git a/index.html b/index.html
@@ -3,6 +3,7 @@
 <head>
 <meta charset="utf-8">
 <meta name="viewport" content="width=device-width, initial-scale=1">
+<meta name="color-scheme" content="light dark">
 <title>Teachers — Emplois</title>
 <meta name="description" content="Emplois — browse the 2026–2027 timetable of ISIM Mahdia (LBC, LCE, LCS and MPExpRes sections): search a teacher, class or subject and see every session.">
 <meta name="theme-color" content="#0b4da2">
@@ -27,6 +28,24 @@
 
 <link rel="canonical" href="https://adem482p.github.io/time/">
 <link rel="icon" href="data:,">
+<script>
+/* Issue 066: replay the stored theme before first paint — js/theme.js persists
+   the applied --md- and --pal- custom properties per scheme; write them
+   verbatim so the first frame is already themed. Idempotent: theme.js writes
+   the same values again. (Never write a literal star-slash inside this
+   comment — it would terminate it early.) */
+(function () {
+  try {
+    var s = JSON.parse(localStorage.getItem('emplois-theme') || 'null');
+    if (!s || !s.vars) return;             /* first visit / old shape: CSS defaults */
+    var d = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
+    var v = s.vars[d ? 'dark' : 'light'];
+    if (!v) return;
+    var st = document.documentElement.style;
+    for (var k in v) if (v.hasOwnProperty(k)) st.setProperty(k, v[k]);
+  } catch (e) { /* corrupt/unavailable storage: default theme */ }
+})();
+</script>
 <link rel="stylesheet" href="styles.css">
 </head>
 <body data-page="teachers">
diff --git a/classes.html b/classes.html
@@ -3,6 +3,7 @@
 <head>
 <meta charset="utf-8">
 <meta name="viewport" content="width=device-width, initial-scale=1">
+<meta name="color-scheme" content="light dark">
 <title>Classes — Emplois</title>
 <meta name="description" content="Emplois — browse the 2026–2027 class week timetable of ISIM Mahdia (LBC, LCE, LCS and MPExpRes sections): search a class and see its whole week grid.">
 <meta name="theme-color" content="#0b4da2">
@@ -27,6 +28,24 @@
 
 <link rel="canonical" href="https://adem482p.github.io/time/classes.html">
 <link rel="icon" href="data:,">
+<script>
+/* Issue 066: replay the stored theme before first paint — js/theme.js persists
+   the applied --md- and --pal- custom properties per scheme; write them
+   verbatim so the first frame is already themed. Idempotent: theme.js writes
+   the same values again. (Never write a literal star-slash inside this
+   comment — it would terminate it early.) */
+(function () {
+  try {
+    var s = JSON.parse(localStorage.getItem('emplois-theme') || 'null');
+    if (!s || !s.vars) return;             /* first visit / old shape: CSS defaults */
+    var d = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
+    var v = s.vars[d ? 'dark' : 'light'];
+    if (!v) return;
+    var st = document.documentElement.style;
+    for (var k in v) if (v.hasOwnProperty(k)) st.setProperty(k, v[k]);
+  } catch (e) { /* corrupt/unavailable storage: default theme */ }
+})();
+</script>
 <link rel="stylesheet" href="styles.css">
 </head>
 <body data-page="classes">
diff --git a/time.html b/time.html
@@ -3,8 +3,27 @@
 <head>
 <meta charset="utf-8">
 <meta name="viewport" content="width=device-width, initial-scale=1">
+<meta name="color-scheme" content="light dark">
 <title>Time — Emplois</title>
 <link rel="icon" href="data:,">
+<script>
+/* Issue 066: replay the stored theme before first paint — js/theme.js persists
+   the applied --md- and --pal- custom properties per scheme; write them
+   verbatim so the first frame is already themed. Idempotent: theme.js writes
+   the same values again. (Never write a literal star-slash inside this
+   comment — it would terminate it early.) */
+(function () {
+  try {
+    var s = JSON.parse(localStorage.getItem('emplois-theme') || 'null');
+    if (!s || !s.vars) return;             /* first visit / old shape: CSS defaults */
+    var d = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
+    var v = s.vars[d ? 'dark' : 'light'];
+    if (!v) return;
+    var st = document.documentElement.style;
+    for (var k in v) if (v.hasOwnProperty(k)) st.setProperty(k, v[k]);
+  } catch (e) { /* corrupt/unavailable storage: default theme */ }
+})();
+</script>
 <link rel="stylesheet" href="styles.css">
 </head>
 <body data-page="time">
diff --git a/timetable.html b/timetable.html
@@ -3,8 +3,27 @@
 <head>
 <meta charset="utf-8">
 <meta name="viewport" content="width=device-width, initial-scale=1">
+<meta name="color-scheme" content="light dark">
 <title>Timetable matrix — Emplois</title>
 <link rel="icon" href="data:,">
+<script>
+/* Issue 066: replay the stored theme before first paint — js/theme.js persists
+   the applied --md- and --pal- custom properties per scheme; write them
+   verbatim so the first frame is already themed. Idempotent: theme.js writes
+   the same values again. (Never write a literal star-slash inside this
+   comment — it would terminate it early.) */
+(function () {
+  try {
+    var s = JSON.parse(localStorage.getItem('emplois-theme') || 'null');
+    if (!s || !s.vars) return;             /* first visit / old shape: CSS defaults */
+    var d = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
+    var v = s.vars[d ? 'dark' : 'light'];
+    if (!v) return;
+    var st = document.documentElement.style;
+    for (var k in v) if (v.hasOwnProperty(k)) st.setProperty(k, v[k]);
+  } catch (e) { /* corrupt/unavailable storage: default theme */ }
+})();
+</script>
 <link rel="stylesheet" href="styles.css">
 </head>
 <body data-page="matrix">
diff --git a/test/theme-boot.test.js b/test/theme-boot.test.js
new file mode 100644
--- /dev/null
+++ b/test/theme-boot.test.js
+// Tests for the pre-paint theme boot (issue 066) — run with the other suites:
+// `node --test test/theme-boot.test.js` … or the count form
+// `node --test "test/*.test.js"` (the directory form `node --test test/` still
+// fails; files stay listed).
+//
+// The fix has three moving parts, each pinned here:
+//   1. an inline <head> replay snippet — byte-identical on all four pages,
+//      immediately before the stylesheet link — that rewrites the stored
+//      per-scheme output maps before first paint, plus the
+//      <meta name="color-scheme" content="light dark"> next to the viewport
+//      meta that lets the UA paint the right scheme;
+//   2. js/theme.js persisting those maps under `emplois-theme` on every
+//      applyState, via the single writer varsFor, so the replay and the
+//      DOMContentLoaded apply are the same values (double-apply is a no-op);
+//   3. the ONE additive prefers-color-scheme: dark block in styles.css that
+//      gives first-visit dark visitors (and no-JS visitors) a dark first
+//      frame, pinned against the engine so it cannot drift.
+
+'use strict';
+
+var test = require('node:test');
+var assert = require('node:assert');
+var fs = require('node:fs');
+var path = require('node:path');
+var vm = require('node:vm');
+
+var ROOT = path.join(__dirname, '..');
+var PAGES = ['index.html', 'classes.html', 'time.html', 'timetable.html'];
+var STYLESHEET = '<link rel="stylesheet" href="styles.css">';
+
+function readSrc(rel) {
+  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
+}
+
+// The raw <script>…</script> block of the issue-066 replay snippet in a page.
+function replaySnippet(html) {
+  var at = html.indexOf('/* Issue 066:');
+  assert.ok(at !== -1, 'the replay snippet must exist');
+  var open = html.lastIndexOf('<script>', at);
+  var close = html.indexOf('</script>', at);
+  assert.ok(open !== -1 && close !== -1, 'the snippet must sit in one script block');
+  return html.slice(open, close + '</script>'.length);
+}
+
+var SNIPPET_JS = replaySnippet(readSrc(PAGES[0]))
+  .replace(/^<script>\n?/, '')
+  .replace(/\n?<\/script>$/, '');
+
+// ---- 1. HTML wiring: byte-identical snippet, positioned before the sheet ---
+
+test('the inline replay snippet is byte-identical on all four pages, immediately before the stylesheet link', function () {
+  var first = replaySnippet(readSrc(PAGES[0]));
+  assert.ok(Buffer.byteLength(first, 'utf8') >= 900 && Buffer.byteLength(first, 'utf8') <= 1000,
+    'the snippet stays under ~1 KB inline');
+  PAGES.forEach(function (page) {
+    var html = readSrc(page);
+    var snip = replaySnippet(html);
+    assert.strictEqual(snip, first, page + ': the snippet must be byte-identical to ' + PAGES[0]);
+    var end = html.indexOf('</script>', html.indexOf('/* Issue 066:')) + '</script>'.length;
+    var link = html.indexOf(STYLESHEET);
+    assert.ok(link !== -1, page + ': the stylesheet link must exist');
+    assert.ok(html.slice(end, link).trim() === '',
+      page + ': the snippet must sit immediately before the stylesheet link');
+  });
+});
+
+test('meta color-scheme "light dark" sits right after the viewport meta on all four pages', function () {
+  var line = '<meta name="color-scheme" content="light dark">';
+  PAGES.forEach(function (page) {
+    var html = readSrc(page);
+    var vp = html.indexOf('<meta name="viewport"');
+    assert.ok(vp !== -1, page + ': the viewport meta must exist');
+    var after = html.indexOf('>', vp) + 1;
+    assert.strictEqual(html.slice(after + 1, after + 1 + line.length), line,
+      page + ': the color-scheme meta sits on the next line after the viewport meta');
+  });
+});
+
+// ---- 2. the replay logic, executed in a vm with a stubbed DOM --------------
+
+// Sentinel maps for the two schemes — the snippet must pick one whole-map and
+// write it verbatim, never merge or transform it.
+var LIGHT = { '--md-primary': '#111111', '--md-surface': '#222222', 'color-scheme': 'light' };
+var DARK = { '--md-primary': '#333333', '--md-surface': '#444444', 'color-scheme': 'dark' };
+
+function asWrites(map) {
+  return Object.keys(map).map(function (k) { return [k, map[k]]; });
+}
+
+// Run the extracted snippet against a stub environment; return the list of
+// setProperty calls (host-realm arrays, safe for deepStrictEqual).
+function runReplay(opts) {
+  var writes = [];
+  var sandbox = {
+    document: {
+      documentElement: {
+        style: { setProperty: function (k, v) { writes.push([k, v]); } }
+      }
+    },
+    localStorage: {
+      getItem: function () {
+        if (opts.getThrows) throw new Error('storage denied');
+        return opts.store === undefined ? null : opts.store;
+      }
+    }
+  };
+  sandbox.window = opts.matchMedia === false ? {} : {
+    matchMedia: function () { return { matches: !!opts.dark }; }
+  };
+  vm.runInNewContext(SNIPPET_JS, sandbox, { filename: 'replay-snippet' });
+  return writes;
+}
+
+test('the inline replay writes the stored map for the live scheme verbatim (dark, light, no matchMedia = light)', function () {
+  var store = JSON.stringify({ preset: 'Ember', vars: { light: LIGHT, dark: DARK } });
+  assert.deepStrictEqual(runReplay({ store: store, dark: true }), asWrites(DARK),
+    'dark scheme replays vars.dark');
+  assert.deepStrictEqual(runReplay({ store: store, dark: false }), asWrites(LIGHT),
+    'light scheme replays vars.light');
+  assert.deepStrictEqual(runReplay({ store: store, matchMedia: false }), asWrites(LIGHT),
+    'no matchMedia support falls back to the light map');
+});
+
+test('the inline replay is a silent no-op on first visit, old shape, corrupt JSON, missing live map and denied storage', function () {
+  var none = [];
+  assert.deepStrictEqual(runReplay({ store: null }), none, 'first visit: no storage');
+  assert.deepStrictEqual(runReplay({ store: 'null' }), none, 'storage holding literal null');
+  assert.deepStrictEqual(runReplay({ store: JSON.stringify({ preset: 'Ember' }) }), none,
+    'old shape without vars');
+  assert.deepStrictEqual(runReplay({ store: '{"preset":' }), none, 'corrupt JSON');
+  assert.deepStrictEqual(runReplay({ store: JSON.stringify({ preset: 'Ember', vars: {} }) }),
+    none, 'vars present but no map for any scheme');
+  assert.deepStrictEqual(runReplay({ store: JSON.stringify({ preset: 'Ember', vars: { light: LIGHT } }), dark: true }),
+    none, 'dark scheme requested but only the light map exists');
+  assert.deepStrictEqual(runReplay({ store: null, getThrows: true }), none,
+    'a throwing localStorage is swallowed');
+});
+
+// ---- 3. theme.js persistence, exercised through a real init() --------------
+
+// Boot js/theme.js in a fresh vm against a stub DOM, exactly like a page load:
+// readyState is already 'complete', so autoInit runs init() synchronously.
+function bootTheme(seedStorage, dark) {
+  var store = {};
+  if (seedStorage !== undefined) store['emplois-theme'] = seedStorage;
+  var writes = {};   // documentElement.style.setProperty calls, in order
+  var btnAttrs = {}; // attributes written on the #themeCycle stub (issue 059)
+  var sandbox = {
+    module: { exports: {} },
+    console: console,
+    localStorage: {
+      getItem: function (k) {
+        return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
+      },
+      setItem: function (k, v) { store[k] = String(v); }
+    },
+    window: {
+      matchMedia: function () {
+        return { matches: !!dark, addEventListener: function () {}, addListener: function () {} };
+      }
+    },
+    document: {
+      readyState: 'complete',
+      documentElement: { style: { setProperty: function (k, v) { writes[k] = v; } } },
+      head: { appendChild: function () {} },
+      getElementById: function (id) {
+        if (id !== 'themeCycle') return null;
+        return {
+          setAttribute: function (k, v) { btnAttrs[k] = v; },
+          removeAttribute: function () {},
+          addEventListener: function () {}
+        };
+      },
+      querySelector: function () { return null; },
+      querySelectorAll: function () { return []; },
+      createElement: function () { return { setAttribute: function () {}, style: {} }; }
+    }
+  };
+  vm.createContext(sandbox);
+  vm.runInContext(readSrc('js/theme.js'), sandbox, { filename: 'js/theme.js' });
+  return { theme: sandbox.module.exports, store: store, writes: writes, btnAttrs: btnAttrs };
+}
+
+function kebab(role) { return role.replace(/([A-Z])/g, '-$1').toLowerCase(); }
+
+function presetOpts(theme, name, dark) {
+  var p = null;
+  theme.PRESETS.forEach(function (x) { if (x.name === name) p = x; });
+  assert.ok(p, 'preset ' + name + ' exists');
+  var opts = { primary: p.primary, dark: !!dark, contrast: 0 };
+  if (p.secondary) opts.secondary = p.secondary;
+  if (p.tertiary) opts.tertiary = p.tertiary;
+  if (p.error) opts.error = p.error;
+  if (p.variant) opts.variant = p.variant;
+  return opts;
+}
+
+test('applyState persists both schemes’ 41-key output maps equal to the engine (Ember + Monochrome variant path)', function () {
+  ['Ember', 'Monochrome'].forEach(function (name) {
+    var boot = bootTheme(JSON.stringify({ preset: name }), false); // light scheme
+    var saved = JSON.parse(boot.store['emplois-theme']);
+    assert.strictEqual(saved.preset, name, name + ': the preset stays stored');
+    ['light', 'dark'].forEach(function (scheme) {
+      var vars = saved.vars && saved.vars[scheme];
+      assert.ok(vars && typeof vars === 'object', name + '/' + scheme + ': the map is stored');
+      var keys = Object.keys(vars);
+      assert.strictEqual(keys.filter(function (k) { return k.indexOf('--md-') === 0; }).length, 37,
+        name + '/' + scheme + ': all 37 --md-* roles');
+      assert.strictEqual(keys.filter(function (k) { return k.indexOf('--pal-') === 0; }).length, 3,
+        name + '/' + scheme + ': all 3 --pal-* swatches');
+      assert.strictEqual(vars['color-scheme'], scheme,
+        name + '/' + scheme + ': color-scheme marks the map');
+      assert.strictEqual(keys.length, 41, name + '/' + scheme + ': 37 + 3 + 1 = 41 keys');
+      var expected = boot.theme.createTheme(presetOpts(boot.theme, name, scheme === 'dark'));
+      Object.keys(expected).forEach(function (role) {
+        assert.strictEqual(vars['--md-' + kebab(role)], expected[role],
+          name + '/' + scheme + ': --md-' + kebab(role) + ' equals the engine output');
+      });
+    });
+    // The applied scheme's map (light — the stubbed system scheme here) was
+    // written verbatim on <html>: replay and apply agree key-for-key, so the
+    // handoff double-apply is a visual no-op.
+    var applied = saved.vars.light;
+    Object.keys(applied).forEach(function (k) {
+      assert.strictEqual(boot.writes[k], applied[k], name + ': apply() wrote ' + k);
+    });
+    // 059's tooltip contract survives inside applyState.
+    assert.strictEqual(boot.btnAttrs['aria-label'], 'Theme: ' + name + ' — click to change',
+      name + ': aria-label still feeds the tooltip');
+    assert.strictEqual(boot.btnAttrs['data-tip'], boot.btnAttrs['aria-label'],
+      name + ': data-tip still feeds the CSS tooltip');
+  });
+});
+
+test('readState stays backward compatible: the old shape restores and upgrades, the new shape restores intact', function () {
+  // Old shape: only the preset. One transitional load, then the maps appear.
+  var oldBoot = bootTheme(JSON.stringify({ preset: 'Ember' }), true); // dark scheme
+  assert.strictEqual(oldBoot.theme.current.preset, 'Ember',
+    'the old shape still resolves the preset');
+  var upgraded = JSON.parse(oldBoot.store['emplois-theme']);
+  assert.ok(upgraded.vars && upgraded.vars.light && upgraded.vars.dark,
+    'the old shape is upgraded to the new one on the first apply');
+  assert.strictEqual(Object.keys(upgraded.vars.light).length, 41, 'upgraded light map is complete');
+  var wantDark = oldBoot.theme.createTheme(presetOpts(oldBoot.theme, 'Ember', true));
+  assert.strictEqual(oldBoot.writes['--md-primary'], wantDark.primary,
+    'the old-shape visitor is applied at the live (dark) scheme');
+  assert.strictEqual(oldBoot.writes['color-scheme'], 'dark', 'color-scheme follows the system');
+
+  // New shape: preset + maps. Resolves the preset and re-persists complete maps.
+  var newBoot = bootTheme(JSON.stringify({
+    preset: 'Monochrome',
+    vars: { light: LIGHT, dark: DARK }
+  }), false);
+  assert.strictEqual(newBoot.theme.current.preset, 'Monochrome',
+    'the new shape still resolves the preset');
+  var saved = JSON.parse(newBoot.store['emplois-theme']);
+  assert.strictEqual(saved.preset, 'Monochrome');
+  assert.strictEqual(Object.keys(saved.vars.light).length, 41, 'the light map is re-persisted intact');
+  assert.strictEqual(Object.keys(saved.vars.dark).length, 41, 'the dark map is re-persisted intact');
+});
+
+// ---- 4. the CSS dark fallback ----------------------------------------------
+
+test('the styles.css dark-fallback block is additive, singular, top-positioned and drift-free against the engine', function () {
+  var css = readSrc('styles.css');
+  var marker = '@media (prefers-color-scheme: dark)';
+  var start = css.indexOf(marker);
+  assert.ok(start !== -1, 'the dark-fallback block must exist');
+  assert.strictEqual(css.indexOf(marker, start + 1), -1, 'exactly ONE dark-fallback block');
+  // Brace-match the whole block (comments mention braces; lastIndexOf would lie).
+  var open = css.indexOf('{', start);
+  var depth = 0, end = -1;
+  for (var i = open; i < css.length; i++) {
+    if (css[i] === '{') depth++;
+    else if (css[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
+  }
+  assert.ok(end !== -1, 'the block closes');
+  var block = css.slice(start, end + 1);
+
+  var pairs = {}, m;
+  var def = /(--md-[a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g;
+  while ((m = def.exec(block))) pairs[m[1]] = m[2];
+  assert.strictEqual(Object.keys(pairs).length, 22, 'the block defines 22 roles');
+
+  // Purely additive: styles.css consumes exactly those 22 via var(--md-…,
+  // #fallback) and defines no --md-* anywhere outside this block.
+  var consumed = {}, use = /var\((--md-[a-z-]+)[,)]/g;
+  while ((m = use.exec(css))) consumed[m[1]] = true;
+  assert.deepStrictEqual(Object.keys(pairs).sort(), Object.keys(consumed).sort(),
+    'the block covers exactly the roles styles.css consumes');
+  var outside = css.slice(0, start) + css.slice(end + 1);
+  assert.ok(!/--md-[a-z-]+\s*:/.test(outside),
+    'no --md-* property is defined anywhere else in styles.css');
+
+  // Top placement (per the issue-066 decision), after the @import that CSS
+  // requires to precede every other at-rule.
+  assert.ok(start < css.indexOf('* { box-sizing'), 'the block precedes the first rule');
+  assert.ok(start > css.indexOf('@import'), 'the @import stays the first at-rule');
+
+  // Drift pin: every value equals the engine's dark ISIM Blue output.
+  var engine = require('../js/theme.js');
+  var want = engine.createTheme({ primary: '#0b4da2', secondary: '#4b5f7d', tertiary: '#7c5260', dark: true });
+  Object.keys(pairs).forEach(function (prop) {
+    var role = prop.slice('--md-'.length).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
+    assert.ok(want[role], prop + ' maps to an engine role');
+    assert.strictEqual(pairs[prop].toUpperCase(), String(want[role]).toUpperCase(),
+      prop + ' equals createTheme(…, dark:true)');
+  });
+});
```
