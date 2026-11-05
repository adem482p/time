# 100: Unify “branch” and “specialization” as “specialty”

Status: Fixed
Date: 2026-11-05
Reporter: coordinator

## Description

The domain model used two interchangeable curricular nouns, **branch** and
**specialization**, and sometimes combined them (`specialization branch`,
`branch semester`, `specialization specifier`). The same words also carry
unrelated senses elsewhere in the repository (git branches, control-flow
branches, publication master branches), so neither word isolates the
curricular concept.

### Observed

- `Type` exported `COMMON_BRANCH`, `SPECIALIZATION_BRANCH`,
  `BRANCH_REFERENCE`, `BRANCH_POPULATION`, `BRANCH_SEMESTER_SPECIFIER`,
  `SPECIALIZATION_SPECIFIER`, `COMMON_BRANCH_RULE`, and
  `SPECIALIZATION_BRANCH_RULE`.
- Constructors were named `branch`, `commonBranch`, `commonBranchRule`,
  `specializationBranchRule`, `branchSemesterFor`, `classFromBranch`,
  `queryBranches`, and `parseBranchTokens`.
- Concrete objects stored `branch`, `specialization_specifier`, and
  `branch_semester_specifier`; the catalogue exposed `branches`.
- The session kind was `branch-lecture` with population scope `branch`.
- `DOMAIN.md` defined “Branch” and “Specialization specifier” as separate
  concepts and described child nodes as “sub-branches”.
- Error messages and tests mixed both vocabularies.

### Expected

One curricular noun, **specialty**, used consistently:

| Concept | Name |
|---|---|
| Curricular node (`LCS1`, `GLSI3`) | specialty |
| Trunk node | common specialty |
| Non-common node | specialty (qualified as non-common when needed) |
| Name token (`GLSI`) | specialty specifier |
| Global semester (`3` in `GLSI3`) | specialty semester |
| Semester token | specialty-semester specifier |
| Classes' parent | `class.specialty` |
| Population scope | specialty population, `specialty-lecture` |
| Catalogue list | `catalogue.specialties` |
| Child nodes | children (not a kind of specialty) |
| Publication grouping | master programmes (not curricular nodes) |

The two concrete discriminants remain distinct: `COMMON_SPECIALTY` for the
trunk and `SPECIALTY` for non-common nodes.

## Root cause

The model evolved from a concrete “branch” catalogue into a grammar whose
nodes can be common or non-common. New vocabulary (`specialization`) was
layered on top of the old one instead of replacing it, leaving both terms in
the API, object fields, docs, and error messages. Because both words also mean
other things outside the domain, the ambiguity spread into every layer.

## Repro steps

```bash
cd domain-model
grep -rniE 'branch|specialization' .
npm test
```

Before the fix the grep reported both words throughout `index.js`,
`catalogue.js`, `index.test.js`, `README.md`, `DOMAIN.md`, and `SYSTEM.md`.

## Discussion

### Maintainer decision (2026-11-05)

Adopt **specialty** as the single curricular noun and remove both legacy words
from `domain-model/`. Keep the existing grammar and behaviour; this is a
vocabulary change, not a model change.

Naming rules:

1. `branch` and `specialization` both become `specialty`; retain `common` as
   the qualifier for the trunk (`common specialty`, `common specialty rule`).
2. Compounds collapse rather than stack words: `specializationBranchRule` →
   `specialtyRule`; `branchSemesterFor` → `specialtySemesterFor`.
3. `specialtySpecifier` is parallel to `trackSpecifier`; the global-semester
   concept is `specialtySemester` / `specialty-semester specifier`.
4. Object fields use `specialty_specifier`, `specialty_semester_specifier`,
   and `specialty`; public option values use `'specialty'` and
   `'specialty-specifier'`; the session kind is `specialty-lecture` with
   scope `specialty`.
5. Tree children are **children**, not specialties. The publication's
   “master branches” become **master programmes**.
6. Historical discussion in `issues/099-domain-model-refactor.md` stays
   untouched; this issue records the rename.
7. `app/` keeps its un-migrated model until issue 088. Unrelated “branch”
   senses (git, control flow, service-worker per-branch work, test branches)
   are out of scope.

Acceptance criteria:

1. [x] `domain-model/*.js` contains no `branch` or `specialization` identifier,
   field, literal, comment, or error message.
2. [x] `Type` exports `COMMON_SPECIALTY`, `SPECIALTY`, `SPECIALTY_SPECIFIER`,
   `SPECIALTY_SEMESTER_SPECIFIER`, `SPECIALTY_SPECIFIER_REFERENCE`,
   `SPECIALTY_REFERENCE`, `SPECIALTY_POPULATION`, `COMMON_SPECIALTY_RULE`, and
   `SPECIALTY_RULE`.
3. [x] `Catalogue` exposes `specialties`, `specialtySpecifiers`,
   `specialtyRules`, and `commonSpecialtyRules`.
4. [x] `SPECIALTY` and `COMMON_SPECIALTY` remain separate discriminants.
5. [x] `README.md`, `DOMAIN.md`, and `SYSTEM.md` use the unified vocabulary.
6. [x] Behaviour is unchanged: 15 tests pass and generation/CSV counts match.
7. [x] No application or unrelated “branch” sense is renamed.

Risks/constraints: identifiers are internal to `domain-model/`, so no
consumer breaks; the CSV column names and published notation stay unchanged.

### Fix implemented (2026-11-05)

`domain-model/index.js`
- Renamed `Type` symbols and their `Symbol('…')` descriptions.
- Renamed constructors: `specialtySpecifier`, `specialtySemesterSpecifier`,
  `commonSpecialtyRule`, `specialtyRule`, `specialtySemesterFor`,
  `commonSpecialty`, `specialty`, `classPopulation` (parameter `specialty`),
  `parseSpecialtyTokens`, `classFromSpecialty`, `specialtyReference`,
  `specialtySpecifierReference`, `querySpecialties`.
- Renamed fields: `specialty_specifier`, `specialty_semester_specifier`, and
  `specialty` on reference, population, and class objects.
- Catalogue storage: `specialtySpecifiers`, `_specialtySpecifierObjects`,
  `specialtyRules`, `commonSpecialtyRules`, `_cache.specialties`, and
  `get specialties()`.
- Parse option values: `'specialty'` and `'specialty-specifier'`;
  session kind `specialty-lecture` maps to scope `specialty`.
- Updated comments, diagnostics, and local names to match
  (`specialtySpec`, `specialtyTag`, `specialtyValue`, `specialtySemester`).

`domain-model/catalogue.js`
- Imports and calls the renamed rule/specifier constructors; rule table keys
  are `specialtyRules` and `commonSpecialtyRules`.

`domain-model/index.test.js`
- Imports and asserts the new API; renamed locals and fixture tag `SPC`;
  test titles use specialty vocabulary.

`domain-model/README.md`, `DOMAIN.md`, `SYSTEM.md`
- Synced API examples, headings, glossary entries, alternative-term lists,
  session-kind values, and the tree/ publication wording. “Sub-branches”
  became “children”; “master branches” became “master programmes”.

Verification:

```bash
cd domain-model
grep -rniE 'branch|specialization' .
# no matches

npm test
# tests 15 / pass 15 / fail 0

node -e "
import('./index.js').then(async (dm) => {
  const { catalogue } = await import('./catalogue.js');
  console.log(
    catalogue.years.length,
    catalogue.specialties.length,
    catalogue.specialties.filter((n) => n.type === dm.Type.COMMON_SPECIALTY).length,
    catalogue.specialties.filter((n) => n.type === dm.Type.SPECIALTY).length,
    catalogue.classes.length
  );
});
"
# 11 26 3 23 210
```

Real dataset (`emplois.csv`, 2093 rows): 2089 convert to
`PARTIAL_SESSION_RECORD`; the 4 failures are the known source rows with an
empty professor and are correctly reported as `INVALID_CSV_RECORD`.
