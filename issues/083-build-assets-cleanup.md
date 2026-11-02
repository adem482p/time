# 083: Exclude README screenshots from offline cache and remove dead vendor/kaomoji.js

Status: Open
Date: 2026-11-01
Reporter: coordinator

## Description

Two unrelated cleanups in the static asset pipeline:

1. **README screenshots** (`assets/screens/*.png`, `preview*.png/svg` ~960K) are triplicated (root → app/static → app/build) and precached by both service workers. Only consumer is `README.md`. They add ~3.8 MB to the shipped tree and offline caches for no runtime value.

2. **`vendor/kaomoji.js`** (41K) is referenced by nothing — pages import `$lib/kaomoji.js` (ESM port). Yet it lands in both SW snapshot URL lists and is committed.

## Root cause

`sync-static.mjs` copies the entire `assets/` tree additively. `gen-sw.mjs` walks the whole build root for snapshot URLs. The vendor file was added for legacy parity (issue 072) but never wired.

## Repro steps

```bash
# From repo root
ls app/static/assets/screens/ app/static/assets/preview*
grep -rn "vendor/kaomoji" app/src app/static/*.html app/static/*/manifest.json
ls app/static/vendor/
```

## Discussion

### Maintainer triage (2026-11-01)

Changes in `app/scripts/sync-static.mjs` and `app/scripts/gen-sw.mjs` (merged per issue 079 build consolidation):

1. `sync-static.mjs`: replace additive `cpSync` for `assets/` with `rmSync` + file-by-file copy excluding `screens/` and `preview*`. Keep `emplois.csv` and `classes.html` copies as-is. Delete the committed `app/static/assets/screens/` dir and `preview*` files (root copies stay for README).

2. Verify `vendor/kaomoji.js` has zero references (grep confirmed). Delete `app/static/vendor/kaomoji.js`. Keep `vendor/NOTICE` (covers DejaVu Sans, Noto fonts).

Acceptance criteria:
1. `npm run build` in `app/` succeeds
2. `grep -c kaomoji build/teachers/sw.js build/classes/sw.js build/teachers/index.html` → all 0
3. `grep -c screens build/teachers/sw.js` and `grep -c preview build/teachers/sw.js` → 0
4. `ls app/static/vendor` → no `kaomoji.js`
5. `ls app/static/assets` → no `screens/`, no `preview*`
6. `node --check build/teachers/sw.js build/classes/sw.js` → both pass
7. `node --test test/*.test.js` → 192 pass / 0 fail (token names in offline/pwa tests preserved)