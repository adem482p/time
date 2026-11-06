# 101: Specialty year mismatch — GLSI3 shows year 2 instead of year 3

Status: Fixed
Date: 2026-11-06
Reporter: coordinator

## Description

Two related bugs in the specialty construction:

### Bug 1: Wrong academic year for later specialty semesters
Specialty objects report the wrong academic year for semesters beyond the starting year of the specialty. The specialty `GLSI` starts at year 2 (track `LCS`). Its semesters map to academic years as follows:

| Specialty semester (1-based) | Global semester | Academic year |
|-----------------------------|----------------|---------------|
| 1 (GLSI1)                   | 3              | 2             |
| 2 (GLSI2)                   | 4              | 2             |
| 3 (GLSI3)                   | 5              | **3**         |

Currently `GLSI3` (the 3rd GLSI semester, global semester 5) reports academic year `2` instead of `3`. (GLSI duration is 3 semesters; there is no GLSI4.)

### Bug 2: Identifier notation uses global semester instead of specialty-relative semester
The `specialty` object's `identifier` and `specialty_semester_specifier` use the **global degree semester number** (e.g., `GLSI3` = global semester 3) rather than the **specialty-relative semester** (1st, 2nd, 3rd semester of GLSI).

Per `DOMAIN.md` lines 148-153: *"In `GLSI3`, the `3` is counted from the start of GLSI."* The correct identifiers should be:
- 1st GLSI semester (global 3) → `GLSI1`
- 2nd GLSI semester (global 4) → `GLSI2`
- 3rd GLSI semester (global 5) → `GLSI3`

Current code produces `GLSI3`, `GLSI4`, `GLSI5` — which incorrectly implies GLSI has 5 semesters and suggests an impossible `LCS4` year (LCS track only has 3 years).

## Root cause

1. **`specialty()` function** (line ~843): constructs `year` from input `year_specifier` instead of deriving from global semester. Also uses global semester for `specialty_semester_specifier` and `identifier`.

2. **`specialtySemesterFor()` function** (line ~370): returns global semester as the specialty-semester specifier. Should return specialty-relative semester: `globalTarget - globalStart + 1`.

3. **`_buildCache()` function** (line ~664): calls `specialty()` with `year_specifier`/`year_semester_specifier` derived from global semester, which then get misused.

4. **`parseSpecialtyTokens()`** (lines ~1078, 1112): interprets the numeric suffix in `GLSI3` as global semester; should interpret as specialty-relative semester.

5. **`sourceFieldReference()`** (line ~1265): assumes semester 1 when parsing CSV fields like `LCS2-GLSI_A`; should compute specialty-relative semester from the track year.

6. **`DOMAIN.md`** (lines 133-136): contradicts itself — says specialty semester is "global degree semester number" but specialty-semester specifier is "counted from the start of GLSI".

## Repro steps

```bash
cd /home/user/.local/share/opencode/worktree/1de5bb/model/domain-model
node -e "
import { createCatalogue, specialty } from './index.js';
const cat = createCatalogue();

// Current behavior (buggy):
// GLSI starts at year 2, duration 3 semesters (global 3,4,5)
const s1 = specialty(cat, { specialty_specifier: 'GLSI', year_specifier: 2, year_semester_specifier: 1 });
const s2 = specialty(cat, { specialty_specifier: 'GLSI', year_specifier: 2, year_semester_specifier: 2 });
const s3 = specialty(cat, { specialty_specifier: 'GLSI', year_specifier: 3, year_semester_specifier: 1 });

console.log('Identifiers:', s1.identifier, s2.identifier, s3.identifier); // GLSI3, GLSI4, GLSI5 (wrong)
console.log('Years:', s1.year.year_specifier.value, s2.year.year_specifier.value, s3.year.year_specifier.value); // 2, 2, 3 (s3 correct after partial fix)

// From catalogue:
cat.specialties.filter(s => s.identifier.startsWith('GLSI')).forEach(s => 
  console.log('Catalogue:', s.identifier, 'year:', s.year.year_specifier.value)
);
"
```

Current output:
```
Identifiers: GLSI3 GLSI4 GLSI5
Years: 2 2 3
Catalogue: GLSI3 year: 2, GLSI4 year: 2, GLSI5 year: 3
```

Expected output after fix:
```
Identifiers: GLSI1 GLSI2 GLSI3
Years: 2 2 3
Catalogue: GLSI1 year: 2, GLSI2 year: 2, GLSI3 year: 3
```

## Relevant code locations

### `domain-model/index.js`

1. **`specialty()` function** (around line 843):
   - Computes `globalTarget = 2 * (ys.value - 1) + yss.value`
   - Uses `globalTarget` for `specialty_semester_specifier` and `identifier` (should use specialty-relative: `globalTarget - globalStart + 1`)
   - Partially fixed: now derives `year` from `globalTarget` but validation still uses wrong semester

2. **`specialtySemesterFor()` function** (around line 370):
   - Returns `specialtySemesterSpecifierValue(globalTarget)` — should return `globalTarget - globalStart + 1`

3. **`_buildCache()` function** (around line 664):
   - Iterates `s = 0..duration-1`, computes `globalSem = startGlobal + s`
   - Calls `specialty()` with derived `year_specifier`/`year_semester_specifier`
   - Should pass specialty-relative semester directly

4. **`parseSpecialtyTokens()`** (around line 1078 two-token, 1112 compact):
   - Two-token: treats `GLSI3` suffix as global semester (line 1085)
   - Compact: treats `GLSI3` suffix as global semester (line 1116)
   - Both should treat as specialty-relative

5. **`sourceFieldReference()`** (around line 1265):
   - Parses `LCS2-GLSI_A` → assumes semester 1
   - Should compute specialty semester from track year: `(year - start_year) * 2 + 1`

### `domain-model/DOMAIN.md`
- Lines 133-136: incorrect definition of "specialty semester" as global semester
- Lines 148-153: correct definition of "specialty-semester specifier" as specialty-relative

### `domain-model/catalogue.js`
- `populationsForYear` keys by academic year specifier — should remain unchanged

### `app/src/lib/omni-model.js` (consumer)
- Reads `cls.specialty?.year?.year_specifier?.value` for display — will be correct after fix
- Reads `cls.specialty?.specialty_semester_specifier?.value` for identifier — will show 1,2,3 instead of 3,4,5

## Discussion

The fix requires changing the meaning of `specialty_semester_specifier` from global semester to specialty-relative semester throughout the domain model. This is a breaking change for the identifier notation but aligns with the domain model's own documentation and the institution's actual naming convention (`GLSI1`, `GLSI2`, `GLSI3` for the three semesters of GLSI).

The academic year derivation is a separate bug that was partially fixed but needs the semester notation fix to be complete.

## Fix implemented (2026-11-06)

### Changes made

1. **`domain-model/DOMAIN.md`** — Fixed contradictory definition of specialty semester. Now consistently defines it as specialty-relative (1-based from specialty start).

2. **`domain-model/index.js`**:
   - `specialtySemesterFor()`: Returns `globalTarget - globalStart + 1` (specialty-relative semester)
   - `specialty()`: Uses specialty-relative semester for `specialty_semester_specifier` and `identifier`; derives academic year from global semester
   - `parseSpecialtyTokens()` (two-token form): Interprets suffix as specialty-relative; validates against `duration_semesters`; computes expected track year
   - `parseSpecialtyTokens()` (compact form): Interprets `GLSI3` as 3rd GLSI semester; validates against `duration_semesters`; computes track year

3. **`domain-model/index.test.js`** — Updated all expectations:
   - Identifiers: `GLSI3`→`GLSI1`, `GLSI4`→`GLSI2`, `GLSI5`→`GLSI3`
   - `specialtySemesterFor`: expected 5→3, 4→2
   - `parseReference`: `GLSI5`→`GLSI3`, `GLSI3`→`GLSI1`
   - CSV conversion: `BI3`→`BI1`, `EB5`→`EB1`
   - Generation: expects `GLSI1`, `GLSI2`, `GLSI3`

### Verification
- All 15 domain-model tests pass
- App builds successfully
- Catalogue now produces correct specialty identifiers:
  - `GLSI1` (year 2) — 1st GLSI semester, global semester 3
  - `GLSI2` (year 2) — 2nd GLSI semester, global semester 4
  - `GLSI3` (year 3) — 3rd GLSI semester, global semester 5
- No impossible `GLSI4`, `GLSI5` or `LCS4`
- CSV parsing correctly maps `LCS2-GLSI` → `GLSI1`, `LCS3-GLSI` → `GLSI3`