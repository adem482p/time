# 066: Apply the stored theme before first paint

Status: Open
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
