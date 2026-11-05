# Domain model library

This library provides the normalized timetable domain model used by the
application. It is JavaScript-only and uses runtime validation plus tagged
objects so callers can distinguish valid values, invalid input, ambiguity, and
missing publication data without inspecting nullable fields. Every `type` is
an exported unique symbol from the `Type` enum-like object.

Import it as an ES module (the paths below are relative to the repository
root):

```js
import { Catalogue, branch, classPopulation, parseReference, Type } from './domain-model/index.js';
```

## Core rule: switch on `type`

Most results are discriminated by a `type` property. Compare it with the
exported `Type` symbols and use `switch`.

Invalid constructor arguments throw an `Error`. Parsing and catalogue
resolution return explicit result variants because invalid input and an absent
catalogue entry are normal query outcomes.

## Catalogue as grammar

The `Catalogue` is a finite typed grammar. It contains only specifiers and
relationships; it does not contain concrete years, branches, classes, or
sessions. Concrete objects are derived bottom-up under the catalogue's
supervision.

A catalogue is built from rule objects:

```js
import { createCatalogue } from './domain-model/catalogue.js';
const catalogue = createCatalogue();
```

The generic library lives in `index.js`; the institution-specific rule table
lives in `catalogue.js`, next to it but separate from the grammar engine.

### Vocabulary and rules

```js
commonBranchRule({ track_specifier, year_specifier, sections });
specializationBranchRule({
  specialization_specifier,
  track_specifier,
  start_year_specifier,
  duration_semesters,
  populations: [populationsForYear({ year_specifier, sections })]
});
```

- Every rule is a frozen object that carries its own `type` symbol:
  `COMMON_BRANCH_RULE` or `SPECIALIZATION_BRANCH_RULE`.
- Tracks are **pure derivations**: there is no manual track rule. Total track
  duration and the common trunk depth are derived automatically from the branch
  topology.
- `commonBranchRule`: declares populations for each common trunk year. The common
  trunk is derived as the prefix of years preceding the earliest specialization start.
- `specializationBranchRule`: declares the specialization, the track specifier
  that owns it, its start year (`start_year_specifier`, always semester 1) and
  its length in `duration_semesters`.
  For example, `GLSI` starts at Year 2, Semester 1 with `duration_semesters: 3`,
  producing `GLSI3`, `GLSI4`, and `GLSI5` (Semester 6 is the graduation project PFE).
  Because **branches never merge back**, a specialization cannot start within or
  before the track's common trunk.
- Populations stay attached to their branch rule, so the derived trunk and the
  population mappings cannot drift apart.

Section population helpers:

```js
sectionsWithTwoCohorts('A', 'B', 'C');
sectionsWithNoCohorts('A', 'B');
// singleton class population: []
```

## Years, branches, classes

Constructors receive the catalogue and validate against the grammar:

```js
const y = year(catalogue, { track_specifier: trackSpecifier('LCS'), year_specifier: yearSpecifier(3) });
const cb = commonBranch(catalogue, { track_specifier: trackSpecifier('LBC'), year_specifier: yearSpecifier(1) });
const b = branch(catalogue, { specialization_specifier: specializationSpecifier('GLSI'), year_specifier: yearSpecifier(3), year_semester_specifier: yearSemesterSpecifier(1) });
const cls = classPopulation(catalogue, { branch: b, section_specifier: 'A', cohort_specifier: 1 });
```

- `year` validates the couple of a track specifier and year specifier against the
  track's derived duration.
- `commonBranch` requires a common-branch publication for that year.
- `branch` derives the owning track specifier, forms its concrete prefix `year`,
  and derives the branch semester; rejects year specifiers outside the declared duration.
- `classPopulation` derives the allowed population shape from the branch rule;
  cohorts are only allowed for cohort-partitioned sections.

There is no "singleton track": `MP1-EXR` is a specialization branch (EXR)
whose population for that year has no sections, producing a singleton class
population.

## References

`parseReference()` is catalogue-aware. Pass a catalogue to reject unknown
specifiers at parse time:

```js
parseReference('GLSI3', { catalogue });
parseReference('LCS1 A2', { catalogue, expected: 'class' });
parseReference('LCS1', { catalogue, expected: 'year' });
```

`expected` selects the interpretation: `'year'` only succeeds for a common
branch such as `LCS1`, because a specialization is identified by a branch
semester (`GLSI3`), not by a year. Without a catalogue, a small built-in track
list is used as a fallback; pass a catalogue for authoritative results.

## Resolution

```js
const resolution = catalogue.resolve('GLSI3');
```

Returns `INVALID_RESOLUTION`, `NOT_FOUND`, `UNIQUE_MATCH`, or
`AMBIGUOUS_MATCH`. Publication presence is reported separately.

## CSV records

`fromCsvRecord(record, { catalogue })` converts a scalar CSV row into a
`PARTIAL_SESSION_RECORD` or `INVALID_CSV_RECORD`. With a catalogue, the
publication's field notation is resolved to canonical references:

```js
fromCsvRecord({ field: 'LCS1-A Groupe 2', ... }, { catalogue }); // -> LCS1 A2
fromCsvRecord({ field: 'LBC2-BI_A Groupe 1', ... }, { catalogue }); // -> BI3 A1
fromCsvRecord({ field: 'MP1-EXR', ... }, { catalogue }); // -> EXR1
```

The canonical notations (`GLSI3 A2`, `LCS1 A2`) are accepted too. Without a
catalogue only those generic notations are normalized; the publication's
track-year-specialization form needs the catalogue to derive the branch
semester.

## Generation

```js
catalogue.years;
catalogue.branches;
catalogue.classes;
```

Each list is derived lazily on first access from the catalogue's rules; there
are no `generate*` methods.

## Testing

```sh
node --experimental-default-type=module --test domain-model/index.test.js
# or, from this directory
npm test
```
