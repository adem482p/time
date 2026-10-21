# 070: Log last online status; erase the snapshot and retake it on reconnect

- Status: Fixed
- Date: 2026-10-21, Reporter: user

## Description

The user's requirement, verbatim — an AMENDMENT to the design shipped for
issue 063 (`sw.js` / `js/register.js` / `test/offline.test.js`), to be read
against 063's Maintainer decision (2026-10-20) and, for deployment context,
issue 067:

> just log the last online status: online vs offline. of the user ever goes
> from offline to online, then tear down all cache and start over. we never
> trust our cache. in fact calling it a cache is a misnomer. it's more like a
> 'last snapshot' of the webiste. and it gets erased everytime

**Expected behavior:**

- The last online status — `online` vs `offline` — is logged and persisted, and
  reads back after the service worker has been terminated and relaunched.
- An **offline → online** transition tears down **all** snapshot storage and
  then retakes the snapshot wholesale from the network — fired from the
  persisted record, so it works even across service-worker restarts.
- The stored copy is a **last snapshot, never a trusted cache**: it is only
  ever built wholesale (install's all-or-nothing `addAll`, every
  network-served navigation's full take, and the erase-then-retake on
  reconnect) and gets erased on every reconnect.
- Our vocabulary says **snapshot**, not cache (platform Cache API names are
  unavoidably exempt).

**Observed (today, HEAD b6b6cd0):** no online/offline status is recorded
anywhere — `sw.js` has no status store at all (grep: no IndexedDB, no
`localStorage`; workers have neither a written nor a read record), so an
offline→online transition cannot even be detected, let alone logged. The
snapshot is continuously **entry-patched**: `putCanonical` `cache.put`s each
individual 2xx response into the snapshot as it arrives, and it is **never
wholesale-erased on reconnect** — after an offline period the next online load
only overwrites whichever entries happen to be fetched (plus the navigation's
`addAll`, which overwrites the 21 canonical entries but deletes nothing), so
any extra or stale entry survives forever. The identifiers and comments all
say "cache" (`CACHE`, `PRECACHE`, `emplois-v1`, "cache fallback").

## Root cause

Not a bug in issue 063's implementation but a **design amendment of 063's
shipped design**. 063's decision deliberately chose "per-entry `cache.put` on
every online response PLUS a full `cache.addAll(PRECACHE)` after every
network-served navigation" (criterion 4), explicitly rejected
`caches.delete`-then-rebuild because it opens an empty window, never recorded
connectivity anywhere, and named the store `emplois-v1` in cache vocabulary.
The user now rejects exactly that shape: an entry-patched, never-erased store
IS the "trusted cache" they no longer trust — the thing is a *last snapshot*
of the site, and it gets erased every time the connection comes back. The
amendment therefore has to (a) give the worker a persisted online/offline
record, (b) make offline→online a wholesale teardown + retake, (c) remove the
per-entry write path so the snapshot is only ever built wholesale, and (d)
rename the vocabulary to "snapshot". All of that is what this issue records
and ships.

## Repro steps

1. `cd /home/user/.local/share/opencode/worktree/1de5bb/068-snapshot-model && python3 -m http.server 8168 --bind 127.0.0.1`
   (record the real PID via `ss -ltnp | grep 8168`; kill by PID afterwards —
   never `pkill -f`, sibling sessions run their own servers).
2. Open `http://127.0.0.1:8168/index.html`, wait for the worker to install
   (console: `caches.keys()` → `['emplois-v1']`, 21 entries).
   **Observed:** there is no last-online-status record anywhere —
   `indexedDB.databases()` contains no status database, and grepping `sw.js`
   for `indexedDB|localStorage` returns nothing: online vs offline is never
   logged or persisted, so "offline → online" cannot fire.
3. Stop the server by its recorded PID (confirm: `curl` → `000`). Reload the
   page → it renders from the snapshot. While still offline, plant a sentinel
   into the snapshot storage from the page console:
   `caches.open('emplois-v1').then(c => c.put('/sentinel', new Response('x')))`
   → `caches.match('/sentinel')` now resolves.
4. Start the server again and reload (the offline→online moment).
   **Observed (today):** the sentinel is still there after the online load —
   nothing erases storage on reconnect: the navigation's `addAll` overwrites
   the canonical 21 entries only, and `putCanonical` patches whichever
   individual responses arrive. No transition is logged, no record flips.
5. **Expected after this issue:** step 4's load detects offline→online from
   the persisted record (even if the worker was terminated and relaunched in
   between — terminate it first by letting it idle ~30 s, then reload offline
   to relaunch it), logs the transition in the worker console, erases every
   cache, retakes the full wholesale snapshot, leaves the sentinel gone and
   exactly the 21 fresh entries in place (byte-identical to disk), and reads
   back `online` from the status record. A second online load without an
   intervening offline period must NOT erase anything (no transition).

## Discussion

### Maintainer decision (2026-10-21)

**Verdict — valid, in scope, adopted as a binding amendment of 063's shipped
design.** The user's five intents are all honored; 063's user-supplied
guarantees that the amendment does NOT retract (network-first online, every
network-served navigation rebuilds the full snapshot, closed precache set,
activate destroys non-current generations, no stale-while-revalidate/no
cache-first) all survive unchanged. The one 063 decision the amendment
*reverses* is criterion 4's per-entry `put` — reversed for the reason the user
gives: a store that is entry-patched between rebuilds is precisely a cache we
trust, and a snapshot that is entry-patched is exactly the "trusted cache" the
user rejects.

**Open mechanics — rulings (all five):**

1. **Status store location → IndexedDB, one record; NOT a dedicated exempt
   Cache, NOT anything in Cache Storage.** The worker has no `localStorage`
   (window-only API), so the realistic candidates were a tiny IndexedDB record
   vs. a dedicated status Cache exempted from activate-deletion. IndexedDB
   wins because the exemption is the disqualifier: a status kept in a cache
   would need a "delete every non-current cache EXCEPT this one" clause in
   *two* teardown paths (activate's generation wipe and the new
   erase-everything transition) — two special cases guarding one record — it
   would be collateral damage for the header's own dev escape hatch
   (`caches.keys().forEach(k => caches.delete(k))`), and it re-creates the
   exact conflation the user is rejecting (a connectivity record dressed up as
   snapshot content). IndexedDB is a separate storage class: the snapshot
   teardown (Cache Storage only) can structurally never touch it, it survives
   worker restarts, and the page can read it back for tests. Shape: db
   `emplois-status`, object store `kv`, key `last-online` → `'online'` |
   `'offline'` — a record, not a cache entry.
2. **Detection point → the fetch handler's network outcome, evaluated against
   the persisted record.** A 2xx response = online; a network rejection =
   offline; a non-2xx is neither (served as-is, no status change — "a
   *successful* network fetch" is the transition trigger, per the brief). The
   record is read **once at worker top level on every start** (`var status =
   readStatus()`), so a freshly relaunched worker whose memory never saw the
   offline period still detects offline→online; in a warm worker the in-memory
   value is the same record kept current. All status updates serialize through
   one promise chain so two transitions can never interleave the erase.
3. **Per-entry-write fate → REMOVED.** `putCanonical` and the response clone
   are gone; the snapshot is ONLY ever built wholesale: install's
   all-or-nothing `addAll`, every network-served navigation's full take
   (063 invariant c — preserved verbatim), and the erase-then-retake on
   reconnect. Reasoning: with the per-entry `put` deleted, "writes are a
   closed set" (063 criterion 9) stops being a filter and becomes a structural
   fact — the only Cache Storage write sites are the two `addAll` calls, so
   query-string collapse, 404-poisoning and growth boundedness no longer need
   a gate at all. CSV freshness is unaffected: every page load *is* a
   navigation, and the navigation's wholesale take refetches `emplois.csv`
   with everything else.
4. **Cache name/vocabulary → `SNAPSHOT = 'emplois-snapshot-v1'`** (identifier
   `CACHE` → `SNAPSHOT`, `PRECACHE` → `SNAPSHOT_URLS`, `rebuild()` →
   `takeSnapshot()`, new `eraseSnapshot()`); comments and test messages say
   snapshot; `sw.js` and `js/register.js` header comments rewritten to the
   snapshot model. Platform names (`caches.match/keys/delete/open`, `addAll`)
   unavoidably stay. The rename itself performs a teardown: `emplois-v1` is
   now a non-current name, so activate deletes it on the first run of the new
   worker — the 063 mechanism, doing exactly what the amendment wants.
5. **Erase's empty window → accepted, documented, healed as below.** The
   transition fires while we are online (network-first serves pages from the
   network regardless of snapshot state); between `eraseSnapshot()`'s delete
   and a completed `addAll` the snapshot is empty, and a network fetch that
   fails in that window falls back to a miss → `Response.error()` (honest
   failure, no fabricated content). Closest-to-atomic as the API allows: one
   chained erase→addAll inside the serialized status chain, `addAll` being
   all-or-nothing so the snapshot is never half-written. Healing: the retake
   is chained onto the very load being served; if it fails, the next
   network-served navigation performs the full take anyway (063 inv c), and
   the next offline→online cycle re-runs the whole erase+retake. The status
   record is written **before** the erase so it keeps reporting the true
   connectivity outcome of the fetch that triggered the transition.

---

**Acceptance criteria (implementation-ready; numbered, self-contained)**

**1. Persisted + logged last online status.**
- `sw.js` gains an IndexedDB record (db `emplois-status`, store `kv`, key
  `last-online`, value `'online'` | `'offline'`), with `readStatus()` /
  `writeStatus()` helpers in repo style (guarded, ES5, best-effort: a storage
  error resolves rather than wedges the chain).
- `var status = readStatus();` executes at worker top level, so **every**
  worker (re)start re-reads the persisted record — detection therefore works
  after termination + relaunch.
- Console log line on every transition and on the first observation:
  `[sw] offline -> online: erasing the snapshot and retaking it fresh`,
  `[sw] online -> offline: the last snapshot now serves`, plus first-observation
  lines — the observable "log" half. The persisted value is the readable-back
  half (from the page's own IndexedDB, for tests).
- No `localStorage` anywhere in `sw.js` (workers don't have it).

**2. Offline → online tears down ALL snapshot storage, then retakes wholesale.**
- In the status chain: log → persist `online` → `eraseSnapshot()` →
  `takeSnapshot()`, in that order, as one chained run.
- `eraseSnapshot()` deletes **every** cache: `caches.keys()` → `ks.map(
  delete)` with **no filter** (all of Cache Storage is snapshot territory; the
  status record is IndexedDB and untouched).
- `takeSnapshot()` = the shared in-flight `addAll(SNAPSHOT_URLS)` run
  (063 invariant d preserved): install, the reconnect retake and a concurrent
  navigation's take all await the same run — no double-fetching.
- Fires from the persisted record: warm worker (in-memory status = `offline`)
  and freshly relaunched worker (status just read from IndexedDB) take the
  identical branch. Persisted `offline` + a successful network fetch now ⇒
  transition, in either case.

**3. Snapshot is written wholesale ONLY (the per-entry-write ruling).**
- `putCanonical` is deleted, along with the `res.clone()` it needed.
- The only Cache Storage writes in `sw.js` are the two `addAll` call sites
  (install, `takeSnapshot`), each opening a cache for wholesale filling.
- 063's binding guarantees kept untouched: network-first serving (`fetch(`
  before `caches.match(`, guards, `res.ok` gate, `Response.error()` miss),
  every network-served navigation takes the whole snapshot, install remains
  all-or-nothing, activate still destroys every non-current cache, the banned
  stale-while-revalidate/cache-first patterns stay banned.

**4. Snapshot vocabulary.**
- `var SNAPSHOT = 'emplois-snapshot-v1'` (bump-the-suffix comment kept, restated
  for the snapshot), `var SNAPSHOT_URLS = [...]` with **exactly the same 21
  URLs** (content unchanged; only the identifier moves).
- `sw.js` header rewritten to the snapshot model (last snapshot, wholesale
  takes, erased on offline→online, status persisted in IndexedDB, escape hatch
  and file:// notes kept); `js/register.js` header likewise. Our identifiers /
  comments / test messages say "snapshot"; platform Cache API names stay.
- The four HTML registration lines and `serviceWorker.register('sw.js')` are
  untouched (registration still points at `sw.js`).

**5. The erase-then-retake window is documented where it lives** — a comment
at `eraseSnapshot()` stating: online at that moment (network-first serves
regardless), empty-until-retake window, `Response.error()` for a fallback miss
inside it, all-or-nothing retake (never half-written), and the healing order
(served load's chained retake → next network-served navigation's full take →
next offline→online cycle).

**6. Test ruling — `test/offline.test.js` pins that CHANGE (they test the very
thing being amended; precedent: criterion-changes-pinned-fact), by number:**
- **Test 1** (`the service worker ships at the site root with the full
  lifecycle…`): token `CACHE = 'emplois-v1'` → `SNAPSHOT = 'emplois-snapshot-v1'`.
  All other lifecycle tokens survive.
- **Test 2** (`the precache covers every runtime asset…`): name → "the
  snapshot covers every runtime asset and only existing files (issues 063, 070)"; the literal parsed out of `sw.js` is now `var SNAPSHOT_URLS = [`;
  messages say `SNAPSHOT_URLS`. The derivation logic (pages' tags +
  `styles.css` `url(...)`s + `js/data.js` fetch, existence, no duplicates, no
  absolute URLs) survives **in substance unchanged** — it is 063's coverage
  automation and is not being amended.
- **Test 3** (`the fetch handler is network-first with the cache as fallback
  only…`): name → "…with the snapshot as fallback only (issues 063, 070)";
  the `res.ok` gate message is restated for its amended meaning (non-2xx is
  never a status input and never snapshot material — there are no per-entry
  writes left to gate); the **banned-string list gains `'putCanonical'`**
  alongside the surviving `stale-while-revalidate` and `cache-first`.
  Ordering (`fetch(` before `caches.match(`), both guards, `mode === 'navigate'`
  survive as-is.
- **Test 4** (`every page registers the service worker through the shared
  module…`): **survives untouched** (registration mechanics are not amended).
- **Test 5** (`old caches are destroyed on activate and rebuild is
  network-driven…`): name → "…and the snapshot take is network-driven (issues
  063, 070)"; install assertion `c.addAll(PRECACHE)` → `c.addAll(SNAPSHOT_URLS)`;
  the navigation-path assertion reaches the wholesale take via the new wiring
  (`noteOnline(nav)` / `noteOffline(` in the fetch block). The activate slice
  (keys → filter → delete → non-current) and install's `share(` survive.

**7. New tests — exactly four new `test()` blocks (total 5 → 9):**
- **6. status persistence + readback (issue 070):** `sw.js` contains
  `indexedDB.open('emplois-status'`, `readStatus()` invoked at top level
  (`var status = readStatus()`), `writeStatus('online')` AND
  `writeStatus('offline')` in the two note paths, the `'last-online'` key,
  both value literals, no `localStorage`, and both transition log lines
  (`[sw] offline -> online…`, `[sw] online -> offline…`).
- **7. offline → online erases everything before the retake (issue 070):**
  the `noteOnline` body's offline branch chains, in order,
  `writeStatus('online')` → `eraseSnapshot` → `takeSnapshot`; `eraseSnapshot`
  uses `caches.keys()` + `.map(` + `caches.delete(` with **no `.filter(`**
  (proves "ALL", not a subset); the branch condition is `prev === 'offline'`
  (the persisted record, i.e. restart-safe detection).
- **8. the snapshot is written wholesale only (issue 070):** `putCanonical`
  absent; `res.clone(` absent; every line containing `caches.open(` also
  contains `addAll(`; exactly **2** `caches.open(` occurrences (install +
  take) — structurally, no per-entry `cache.put` exists or can be added
  without tripping the pin.
- **9. snapshot vocabulary (issue 070):** `sw.js` + `js/register.js` contain
  no `var CACHE`, no `var PRECACHE`, no `'emplois-v1'`; `sw.js` has
  `var SNAPSHOT =`, `SNAPSHOT_URLS`, `takeSnapshot(`; both headers mention
  "snapshot".

**8. Expected test totals:** baseline re-verify in this worktree **161 pass /
161 / 0 fail / 0 cancelled / 0 skipped** (measured 2026-10-21 before any
change), then **+4 → exactly 165 pass / 0 fail / 0 cancelled / 0 skipped** in
both `node --test` and `node --test test/*.test.js`. No test file other than
`test/offline.test.js` changes.

**9. Scope fences (allowed file list — nothing else, anywhere):** `sw.js`,
`js/register.js`, `test/offline.test.js`, `issues/070-snapshot-erased-on-reconnect.md`
(this issue). Untouchable: the four HTML files (registration lines stay as-is;
HTML heads belong to sibling 066), `js/theme.js`, `styles.css`,
`js/data.js`, redaction, all other tests, `Design.md`, `README.md`, `vendor/`,
`data/`.

**10. Browser verification (Playwright) before the fix entry:** online load
builds the snapshot wholesale (21 entries, record `online`) → server killed by
PID → offline loads serve the snapshot (record flips `offline`) → **while
offline, plant a sentinel entry** (and a stray extra cache, proving "ALL") →
let the worker idle out so it terminates, reload offline to relaunch it (fresh
in-memory context — detection must then come from the persisted record) →
fresh server → next load: transition observed (console line captured from the
worker + record reads `online`), sentinel and stray cache GONE, exactly the 21
wholesale entries present, sampled entries byte-identical to disk → second
online load without an intervening offline period does NOT erase (a probe
entry planted online survives it; no new transition log) → `curl /sw.js` 200 →
server killed by PID.

**Risks / constraints**

- **063 invariants to preserve:** (a) clone-before-respond no longer applies
  (no per-response write exists — the invariant is subsumed); (b) `waitUntil`
  still invoked synchronously with a promise created in the handler — the save
  chain now carries the whole status+erase+take work; (c) navigation takes the
  full snapshot only when the network answered it; (d) one shared in-flight run.
- **Per-navigation take cost unchanged** (063 already accepted a 21-URL refetch
  per online navigation, ~686 KiB, CSV ≈ 40 %); the transition adds one take
  only on the reconnect load, and install-followed-by-reconnect can take twice
  (deploy while offline) — rare, accepted.
- **Status-write failure** degrades to best-effort (chain resolves; worst case
  a missed transition that the next offline→online cycle still performs, since
  the record is rewritten on the next observed change).
- **No new no-gos beyond 063's**, plus: no per-entry `cache.put` of any kind;
  no status storage inside Cache Storage; no exemption clause for any cache
  name in either teardown path.

**Status stays `Open`** until the main agent merges the implementation.

### Maintainer amendment (2026-10-21)

*(Same-day re-evaluation, discovered while verifying the first implementation
cut against the Playwright walk — decision entry above stands except where
this entry amends it.)*

**The walk caught the decision's assumption breaking: "a successful network
fetch" is not the same as "the origin answered".** Measured: with the server
killed (`curl=000`, port free), offline page loads still *rendered* and —
decisively — the snapshot collapsed 21 → 1 entries while the status record
read `online` during the offline period. Mechanism: the worker's plain
`fetch(req)` is answered by the browser's heuristic HTTP cache (no
`Cache-Control` from `python3 -m http.server`; on GitHub Pages the same with
`max-age=600`) *without contacting the origin*, so 063's "Measured nuance"
(the HTTP-cache hit 063 recorded as "a dev-server characteristic, not a
defect") now fires the offline→online transition while still offline: erase
runs, the retake either fails or half-observes, and the empty window of
intent 5 opens **on the wrong side of the transition** — the snapshot torn
down exactly when offline support is needed. Intent 5's premise ("you are
online at that moment") must be *enforced*, not assumed.

**Amendments (both now part of the acceptance criteria):**

**11. The transition may key only on real origin contact.** The fetch handler
uses `fetch(req, { cache: 'no-cache' })`: every network attempt must
revalidate against the origin, so a resolved fetch *means the server
answered* (an HTTP-cache hit can no longer fake `online`), and offline the
attempt genuinely fails (→ record `offline`, snapshot fallback — the offline
walk now actually exercises the snapshot instead of the HTTP cache). Chosen
over `no-store` because `no-cache` keeps 063's accepted cost model
(validators go back → GitHub Pages `304`s on unchanged assets; `no-store`
would forfeit them and download ~686 KiB per navigation) while satisfying
"we never trust our cache": freshness is *proven against the origin every
time*, never taken on trust. Pin added to test 3 (total unchanged: 165).

**12. Status storage must degrade, never wedge.** Verification also hit the
criterion-1 edge concretely: a `db.transaction(...)` throw inside an
`onsuccess` handler (store missing — here provoked by a harness-side
`deleteDatabase` race) left the status promise unsettled *forever*, which
would freeze every future transition in that worker. `readStatus`/
`writeStatus` now wrap their transaction use in `try/catch`, close the
connection on the failure path and always resolve (best-effort as ruled), and
the database opens at **version 2** with an `objectStoreNames` guard in
`onupgradeneeded` so a store-less database left by any other opener of this
name is healed by an upgrade instead of poisoning reads permanently.

### Fix implemented (2026-10-21)

Implementer run (folded with the maintainer role, as authorized) in the
`fix/068-snapshot-model` worktree. **All changes are uncommitted** — the main
agent commits. `Status:` left `Open` for the main agent to flip at merge.

**Allowed files touched — exactly four, verified** (`find . -type f -not -path
'./.git/*' -newer <pre-edit snapshot>`): `sw.js`, `js/register.js`,
`test/offline.test.js`, `issues/070-snapshot-erased-on-reconnect.md` (this
file). The four HTML registration lines, `js/theme.js`, `styles.css`,
`js/data.js`, `Design.md`, `README.md`, all other tests: untouched.

**Checklist — every numbered criterion → met (evidence).**

1. **Persisted + logged status — met.** IndexedDB record db `emplois-status`,
   store `kv`, key `last-online` → `'online'|'offline'`; `var status =
   readStatus();` at worker top level (every relaunch re-reads it);
   `console.log` lines on both transitions and first observations; the record
   was read back from the page in the walk at every phase (`online` →
   `offline` → `online`); no `localStorage.` access (pinned).
2. **Offline → online erases ALL, then retakes — met.** `noteOnline` chains
   `writeStatus('online')` → `eraseSnapshot()` → `takeSnapshot()` under
   `prev === 'offline'`; `eraseSnapshot` maps `caches.keys()` with **no
   filter**; `takeSnapshot` is the shared in-flight `addAll` (063 inv d).
   Browser-proven: sentinel entry AND a stray extra cache both GONE after
   reconnect, exactly 21 entries back, both in a warm-worker and a
   restarted-worker instance (see walk §3–4).
3. **Wholesale-only writes — met.** `putCanonical` and `res.clone()` deleted;
   exactly two `caches.open(` sites, each a one-line `addAll` (pinned by test
   8); network-first ordering, guards, `res.ok` gate, `Response.error()` miss
   and the banned-pattern strings all kept (tests 3/5).
4. **Vocabulary — met.** `SNAPSHOT = 'emplois-snapshot-v1'`,
   `SNAPSHOT_URLS` (same 21 URLs — content unchanged), `takeSnapshot()`,
   `eraseSnapshot()`; headers of `sw.js` + `js/register.js` rewritten to the
   snapshot model; platform `caches.*` names kept; registration lines
   untouched. The rename itself makes `emplois-v1` non-current → activate
   deletes it (063 mechanism, doing the amendment's teardown across the
   rename).
5. **Empty window documented — met.** Comment block above `eraseSnapshot()`
   states: online at that moment, empty-until-retake window,
   `Response.error()` for a miss inside it, all-or-nothing retake, and the
   healing order (chained retake of the served load → next network-served
   navigation's take → next offline→online cycle); record written *before*
   the erase so it keeps reporting the true fetch outcome.
6. **Pinned facts updated by number — met:** test 1 (cache-name token →
   `SNAPSHOT = 'emplois-snapshot-v1'`); test 2 (name + literal parse
   `PRECACHE` → `SNAPSHOT_URLS` + messages; derivation logic in substance
   unchanged); test 3 (name, `res.ok` message restated, banned list gains
   `'putCanonical'`, plus the amendment-11 `cache: 'no-cache'` pin); test 5
   (name, `c.addAll(SNAPSHOT_URLS)`, nav path reaches `noteOnline(nav)` /
   `noteOffline(`). **Test 4 survives untouched**, as ruled.
7. **Four new tests — met:** #6 status persistence+readback (incl. both log
   lines + no `localStorage.` access), #7 full erase (branch on persisted
   record, write→erase→take order, **no `.filter(`** in the erase),
   #8 wholesale-only (no `putCanonical`, no `res.clone(`, exactly 2
   `caches.open(` lines each with `addAll(`, exactly 2 `addAll(`), #9
   snapshot vocabulary (banned `var CACHE` / `var PRECACHE` / `'emplois-v1'`
   in both files, required snapshot identifiers, both headers mention
   "snapshot").
8. **Totals — met:** baseline re-verified before changes **161/161/0**;
   final, both invocations: **165 pass / 165 / 0 fail / 0 cancelled / 0
   skipped** (`node --test` and `node --test test/*.test.js`), i.e. exactly
   +4.
9. **Scope fences — met** (four-file check above; sibling 066's HTML heads +
   `js/theme.js` + `styles.css` untouched; HTML registration lines as-is).
10. **Browser verification — met** (full walk below).
11. **Origin-contact detection — met** (`fetch(req, { cache: 'no-cache' })` +
    test-3 pin): walk §2 proves the pre-fix failure (false transition with the
    server down) and the post-fix behavior (server down ⇒ every fetch fails ⇒
    record flips `offline`, snapshot untouched at 21 entries).
12. **Storage degrades, never wedges — met:** both helpers guard `open` and
    transaction use with `try/catch`, close the connection on every path, and
    always resolve; DB opens at version 2 with an `objectStoreNames` guard in
    `onupgradeneeded` (heals a store-less older database — this heal was
    exercised by the walk's own harness debris).

**Playwright walk (server `python3 -m http.server 8468 --bind 127.0.0.1`,
real PIDs taken from `ss -ltnp` — 1166657, 1167025, 1167212 — killed by PID,
never `pkill -f`):**

1. **Online build (wholesale):** clean slate (unregister + caches wipe +
   `deleteDatabase` awaited to real completion) → load → install's `addAll`
   → `caches.keys()` = `['emplois-snapshot-v1']`, **exactly 21 entries**,
   record `online`, `2093 sessions · 132 teachers` / 132 items, page
   controlled. Worker instrumented (in-memory marker + `console.log` capture).
2. **Offline (server dead — `curl=000`, port free):** index reload →
   `2093 sessions · 132 teachers` / 132 items **from the snapshot**
   (post-`no-cache` these fetches cannot touch the HTTP cache);
   `classes.html` → `2093 sessions · 94 classes` / 94 items; record flips
   **`offline`** (logged); snapshot **still 21 entries** — no false
   transition; sentinel `__sentinel-offline` planted in the snapshot (22
   entries) **and** a stray cache `emplois-stray-068` planted (the "ALL
   storage" proof). Console: only the permitted
   `Failed to update a ServiceWorker` note (one per offline load, 4 across
   the walk), **zero page JS errors**.
3. **SW restart between statuses — proven twice.** (a) *Organic:* after an
   idle period the offline phase was served by a **fresh, markerless
   instance** while the originally instrumented instance's log stayed empty —
   i.e. an instance born after the online phase read/wrote the persisted
   record correctly (record `online` at its startup → `offline` after the
   failed fetches). (b) *Airtight for the transition itself:* after a further
   60 s idle termination + offline-reload relaunch, the instance that fired
   the reconnect transition logged **only** `offline -> online` and no prior
   `online -> offline` line — it never ran `noteOffline`, so its in-memory
   `offline` can only have come from `readStatus()` **at its own startup**,
   from a record written before it existed. Restart-safe detection, from the
   persisted record, observed — not assumed.
4. **Reconnect transition (server restarted, PID 1167025):** first poll after
   the reload → record **`online`**; SW console line captured inside the
   worker: **`[sw] offline -> online: erasing the snapshot and retaking it
   fresh`**; sentinel **GONE**; stray cache **GONE**; exactly **21 entries**
   under the single cache `emplois-snapshot-v1` (exact path set = the 21
   `SNAPSHOT_URLS`); byte-check vs disk **3/3 SHA-256 exact**:
   `styles.css` `b1c11859…33086`, `emplois.csv` `ab9fb940…e1882e`,
   `vendor/dejavu-sans.woff2` `0c4e8ae1…5666a`.
5. **Second online load, no intervening offline ⇒ NO erase:** probe entry
   `__probe-keep` planted online (22 entries) → reload → probe **survives**
   (a navigation's take overwrites the 21 but deletes nothing — only a
   transition erases), record stays `online`, worker log count unchanged
   (no new transition line).
6. **Repeat cycle (also captures the other log line):** server killed by PID
   → offline load → `[sw] online -> offline: the last snapshot now serves`
   captured in the worker, record `offline`, probe untouched, page renders
   offline → server restarted (PID 1167212) → reload → transition #2:
   probe erased, back to exactly 21, record `online`, worker log sequence =
   `[offline -> online, online -> offline, offline -> online]` — the cycle is
   repeatable.
7. **HTTP + teardown:** `curl` → **200** for `/sw.js`, `/js/register.js`,
   the four pages, `/styles.css`, `/emplois.csv`; server killed by recorded
   PID 1167212 → dead, port free, `curl` → `000`.

**Verification (node):** baseline **161/161/0** before any change; after the
change **165/165/0, 0 fail** in **both** `node --test` and `node --test
test/*.test.js` (4 new tests, none removed).

**Deviations:** none. Two discoveries during verification are recorded as the
`Maintainer amendment (2026-10-21)` entry above (the HTTP-cache false-online
→ `cache: 'no-cache'`; the status-chain wedge → guarded helpers + DB v2);
both are part of the shipped code and criteria 11/12. One harness-side
mistake (resolving `deleteDatabase` on `onblocked` early) provoked the wedge
edge case and was corrected in the walk — production code is unaffected by
that harness bug and now heals its residue.

**Exact diff of this fix (4 files; headers normalized to repo-relative paths,
hunks verbatim):**

```diff
--- sw.js (before)
+++ sw.js (after)
@@ -1,15 +1,21 @@
-// sw.js — network-first service worker (issue 063).
-// Online: every response comes from THIS load's network fetch; the cache is
-// rewritten from those bytes (destroy + rebuild), never used to answer a page
-// while the network works. Offline: the cache is the fallback.
+// sw.js — network-first service worker, "last snapshot" model (issues 063 + 070).
+// The stored copy is a SNAPSHOT of the site, never a cache we trust: online,
+// every response comes from THIS load's network fetch and the snapshot is only
+// ever built WHOLESALE (install's all-or-nothing addAll, every network-served
+// navigation's full take, and the erase-everything-then-retake when the
+// recorded status goes offline -> online). Offline, the snapshot is the
+// fallback. The last online status (online vs offline) is persisted in
+// IndexedDB — a worker has no localStorage — so the offline -> online
+// transition is detected even after this worker has been terminated and
+// relaunched, logged, and the snapshot is erased + retaken on every reconnect.
 // file:// is NOT supported (service workers need http/https; localhost counts).
 // Dev escape hatch when the worker gets in the way (browser console):
 //   navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
 //   caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
-var CACHE = 'emplois-v1';           // bump the suffix whenever PRECACHE or the
+var SNAPSHOT = 'emplois-snapshot-v1'; // bump the suffix whenever SNAPSHOT_URLS or the
                                     // handler semantics change (forces a full
-                                    // rebuild + wipes the old cache on activate)
-var PRECACHE = [
+                                    // retake + wipes the old snapshot on activate)
+var SNAPSHOT_URLS = [
   './',
   'index.html', 'classes.html', 'time.html', 'timetable.html',
   'styles.css',
@@ -22,10 +28,10 @@
   'emplois.csv'
 ];
 
-// One shared in-flight precache/rebuild promise: install's addAll, a network
-// navigation's rebuild and concurrent tabs await the SAME run, so the 21 URLs
-// are never fetched twice in parallel (plan invariant d). Cleared when the run
-// settles so the NEXT online navigation rebuilds again.
+// One shared in-flight take: install's addAll, the offline -> online retake,
+// a network navigation's take and concurrent tabs await the SAME run, so the
+// 21 URLs are never fetched twice in parallel (063 plan invariant d). Cleared
+// when the run settles so the NEXT online navigation takes it again.
 var inflight = null;
 function share(p) {
   inflight = p;
@@ -33,43 +39,139 @@
   p.then(done, done);
   return p;
 }
-function rebuild() {
+function takeSnapshot() {
   if (!inflight) {
-    share(caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); }));
+    share(caches.open(SNAPSHOT).then(function (c) { return c.addAll(SNAPSHOT_URLS); }));
   }
   return inflight;
 }
 
-// Closed write set (plan criterion 9): only responses whose path matches an
-// entry of PRECACHE are ever stored, and they are stored under that canonical
-// PRECACHE URL (search stripped) — query strings collapse onto one entry and
-// nothing outside the set can be written. The 2xx gate lives in the fetch
-// handler above this call; no 404/500 body ever reaches here.
-function putCanonical(req, copy) {
-  var pathname = new URL(req.url).pathname;
-  for (var i = 0; i < PRECACHE.length; i++) {
-    var key = new URL(PRECACHE[i], self.location.origin);
-    if (key.pathname === pathname) {
-      return caches.open(CACHE).then(function (c) { return c.put(key, copy); });
+// Issue 070 — erase-then-retake window: at the transition we ARE online
+// (network-first serves every page from the network regardless), but between
+// the deletes below and a completed addAll the snapshot is empty — a network
+// fetch that fails in that window falls back to a miss -> Response.error()
+// (honest failure, no fabricated content). Closest to atomic as the API
+// allows: this runs as one chained erase -> addAll inside the serialized
+// status chain, and addAll is all-or-nothing, so the snapshot is never
+// half-written. It heals: the load being served chains the retake; if that
+// fails, the next network-served navigation takes the whole snapshot anyway
+// (063 inv c), and the next offline -> online cycle re-runs erase+retake.
+// Every cache is snapshot territory — the status record lives in IndexedDB,
+// outside Cache Storage, so this teardown can never erase it.
+function eraseSnapshot() {
+  return caches.keys().then(function (ks) {
+    return Promise.all(ks.map(function (k) { return caches.delete(k); }));
+  });
+}
+
+// --- last online status (issue 070): persisted in IndexedDB, NOT in a cache.
+// db 'emplois-status', store 'kv', key 'last-online' -> 'online' | 'offline'.
+// Storage errors resolve (best-effort) so the chain never wedges: opens and
+// transaction use are guarded, and the connection is closed on every path.
+// Version 2: onupgradeneeded also runs on an upgrade, so a store-less older
+// database (left by any other opener of this name) is healed here too.
+function readStatus() {
+  return new Promise(function (resolve) {
+    try {
+      var req = indexedDB.open('emplois-status', 2);
+      req.onupgradeneeded = function () {
+        if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
+      };
+      req.onerror = function () { resolve(null); };
+      req.onsuccess = function () {
+        var db = req.result;
+        try {
+          var get = db.transaction('kv', 'readonly').objectStore('kv').get('last-online');
+          get.onsuccess = function () {
+            db.close();
+            resolve(get.result === 'online' || get.result === 'offline' ? get.result : null);
+          };
+          get.onerror = function () { db.close(); resolve(null); };
+        } catch (e) { db.close(); resolve(null); }
+      };
+    } catch (e) { resolve(null); }
+  });
+}
+function writeStatus(value) {
+  return new Promise(function (resolve) {
+    try {
+      var req = indexedDB.open('emplois-status', 2);
+      req.onupgradeneeded = function () {
+        if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
+      };
+      req.onerror = function () { resolve(value); };
+      req.onsuccess = function () {
+        var db = req.result;
+        try {
+          var put = db.transaction('kv', 'readwrite').objectStore('kv').put(value, 'last-online');
+          put.onsuccess = function () { db.close(); resolve(value); };
+          put.onerror = function () { db.close(); resolve(value); };
+        } catch (e) { db.close(); resolve(value); }
+      };
+    } catch (e) { resolve(value); }
+  });
+}
+
+// Loaded ONCE per worker start — every relaunch re-reads the persisted record,
+// which is what makes offline -> online detection survive worker restarts —
+// then kept in memory. Every update chains onto it so an erase+retake can
+// never interleave with another transition check.
+var status = readStatus();
+
+// A successful network fetch: record 'online'. On the offline -> online
+// transition (persisted record says offline — warm worker OR freshly
+// relaunched worker) log it, persist it, tear down EVERYTHING and retake the
+// snapshot wholesale; a navigation's take is covered by that same run.
+function noteOnline(nav) {
+  var run = status.then(function (prev) {
+    if (prev === 'offline') {
+      console.log('[sw] offline -> online: erasing the snapshot and retaking it fresh');
+      return writeStatus('online').then(eraseSnapshot).then(takeSnapshot);
     }
-  }
-  return Promise.resolve();
+    var stored = Promise.resolve();
+    if (prev !== 'online') {
+      console.log('[sw] status: online' + (prev === null ? ' (first observation)' : ''));
+      stored = writeStatus('online');
+    }
+    return stored.then(function () {
+      if (nav) return takeSnapshot();   // every network-served navigation takes the whole snapshot
+    });
+  });
+  status = run.then(function () { return 'online'; }, function () { return 'online'; });
+  return run;
+}
+
+// A failed network fetch: record 'offline' (logged + persisted on transition).
+// The offline fallback below is never gated on any of this — status recording
+// is an observability record, not a switch.
+function noteOffline() {
+  var run = status.then(function (prev) {
+    if (prev === 'offline') return undefined;
+    if (prev === 'online') {
+      console.log('[sw] online -> offline: the last snapshot now serves');
+    } else {
+      console.log('[sw] status: offline (first observation)');
+    }
+    return writeStatus('offline');
+  });
+  status = run.then(function () { return 'offline'; }, function () { return 'offline'; });
+  return run;
 }
 
 self.addEventListener('install', function (event) {
   self.skipWaiting();
-  // all-or-nothing precache: any failing URL aborts addAll and writes nothing,
+  // all-or-nothing take: any failing URL aborts addAll and writes nothing,
   // so a failed install leaves the previous generation intact and retries later.
-  event.waitUntil(share(caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); })));
+  event.waitUntil(share(caches.open(SNAPSHOT).then(function (c) { return c.addAll(SNAPSHOT_URLS); })));
 });
 
 self.addEventListener('activate', function (event) {
-  // Every non-current cache is destroyed here. The cache NAME changes with
-  // each PRECACHE/semantics bump, so an entry removed from the list cannot
-  // survive a generation — without ever opening an empty-cache window.
+  // Every non-current cache is destroyed here. The snapshot NAME changes with
+  // each SNAPSHOT_URLS/semantics bump, so an entry removed from the list cannot
+  // survive a generation — without ever opening an empty-snapshot window.
   event.waitUntil(
     caches.keys().then(function (ks) {
-      return Promise.all(ks.filter(function (k) { return k !== CACHE; })
+      return Promise.all(ks.filter(function (k) { return k !== SNAPSHOT; })
        .map(function (k) { return caches.delete(k); }));
      }).then(function () { return self.clients.claim(); })
    );
@@ -81,17 +183,18 @@
   var url = new URL(req.url);
   if (url.origin !== self.location.origin) return;                   // CDN/Google Fonts untouched
   var nav = req.mode === 'navigate';
-  var served = false;
-  var save = Promise.resolve();            // per-branch write, created synchronously (inv. b)
-  var reply = fetch(req).then(function (res) {                       // 1) NETWORK FIRST
-    served = true;
-    if (!res.ok) return res;                                         // never cache 404/500
-    var copy = res.clone();                                          // clone BEFORE respondWith (inv. a)
-    save = putCanonical(req, copy);                                  // 2) rebuild that entry
-    if (nav && served) save = save.then(rebuild);                    // 3) network-served navigation ⇒ rebuild ALL (inv. c)
-    return res;
+  var save = Promise.resolve();            // per-branch work, created synchronously (inv. b)
+  // cache: 'no-cache' (issue 070): every attempt must REVALIDATE with the
+  // origin, so a resolved fetch means the server actually answered — an
+  // HTTP-cache hit must never fake "online" for the status record — while
+  // validators still let the origin answer 304 when nothing changed.
+  var reply = fetch(req, { cache: 'no-cache' }).then(function (res) {  // 1) NETWORK FIRST
+    if (!res.ok) return res;                                         // 404/500: never a status input, never snapshot material
+    save = noteOnline(nav);                                          // 2) record online; transition => erase ALL + retake
+    return res;                                                      //    wholesale inside noteOnline (inv. c)
   }).catch(function () {
-    return caches.match(req, nav ? { ignoreSearch: true } : undefined)  // 4) CACHE FALLBACK
+    save = noteOffline();                                            // 3) record offline (logged + persisted)
+    return caches.match(req, nav ? { ignoreSearch: true } : undefined)  // 4) SNAPSHOT FALLBACK
       .then(function (hit) { return hit || Response.error(); });
   });
   event.respondWith(reply);
--- js/register.js (before)
+++ js/register.js (after)
@@ -1,4 +1,8 @@
-// js/register.js — service-worker registration (issue 063).
+// js/register.js — service-worker registration (issues 063, 070).
+// The worker implements the "last snapshot" model: online always serves from
+// the network and only ever BUILDS the snapshot wholesale; offline serves the
+// snapshot taken at the last online moment, which is erased and retaken from
+// scratch every time the recorded status goes offline -> online (see sw.js).
 // file:// and other non-http(s) origins have no serviceWorker API: guard + catch
 // keep those a silent no-op.
 if ('serviceWorker' in navigator) {
--- test/offline.test.js (before)
+++ test/offline.test.js (after)
@@ -1,14 +1,17 @@
-// Tests for the network-first service worker (issue 063) — run with the other
-// suites: `node --test` / `node --test test/*.test.js`.
+// Tests for the network-first service worker, "last snapshot" model (issues
+// 063 + 070) — run with the other suites: `node --test` / `node --test test/*.test.js`.
 //
 // Source-level pins over sw.js, js/register.js and the four pages: the install/
-// activate/fetch lifecycle, the hand-written PRECACHE literal (its coverage is
-// DERIVED from the pages' tags, styles.css's same-origin url(...)s and
+// activate/fetch lifecycle, the hand-written SNAPSHOT_URLS literal (its coverage
+// is DERIVED from the pages' tags, styles.css's same-origin url(...)s and
 // js/data.js's fetch, so a new asset missing from the list goes red instead of
-// becoming a silent offline hole), network-first ordering with the cache as
-// fallback only (and the banned stale-while-revalidate / cache-first strings
-// absent everywhere), the shared registration tag as each page's last script,
-// and the activate destroy + network-driven navigation rebuild wiring.
+// becoming a silent offline hole), network-first ordering with the snapshot as
+// fallback only (and the banned stale-while-revalidate / cache-first /
+// per-entry-write strings absent everywhere), the shared registration tag as
+// each page's last script, the activate destroy + network-driven navigation
+// take wiring, the persisted online/offline status record, the erase-everything-
+// then-retake transition, wholesale-only snapshot writes, and the snapshot
+// vocabulary itself.
 
 'use strict';
 
@@ -24,14 +27,14 @@
   return fs.readFileSync(path.join(ROOT, rel), 'utf8');
 }
 
-// Parse the PRECACHE array literal out of sw.js (hand-written, no build step).
-function precacheUrls() {
+// Parse the SNAPSHOT_URLS array literal out of sw.js (hand-written, no build step).
+function snapshotUrls() {
   var src = readSrc('sw.js');
-  var block = src.match(/var PRECACHE = \[([\s\S]*?)\];/);
-  assert.ok(block, 'sw.js must declare the hand-written PRECACHE literal');
+  var block = src.match(/var SNAPSHOT_URLS = \[([\s\S]*?)\];/);
+  assert.ok(block, 'sw.js must declare the hand-written SNAPSHOT_URLS literal');
   var urls = [], m, re = /'([^']+)'/g;
   while ((m = re.exec(block[1]))) urls.push(m[1]);
-  assert.ok(urls.length > 0, 'PRECACHE must not be empty');
+  assert.ok(urls.length > 0, 'SNAPSHOT_URLS must not be empty');
   return urls;
 }
 
@@ -44,21 +47,21 @@
   var src = readSrc('sw.js');
   ["self.addEventListener('install'", "self.addEventListener('activate'",
    "self.addEventListener('fetch'", 'skipWaiting', 'clients.claim',
-   'addAll', "CACHE = 'emplois-v1'"].forEach(function (tok) {
+   'addAll', "SNAPSHOT = 'emplois-snapshot-v1'"].forEach(function (tok) {
     assert.ok(src.indexOf(tok) !== -1, 'sw.js must contain ' + tok);
   });
 });
 
-test('the precache covers every runtime asset and only existing files (issue 063)', function () {
-  var urls = precacheUrls();
+test('the snapshot covers every runtime asset and only existing files (issues 063, 070)', function () {
+  var urls = snapshotUrls();
   // './' (bare-origin navigation) plus every other entry as a real file here
-  assert.ok(urls.indexOf('./') !== -1, "'./' must be precached");
+  assert.ok(urls.indexOf('./') !== -1, "'./' must be snapshotted");
   assert.deepStrictEqual(urls.filter(function (u, i) { return urls.indexOf(u) === i; }), urls,
-    'PRECACHE must not contain duplicates');
+    'SNAPSHOT_URLS must not contain duplicates');
   urls.forEach(function (u) {
-    assert.ok(!/^(https?:)?\/\//.test(u), 'no cross-origin/absolute URLs in PRECACHE: ' + u);
+    assert.ok(!/^(https?:)?\/\//.test(u), 'no cross-origin/absolute URLs in SNAPSHOT_URLS: ' + u);
     if (u !== './') {
-      assert.ok(fs.existsSync(path.join(ROOT, u)), 'PRECACHE entry missing on disk: ' + u);
+      assert.ok(fs.existsSync(path.join(ROOT, u)), 'SNAPSHOT_URLS entry missing on disk: ' + u);
     }
   });
 
@@ -73,32 +76,36 @@
     re = /<link\b[^>]*rel="stylesheet"[^>]*\bhref="([^"]+)"/g;
     while ((m = re.exec(html))) { if (isSameOrigin(m[1])) required.push(m[1]); }
   });
-  var css = readSrc('styles.css'), m, re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
+  var css = readSrc('styles.css'), m, re;
+  re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
   while ((m = re.exec(css))) { if (isSameOrigin(m[1])) required.push(m[1]); }
   var fetchTarget = readSrc('js/data.js').match(/fetch\('([^']+)'\)/);
   assert.ok(fetchTarget, 'js/data.js must fetch the CSV');
   required.push(fetchTarget[1].split('?')[0]);
 
   Array.from(new Set(required)).forEach(function (u) {
-    assert.ok(urls.indexOf(u) !== -1, 'PRECACHE misses runtime asset: ' + u);
+    assert.ok(urls.indexOf(u) !== -1, 'SNAPSHOT_URLS misses runtime asset: ' + u);
   });
 });
 
-test('the fetch handler is network-first with the cache as fallback only (issue 063)', function () {
+test('the fetch handler is network-first with the snapshot as fallback only (issues 063, 070)', function () {
   var src = readSrc('sw.js');
   var netAt = src.indexOf('fetch(');
   var cacheAt = src.indexOf('caches.match(');
   assert.ok(netAt !== -1, 'sw.js must fetch(');
   assert.ok(cacheAt !== -1, 'sw.js must caches.match(');
-  assert.ok(netAt < cacheAt, 'network must be tried before the cache falls back');
-  assert.ok(/if \(!res\.ok\)/.test(src), 'the res.ok gate must reject non-2xx from the cache');
+  assert.ok(netAt < cacheAt, 'network must be tried before the snapshot falls back');
+  assert.ok(src.indexOf("cache: 'no-cache'") !== -1,
+    'every fetch must revalidate with the origin — only origin contact may count as online (issue 070)');
+  assert.ok(/if \(!res\.ok\)/.test(src),
+    'the res.ok gate must keep non-2xx responses out of the status record and the snapshot');
   assert.ok(src.indexOf("req.method !== 'GET'") !== -1, 'the non-GET pass-through guard must exist');
   assert.ok(src.indexOf('url.origin !== self.location.origin') !== -1,
     'the cross-origin pass-through guard must exist');
   assert.ok(src.indexOf('req.mode === \'navigate\'') !== -1, 'navigations must be handled');
-  assert.ok(src.indexOf('stale-while-revalidate') === -1,
-    'stale-while-revalidate must appear nowhere in sw.js');
-  assert.ok(src.indexOf('cache-first') === -1, 'cache-first must appear nowhere in sw.js');
+  ['stale-while-revalidate', 'cache-first', 'putCanonical'].forEach(function (tok) {
+    assert.ok(src.indexOf(tok) === -1, 'banned from sw.js (issue 070): ' + tok);
+  });
 });
 
 test('every page registers the service worker through the shared module (issue 063)', function () {
@@ -118,7 +125,7 @@
   });
 });
 
-test('old caches are destroyed on activate and rebuild is network-driven (issue 063)', function () {
+test('old caches are destroyed on activate and the snapshot take is network-driven (issues 063, 070)', function () {
   var src = readSrc('sw.js');
   var actAt = src.indexOf("self.addEventListener('activate'");
   var fetchAt = src.indexOf("self.addEventListener('fetch'");
@@ -132,12 +139,99 @@
 
   var instAt = src.indexOf("self.addEventListener('install'");
   var instBlock = src.slice(instAt, actAt);
-  assert.ok(instBlock.indexOf('c.addAll(PRECACHE)') !== -1,
-    'install must precache via the all-or-nothing addAll(PRECACHE)');
+  assert.ok(instBlock.indexOf('c.addAll(SNAPSHOT_URLS)') !== -1,
+    'install must take the snapshot via the all-or-nothing addAll(SNAPSHOT_URLS)');
   assert.ok(instBlock.indexOf('share(') !== -1,
-    "install's precache must join the shared in-flight run");
+    "install's take must join the shared in-flight run");
 
   var fetchBlock = src.slice(fetchAt);
-  assert.ok(/nav/.test(fetchBlock) && fetchBlock.indexOf('rebuild') !== -1,
-    'the navigation path must reach the full addAll rebuild');
+  assert.ok(/nav/.test(fetchBlock) && fetchBlock.indexOf('noteOnline(nav)') !== -1,
+    'a network-served navigation must reach the wholesale take through noteOnline');
+  assert.ok(fetchBlock.indexOf('noteOffline(') !== -1,
+    'a failed network fetch must record the offline status');
+});
+
+test('the last online status is persisted in IndexedDB and logged on transitions (issue 070)', function () {
+  var src = readSrc('sw.js');
+  assert.ok(src.indexOf("indexedDB.open('emplois-status'") !== -1,
+    'the status record must live in a dedicated IndexedDB database');
+  assert.ok(/var status = readStatus\(\);/.test(src),
+    'every worker (re)start must re-read the persisted record — restart-safe detection');
+  assert.ok(src.indexOf("writeStatus('online')") !== -1, 'online must be persisted');
+  assert.ok(src.indexOf("writeStatus('offline')") !== -1, 'offline must be persisted');
+  assert.ok(src.indexOf("'last-online'") !== -1, 'the record key must exist');
+  assert.ok(src.indexOf("=== 'offline'") !== -1 && src.indexOf("=== 'online'") !== -1,
+    "the record's two values, 'offline' and 'online', must both be read back");
+  assert.ok(src.indexOf('localStorage.') === -1,
+    'workers have no localStorage — no localStorage access may appear in sw.js');
+  assert.ok(src.indexOf('[sw] offline -> online') !== -1,
+    'the offline -> online transition must be logged from the worker');
+  assert.ok(src.indexOf('[sw] online -> offline') !== -1,
+    'the online -> offline transition must be logged from the worker');
+});
+
+test('offline -> online erases every cache before retaking the snapshot (issue 070)', function () {
+  var src = readSrc('sw.js');
+  var n0 = src.indexOf('function noteOnline');
+  var n1 = src.indexOf('function noteOffline');
+  var i0 = src.indexOf("self.addEventListener('install'");
+  var e0 = src.indexOf('function eraseSnapshot');
+  var e1 = src.indexOf('function readStatus');
+  assert.ok(n0 !== -1 && n1 > n0, 'noteOnline and noteOffline must exist in that order');
+  assert.ok(i0 > n1, 'noteOffline must precede the install listener');
+  assert.ok(e0 !== -1 && e1 > e0, 'eraseSnapshot must precede readStatus');
+
+  var note = src.slice(n0, n1);
+  var off = src.slice(n1, i0);
+  var erase = src.slice(e0, e1);
+  assert.ok(note.indexOf("prev === 'offline'") !== -1,
+    'the branch must key off the persisted record, not in-memory-only state');
+  var w = note.indexOf("writeStatus('online')");
+  var e = note.indexOf('eraseSnapshot');
+  var t = note.indexOf('takeSnapshot');
+  assert.ok(w !== -1 && e !== -1 && t !== -1 && w < e && e < t,
+    'the transition must chain persist online -> eraseSnapshot -> takeSnapshot, in that order');
+  assert.ok(off.indexOf("writeStatus('offline')") !== -1, 'the offline record must be persisted');
+  assert.ok(erase.indexOf('caches.keys()') !== -1, 'the erase must enumerate every cache');
+  assert.ok(erase.indexOf('.map(') !== -1, 'the erase must delete via map over the key list');
+  assert.ok(erase.indexOf('caches.delete(') !== -1, 'the erase must destroy via caches.delete(');
+  assert.ok(erase.indexOf('.filter(') === -1,
+    'no filter — ALL snapshot storage is torn down, not a subset');
+});
+
+test('the snapshot is written wholesale only — no per-entry writes (issue 070)', function () {
+  var src = readSrc('sw.js');
+  assert.ok(src.indexOf('putCanonical') === -1,
+    'the per-entry writer must be gone — the snapshot is never patched entry by entry');
+  assert.ok(src.indexOf('res.clone(') === -1,
+    'nothing clones a single response to copy it into the snapshot');
+  var openLines = src.split('\n').filter(function (line) {
+    return line.indexOf('caches.open(') !== -1;
+  });
+  assert.strictEqual(openLines.length, 2,
+    'exactly two cache-open sites exist: install and takeSnapshot');
+  openLines.forEach(function (line) {
+    assert.ok(line.indexOf('addAll(') !== -1,
+      'a snapshot cache may only be opened for a wholesale addAll: ' + line.trim());
+  });
+  assert.strictEqual((src.match(/addAll\(/g) || []).length, 2,
+    'addAll is the only write and appears exactly twice (install + take)');
+});
+
+test('the vocabulary is snapshot, not cache (issue 070)', function () {
+  var sw = readSrc('sw.js');
+  var reg = readSrc('js/register.js');
+  ['var CACHE', 'var PRECACHE', "'emplois-v1'"].forEach(function (tok) {
+    assert.ok(sw.indexOf(tok) === -1, 'sw.js must not carry the cache vocabulary: ' + tok);
+    assert.ok(reg.indexOf(tok) === -1, 'js/register.js must not carry the cache vocabulary: ' + tok);
+  });
+  assert.ok(sw.indexOf('var SNAPSHOT =') !== -1, 'the snapshot name identifier must exist');
+  assert.ok(sw.indexOf('SNAPSHOT_URLS') !== -1, 'the snapshot URL list identifier must exist');
+  assert.ok(sw.indexOf('takeSnapshot(') !== -1, 'the wholesale take must be named as such');
+  var swHead = sw.slice(0, sw.indexOf('var SNAPSHOT'));
+  assert.ok(/snapshot/i.test(swHead),
+    'the sw.js header comment must describe the snapshot model');
+  var regHead = reg.slice(0, reg.indexOf('if ('));
+  assert.ok(/snapshot/i.test(regHead),
+    'the js/register.js header comment must describe the snapshot model');
 });
```

(The fourth file, `issues/070-snapshot-erased-on-reconnect.md`, is this issue
itself — created and appended to by this run: Description/Root cause/Repro
steps first, then the three Discussion entries.)

### Maintainer decision (2026-10-21, numbering)

This issue was drafted in worktree `068-snapshot-model` (branch
`fix/068-snapshot-model`) while a parallel run was landing on main. Main took
number 068 (installable PWA) and 069 (ISIMa logo), so at merge time this issue
is **renumbered 070** and the code self-references say `issues 063 + 070` /
`(issues 063, 070)`. The worktree and branch names above keep their original
`068` labels (they are real filesystem/ref names, not tracker references), and
the embedded diff is the post-rebase form: it also carries the PWA run's
precache entries (26 URLs, `manifest.json` + the four icons) and the adapted
`test/pwa.test.js` pins (`SNAPSHOT_URLS` parse, versioned-snapshot-name regex).
