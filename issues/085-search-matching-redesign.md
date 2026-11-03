# 085: Redesign search/matching engine — fix highlight bug, reduce complexity

Status: Open
Date: 2026-11-02
Reporter: coordinator

## Description

The current matching engine (`app/src/lib/match.js`, ~800 lines) has a known highlight bug and excessive complexity:

- **Bug**: Searching "LCS" on the classes page highlights "GLS" in `GLSI3 D` shortcuts. Root cause: ranges computed on canonical key `"GLSI3D1"` (where "LCS" matches at position 0-3) then incorrectly remapped to shortcut display form `"GLSI3 D"` (where positions 0-3 = "GLS").
- **Complexity**: 4+ independent matching implementations (`fuzzyRanges`/`tokenScore`, `scoreEntry`, `matchTeacher`, `classSearch`), duplicated index data (`entries[i].texts[]` up to 20 strings per class), legacy baggage (`aliasToCanonical`, `legacyKey` for done migration), autocomplete only used by teachers page.

## Root cause

Architectural mismatch: the index stores/matches on **canonical keys and full names**, but the display layer uses **shortcut forms** (track prefix removed, cohort as `<sub>`). Ranges are computed on the wrong string and no correct mapping exists — `highlightedHeadingHTML` remaps by splitting at `sc.head.length` but ranges from the full name don't align with the shortcut.

## Repro steps

1. Start dev server: `cd app && npm run dev`
2. Open `/classes/`
3. Type "LCS" in search
4. Observe: `GLSI3 D`, `GLSI3 A1`, etc. get "GLS" highlighted instead of no highlight (track "LCS" stripped from shortcut)

## Discussion

### Maintainer triage (2026-11-02)

Replace the entire `match.js` with a standard, display-form-first search engine in three focused modules:

**New structure:**
```
app/src/lib/
├── search.js              # Core primitives (~150 lines)
├── search-teachers.js     # Teacher search + suggest (~180 lines)  
├── search-classes.js      # Class search + suggest (~180 lines)
├── match.js               # DELETED
```

**Core principle:** Pre-compute searchable text on the exact **DISPLAY FORM**. Match and highlight on the same string the user sees. No remapping ever.

**Algorithm (standard approach):**
- `buildClassIndex(groups)`: for each leaf, `searchableText = shortcut.head + ' ' + shortcut.sub + ' ' + attrs.join(' ')` — exactly what displays
- `searchClasses(index, query)`: tokenize → token-AND → `scoreMatch` → `findRanges` **on shortcut.head + shortcut.sub** → return ranges + attrMatches
- `searchTeachers`: same pattern, includes name/subjects/class shortcuts
- `highlightHTML(haystack, ranges)` on original display text (already correct)

**Estimated reduction:** ~800 lines → ~530 lines (**-34%**). Bug fixed by construction.

**Migration path (incremental, each phase verified by test suite):**

1. Create `search.js` core primitives (`normStr`, `tokenize`, `findRanges`, `scoreMatch`, `mergeRanges`, `highlightHTML`)
2. Create `search-classes.js` (`buildClassIndex`, `searchClasses`, `suggestClasses`); update `classes/+page.svelte`
3. Create `search-teachers.js` (`buildTeacherIndex`, `liveSearch`, `searchSections`, `suggestTeachers`, `shadowText`); update `teachers/+page.svelte`
4. Delete `match.js`

**Test pins to update:**
- `test/classes.test.js`: `match.buildIndex` → `searchClasses.buildClassIndex`, `match.classSearch` → `searchClasses.searchClasses`, `match.suggest` → `searchClasses.suggestClasses`
- `test/teacher-daygroups.test.js`: `match.buildIndex` → `searchTeachers.buildTeacherIndex`, `match.searchSections` → `searchTeachers.liveSearch`, `match.suggest` → appropriate suggest function
- `test/page-chrome.test.js`: **no changes** (markup/CSS only)

**Acceptance criteria:**
1. `node --test test/*.test.js` → 192 pass / 0 fail (same totals)
2. Search "LCS" on classes page → no highlight on GLSI* shortcuts (bug fixed)
3. All existing behavioral invariants preserved:
   - Token-AND semantics (`LCS GLSI` → both tokens must match)
   - Exact match priority (teacher "Ben Haj" > partial)
   - Own-key outranks alias (`lcs` suggest → LCS, LCS1, LCS2, LCS3 before GLSI*)
   - Deterministic ordering (empty query → byte-sorted keys)
   - Availability sorting (today → tomorrow → none)
   - Highlight on display text (`searchClasses('LCS')` → ranges on "GLSI3 D")
   - Leaf-only filtering (classes page responsibility)
   - Autocomplete shadow text (`shadowText('glsi', {commit:'class:GLSI3D1'})` → `{pre:'class:', rest:'3D1'}`)
4. `npm run build` succeeds; service workers pass `node --check`

### Fix implemented (2026-11-03)

Implemented by the implementer in worktree `issue-085-autocomplete` (phase 4 completion: the two suggest stubs + the dead `match.js` shell gone).

**Row contract (`suggestTeachers`)**: every index entry contributes three candidate kinds — its teacher name (`kind:'teacher'`), every distinct subject string (`kind:'subject'`), every distinct class key from its `classes` arrays (`kind:'class'`, ancestors included). Dedupe is first-seen in teacher→subject→class order, so labels are unique and the sort is fully deterministic. A candidate passes iff every token matches its text via `fuzzyRanges` (substring-or-subsequence, the same tiers `searchTeachers` itself matches with); score = Σ `Math.max(scoreMatch(text, tok), 0)` (clamped like `suggestClasses`); rows sort score-desc then `cmpByte(label)` (local copy, same rule as `search-classes.js`) and cap at 8. Each row carries `kind`, `label` (= the text), `commit` (= **the bare text** — name / subject string / node key; no `subject:`/`class:` prefixes, so a pick round-trips through `searchTeachers.searchSections` as plain token-AND), `detail: null` (kept minimal — class rows already render the shortcut form through `headingHTML`, and the counted badge line is gone since issue 062) and `ranges` (`mergeRanges(fuzzyRanges(label, tok)…)`, null when nothing matches). Empty/blank query → `[]`.

**`shadowText`**: exact port of the old `match.js` semantics (from `43a324e`) — raw typed string, case-insensitive, **no trim/collapse**; branch order preserved: (1) lowercase commit prefix → `{pre:'', rest: commit.slice(raw.length)}`, (2) commit matching `^(subject|class|teacher):` + label prefix → `{pre: prefix+':', rest: label.slice(raw.length)}`, (3) plain label prefix → `{pre:'', rest}`, else null; null on blank query / missing row. Branch (2) survives as a pure-function pin only — new bare-commit rows (commit === label) take branch (1).

**Also required by the contract — `index.groups` restored on `buildTeacherIndex`** (deviation from "byte-identical", flagged deliberately): the redesign converted the merged match.js index into the flat entries array but left `covers(index.groups, …)` reading a nonexistent `.groups`. Verified crash: any exact class-key commit (`searchSections(index, 'GLSI3D1')` — reachable both by committing an autocomplete class row and by typing a full class key + Enter) threw `Cannot read properties of undefined (reading 'leafFor')`, killing the page. The redesigned engine still needs the groups for the exact-class "(n relevant)" walk, so `buildTeacherIndex` now rides them on the returned array like the old merged index did — one property, no behavior changes elsewhere, and the old exact-relevance counting returns (GLSI3D1: 18 exact hits with 1–2 relevant sessions each).

**Diff summary (per file; 170+/118-):**
- `app/src/lib/match.js` — **deleted** (110 lines; zero importers, confirmed by grep across `app/src` + `test/`).
- `app/src/lib/search-teachers.js` — `buildTeacherIndex` returns the entries array with `index.groups = groups` (+6 lines, comment explains); `suggestTeachers` implemented (+36); `shadowText` implemented ported verbatim from `43a324e` (+16, concise doc comment noting the pinned example); local `cmpByte` appended (+3). Imports unchanged (the pre-staged `scoreMatch` is now actually used).
- `test/deadcode.test.js` — first test replaced: now pins `app/src/lib/match.js` **stays deleted** (`fs.existsSync` === false via exported `ROOT`) and that `search.js`/`search-classes.js`/`search-teachers.js` never reintroduce `parseExactQuery`/`exactQuery`. Test count parity (1→1). Other deadcode pins untouched.
- `test/teacher-daygroups.test.js` — 3 new `test()` blocks (no existing assertion touched): (1) suggest mechanics — 'abe' opens exactly 8, blank → 0, kind vocabulary, byte-order tie pin on 'glsi' (`GLSI1, GLSI1A, GLSI1A1, GLSI1A2, GLSI1B, GLSI1B1, GLSI1B2, GLSI1C`), two-token 'algo struct' AND-gate with the tighter prefix ranking first; (2) every commit round-trips: `searchSections(index, row.commit)` total > 0 for 'abe'/'glsi'/'algo struct'/'machine'/'ben', commit === label, teacher commits are the exact selection, and the GLSI3D1 commit survives the class-exact relevance walk with a counted "(n relevant)"; (3) shadowText — bare-commit, 'hass'→'airi', single-space 'machine '→'Learning', the pinned 'class:' prefix case → `{pre:'class:', rest:'3D1'}`, double-space 'machine  ' → null, empty query and missing row → null.

**Verification:**
- `node --test test/*.test.js` → **195 pass / 0 fail** (192 baseline + 3 new; the deadcode swap kept parity).
- REPL against the real `emplois.csv` (existing loaders): `abe` → 8 rows (3 teacher + 5 subject, cap edge), score-desc, byte-sorted ties; `glsi` → 8 class rows, all commits round-trip with totals 15–41; teacher commit exact-first confirmed for all 3 teacher rows; all shadowText cases above return the pinned values; `GLSI3D1` commit → total 18, no crash, relevantSessions restored.
- `npm run build` in `app/` → prerenders 4 routes, `gen-sw` stamps both workers, `node --check` passes on both; served `app/build/` → all four pages curl 200.
- `git status` in the worktree contains only the four intended site files plus this issue file.