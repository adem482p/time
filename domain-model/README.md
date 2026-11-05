# Domain model library

This library provides the normalized timetable domain model used by the
application. It is JavaScript-only and uses runtime validation plus tagged
objects so callers can distinguish valid values, invalid input, ambiguity, and
missing publication data without inspecting nullable fields. Every `type` is
an exported unique symbol from the `Type` enum-like object.

Import it as an ES module:

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
import { createCatalogue } from './catalogue.js';
const catalogue = createCatalogue();
```

The library stays generic; the institution-specific rule table lives outside
this directory (see `./catalogue.js`).

### Vocabulary and rules

```js
commonBranchRule({ track_specifier, year_specifier, sections });
specializationRule({ specialization_specifier, track_specifier });
branchRule({
  specialization_specifier,
  start_year_specifier,
  start_year_semester_specifier,
  duration_semesters,
  populations: [populationsForYear({ year_specifier, sections })]
});
```

- Tracks are **pure derivations**: there is no manual `trackRule`. Total track
  duration and the common trunk depth are derived automatically from the branch
  topology.
- `commonBranchRule`: declares populations for each common trunk year. The common
  trunk is derived as the prefix of years preceding the earliest specialization start.
- `specializationRule`: declares which track specifier owns a specialization.
- `branchRule`: declares the branch's exact start coordinate (`start_year_specifier`
  and `start_year_semester_specifier`) and its length in `duration_semesters`.
  For example, `GLSI` starts at Year 2, Semester 1 with `duration_semesters: 3`,
  producing `GLSI3`, `GLSI4`, and `GLSI5` (Semester 6 is the graduation project PFE).
  Because **branches never merge back**, a specialization cannot start within or
  before the track's common trunk.

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

- `year` validates the couple of a track specifier and year specifier against `trackRule`.
- `commonBranch` requires a common-branch publication for that year.
- `branch` derives the owning track specifier, forms its concrete prefix `year`,
  and derives the branch semester; rejects year specifiers outside the declared duration.
- `classPopulation` derives the allowed population shape from the branch/year
  rule; cohorts are only allowed for cohort-partitioned sections.

There is no "singleton track": `MP1-EXR` is a specialization branch (EXR)
whose population rule for that year has no sections, producing a singleton
class population.

## References

`parseReference()` is catalogue-aware. Pass a catalogue to reject unknown
specifiers at parse time:

```js
parseReference('GLSI3', { catalogue });
parseReference('LCS1 A2', { catalogue, expected: 'class' });
parseReference('LCS2', { catalogue, expected: 'year' });
```

## Resolution

```js
const resolution = catalogue.resolve('GLSI3');
```

Returns `INVALID_RESOLUTION`, `NOT_FOUND`, `UNIQUE_MATCH`, or
`AMBIGUOUS_MATCH`. Publication presence is reported separately.

## CSV records

`fromCsvRecord(record, { catalogue })` converts a scalar CSV row into a
`PARTIAL_SESSION_RECORD` or `INVALID_CSV_RECORD`.

## Generation

```js
catalogue.generateYears();
catalogue.generateBranches();
catalogue.generateClasses();
```

Available as `catalogue.years`, `catalogue.branches`, `catalogue.classes`.

## Testing

```sh
node --experimental-default-type=module --test domain-model/index.test.js
```
