# Domain model library

This library provides the normalized timetable domain model used by the
application. It is JavaScript-only (ES modules) and uses runtime validation plus
tagged objects so callers can distinguish valid values, invalid input, ambiguity,
and missing publication data without inspecting nullable fields. Every `type` is
an exported unique symbol from the `Type` enum-like object.

The grammar lives in `index.js`; the institution-specific rule table lives in
`catalogue.js`, next to it but separate from the grammar engine.

Import it as an ES module (the paths below are relative to the repository root):

```js
import { Catalogue, commonSpecialty, specialty, classPopulation, parseReference, Type } from './domain-model/index.js';
import { createCatalogue } from './domain-model/catalogue.js';
```

## Core rule: switch on `type`

Most results are discriminated by a `type` property. Compare it with the
exported `Type` symbols and use `switch`.

Invalid constructor arguments throw an `Error`. Parsing and catalogue
resolution return explicit result variants because invalid input and an absent
catalogue entry are normal query outcomes.

```js
switch (result.type) {
  case Type.UNIQUE_MATCH:
    // result.catalogue.match
    break;
  case Type.NOT_FOUND:
    // no catalogue entry
    break;
  case Type.AMBIGUOUS_MATCH:
    // result.catalogue.matches
    break;
  case Type.INVALID_RESOLUTION:
    // syntax error
    break;
}
```

## The `Type` discriminators

`Type` is a frozen object of unique symbols. Each composite value carries one of
these as its `type`:

**Specifiers** — reusable primitives that complement another value:

- `TRACK_SPECIFIER` — a degree-family tag such as `LBC`, `LCE`, `LCS`, `MP`
- `YEAR_SPECIFIER` — a year number such as `1`, `2`, `3`
- `SPECIALTY_SPECIFIER` — a specialty tag such as `GLSI`, `BI`, `IoT`, `EXR`
- `YEAR_SEMESTER_SPECIFIER` — `1` or `2` within a year
- `SPECIALTY_SEMESTER_SPECIFIER` — a specialty-relative semester number
- `GROUP_SPECIFIER` — a group letter such as `A`, `B`
- `COHORT_SPECIFIER` — a cohort number such as `1`, `2`

**Concrete objects** — built bottom-up from specifiers under catalogue
supervision:

- `YEAR` — a track specifier coupled with a year specifier (`LCS3`)
- `COMMON_SPECIALTY` — a common-trunk specialty (`LCS1`)
- `SPECIALTY` — a non-common specialty (`GLSI3`)
- `CLASS` — a specialty with an optional group specifier and an optional
  cohort specifier (`GLSI3 A`, `GLSI3 A1`, `EXR1`). All three are the same
  object kind at different specificity; a class carrying neither specifier is
  a singleton class.

**References** — input notations parsed by `parseReference`:

- `INVALID_REFERENCE`, `TRACK_SPECIFIER_REFERENCE`,
  `SPECIALTY_SPECIFIER_REFERENCE`, `YEAR_REFERENCE`, `SPECIALTY_REFERENCE`,
  `CLASS_REFERENCE`

**Populations** — the audience a session addresses:

- `SPECIALTY_POPULATION`, `GROUP_POPULATION`, `COHORT_POPULATION`

**Other** — `SESSION_SPECIFIER`, `PROVENANCE`, `PARTIAL_SESSION_RECORD`,
`INVALID_CSV_RECORD`, `INVALID_RESOLUTION`, `NOT_FOUND`, `UNIQUE_MATCH`,
`AMBIGUOUS_MATCH`, `NOT_APPLICABLE`, `NO_RECORDS`, `RECORDS`,
`COMMON_SPECIALTY_RULE`, `SPECIALTY_RULE`.

## Catalogue as grammar

The `Catalogue` is a finite typed grammar. It contains only specifiers and
relationships; it does not contain concrete years, specialties, or classes.
Concrete objects are derived bottom-up under the catalogue's supervision.

```js
import { createCatalogue } from './domain-model/catalogue.js';
const catalogue = createCatalogue();
```

Track specifiers and specialty specifiers are declared, then rules attach
curricular structure and student populations:

```js
commonSpecialtyRule({ track_specifier, year_specifier, groups });
specialtyRule({
  specialty_specifier,
  track_specifier,
  start_year_specifier,
  duration_semesters,
  populations: [populationsForYear({ year_specifier, groups })]
});
```

- Every rule is a frozen object carrying its own `type` symbol:
  `COMMON_SPECIALTY_RULE` or `SPECIALTY_RULE`.
- Tracks are **pure derivations**: there is no manual track rule. Total track
  duration and the common trunk depth are derived automatically from the
  specialty topology.
- `commonSpecialtyRule`: declares populations for each common trunk year. The
  common trunk is derived as the prefix of years preceding the earliest
  specialty start.
- `specialtyRule`: declares the specialty, the track specifier that owns it,
  its start year (`start_year_specifier`, always semester 1) and its length in
  `duration_semesters`. For example, `GLSI` starts at Year 2, Semester 1 with
  `duration_semesters: 3`, producing `GLSI3`, `GLSI4`, and `GLSI5` (Semester 6
  is the graduation project PFE). Because **specialties never merge back**, a
  specialty cannot start within or before the track's common trunk.
- Populations stay attached to their specialty rule, so the derived trunk and
  the population mappings cannot drift apart.

Group population helpers:

```js
groupsWithTwoCohorts('A', 'B', 'C');
groupsWithNoCohorts('A', 'B');
// no groups: the class carries no specifiers
```

`twoCohorts` and `noCohorts` are the cohorting marker values used by the group
descriptors above. The descriptors declare which classes a specialty has; the
group and cohort are specifiers on each derived class, not objects themselves.

## Years, specialties, classes

Constructors receive the catalogue and validate against the grammar:

```js
const y = year(catalogue, { track_specifier: trackSpecifier('LCS'), year_specifier: yearSpecifier(3) });
const common = commonSpecialty(catalogue, { track_specifier: trackSpecifier('LBC'), year_specifier: yearSpecifier(1) });
const node = specialty(catalogue, { specialty_specifier: specialtySpecifier('GLSI'), year_specifier: yearSpecifier(3), year_semester_specifier: yearSemesterSpecifier(1) });
const cls = classPopulation(catalogue, { specialty: node, group_specifier: 'A', cohort_specifier: 1 });
```

- `year` validates the couple of a track specifier and year specifier against
  the track's derived duration.
- `commonSpecialty` requires a common-specialty publication for that year.
- `specialty` derives the owning track specifier, forms its concrete prefix
  `year`, and derives the specialty semester; rejects year specifiers outside
  the declared duration.
- `classPopulation` derives the allowed class shape from the specialty
  rule; cohorts are only allowed for cohort-partitioned groups. Omitting
  `group_specifier` produces a singleton class (no group or cohort specifier)
  where the rule declares no groups.

There is no "singleton track": `MP1-EXR` is a specialty (EXR) whose population
for that year has no groups, producing a singleton class.

### Specialty semester calculation

`specialtySemesterFor({ year_specifier, year_semester_specifier,
start_year_specifier })` returns the specialty-relative semester (1-based from
the specialty start) for a given academic year/semester position:

```js
specialtySemesterFor({ year_specifier: 3, year_semester_specifier: 1, start_year_specifier: 2 }); // -> 3
```

## References

`parseReference()` is catalogue-aware. Pass a catalogue to reject unknown
specifiers at parse time:

```js
parseReference('GLSI3', { catalogue });
parseReference('LCS1 A2', { catalogue, expected: 'class' });
parseReference('LCS1', { catalogue, expected: 'year' });
```

`expected` selects the interpretation: `'year'` only succeeds for a common
specialty such as `LCS1`, because a non-common specialty is identified by a
specialty semester (`GLSI3`), not by a year. Without a catalogue, a small
built-in track list (`LBC`, `LCE`, `LCS`, `MP`) is used as a fallback; pass a
catalogue for authoritative results.

Accepted notations include canonical forms (`GLSI3 A2`, `LCS1 A2`), verbose
two-token forms (`LCS3 GLSI3`), compact forms (`GLSI3A2`), and the publication's
track-year-specialty form (`LBC2-BI_A Groupe 1` → `BI3 A1`).

## Resolution

```js
const resolution = catalogue.resolve('GLSI3');
```

Returns `INVALID_RESOLUTION`, `NOT_FOUND`, `UNIQUE_MATCH`, or
`AMBIGUOUS_MATCH`. Publication presence is reported separately:

```js
switch (resolution.type) {
  case Type.UNIQUE_MATCH:
    // resolution.catalogue.match is the Year/Specialty/ClassNode
    // resolution.publication is NO_RECORDS or RECORDS
    break;
  case Type.NOT_FOUND:
    // resolution.catalogue is NOT_FOUND
    break;
  case Type.AMBIGUOUS_MATCH:
    // resolution.catalogue.matches is an array
    break;
  case Type.INVALID_RESOLUTION:
    // resolution.syntax carries diagnostics
    break;
}
```

## Session specifiers and populations

`sessionSpecifier(fields)` builds a frozen recurring session specifier from its
fields. `session_kind` and `population` are required; `day`/`time` are validated
against the fixed day/slot sets:

```js
const s = sessionSpecifier({
  subject: 'Math',
  teacher: 'T',
  room: 'A1',
  population: 'LCS1',
  day: 'lundi',
  time: '10H00-11H30',
  session_kind: 'specialty-lecture',
  catalogue: cat
});
// s.day === 'LUNDI'; s.time === '10h00-11h30'; s.week_pattern_specifier === ''
```

`sessionKind(value)` normalizes a session kind alias (`lecture`,
`seminar`, `lab`, or the canonical names) to its canonical value.
`SESSION_KIND_SCOPES` maps each canonical kind to its population scope:
`specialty-lecture → specialty`, `group-seminar → group`,
`cohort-lab-work → cohort`.

`populationReference({ reference, session_kind, catalogue })` resolves a
reference into the population its session kind requires (specialty, group, or
cohort scope). Without a session kind it infers `class` vs `specialty` from the
notation.

`weekPatternSpecifier(value)` normalizes a week pattern to `''` (every week),
`'SA'`, or `'SB'`; `'S1'` is rejected (it is a semester source label, not a
week pattern).

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
track-year-specialty form needs the catalogue to derive the specialty semester.

The record columns are `field, professor, subject, room, day, time, week,
source, color` (semantically `field` is the class reference). `week` contains
`''`, `SA`, or `SB`; `source` identifies the exact PDF page; `color` is a
lowercase `#rrggbb` value or empty. Session kind is not a CSV field, so every
partial record carries `missing: ['session_kind']`.

## Generation

```js
catalogue.years;
catalogue.specialties;
catalogue.classes;
```

Each list is derived lazily on first access from the catalogue's rules; there
are no `generate*` methods. For the default catalogue:

- 11 years: LBC1-3, LCE1-3, LCS1-3, MP1-2
- 26 specialties: 3 common (LBC1, LCE1, LCS1) + 23 non-common
  (GLSI3-5, BI3-6, EB5-6, IoT3-6, IRS3-6, EXR1-3, SD1-3)
- 210 classes (singleton, group and cohort specificity)

## Query helpers

```js
querySpecialties(catalogue, predicate = () => true)
queryClasses(catalogue, predicate = () => true)
queryRecords(records, filters = {})
```

`querySpecialties` and `queryClasses` filter the derived catalogue lists by
predicate. `queryRecords` returns records matching every field of a filter
object.

## Testing

```sh
node --test domain-model/index.test.js
# or, from this directory
npm test
```

The suite has 15 tests. Run from the repository root:

```sh
cd domain-model && npm test
```

## Institution-specific catalogue

`./domain-model/catalogue.js` exports `createCatalogue(records)` and a default
`catalogue = createCatalogue()`, plus the specifier and year objects it builds
(`lbc`, `lce`, `lcs`, `mp`, `bi`, `eb`, `iot`, `irs`, `glsi`, `exr`, `sd`,
`y1`, `y2`, `y3`).

It declares four tracks (LBC, LCE, LCS, MP) with their common trunk years and
non-common specialties (BI, EB, IoT, IRS, GLSI, EXR, SD), each with attached
group/cohort populations per year.
