# 099: Domain model refactor — grammar-based catalogue with separated populations

Status: Fixed
Date: 2026-11-05
Reporter: coordinator

## Description

The data model library has been completely refactored from a concrete-object catalogue to a formal grammar-based model with strict separation between curricular branches and student populations.

### Observed vs Expected

**Before (legacy):**
- `Catalogue` stored concrete tracks, branches, classes as pre-computed arrays
- `trackRule` had explicit `duration` and per-year `trunk` with embedded populations
- `specializationRule` + `branchRule` were separate (two-step indirection)
- `branchRule` had `start_year_specifier`, `start_year_semester_specifier`, `duration_years`, and embedded `populations`
- `commonBranchRule` had per-year populations attached
- Populations were bundled inside branch definitions, violating separation of concerns

**After (grammar-based):**
- Tracks are **pure derivations** — no manual `trackRule` with durations or trunks
- Common branches and specialization branches are **first-class grammar entities** defined by symmetric rules
- Student populations (classes) are declared by the branch rules themselves;
  every rule attaches its own `populations`/`sections` (see the re-evaluation below)
- All grammar entities use the **Rule suffix** consistently (`commonBranchRule`, `specializationBranchRule`)
- Non-convergence invariant enforced: branches never merge back; common trunk derived from earliest specialization start

## Root cause

The legacy model treated the catalogue as a database of concrete objects rather than a generative grammar. This caused:
1. Coupling of curricular structure (branches) with population logistics (sections/cohorts)
2. Asymmetric rule types (`trackRule`, `specializationRule`, `branchRule`, `commonBranchRule`)
3. Redundant/contradictory state (track duration declared manually but also implied by branch rules)
4. Impossible to verify coherence between derived trunk and population mappings

## Repro steps

```bash
# Run the domain model tests
cd /home/user/.local/share/opencode/worktree/1de5bb/svelte
npm test --workspace=domain-model
# or
node --test domain-model/index.test.js

# Expected: 15 tests pass, 0 fail

# Inspect the generated catalogue
node -e "
import('./domain-model/index.js').then(async dm => {
  const c = (await import('./domain-model/catalogue.js')).catalogue;
  console.log('years:', c.years.length);
  console.log('common branches:', c.branches.filter(b => b.type === dm.Type.COMMON_BRANCH).map(b => b.identifier));
  console.log('specialization branches:', c.branches.filter(b => b.type === dm.Type.SPECIALIZATION_BRANCH).map(b => b.identifier));
  console.log('classes:', c.classes.length);
});
"
```

Output should show:
- 11 years (LBC1-3, LCE1-3, LCS1-3, MP1-2)
- 3 common branches: LBC1, LCE1, LCS1
- 23 specialization branches (GLSI3-5, BI3-6, EB5-6, IoT3-6, IRS3-6, EXR1-3, SD1-3)
- 210 classes

## Discussion

### Maintainer decision (2026-11-04)

The domain model was migrated from a concrete-object catalogue to a formal grammar with these key architectural decisions:

1. **Grammar entities over concrete objects**: `Catalogue` now stores only specifiers and rules; concrete years/branches/classes are derived via `_buildCache()`.

2. **Non-convergence invariant**: A track's common trunk is derived as the prefix of years before the earliest specialization start. Specializations cannot start within the trunk. Common branches cease permanently after divergence.

3. **Semester as native unit**: Branch durations are in semesters (`duration_semesters`), not years. This correctly models LMD curricula where specializations like `GLSI` run for 3 semesters (S3-S5, with S6 being PFE).

4. **Separation of branches and populations**: 
   - `commonBranchRule({ track_specifier, duration_semesters })` — curricular trunk only
   - `specializationBranchRule({ specialization_specifier, track_specifier, start_year_specifier, duration_semesters })` — curricular branch only
   - `populationRule({ track_specifier | specialization_specifier, year_specifier, sections })` — student populations attached to either branch type

5. **Symmetric naming**: All grammar entities use `Rule` suffix; runtime constructors have no `Rule` suffix.

6. **First-class common branches**: `commonBranchRule` is a first-class entity defining the trunk, not a per-year population list.

### Maintainer re-evaluation (2026-11-05)

Further refinements applied:

- Merged `specializationRule` into `specializationBranchRule` (now includes `track_specifier` directly).
- Removed `start_year_semester_specifier` — specializations always start in Fall (semester 1 of the starting year).
- Populations remain attached to their respective branch rules (not a separate `populationRule` list) to prevent coherence divergence between derived trunk and population mappings.
- `Catalogue` validates: every trunk year has a `commonBranchRule`; every specialization active year has populations; no specializations inside trunk.

### Maintainer final (2026-11-05)

Final naming standardization (grammar terminology):

| Grammar entity | Constructor | Type symbol |
|---|---|---|
| Common branch | `commonBranchRule({ track_specifier, year_specifier, sections })` | `COMMON_BRANCH_RULE` |
| Specialization branch | `specializationBranchRule({ specialization_specifier, track_specifier, start_year_specifier, duration_semesters, populations })` | `SPECIALIZATION_BRANCH_RULE` |

> Note: the `populationRule` row from the original decision was superseded by
> the re-evaluation above — populations are attached to their branch rule, and no
> `POPULATION_RULE` symbol exists.

Runtime instances retain their names without "Rule" suffix.

### Acceptance criteria

1. [x] `Catalogue` constructor takes only specifiers and grammar rules; no concrete objects
2. [x] Common trunk derived from earliest specialization start; no manual track rule
3. [x] Branch durations in semesters; `GLSI` = 3 semesters (no phantom `GLSI6`)
4. [x] Non-convergence invariant enforced at compilation (throw if specialization starts inside trunk)
5. [x] Populations attached to their branch rule; no separate population-rule type
6. [x] All grammar entities use "Rule" suffix; runtime constructors have no suffix
7. [x] 15 tests pass; 11 years, 26 branches (3 common + 23 specialization), 210 classes generated
8. [x] Subproject isolated under `domain-model/` with own `package.json`

### Risks/constraints

- App migration (issue 088) must update imports from `../data/catalogue.js` to `../domain-model/catalogue.js`
- `data/extract.py` and `emplois.csv` remain outside the subproject (ingestion, not modeling)
- `commonBranch` instance constructor vs `commonBranchRule` grammar entity — naming collision mitigated by "Rule" suffix convention
- `specializationBranchRule` carries attached `populations`; trunk/rule coherence is validated at catalogue construction

### Reporter (2026-11-04)

Confirmed the bug against the legacy code. The duplicate model responsibilities in `app/src/lib/libgroups.js` and `app/src/lib/model.js` (issue 088) are now clearly separated from the canonical grammar in `domain-model/`.

### Maintainer decision (2026-11-04)

Architecture approved as described. The grammar-based model is the single source of truth for curricular structure.

### Maintainer re-evaluation (2026-11-05)

Applied the requested refinements (merge specialization rule, drop semester start parameter, keep populations with branch rules, final naming).

### Fix implemented (2026-11-05)

All changes committed across multiple atomic commits:

- `81574a4` — Initial domain model library migration
- `437e7fb` — Grammar-based catalogue, purge singleton track
- `711d41f` — Clean up dead helpers
- `7e68d35` — Rename concrete track couple to `year`; precise terminology
- `e12cbce` — Enforce strict tree divergence (branches never merge back)
- `5afd917` — Model branch duration in semesters; derive track metrics purely from branch grammar
- `41fd90f` — Merge specializationRule into branchRule; drop start_year_semester_specifier; populations stay attached
- `772c9f6` — Make data modelling a self-contained subproject under `domain-model/`

### Final verification

```bash
cd domain-model && npm test
# 14 tests pass, 0 fail
```

### Implementer — coherence pass (2026-11-05)

The working tree contained a half-applied rename: `Type.BRANCH_RULE` had been
replaced by `SPECIALIZATION_BRANCH_RULE` + `POPULATION_RULE`, but
`branchRule()` still returned `type: Type.BRANCH_RULE`, so every rule object had
`type: undefined` and no test caught it. This pass finishes the rename and
removes the code that no decision ever asked for.

`domain-model/index.js`
- `branchRule` → `specializationBranchRule`; returns `Type.SPECIALIZATION_BRANCH_RULE`.
- Removed the never-constructed `POPULATION_RULE` symbol (populations stay
  attached to branch rules, per the re-evaluation).
- Removed dead code: `isKnownTrackSpec` / `isKnownSpecSpec`, the empty
  catalogue-awareness block in `parseReference`, and the no-op `else` in
  `parseBranchTokens`.
- Dropped the unused `catalogue` parameter from `populationForParsed` and the
  redundant `parsedOptions` wrapper in `parseReference`.

`domain-model/catalogue.js`, `domain-model/index.test.js`
- Call sites updated to `specializationBranchRule`.
- New regression test asserting both grammar rules expose their type symbols
  (`COMMON_BRANCH_RULE`, `SPECIALIZATION_BRANCH_RULE`); the semester test no
  longer passes the ignored `start_year_semester_specifier` argument.

`domain-model/index.js` — CSV entry point
- `fromCsvRecord` now resolves the publication's field notation through the
  catalogue (`LBC2-BI_A Groupe 1` → `BI3 A1`, `LBC3-EB_A` → `EB5 A`,
  `MP1-SD` → `SD1`) instead of only rewriting `-` and `Groupe`. Canonical
  notations and the catalogue-less path keep working.
- Added `inferExpectedReference` so `populationReference` infers `class` vs
  `branch` when no session kind is given; `Catalogue.resolve` reuses it instead
  of duplicating the heuristic.

`domain-model/README.md`
- Synced with the shipped API: one `specializationBranchRule` (populations
  attached), root-relative imports, `expected: 'year'` shown on `LCS1`, getters
  instead of nonexistent `generate*` methods, current test commands, and CSV
  field examples.

Verification:

```bash
cd domain-model && npm test
# tests 15 / pass 15 / fail 0

node -e "
import('./domain-model/index.js').then(async dm => {
  const c = (await import('./domain-model/catalogue.js')).catalogue;
  console.log(
    c.years.length,
    c.branches.filter(b => b.type === dm.Type.COMMON_BRANCH).length,
    c.branches.filter(b => b.type === dm.Type.SPECIALIZATION_BRANCH).length,
    c.classes.length
  );
});
"
# 11 3 23 210
```

Real dataset (`emplois.csv`, 2093 rows): **2089 rows** convert to
`PARTIAL_SESSION_RECORD`. The 4 remaining rows are source rows with no
professor (LBC1-C Statistique Descriptive p8/p9, LBC2-BI_F Projet profess.
personnel p17/p18) and are correctly reported as `INVALID_CSV_RECORD`
(`professor is required`).