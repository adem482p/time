# 084: Merge stamp-page into gen-sw, drop vite preview, fix sync-static staleness

Status: Open
Date: 2026-11-01
Reporter: coordinator

## Description

Three build-pipeline simplifications:

1. **Two postbuild stages → one**: `stamp-page.mjs` (data-page attribute stamp) and `gen-sw.mjs` (service worker generation) both walk `build/*/index.html` with nearly identical directory logic. Merge stamp logic as stage one inside `gen-sw.mjs`; delete `stamp-page.mjs`.

2. **Drop `preview` script**: `package.json` has `"preview": "vite preview"` but AGENTS.md explicitly states this does not serve `app/build/` (workers 404) — documented broken path.

3. **Fix `cpSync` staleness**: `sync-static.mjs` copies `assets/` additively (`cpSync` recursive) — deleted files at root resurrect in `app/static/` and then `app/build/`. Replace with `rmSync` + fresh copy (with screenshot exclusion from issue 083).

## Root cause

Scripts evolved independently; `preview` was left from template; additive copy was the default `cpSync` behavior.

## Repro steps

```bash
# From app/
cat package.json | grep postbuild
ls scripts/stamp-page.mjs scripts/gen-sw.mjs
grep -n "cpSync.*assets" scripts/sync-static.mjs
```

## Discussion

### Maintainer triage (2026-11-01)

Changes in `app/scripts/gen-sw.mjs`, `app/package.json`, `app/scripts/sync-static.mjs`, delete `app/scripts/stamp-page.mjs`:

1. `gen-sw.mjs`: prepend `stampPage()` + `appPages()` from `stamp-page.mjs` (same regex, same skip-stubs behavior, same page-name rule). Keep both log lines (unified `gen-sw:` prefix). Header comment updated. `sw-template.js` byte-identical.

2. `package.json`: `postbuild` → `node scripts/gen-sw.mjs`; delete `"preview"` line.

3. `sync-static.mjs`: `assets/` sync → `rmSync(app/static/assets)` + `mkdirSync` + file-by-file `copyFileSync` with exclusion predicate (screens/, preview*). Trim unused imports.

Acceptance criteria:
1. `npm run build` → success, single `gen-sw:` log line with stamp count + both SW writes
2. `node --check build/teachers/sw.js build/classes/sw.js` → pass
3. Data-page stamping: `grep -o '<body[^>]*' build/teachers/index.html build/classes/index.html build/all/index.html build/at/index.html build/index.html build/classes.html` → app pages have `data-page="..."`, stubs do not
4. Staleness: create `app/static/assets/stale.txt` → re-run sync → removed
5. `node --test test/*.test.js` → 192 pass / 0 fail (offline/pwa token pins preserved)