# 053: Case/whitespace-insensitive subject counts on the teachers page

- Status: Fixed
- Date: 2026-10-19, Reporter: user

## Description

### Observed

The teachers page builds a teacher's "Subjects (ranked by hours)" list and the
"Mostly teaches …" subject line from `subjectCounts`, which is keyed by the
**RAW subject string** — so case/whitespace variants of the same subject split
into separate rows with halved percentages, and the top-subject line can pick
the wrong subject. The module's own contract says the opposite: `normStr` is
documented as "Case/whitespace-insensitive key for teacher names and subjects"
(`js/model.js:16-19`), and the search layer already resolves subjects through
it (`js/match.js:48-50` builds `subjectsByNorm`; `:313`, `:629`, `:635` resolve
subject constraints through `normStr`; `:370`, `:377`, `:663`, `:669` compare
subjects through `normStr`; `teacherAttrCtx` collects per-teacher subjects keyed
by `normStr`, `:361`).

**Everything below marked (executed) was run in node against the real
`emplois.csv` (md5 `41dbe5a8768c08b94872398245cb78f3`, identical in every
current worktree) through the real page modules — the same vm stack as
`test/classes.test.js:23-38` (`data.js` → `libgroups.js` → `model.js` →
`match.js`, then `model.buildAll(store)`). Harness:
`/tmp/opencode/subject-counts-harness.js`.**

#### The three cited examples (executed — all reproduce exactly)

- **Bannour** (24 sessions) — current list (`t.subjects`, exactly what
  `breakdownHTML` renders at `js/teachers.js:233-235`):
  `IoT:Appli et Plates Formes 12h00 (33.3%)` |
  `IoT:Appli et Plates formes 12h00 (33.3%)` | `Atelier Python 9h00 (25.0%)` |
  `Réseaux multimédia 3h00 (8.3%)`. The two IoT spellings differ only in
  `F`/`f`; merged they are 16/24 = **66.7%** in one row, which then correctly
  dominates the list. ("Mostly teaches" happens to keep the same label here —
  `IoT:Appli et Plates Formes` wins the current byte tie-break 12 vs 12 — but
  the two 33.3% rows are shown instead of one 66.7% row.)
- **Ghanmi** (28 sessions) — current list:
  `Electricité - Electronique 18h00 (42.9%)` | `Systèmes Logiques 18h00
  (42.9%)` | `Systèmes logiques 6h00 (14.3%)`. The merged `Systèmes Logiques`
  family is 16/28 = **57.1%** and is the true top subject, but the raw-keyed
  tie at 12 makes the current `topSubject` = `Electricité - Electronique`
  (`js/model.js:136` takes `subjects[0]` of the raw-sorted list), so the page
  says **"Mostly teaches Electricité - Electronique"** while the merged truth
  is **"Mostly teaches Systèmes Logiques (57.1%)"** — the WRONG subject.
- **Maaloul** (26 sessions) — current list:
  `Technologies Web 1 15h00 (38.5%)` | `Services des Réseaux 12h00 (30.8%)` |
  `Services des réseaux 12h00 (30.8%)`. Merged, `Services des Réseaux` is
  16/26 = **61.5%** and is the true top; the current page says "Mostly teaches
  **Technologies Web 1** (38.5%)" — wrong again.

#### Full variant inventory (executed)

Raw distinct subjects: **176**; distinct `normStr` keys: **164**; variant
groups (one `normStr`, >1 raw spelling): **12**, each with exactly two
spellings. No variant spelling appears in a no-professor row, so all-rows
counts = taught-session counts.

| # | norm key | spellings (row counts) | split inside one teacher? |
|---|---|---|---|
| 1 | `admin avancée serv d'entrep` | `Admin Avancée serv d'entrep` (1) ~ `Admin avancée serv d'entrep` (1) | **Ghannay** 1~1 |
| 2 | `cloud et virtualisation` | `Cloud et Virtualisation` (4) ~ `Cloud et virtualisation` (4) | no — Ben Daoud (4) / Ghammem (4) |
| 3 | `déploiement services cloud` | `Déploiement Services Cloud` (2) ~ `Déploiement services Cloud` (2) | no — Adel (2) / Ben Daoud (2) |
| 4 | `fouille de données massives` | `Fouille de données Massives` (2) ~ `Fouille de données massives` (2) | **Hamdani** 2~2 |
| 5 | `frameworks big data` | `Frameworks Big DATA` (2) ~ `Frameworks Big Data` (2) | **Abdelhafidh** 2~2 |
| 6 | `gestion de la production` | `Gestion de la Production` (12) ~ `Gestion de la production` (12) | no — Ben Amor E. (12) / Omezzine (12) |
| 7 | `gestion de projet` | `Gestion de Projet` (8) ~ `Gestion de projet` (8) | no — Ben messaoud C. 2, Ben Messaoud.Ch 2, Hazgui.S 4 / Fitouri M. 8 |
| 8 | `gestion de projets` | `Gestion de Projets` (1) ~ `Gestion de projets` (1) | no — Ben Neji (1) / Ben Krim (1) |
| 9 | `iot:appli et plates formes` | `IoT:Appli et Plates Formes` (8) ~ `IoT:Appli et Plates formes` (8) | **Bannour** 8~8 |
| 10 | `services des réseaux` | `Services des Réseaux` (8) ~ `Services des réseaux` (8) | **Maaloul** 8~8 |
| 11 | `systèmes logiques` | `Systèmes Logiques` (24) ~ `Systèmes logiques` (12) | **Ghanmi** 12~4; also Bayoudh 2, Fnaiech 4, Zaag 6 (Logiques), Sfar 8 (logiques) |
| 12 | `sécurité réseaux sans fils` | `Sécurité Réseaux sans fils` (2) ~ `sécurité Réseaux sans fils` (1) | no — Barboura (2) / Ben Hassine (1) |

**Affected teachers — 6 whose OWN counts split** (executed):
`Abdelhafidh`, `Bannour`, `Ghanmi`, `Ghannay`, `Hamdani`, `Maaloul`.
Row-count change if merged: Abdelhafidh 5→4, Bannour 4→3, Ghanmi 3→2,
Ghannay 5→4, Hamdani 3→2, Maaloul 3→2. `topSubject` **flips** for 2 of them:
Ghanmi (`Electricité - Electronique` → `Systèmes Logiques`) and Maaloul
(`Technologies Web 1` → `Services des Réseaux`); the other 4 keep their top
subject but get merged rows/percentages. Additionally **23 teachers** touch ≥1
session in a variant group (their own lists don't split today, but their rows
carry the corpus's inconsistent spelling).

**Discrepancy with the prior bug hunt's note (re-verified, do not trust it):**
the claimed "17 spelling groups affecting 10 teachers" does **not** reproduce.
Executed: **12 groups / 6 split teachers** with the repo's own `normStr`; six
normalization variants were tried (`normStr`, lowercase+trim, lowercase+no-ws,
lowercase+no-ws+deaccent, and the two punctuation-stripping variants) and no
variant reaches 17/10 — the loosest (punctuation-stripped) gives 14/8. The
same 12/6 holds against the older CSV in worktree `046` (the only worktree
whose `emplois.csv` differs). Rooms, fields and professor names have **0**
variant groups by `normStr`. The directive's three named examples all
reproduce exactly (above); only the aggregate counts differ.

#### Adjacent finding: punctuation variants `normStr` does NOT merge (executed)

Two more intra-teacher spelling splits exist that a case/whitespace-only
`normStr` will still NOT merge — noted for scoping, not decided here:

- **Jrad**: `Prép. à l'env. Professionnel` (9) ~ `Prép à l'env. Professionnel`
  (6) — differs by a period.
- **Achoura**: `Préparation Certif CCNA3` (2) ~ `Préparation Certif. CCNA 3`
  (2) — differs by a period and a space/digit (`CCNA3`/`CCNA 3`).

#### Sibling surface (observed): search suggestions list both spellings (executed)

The suggestion/entry list is built one entry per RAW spelling
(`js/match.js:46-47` collects raw subjects, `:55-56` pushes one `kind:
'subject'` entry each), so executed `match.suggest` returns both variants
side-by-side: `["Systèmes logiques","Systèmes Logiques", …]` for `"sys"`,
`["Services des réseaux","Services des Réseaux"]` for `"services des"`,
`["Gestion de projet","Gestion de Projet","Gestion de projets","Gestion de
Projets"]` for `"gestion de projet"` (the last two are genuinely different
subjects — singular/plural). Constraint *resolution* is already insensitive
(citations above); only the displayed suggestion labels split. Whether this is
folded into the fix is a Maintainer scope decision.

### Expected

Per the user's directive ("make insensitive") — **binding**:

- **Subject counting is case/whitespace-insensitive**, per the module's own
  contract (`normStr`, `js/model.js:16-19`: "Case/whitespace-insensitive key
  for teacher names and subjects"): one row per subject per teacher across all
  case/whitespace spellings, with the merged count and percentage
  (Bannour: one `IoT:Appli et Plates …` row at **66.7%** instead of two at
  33.3%).
- **"Mostly teaches" picks the correct subject**: Ghanmi → `Systèmes Logiques`
  (57.1%), Maaloul → `Services des Réseaux` (61.5%).
- The full variant inventory above collapses accordingly (12 groups, 6
  teachers' lists change; the 4 non-flipping teachers keep their top subject).

**Design decision left to the Maintainer (explicitly NOT decided here):**
which spelling wins the merged row's displayed label. Options observed in the
codebase: (a) **first-seen variant** in the teacher's session/fused order;
(b) **most-frequent variant** corpus-wide (with a tie-break); (c) the
precedent already set by the search index, which keeps the `localeCmp`-sorted
list's winner in `subjectsByNorm` (`js/match.js:47,50` — executed: e.g.
`Systèmes Logiques`, `IoT:Appli et Plates Formes`). Counting/unification is
mandatory; the label choice is not.

## Root cause

`Teacher` counts subjects by raw string identity (`js/model.js:123-140`):

- `js/model.js:128-131` — `var sc = {}, i; for (i = 0; i < sessions.length;
  i++) sc[sessions[i].subject] = (sc[sessions[i].subject] || 0) + 1;
  this.subjectCounts = sc;` — the key is the raw `subject` string, never
  normalized. Two spellings that differ only in case create two buckets.
- `js/model.js:133-135` — `this.subjects` sorts the raw keys (`sc[b]-sc[a]`
  then byte tie-break) and maps them to `Subject` objects (`js/model.js:44-49`:
  `{name, sessions, hours, share}`, `share = sessions / totalSessions`), so
  each split bucket renders its own row with its own (halved) `share`.
- `js/model.js:136` — `this.topSubject = this.subjects[0]`; on a split tie the
  byte tie-break compares the *raw* spellings (Ghanmi: `Electricité…` < `Systèmes…`
  at 12 vs 12), picking a subject whose merged family is strictly larger —
  hence the wrong "Mostly teaches".
- The helper that would fix it already exists and is exported:
  `normStr` (`js/model.js:17-19`, exported `js/model.js:599`) — the very helper
  the contract comment at `:16` describes, and the one the search layer uses
  everywhere (see Observed). No new helper is needed.

**Consumers (blast radius, grep-verified):**

- `subjectCounts` itself has **no reader outside the constructor**
  (grep `subjectCounts` → only the write at `js/model.js:131`; the name
  `subTeaches` does not exist anywhere). Its observable output is the derived
  pair `this.subjects` / `this.topSubject`:
  - `js/teachers.js:232-236` — `breakdownHTML` renders `t.subjects` (name,
    `hoursLabel(s.sessions)`, `(s.share * 100).toFixed(1) + '%'`);
  - `js/teachers.js:265-267` — `showTeacher` renders the first "Mostly
    teaches" line from `t.topSubject.name` (the second line at `:268-269` is
    the CLASS line from `topClass`, keyed by libgroups node keys — insensitive
    by construction, untouched).
- Purity/testability: `Teacher(name, sessions, grouping)` is a pure function of
  its inputs (no DOM, no clock) and is exported (`js/model.js:602`), so the
  counting logic is unit-testable in node against the real CSV exactly like the
  existing suites do (`test/classes.test.js:23-38` loader).

**What else keys by raw subject (in-scope vs out-of-scope, for the
Maintainer):**

- `js/data.js:44-50,67` — `store.subjects` raw distinct list: **no consumer**
  (grep-verified; `match.js` rebuilds its own list).
- `js/match.js:46-56` — search's own raw list drives the `kind:'subject'`
  *entries* (suggestion labels; see Observed sibling surface) — resolution
  paths are already insensitive (`:313`, `:361`, `:370`, `:377`, `:629`,
  `:635`, `:663`, `:669`); `matchTeacher`'s per-teacher `sset` is raw-keyed
  (`:193-197`) but its exact checks normalize (`:216`, `:240`, `:255`), so only
  its displayed `subjectMatches` labels (`:211-216`) can double-list variants.
- `js/model.js:168-172` `fusionKey` includes the raw subject, and
  `:300,`:305,`:313` join distinct raw subjects with `' or '` — but executed:
  **0** `(professor, day, time)` buckets and **0** stage-1 groups in today's
  CSV contain case/whitespace-variant subjects, so `fuseSessions` output is
  unaffected by this data (future data could hit it — a note, not a required
  change).
- Order-only raw comparisons (deterministic tie-breaks, not counts):
  `js/model.js:333-334` (`cmpFusedSession`), `:394` (`classWeek` sort).
- Per-session row displays keep showing each row's own raw subject —
  `js/teachers.js:303`, `js/classes.js:252,301`, `js/app.js:124,160` — and the
  summary capsules `js/model.js:563,570` display `s.subject` raw. These are
  displays of individual sessions, not counts.

**Scope boundary (what insensitive must and must NOT change):** counting and
unification inside `Teacher` — yes (merged rows, correct `share`, correct
`topSubject`); the merged row's displayed spelling — a Maintainer design
decision (options in Expected); search suggestions, fusion behavior, ordering
tie-breaks, and per-session row/capsule displays — unchanged unless the
Maintainer explicitly widens the scope.

**Tests that touch this area (grep `test/` for `subjectCounts` / `Mostly
teaches` / `subTeaches` / `topSubject`):** no test pins the counted VALUES —
`subjectCounts`, `subTeaches` and the "Mostly teaches" text appear in **zero**
tests. Only structural pins exist:
`test/teacher-daygroups.test.js:46` (slices `function breakdownHTML(t)` out of
the real source), `:136` (`breakdownHTML(t)` call must be kept), `:261`
(the rendered HTML must contain the `Subjects (ranked by hours)` heading).
Baseline in this worktree (executed): `node --test` → **103 tests, 103 pass,
0 fail**. `test/fusion.test.js:53,65,78,102,110` pins `fuseSessions`
subject joining — a different subsystem, zero-diff expected.

## Repro steps

Commands (from the worktree root
`/home/user/.local/share/opencode/worktree/1de5bb/053-subject-counts`):

```
node --test                        # baseline: 103 tests, 103 pass, 0 fail
python3 -m http.server 8000
curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/index.html   # 200
```

Node harness (the executed confirmation; same loader as
`test/classes.test.js:23-38`) — full version at
`/tmp/opencode/subject-counts-harness.js`:

```js
var fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
var ROOT = '/home/user/.local/share/opencode/worktree/1de5bb/053-subject-counts';
var ctx = { console: console }; vm.createContext(ctx);
['js/data.js', 'js/libgroups.js', 'js/model.js', 'js/match.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
});
var TT = ctx.TT, model = TT.model, data = TT.data;
var store = data.createStore(fs.readFileSync(path.join(ROOT, 'emplois.csv'), 'utf8'));
var t = model.buildAll(store).teachers['Ghanmi'];
t.subjects.forEach(function (s) {
  console.log(s.name, s.sessions, (s.share * 100).toFixed(1) + '%');
});
console.log('Mostly teaches:', t.topSubject.name);
// observed: "Electricité - Electronique 12 42.9%" |
//           "Systèmes Logiques 12 42.9%" | "Systèmes logiques 4 14.3%"
//           Mostly teaches: Electricité - Electronique   <-- wrong
// expected: "Systèmes Logiques 16 57.1%" (one row) and
//           Mostly teaches: Systèmes Logiques
```

Browser steps (executed via the harness above; page serves confirmed with
`curl` → 200):

1. Open http://localhost:8000/index.html, type `Ghanmi` in the teacher
   search, let the single result auto-open. Observed: "Mostly teaches
   Electricité - Electronique"; the "Subjects (ranked by hours)" list shows
   `Systèmes Logiques 18h00 (42.9%)` and `Systèmes logiques 6h00 (14.3%)` as
   separate rows. Expected: one `Systèmes Logiques … (57.1%)` row and
   "Mostly teaches Systèmes Logiques".
2. Repeat with `Bannour`: observed two rows `IoT:Appli et Plates Formes
   12h00 (33.3%)` / `IoT:Appli et Plates formes 12h00 (33.3%)`. Expected: one
   row at 66.7%.
3. Repeat with `Maaloul`: observed `Services des Réseaux 12h00 (30.8%)` and
   `Services des réseaux 12h00 (30.8%)` as separate rows and "Mostly teaches
   Technologies Web 1". Expected: one `Services des Réseaux … (61.5%)` row
   and "Mostly teaches Services des Réseaux".

## Discussion

### Maintainer decision (2026-10-19)

Round 1 — final decision, no outstanding requests; the Implementer may act on
the criteria below. I re-verified the Reporter's analysis on this tree
(post-`a259c71`): the constructor defect is exactly at `js/model.js:128-136`,
`normStr`/`cmpByte` sit at `:16-19`/:22 with `normStr` exported at `:599`,
`subjectCounts` has no reader outside the constructor (grep-verified: the only
other reference to `topSubject` in code is the read at `js/teachers.js:267`),
and the baseline is 103/103 passing tests. I executed the proposed semantics
against the real `emplois.csv` (md5 `41dbe5a8768c08b94872398245cb78f3`)
through the real `model.buildAll` stack; every expected value in the criteria
below is an executed fact, not a derivation. On the inventory discrepancy: the
directive's "17 groups / 10 teachers" does not reproduce and the Reporter's
re-executed **12 groups / 6 split teachers** stands; what binds is the
directive's substance — counting must be case/whitespace-insensitive — not the
stale aggregates.

**Verdict**

- **VALID, in scope, as requested** ("make insensitive"). The code contradicts
  the module's own contract: the header comment promises a "Case/
  whitespace-insensitive key for teacher names and subjects"
  (`js/model.js:16-19`) and the search layer already honors it
  (`subjectsByNorm`, `js/match.js:48-50`), but `Teacher` counts by raw string
  identity (`js/model.js:128-131`). Ghanmi and Maaloul get a demonstrably
  wrong "Mostly teaches" line; six teachers' lists are split. Fixing the
  counting layer makes the code match its documented contract — this is the
  rare case where the shallow fix IS the architecturally right fix.
- *Teacher names need nothing.* Code path verified: `store.teachers` is an
  exact-string, localeCmp-sorted distinct list (`js/data.js:47,52`), each
  `Teacher` receives one canonical name from it (`js/model.js:157-159`), and
  name resolution for search already normalizes (`teachersByNorm`,
  `js/match.js:49`). The Reporter executed 0 name-variant groups in the CSV.
  The contract sentence needs no narrowing.
- *The fix belongs at render/analysis time, not in the parser.* `data/extract.py`
  and `emplois.csv` are out of scope by rule: the CSV is the single source of
  truth and re-parsing rewrites every row's `source` and history plus every
  fixture hash pinned to it; parser-level cleanup would also rewrite the
  per-session display text the site deliberately shows raw. And it could never
  be the only line of defense — future PDFs will bring fresh spelling
  variants, so the counting layer must be insensitive regardless. The search
  layer already made this same bet (`normStr` at resolution time); counting
  follows suit.
- *Punctuation variants stay split.* `normStr` remains case/whitespace-only;
  Jrad's and Achoura's period-differing pairs are not merged. Widening
  `normStr` would silently change subject/class resolution across the whole
  search layer (`js/match.js` compares through it everywhere) — a different,
  riskier decision that belongs to its own issue (and `js/match.js` is
  sibling issue #055's file). The two named pairs are honest known-splits.

**Architectural direction**

1. *One fix, at the counting site.* Key `Teacher`'s `subjectCounts` by
   `normStr(subject)` (`js/model.js:128-131`) and carry a label map for
   display; the ranking (`:132-135`) sorts merged buckets and maps to
   `Subject` with the stored label. No new helper — `normStr` and `cmpByte`
   already exist and are in scope. `this.subjectCounts` becomes
   norm-keyed (documented in the comment); it has no external readers
   (grep-verified above), so the contract change is safe and the name
   now matches the contract it was always described by.
2. *Label rule: byte-smallest spelling the teacher is scheduled under*
   (`cmpByte`), chosen while counting. Rationale, in the order I ruled:
   (a) **byte-order is the house canonical-key comparator** — the file's own
   comment establishes `cmpByte` for canonical decisions "locale-independent"
   (`js/model.js:21-22`) while `localeCmp` is used for display lists only;
   (b) `localeCmp` is rejected — executed in this environment it orders the
   title-case spelling *last* (`localeCmp("Systèmes Logiques",
   "Systèmes logiques") === 1`) and its result is ICU-locale-dependent, so it
   cannot anchor a canonical choice; (c) **first-seen in CSV session order**
   (deterministic — `sessionsOf` preserves row order, `js/data.js:54-57`) is
   rejected because it picks the *minority* spelling for two of the three
   named examples (Ghanmi → "Systèmes logiques", Maaloul → "Services des
   réseaux"), contradicting this issue's own Expected/repro steps; (d)
   **corpus-majority** is rejected because `Teacher` only receives the
   teacher's own sessions — it would require a signature change to plumb
   corpus knowledge for zero user value. Executed: the byte-smallest rule
   produces exactly the Expected spellings — Bannour "IoT:Appli et Plates
   Formes", Ghanmi "Systèmes Logiques", Maaloul "Services des Réseaux" —
   and is per-teacher, so a teacher who only ever sees one spelling simply
   shows it (honest: the label is always a spelling their own timetable
   uses).
3. *Ranking stays "count desc, ties byte-alphabetical" — tie-broken on the
   display label.* Executed: with this rule, every unaffected teacher's list
   stays byte-identical to today, and only the 6 affected teachers change
   (rows collapse, total corpus subject rows 272 → 266, one merge per
   affected teacher). `topSubject = subjects[0]` (`:136`) is untouched and
   becomes correct by construction.
4. *Percentages: no rounding rule changes.* `js/teachers.js:235` keeps
   `(s.share * 100).toFixed(1)`; merged buckets partition `totalSessions`, so
   shares sum to 1, and executed values for all six affected teachers sum to
   exactly 100.0 at one decimal.
5. *Scope of raw-keyed aggregations: `subjectCounts` only.* Siblings
   checked and explicitly ruled out: `fusionKey` includes the raw subject
   (`js/model.js:168-172`) — that is fusion *identity*, the pinned
   `test/fusion.test.js:53,65,78,102,110` subsystem (owned by sibling #052),
   and the Reporter executed 0 variant-subject buckets in today's CSV;
   `store.subjects` (`js/data.js:44-50,67`) has no consumer; the search
   *suggestion labels* list raw spellings (`js/match.js:46-56`) — display of
   corpus variants in a sibling-owned file, may be folded into #055 or filed
   separately, not decided here; per-session displays (`js/teachers.js:303`,
   `js/classes.js:252,301`, `js/app.js:124,160`, capsules `js/model.js:562-571`)
   and order-only raw comparisons (`:333-334`, `:394`) stay raw by design.
6. *Rejected: upstream subject normalization* (rewrite `s.subject` at
   store/model-build time). It would change every per-session display, change
   fusion semantics (tripping the pinned fusion tests), relabel the search
   index, and effectively contradict the CSV's own text — a corpus-wide
   rewrite to serve one counting bug. The site's data model treats raw
   spelling as the session-level display value; counting is where
   insensitivity belongs.

**Acceptance criteria** (for a blind Implementer; line numbers are
pre-change and may drift below `:136` as a consequence of criterion 1 —
anchor on the code, not the numbers)

1. In `js/model.js`, replace ONLY the counting block inside `Teacher`
   (current lines 128-135: the `var sc = {}, i;` loop through the
   `.map(function (s) { return new Subject(...) }, this)` statement) with:

   ```js
       // Issue 053: subject counting is case/whitespace-insensitive —
       // buckets are keyed by normStr(subject) (this file's header
       // contract), one row per subject across all case/whitespace
       // spellings. The displayed label is the byte-smallest spelling this
       // teacher is scheduled under (cmpByte, the locale-independent
       // canonical-key comparator); rankings tie-break on that label,
       // exactly like before.
       var sc = {}, lab = {}, k, i;
       for (i = 0; i < sessions.length; i++) {
         k = normStr(sessions[i].subject);
         sc[k] = (sc[k] || 0) + 1;
         if (!(k in lab) || cmpByte(sessions[i].subject, lab[k]) < 0) lab[k] = sessions[i].subject;
       }
       this.subjectCounts = sc;
       // subjects ranked by hours, ties byte-alphabetical, share of total
       this.subjects = Object.keys(sc).sort(function (a, b) {
         return (sc[b] - sc[a]) || cmpByte(lab[a], lab[b]);
       }).map(function (s) { return new Subject(lab[s], sc[s], this.totalSessions); }, this);
   ```

   Keep `this.subjectCounts = sc;` and `this.topSubject = ...` (line 136)
   exactly where they are. Do not touch `Subject` (`:44-49`), `normStr`
   (`:16-19`), `fusionKey` (`:168-172`), the teacher-summary region
   (`:577-596`, sibling #052's), or the export list (`:598-613`). **No new
   exports** — `normStr` (`:599`) and `cmpByte` (`:599`) are already
   exported and already in scope inside the IIFE.
2. Add a NEW file `test/teacher-subjects.test.js` (new file = zero merge
   collision with #051/#052/#055). Copy the house loader from
   `test/classes.test.js:23-38` verbatim (vm stack `js/data.js` →
   `js/libgroups.js` → `js/model.js` → `js/match.js`, `CSV_PATH`/`ROOT`,
   `data.createStore`, `model.buildAll(store)`, and the `main()` array
   helper). Exactly five tests, with these exact executed expectations:

   - `test('subject rows merge case/whitespace variants (issue 053: Bannour)', ...)` —
     `Bannour`: `deepStrictEqual(main(t.subjects.map(s => [s.name, s.sessions])),
     [['IoT:Appli et Plates Formes', 16], ['Atelier Python', 6],
     ['Réseaux multimédia', 2]])`; `(t.subjects[0].share * 100).toFixed(1) === '66.7'`;
     `t.topSubject.name === 'IoT:Appli et Plates Formes'`.
   - `test('merged counts pick the true top subject (issue 053: Ghanmi)', ...)` —
     rows `[['Systèmes Logiques', 16], ['Electricité - Electronique', 12]]`;
     share `'57.1%'`; `topSubject.name === 'Systèmes Logiques'`.
   - `test('merged counts pick the true top subject (issue 053: Maaloul)', ...)` —
     rows `[['Services des Réseaux', 16], ['Technologies Web 1', 10]]`;
     share `'61.5%'`; `topSubject.name === 'Services des Réseaux'`.
   - `test('the remaining split teachers merge without flipping their top (issue 053)', ...)` —
     Abdelhafidh: rows `[['Programmation Java', 8], ['Programmation OO', 8],
     ['Frameworks Big DATA', 4], ['Sécurité IoT', 4]]`, length 4, top
     `'Programmation Java'`; Ghannay: rows `[['Virtualisation et conteneur', 4],
     ['Adm. serv. rés. sous Win', 2], ['Admin Avancée serv d'entrep', 2],
     ['Virtualisation Avancée', 2]]`, length 4, top `'Virtualisation et conteneur'`;
     Hamdani: rows `[['Fouille de données Massives', 4],
     ['Machine Learning 2', 2]]`, length 2, top `'Fouille de données Massives'`.
   - `test('every teacher has one row per normalized subject with shares summing to 1 (issue 053)', ...)` —
     over all teachers of `modelObjs.teachers`: (a) every
     `Object.keys(t.subjectCounts)` key `k` satisfies `k === model.normStr(k)`;
     (b) no two `t.subjects` rows share a `normStr` name; (c) every row name
     is a spelling present in `t.sessions`; (d) non-empty teachers' shares
     sum to 1 (±1e-9); (e) `t.topSubject === t.subjects[0]`; (f) corpus pins:
     `store.teachers.length === 132` and the summed subject-row count over
     all teachers `=== 266` (executed on the current CSV).
3. Run `node --test`: expected **108 tests, 108 pass, 0 fail** (executed
   baseline 103 + exactly these 5 new tests). No existing test may change or
   fail — grep-verified: no current test pins subject values; the only
   "Systèmes…" pins are `test/fusion.test.js:102,110` ("Systèmes
   d'exploitation", a different subject in the untouched fusion subsystem),
   and `test/teacher-daygroups.test.js:261` pins only the
   `Subjects (ranked by hours)` heading, which stays.
4. Serve and curl: from the worktree root, `python3 -m http.server 8000`;
   `curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/index.html`
   → 200 and the same for `http://localhost:8000/classes.html` → 200 (both
   pages load `model.js`). Kill the server by its PID afterwards; never
   `pkill -f` (self-match).
5. Diff hygiene: exactly two files — `js/model.js` (edit confined to the
   criterion-1 block in the `Teacher` constructor) and the new
   `test/teacher-subjects.test.js`. Nothing else: no `js/teachers.js`, no
   `js/match.js`, no `js/app.js`, no `data/*`, no `emplois.csv`, no
   `Design.md`, no other issue files, no CSS/HTML.
6. Sibling boundaries (state in the fix entry for merge reconciliation):
   #052 owns the `teacherSummary` region of `js/model.js` (~`:577-596`
   pre-change) plus `test/fusion.test.js` and `Design.md`; #055 owns
   `js/match.js`, `js/app.js`, and the Design.md Classes section; #051 owns
   `js/classes.js`, `js/app.js`, `js/teachers.js` (clock) and their page
   tests. This fix's `js/model.js` region (the `Teacher` constructor
   counting block) is disjoint from all of them, and the export list is
   untouched, so merges reconcile by content; below `:136` line numbers may
   shift — do not let any merge rely on them.
7. Append a `### Fix implemented (2026-10-19 or later)` entry with the exact
   diff and the executed results (per AGENTS.md); do not commit — the main
   agent merges and flips `Status:`.
8. No-go: do not widen `normStr`; do not touch `fusionKey` or fusion
   behavior; do not normalize any `s.subject` anywhere upstream; do not add
   special cases for particular spellings (e.g. "Frameworks Big DATA" stays
   as the byte-smallest label — that is the rule working, not a bug); do not
   "fix" the punctuation pairs (Jrad, Achoura).

**Risks / constraints**

- `subjectCounts` changes key space (raw → norm). Safe today — no external
  readers, grep-verified on this tree — but it is a public property; the
  criterion-1 comment must say the keys are normalized so a future consumer
  cannot mistake them for display spellings.
- The label is display-only: two teachers sharing a variant subject can show
  different labels when one never sees the winning spelling (e.g. Sfar shows
  "Systèmes logiques"). Accepted — the label is always a real spelling of
  that teacher's own timetable; do not plumb corpus-wide label consensus.
- The merged label can be the uglier spelling by luck of byte order
  (executed: Abdelhafidh shows "Frameworks Big DATA"). Accepted cost of a
  deterministic, locale-independent rule; no special-casing (criterion 8).
- Row order changes for the 6 affected teachers (merges reorder rows);
  executed: all other teachers' lists are byte-identical.
- The corpus pins in test 5(f) (132 teachers / 266 rows) are fixtures of the
  current `emplois.csv` (md5 `41dbe5a8768c08b94872398245cb78f3`); regenerating
  the CSV requires re-running and updating them — the same contract every
  existing real-CSV test already carries.
- `fusionKey` keeps the raw subject: future data with case-variant subjects
  in one fusion bucket would show `' or '`-joined spellings. Zero such
  buckets today (executed by the Reporter); that is a fusion concern and
  would collide with #052's subsystem — noted, not fixed here.

### Fix implemented (2026-10-19)

Note: this run is an audit-and-finish pass over an interrupted Implementer
run — the code changes (`js/model.js`, new `test/teacher-subjects.test.js`)
were already in the working tree; I audited them against every numbered
criterion, finished the verification/entry criteria, and changed no code
(the working diff below is byte-identical to what the interrupted run left).
`Status:` untouched (main agent flips it at merge); nothing committed.

**Exact diff (vs base `a259c71` — reproduced with `diff -u`; `js/model.js`
base verified identical to main's copy, since merged #056 does not touch it):**

```diff
--- a/js/model.js
+++ b/js/model.js
@@ -125,14 +125,24 @@
     this.sessions = sessions;
     this.totalSessions = sessions.length;
     this.totalHours = this.totalSessions * HOURS;
-    var sc = {}, i;
-    for (i = 0; i < sessions.length; i++)
-      sc[sessions[i].subject] = (sc[sessions[i].subject] || 0) + 1;
+    // Issue 053: subject counting is case/whitespace-insensitive —
+    // buckets are keyed by normStr(subject) (this file's header
+    // contract), one row per subject across all case/whitespace
+    // spellings. The displayed label is the byte-smallest spelling this
+    // teacher is scheduled under (cmpByte, the locale-independent
+    // canonical-key comparator); rankings tie-break on that label,
+    // exactly like before.
+    var sc = {}, lab = {}, k, i;
+    for (i = 0; i < sessions.length; i++) {
+      k = normStr(sessions[i].subject);
+      sc[k] = (sc[k] || 0) + 1;
+      if (!(k in lab) || cmpByte(sessions[i].subject, lab[k]) < 0) lab[k] = sessions[i].subject;
+    }
     this.subjectCounts = sc;
     // subjects ranked by hours, ties byte-alphabetical, share of total
     this.subjects = Object.keys(sc).sort(function (a, b) {
-      return (sc[b] - sc[a]) || cmpByte(a, b);
-    }).map(function (s) { return new Subject(s, sc[s], this.totalSessions); }, this);
+      return (sc[b] - sc[a]) || cmpByte(lab[a], lab[b]);
+    }).map(function (s) { return new Subject(lab[s], sc[s], this.totalSessions); }, this);
     this.topSubject = this.subjects.length ? this.subjects[0] : null;
     // class summary (libgroups): per-teacher projected tree + top spec slot
     this.classStats = grouping ? buildTeacherClasses(grouping, sessions) : null;
--- /dev/null
+++ b/test/teacher-subjects.test.js
@@ -0,0 +1,129 @@
+// Tests for case/whitespace-insensitive subject counting on the teachers
+// page (issue 053) — run with `node --test test/`.
+//
+// Teacher.subjectCounts is keyed by normStr(subject) (the module's own
+// header contract), so a teacher's "Subjects (ranked by hours)" rows and
+// topSubject merge case/whitespace variants of the same subject; the
+// merged row's label is the byte-smallest spelling that teacher is
+// scheduled under. Values below are executed against the real
+// emplois.csv through the same vm stack as test/classes.test.js.
+
+'use strict';
+
+var test = require('node:test');
+var assert = require('node:assert');
+var fs = require('node:fs');
+var path = require('node:path');
+var vm = require('node:vm');
+
+var CSV_PATH = path.join(__dirname, '..', 'emplois.csv');
+var ROOT = path.join(__dirname, '..');
+
+// Load the browser script stack (data, libgroups, model, match) into one shared
+// TT context, exactly like classes.html's <script> tags do in the browser.
+// model.js / match.js have no UMD wrapper, so they are eval'd in a vm context
+// whose global carries the shared TT object.
+function loadStack() {
+  var ctx = { console: console };
+  vm.createContext(ctx);
+  ['js/data.js', 'js/libgroups.js', 'js/model.js', 'js/match.js'].forEach(function (f) {
+    var src = fs.readFileSync(path.join(ROOT, f), 'utf8');
+    vm.runInContext(src, ctx, { filename: f });
+  });
+  return ctx.TT;
+}
+
+var TT = loadStack();
+var data = TT.data, model = TT.model, match = TT.match;
+
+var store = data.createStore(fs.readFileSync(CSV_PATH, 'utf8'));
+var modelObjs = model.buildAll(store);
+var index = match.buildIndex(store, modelObjs);
+
+// deepStrictEqual compares prototypes, and values that come out of the vm loader
+// belong to the vm's own Array — convert them to this context before comparing
+// against array literals (two vm-context arrays compare fine as-is).
+function main(arr) { return Array.prototype.slice.call(arr); }
+
+// ---- issue 053: merged subject rows ---------------------------------------
+
+test('subject rows merge case/whitespace variants (issue 053: Bannour)', function () {
+  var t = modelObjs.teachers['Bannour'];
+  // the two IoT spellings (F/f) collapse into one 16/24 bucket
+  assert.deepStrictEqual(main(t.subjects.map(function (s) { return [s.name, s.sessions]; })),
+    [['IoT:Appli et Plates Formes', 16], ['Atelier Python', 6],
+     ['Réseaux multimédia', 2]]);
+  assert.strictEqual((t.subjects[0].share * 100).toFixed(1), '66.7');
+  assert.strictEqual(t.topSubject.name, 'IoT:Appli et Plates Formes');
+});
+
+test('merged counts pick the true top subject (issue 053: Ghanmi)', function () {
+  var t = modelObjs.teachers['Ghanmi'];
+  // merged Systèmes Logiques family (16/28) beats Electricité - Electronique (12)
+  assert.deepStrictEqual(main(t.subjects.map(function (s) { return [s.name, s.sessions]; })),
+    [['Systèmes Logiques', 16], ['Electricité - Electronique', 12]]);
+  assert.strictEqual((t.subjects[0].share * 100).toFixed(1) + '%', '57.1%');
+  assert.strictEqual(t.topSubject.name, 'Systèmes Logiques');
+});
+
+test('merged counts pick the true top subject (issue 053: Maaloul)', function () {
+  var t = modelObjs.teachers['Maaloul'];
+  // merged Services des Réseaux (16/26) beats Technologies Web 1 (10)
+  assert.deepStrictEqual(main(t.subjects.map(function (s) { return [s.name, s.sessions]; })),
+    [['Services des Réseaux', 16], ['Technologies Web 1', 10]]);
+  assert.strictEqual((t.subjects[0].share * 100).toFixed(1) + '%', '61.5%');
+  assert.strictEqual(t.topSubject.name, 'Services des Réseaux');
+});
+
+test('the remaining split teachers merge without flipping their top (issue 053)', function () {
+  var a = modelObjs.teachers['Abdelhafidh'];
+  assert.deepStrictEqual(main(a.subjects.map(function (s) { return [s.name, s.sessions]; })),
+    [['Programmation Java', 8], ['Programmation OO', 8],
+     ['Frameworks Big DATA', 4], ['Sécurité IoT', 4]]);
+  assert.strictEqual(a.subjects.length, 4);
+  assert.strictEqual(a.topSubject.name, 'Programmation Java');
+
+  var g = modelObjs.teachers['Ghannay'];
+  assert.deepStrictEqual(main(g.subjects.map(function (s) { return [s.name, s.sessions]; })),
+    [['Virtualisation et conteneur', 4], ['Adm. serv. rés. sous Win', 2],
+     ['Admin Avancée serv d\'entrep', 2], ['Virtualisation Avancée', 2]]);
+  assert.strictEqual(g.subjects.length, 4);
+  assert.strictEqual(g.topSubject.name, 'Virtualisation et conteneur');
+
+  var h = modelObjs.teachers['Hamdani'];
+  assert.deepStrictEqual(main(h.subjects.map(function (s) { return [s.name, s.sessions]; })),
+    [['Fouille de données Massives', 4], ['Machine Learning 2', 2]]);
+  assert.strictEqual(h.subjects.length, 2);
+  assert.strictEqual(h.topSubject.name, 'Fouille de données Massives');
+});
+
+test('every teacher has one row per normalized subject with shares summing to 1 (issue 053)', function () {
+  var totalRows = 0;
+  Object.keys(modelObjs.teachers).forEach(function (name) {
+    var t = modelObjs.teachers[name];
+    // (a) subjectCounts is keyed by normalized keys (never display spellings)
+    Object.keys(t.subjectCounts).forEach(function (k) {
+      assert.strictEqual(k, model.normStr(k), name + ': non-normalized key ' + k);
+    });
+    // (b) one row per normalized subject, (c) each label is a real spelling
+    var seen = {};
+    t.subjects.forEach(function (s) {
+      var nk = model.normStr(s.name);
+      assert.ok(!seen[nk], name + ': duplicate subject row ' + s.name);
+      seen[nk] = true;
+      assert.ok(t.sessions.some(function (ss) { return ss.subject === s.name; }),
+        name + ': label not among own sessions: ' + s.name);
+    });
+    // (d) merged buckets partition the teacher's sessions
+    if (t.totalSessions) {
+      var sum = t.subjects.reduce(function (acc, s) { return acc + s.share; }, 0);
+      assert.ok(Math.abs(sum - 1) <= 1e-9, name + ': shares sum to ' + sum);
+    }
+    // (e) the "Mostly teaches" subject is the first ranked row
+    assert.strictEqual(t.topSubject, t.subjects[0]);
+    totalRows += t.subjects.length;
+  });
+  // (f) corpus pins on the current emplois.csv
+  assert.strictEqual(store.teachers.length, 132);
+  assert.strictEqual(totalRows, 266);
+});
```

**Acceptance-criteria checklist** (1-8 from the Maintainer decision above):

1. **MET — pre-done by the interrupted run, audited by me.** The diff is a
   single hunk (`@@ -125,14 +125,24 @@`) replacing exactly the lines 128-130
   loop and 134-135 sort/map with the mandated block — byte-for-byte the code
   in criterion 1 (the criterion's fenced copy carries the issue list's
   3-space markdown indent; modulo that indent it is identical). The context
   lines prove `this.subjectCounts = sc;`, the ranking comment, and
   `this.topSubject = …` (base line 136, `this.subjects.length ?
   this.subjects[0] : null`) are unchanged and still in place; `Subject`,
   `normStr`, `cmpByte`, `fusionKey`, the `teacherSummary` region and the
   export list are all outside the hunk — **no new exports**.
2. **MET — pre-done by the interrupted run, audited by me.** New file
   `test/teacher-subjects.test.js` (only file added to `test/`); loader is
   the `test/classes.test.js:19-44` house loader copied verbatim (`loadStack`
   with the `js/data.js → js/libgroups.js → js/model.js → js/match.js` vm
   stack, `CSV_PATH`/`ROOT`, `data.createStore`, `model.buildAll(store)`,
   `match.buildIndex`, the `main()` helper). Exactly 5 `test(...)` calls,
   with the exact names and executed expectations from criterion 2 — Bannour
   (16/6/2, 66.7%, top `IoT:Appli et Plates Formes`), Ghanmi
   (16/12, 57.1%, top `Systèmes Logiques`), Maaloul (16/10, 61.5%, top
   `Services des Réseaux`), Abdelhafidh/Ghannay/Hamdani (rows, lengths 4/4/2,
   tops `Programmation Java` / `Virtualisation et conteneur` /
   `Fouille de données Massives`), and the all-teachers sweep with (a)-(f)
   including the 132-teachers / 266-rows corpus pins.
3. **MET — result pre-done, re-executed by me.** Both invocations below give
   exactly **108 tests, 108 pass, 0 fail** (executed baseline 103 + these 5).
   No existing test file differs from base (see criterion 5 hygiene), so no
   existing test changed.
4. **MET — finished by me.** `python3 -m http.server 8000` from the worktree
   root (background), then:
   `curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/index.html`
   → **200** and `…/classes.html` → **200** (also `/js/model.js` → 200,
   `/styles.css` → 200). Server killed by PID — no `pkill -f`. (First kill
   hit the shell wrapper PID `514631`; the `python3` child `514633` was then
   killed directly and confirmed gone: port 8000 not listening, no
   `http.server` process left.)
5. **MET — verified by me.** No git used: a recursive `diff -rq` of this
   worktree against the main worktree (which is base `a259c71` + merged
   #056) shows differences only in `js/model.js`, new
   `test/teacher-subjects.test.js`, `issues/053-*.md` (this file) — plus
   main-side #056 files (`index.html`, `js/teachers.js`, `styles.css`,
   `test/teacher-daygroups.test.js`, `issues/056-*`), none of which I touched.
   An mtime scan of this worktree finds exactly three files modified after
   worktree creation: `js/model.js`, `test/teacher-subjects.test.js`,
   `issues/053-case-insensitive-subject-counts.md`. Nothing in `data/`,
   `emplois.csv` (md5 still `41dbe5a8768c08b94872398245cb78f3`), `Design.md`,
   HTML/CSS, or other issue files.
6. **Sibling boundaries (as requested, for merge reconciliation):** #052 owns
   the `teacherSummary` region of `js/model.js` (~`:577-596` pre-change) plus
   `test/fusion.test.js` and `Design.md`; #055 owns `js/match.js`,
   `js/app.js`, and the Design.md Classes section; #051 owns `js/classes.js`,
   `js/app.js`, `js/teachers.js` (clock) and their page tests. This fix's
   hunk is only the `Teacher` counting block (base lines 128-135) — disjoint
   from all of them — and the export list is untouched, so merges reconcile
   by content. My hunk adds 10 lines, so line numbers below base `:136` shift
   by +10; do not let any merge anchor on them.
7. **MET — this entry.** Exact diff and executed results above; not committed
   (`Status:` left `Open` for the main agent).
8. **MET — audited.** `normStr` is unchanged (still case/whitespace-only:
   executed raw 176 → 164 norm keys, Jrad/Achoura punctuation pairs still
   split); `fusionKey` and fusion untouched; no `s.subject` rewritten
   anywhere upstream; no per-spelling special case — `Frameworks Big DATA`
   stays as Abdelhafidh's label (executed, byte-smallest rule working).

**Verification results (executed this run):**

- `node --test` → `# tests 108 / # pass 108 / # fail 0`.
- `node --test test/*.test.js` → `# tests 108 / # pass 108 / # fail 0`.
- `curl` → `index.html 200`, `classes.html 200` (server killed by PID after).
- Real-CSV harness (same vm stack as the tests, `emplois.csv` md5
  `41dbe5a8768c08b94872398245cb78f3`): `store.teachers.length = 132`,
  summed subject rows over all teachers `= 266`; Bannour `IoT:Appli et Plates
  Formes 16 / 66.7%` + `Atelier Python 6 / 25.0%` + `Réseaux multimédia 2 /
  8.3%` (sum 100.0), top `IoT:Appli et Plates Formes`; Ghanmi `Systèmes
  Logiques 16 / 57.1%` + `Electricité - Electronique 12 / 42.9%` (sum
  100.0), **Mostly teaches Systèmes Logiques**; Maaloul `Services des Réseaux
  16 / 61.5%` + `Technologies Web 1 10 / 38.5%`, **Mostly teaches Services des
  Réseaux**; Abdelhafidh 4 rows (`Frameworks Big DATA 4`), Ghannay 4 rows
  (`Admin Avancée serv d'entrep 2`), Hamdani 2 rows — tops unchanged as
  pinned. Corpus-wide: `0` non-normalized `subjectCounts` keys, `0` duplicate
  norm rows, all six teachers' shares sum to `100.0` at one decimal.
- Regression probes: model exports intact (`normStr`, `cmpByte`, `Teacher`,
  `buildAll`, `fuseSessions` all functions); `match.suggest` subject labels
  still list raw spellings (`"services des"` → `["Services des réseaux",
  "Services des Réseaux"]`) — suggestion display is #055's file and out of
  scope per criterion 5/6, untouched here.
