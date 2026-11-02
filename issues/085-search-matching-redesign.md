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