# Domain model library

This library provides the normalized timetable domain model used by the
application. It is JavaScript-only and uses runtime validation plus tagged
objects so callers can distinguish valid values, invalid input, ambiguity, and
missing publication data without inspecting nullable fields. Every `type` is
an exported unique symbol from the `Type` enum-like object.

Import it as an ES module:

```js
import {
  Catalogue,
  branch,
  classPopulation,
  parseReference,
  Type
} from './domain-model/index.js';
```

## Core rule: switch on `type`

Most results are discriminated by a `type` property. Compare it with the
exported `Type` symbols and use `switch`; do not assume that a result contains
every possible property:

```js
const result = parseReference('LCS1 A2');

switch (result.type) {
  case Type.INVALID_REFERENCE:
    console.error(result.diagnostics);
    break;
  case Type.TRACK_REFERENCE:
    console.log(result.track.identifier);
    break;
  case Type.BRANCH_REFERENCE:
    console.log(result.branch.identifier);
    break;
  case Type.CLASS_REFERENCE:
    console.log(result.class.identifier);
    break;
  case Type.TRACK_SPECIFIER_REFERENCE:
    console.log(result.track_specifier.value);
    break;
  case Type.SPECIALIZATION_SPECIFIER_REFERENCE:
    console.log(result.specialization_specifier.value);
    break;
}
```

Invalid constructor arguments throw an `Error`. Parsing and catalogue
resolution return explicit result variants because invalid input and an absent
catalogue entry are normal query outcomes.

## Track specifiers, year specifiers, and tracks

The library distinguishes reusable specifiers from the concrete track they
form. A **track specifier** names a degree family, a **year specifier** names
its year, and a **track** couples both:

```js
const specifier = trackSpecifier('LCS');
const year = yearSpecifier(2);
const concreteTrack = track({
  track_specifier: specifier,
  year_specifier: year
});
const common = singletonBranch(concreteTrack);
const specialization = branch({
  specialization_specifier: specializationSpecifier('GLSI'),
  branch_semester_specifier: branchSemesterSpecifier(3),
  track: concreteTrack
});
const sectionless = parseReference('MP1-EXR', { expected: 'branch' }).branch;
```

`track({ track_specifier, year_specifier })` produces:

```js
{
  type: Type.TRACK,
  track_specifier: { type: Type.TRACK_SPECIFIER, value: 'LCS' },
  year_specifier: { type: Type.YEAR_SPECIFIER, value: 2 },
  identifier: 'LCS2'
}
```

Specifiers are primitive abstractions: they are not intended to stand alone
as complete catalogue objects. They complement one another to create a
concrete track.

`branch()` creates only specialization branches from a completed `track`, a
specialization specifier, and a branch-semester specifier:

```js
branch({
  track: concreteTrack,
  specialization_specifier: specializationSpecifier('GLSI'),
  branch_semester_specifier: branchSemesterSpecifier(3)
}); // specialization branch
```

`singletonBranch()` is the explicit constructor for a common branch from a
completed track:

```js
singletonBranch(concreteTrack);
```

Passing only a track to `branch()` is an error. This keeps the composition
boundary explicit: specifiers compose a track; `singletonBranch()` creates a
common branch; `branch()` creates a specialization branch.

The resulting branch variants are:

| `Type` value | Meaning |
|---|---|
| `Type.COMMON_BRANCH` | A common branch based on a concrete track such as `LCS2` |
| `Type.SPECIALIZATION_BRANCH` | A specialization with a concrete track prefix such as `GLSI3` |
| `Type.SECTIONLESS_BRANCH` | A branch published as its own singleton class such as `MP1-EXR` |

For a specialization whose semester must be calculated from a starting year:

```js
const semester = branchSemesterFor({
  year_specifier: 3,
  branch_start_year: 2,
  year_semester_specifier: yearSemesterSpecifier(1)
}); // { type: Type.BRANCH_SEMESTER_SPECIFIER, value: 3 }
const value = branch({
  specialization_specifier: specializationSpecifier('GLSI'),
  branch_semester_specifier: semester,
  track: track({
    track_specifier: trackSpecifier('LCS'),
    year_specifier: yearSpecifier(3)
  })
});
```

`yearSemesterSpecifier()` accepts only `1` or `2`.
`branchSemesterSpecifier()` accepts positive integer branch-semester values.

## Classes and class references

A branch can produce one of three class variants:

```js
const b = singletonBranch(track({
  track_specifier: trackSpecifier('LCS'),
  year_specifier: yearSpecifier(1)
}));

const singleton = classPopulation({ branch: b });
const section = classPopulation({
  branch: b,
  section_specifier: sectionSpecifier('A')
});
const cohort = classPopulation({
  branch: b,
  section_specifier: sectionSpecifier('A'),
  cohort_specifier: cohortSpecifier(2)
});
```

| `Type` value | Identifier example |
|---|---|
| `Type.SINGLETON_CLASS` | `LCS1` |
| `Type.SECTION_CLASS` | `LCS1 A` |
| `Type.COHORT_CLASS` | `LCS1 A2` |

The variants contain only fields that apply to them. A section class has a
`section_specifier`; a cohort class has both `section_specifier` and
`cohort_specifier`; a singleton class has neither. Use
`sectionSpecifier()` and `cohortSpecifier()` to create the reusable
components.

`parseReference()` returns explicit reference variants for tracks, track
specifiers, specialization specifiers, branches, and classes:

```js
parseReference('LCS2');           // track-reference
parseReference('LCS');            // track-specifier-reference
parseReference('GLSI');           // specialization-specifier-reference
parseReference('LCS3 GLSI3');        // branch-reference
parseReference('GLSI3 A');        // section-class reference
parseReference('GLSI3A2');        // cohort-class reference
parseReference('LCS3 GLSI3 A2');  // verbose specialization reference
parseReference('MP1-EXR');        // sectionless branch reference
```

`LCS2` defaults to a track reference because it is the concrete composition of
the known common track specifier `LCS` and year specifier `2`. A common branch
uses the same notation, so provide the consumer's expectation when a branch is
needed. Expectations may be `track-specifier`, `specialization-specifier`,
`track`, `branch`, or `class`:

```js
parseReference('LCS2', { expected: 'track' });  // track-reference
parseReference('LCS2', { expected: 'branch' }); // branch-reference
parseReference('MP1-EXR', { expected: 'class' }); // class-reference
```

The class interpretation of a sectionless identifier is its
`Type.SINGLETON_CLASS`. An incompatible expectation returns
`Type.INVALID_REFERENCE` instead of silently choosing another object kind.

To support institution-specific common tracks, pass `commonTracks`:

```js
const result = parseReference('BIO1', { commonTracks: ['BIO'] });
// result.branch.type === Type.COMMON_BRANCH
```

Without that option, unknown codes such as `BIO1` are interpreted as
sectionless branches rather than common branches.

## Population references and session kind

Session kind combines teaching format and population scope:

| Session kind | Required population |
|---|---|
| `branch-lecture` | branch |
| `section-seminar` | section class |
| `cohort-lab-work` | cohort class |

Create a population reference with an optional session-kind constraint:

```js
const lecturePopulation = populationReference({
  reference: 'LCS1',
  session_kind: 'branch-lecture'
});
const seminarPopulation = populationReference({
  reference: 'LCS1 A',
  session_kind: 'section-seminar'
});
const labPopulation = populationReference({
  reference: 'LCS1 A2',
  session_kind: 'cohort-lab-work'
});
```

The returned variants are `Type.BRANCH_POPULATION`,
`Type.SECTION_POPULATION`, and `Type.COHORT_POPULATION`. Incompatible
combinations throw an error:

```js
populationReference({
  reference: 'LCS1 A',
  session_kind: 'branch-lecture'
}); // throws
populationReference({
  reference: 'LCS1',
  session_kind: 'section-seminar'
}); // throws
```

`sessionKind()` normalizes a short activity alias or validates a canonical
session-kind value:

```js
sessionKind('lecture');         // 'branch-lecture'
sessionKind('section-seminar'); // 'section-seminar'
```

## Complete session specifiers

`sessionSpecifier()` constructs a complete recurring session. It requires
subject, teacher, room, population, day, time, and activity information:

```js
const session = sessionSpecifier({
  subject: 'Algebra',
  teacher: 'Ada Lovelace',
  room: 'B12',
  population: 'LCS1 A',
  day: 'Lundi',
  time: '10H00-11H30',
  week_pattern_specifier: 'SA',
  session_kind: 'section-seminar'
});

session.session_kind;          // 'section-seminar'
session.week_pattern_specifier; // 'SA'
```

Days are normalized to uppercase French names. Time slots are normalized to
the library's `08h15-09h45` format. The exported `DAYS` and `SLOTS` sets
contain the accepted values.

Week-pattern specifiers are:

```js
weekPatternSpecifier('');      // ''
weekPatternSpecifier('SA');    // 'SA'
weekPatternSpecifier('SB');    // 'SB'
```

`S1` is not a week-pattern specifier and is rejected.

## CSV records

`fromCsvRecord()` is the boundary for scalar normalized CSV data. It returns
either a partial session record or an explicit validation failure:

```js
const result = fromCsvRecord({
  field: 'LCS1-A Groupe 2',
  professor: 'Teacher',
  subject: 'Algebra',
  room: 'B12',
  day: 'Lundi',
  time: '10H00-11H30',
  week: 'SA',
  source: 'page 2',
  color: '#aabbcc'
});

switch (result.type) {
  case Type.INVALID_CSV_RECORD:
    console.error(result.errors);
    break;
  case Type.PARTIAL_SESSION_RECORD:
    console.log(result.population.type); // Type.COHORT_POPULATION
    console.log(result.missing);          // ['session_kind']
    break;
}
```

CSV records currently do not contain a session kind, so successful
records are intentionally `partial-session-record` values. Missing required
fields, malformed references, and invalid week-pattern specifiers return
`Type.INVALID_CSV_RECORD` with an `errors` array.

## Catalogue resolution

`Catalogue` combines maintained branches and classes with publication records:

```js
const catalogue = new Catalogue({
  branches: ['LCS1', 'LCS2'],
  classes: ['LCS1 A', 'LCS1 A2'],
  records: [result]
});

const resolution = catalogue.resolve('LCS1 A2');
```

The same interpretation preference can be passed to catalogue resolution:

```js
catalogue.resolve('MP1-EXR', { expected: 'branch' });
catalogue.resolve('MP1-EXR', { expected: 'class' });
```

Resolution is one of four variants:

| `Type` value | Meaning |
|---|---|
| `Type.INVALID_RESOLUTION` | The reference is syntactically invalid |
| `Type.NOT_FOUND` | The syntax is valid but no catalogue entry matches |
| `Type.UNIQUE_MATCH` | Exactly one catalogue entry matches |
| `Type.AMBIGUOUS_MATCH` | Multiple catalogue entries match |

For a unique match:

```js
if (resolution.type === Type.UNIQUE_MATCH) {
  console.log(resolution.catalogue.match.identifier);
  if (resolution.publication.type === Type.RECORDS) {
    console.log(resolution.publication.records);
  }
}
```

Publication status is independent of catalogue status. A valid catalogue
match can have either `publication.type === Type.RECORDS` or
`publication.type === Type.NO_RECORDS`.

Sectionless branches automatically receive their singleton class in the
catalogue. The branch and class are separate objects even when they share the
same identifier.

## Queries

The query helpers operate on already-created domain collections:

```js
const lcsBranches = queryBranches(
  catalogue,
  (value) => value.identifier.startsWith('LCS')
);

const sectionClasses = queryClasses(
  catalogue,
  (value) => value.type === Type.SECTION_CLASS
);

const mondayRecords = queryRecords(catalogue.records, { day: 'LUNDI' });
```

`queryRecords()` applies exact equality for every supplied filter key.

## Testing

The library tests are colocated with the implementation:

```sh
node --experimental-default-type=module --test domain-model/index.test.js
```
