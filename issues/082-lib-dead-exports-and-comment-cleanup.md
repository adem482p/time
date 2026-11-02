# 082: Remove dead lib exports, deduplicate match.js comments, fix register.js timing

Status: Open
Date: 2026-11-01
Reporter: coordinator

## Description

Three independent cleanups in `app/src/lib/`:

1. **Dead exports** (verified zero callers):
   - `load.js`: re-exports `DAYS`, `SLOTS`
   - `display.js`: `nextArrowHTML()` (imported by `classes/+page.svelte` and `DayGroupCards.svelte` but never called)
   - `color.js`: `dayGroup()` 
   - `kaomoji.js`: `categories()`, `byCategory` (internal to `random()` — keep function, drop export)
   - `theme.js`: `Math.cbrt` polyfill (pre-ES2015, defensive only), `PALETTES` legacy alias export (`export const PALETTES = PRESETS`)

2. **Comment duplication in `match.js`**: ~10 functions have a prose block comment followed by a JSDoc restating the same sentences. Keep JSDoc, delete redundant prose.

3. **`register.js` timing race**: `window.addEventListener('load', ...)` unconditional — if page JS evaluates after `load` (slow fonts, big bundle), registration never fires. Fix: register immediately when `document.readyState === 'complete'`, else keep `load` listener path.

## Root cause

Dead exports accumulated during port; comment style wasn't normalized; `register.js` was ported from legacy onMount pattern without the readyState guard.

## Repro steps

```bash
# Dead exports
grep -rn "nextArrowHTML\|dayGroup\|categories\|byCategory\|DAYS\|SLOTS\|PALETTES\|Math.cbrt" app/src/lib/ | grep -v "test"

# Comment duplication
grep -B2 -A5 "tokenScore\|fuzzyRanges\|liveSearch\|searchSections" app/src/lib/match.js

# Timing
grep -n "addEventListener.*load" app/src/lib/register.js
```

## Discussion

### Maintainer triage (2026-11-01)

Allowed files: only the 7 `app/src/lib/*.js` files listed. Do NOT touch pages/components/tests/docs.

Changes:
- Remove each dead export + its JSDoc. `kaomoji.byCategory` keeps function body (called by `random()`), drops only `export` keyword.
- `match.js`: for each of the 10 pairs, delete redundant prose sentences; where prose has issue-specific context not in JSDoc (e.g. `nameHTML` architectural note, `shadowText` worked examples), merge into JSDoc before deleting prose.
- `register.js`: extract registration body to `registerWorker()`, call it directly if `document.readyState === 'complete'` else via `addEventListener('load')`. Keep token `'addEventListener'` (pinned by test/offline.test.js:193).

Acceptance criteria:
1. `node --test test/*.test.js` → 192 pass / 0 fail
2. `grep -rn 'Math.cbrt' app/src` → exactly 1 hit (the vendored engine call in theme.js)
3. `PALETTES` absent from theme's export surface
4. No caller of removed names anywhere in `app/src`
5. Build succeeds (expected: two Rollup warnings about stale `nextArrowHTML` imports in pages — those are handled by issue 081)