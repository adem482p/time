# 087: Replace the build-time service-worker snapshot list with runtime response caching

Status: Open
Date: 2026-11-03
Reporter: coordinator

## Description

Two related observations from the offline/PWA thread (issues 063, 070, 072, 084):

1. **Dev-server noise / structural mismatch**: `npm run dev` in `app/` logs
   `[404] GET /teachers/sw.js` (and `[404] GET /classes/sw.js` on the classes app).
   The worker is a build-time artifact — `postbuild: node scripts/gen-sw.mjs` stamps
   `build/<app>/sw.js` from `scripts/sw-template.js` — and `vite dev` serves the source
   tree, never `build/`. The registration fetch therefore always lands on a 404 in dev.

2. **Design question**: instead of generating a static build-time `SNAPSHOT_URLS` list,
   can't the service worker simply cache whatever response it intercepts at runtime —
   i.e. `put` successful network responses into the cache as they happen, and serve from
   cache when offline?

## Repro steps

```bash
cd app && npm run dev
# open /teachers/ -> observe "[404] GET /teachers/sw.js" in the vite log
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/teachers/sw.js   # -> 404
```

Production (`npm run build` + serve `app/build/`) has no such 404 — the generated
`build/<app>/sw.js` exists there.

## Root cause

The offline "last snapshot" model (issue 070) is built around a build-derived snapshot:
whole-app coverage via a generated URL list, all-or-nothing `addAll`, versioned snapshot
names (`SNAPSHOT_SUFFIX` digest) that force clean retakes, and an erase-then-retake
offline → online transition. The generation step is therefore load-bearing by design, which
is what makes the dev server unable to serve a worker at all.

## Discussion

- The static list buys: whole-app offline coverage without prior visits, declarative
  all-or-nothing installs, and snapshot-name versioning as the staleness mechanism.
- Runtime caching buys: no generation step, no `SNAPSHOT_URLS`, simpler worker, cache that
  self-populates from real traffic. Costs: offline coverage becomes visit-dependent; invalidation
  loses the free snapshot-name versioning; the erase+retake state machine (IndexedDB status,
  family prefixes) needs re-anchoring.

## Acceptance criteria

_To be set by the maintainer after triage — candidates: (a) dev no longer 404s (worker served
or registration skipped in dev), (b) snapshot generation replaced by runtime caching, or
(c) both, split into follow-ups._

## Discussion entries

### Maintainer decision (2026-11-03)

…pending…

### Fix implemented (2026-11-03)

Implementer run (issues 087 in the main checkout). **All changes are
uncommitted** — the main agent commits. `Status:` left `Open` for the main
agent to flip at merge.

**Design landed (option (c): both, as one issue):**

1. **Runtime response caching, replacing the build-time snapshot list
   (criterion b).** `app/scripts/sw-template.js` is now a
   network-first runtime-cache worker: every same-origin GET is fetched with
   `cache: 'no-cache'` (an HTTP-cache hit still never fakes connectivity) and
   every successful response is `cache.put(req, res.clone())`'ed into the
   app's runtime cache (`var CACHE = 'emplois-__APP__-snapshot-'`); the offline
   fallback reads the same cache (`cache.match`, navigations ignoring the
   query string) and a miss is an honest `Response.error()`. There is no
   `SNAPSHOT_URLS`, no `addAll`, no `__SNAP_SUFFIX__`, no install-time
   precache and no wholesale take any more — the cache self-populates from
   real traffic, and because the strategy is network-first a returning online
   session overwrites stale entries, so no snapshot-name versioning is needed.
   The erase-and-retake transition is gone too: offline → online just logs +
   persists the status record in IndexedDB (issue 070's mechanism kept as an
   observability record); the runtime cache self-updates.
   `activate` tears down only every OTHER cache of this app's own family
   (parent of the runtime-cache name — covers the retired
   `…-v-<digest>` snapshot generations from the old model and stale superseded
   entries), keeps the current runtime cache, and, in the teachers worker
   only, deletes the legacy pre-split root snapshot `emplois-snapshot-v1` by
   exact name.
2. **Build pipeline (stage two of `gen-sw.mjs`).** No snapshot URL list is
   built any more: the generator keeps stage one (data-page stamping) and
   stage two simply stamps `build/<app>/sw.js` from the template, expanding
   `__APP__` / `__SIBLING__` / the teachers-only legacy-root tokens. No
   build-tree walk, no digest, no URL-list JSON injection.
3. **Dev no longer 404s (criterion a, via registration-skipped-in-dev).**
   `app/src/lib/register.js` returns early when `import.meta.env.DEV` is
   true: the worker is a build artifact (vite dev serves the source tree,
   never `build/`), so the registration would always 404
   (`/teachers/sw.js → [404]`). Production registers the stamped worker
   exactly as before. Verified: `npm run dev`, vite log shows no worker
   fetch/`[404] /teachers/sw.js`; the module served by vite carries
   `import.meta.env = {… DEV: true …}` and `if (import.meta.env.DEV) return;`.
4. **Docs.** `FEATURES.md` — the "Offline: the snapshot model" section is
   rewritten as "Offline: the runtime cache model" (network-first + runtime
   put, no list, re-anchored transition, activate teardown semantics, dev
   skip). `CONTEXT.md` wording updated the same way.

**Files touched:** `app/scripts/sw-template.js`, `app/scripts/gen-sw.mjs`,
`app/src/lib/register.js`, `test/offline.test.js`, `test/pwa.test.js`,
`FEATURES.md`, `CONTEXT.md`, `issues/087-sw-runtime-caching.md`. (The
regenerated `build/{teachers,classes}/sw.js` are build artifacts of the
postbuild step; not tracked source.)

**Verification results:**

- `node --test test/*.test.js` → **192 pass / 0 fail** (baseline before the
  change was 192/0; the SW-related pins were rewritten to the runtime-cache
  model rather than padded with redundant new tests).
- `npm run build` in `app/` → success (stage one stamps the 4 app pages;
  stage two writes both workers); `node --check build/teachers/sw.js
  build/classes/sw.js` → OK; template tokens all expanded.
- `npm run dev` → `/teachers/`, `/classes/`, `/emplois.csv` all 200; no
  `[404] /teachers/sw.js` in the vite log; `/teachers/sw.js` curl → 404 is
  now expected and unreferenced (registration skipped).
- `curl -s -o /dev/null -w "%{http_code}"` on the production tree build is
  not applicable here (no backend, no browser); the generated worker was
  additionally syntax-checked as above.

**Risks / trade-offs accepted (as flagged by the issue):** offline coverage is
visit-dependent (first visit online fills the cache); old-generation snapshot
caches from the previous deploy are deleted on the next worker activate
(own family only, `emplois-snapshot-v1` handled by exact name for the
teachers worker); a miss while offline is an honest error, never fabricated
content; the status record is now observability-only, nothing tears it down.

