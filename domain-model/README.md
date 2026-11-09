# Domain model

A small, constructive data model for the university timetable. Plain frozen
objects, no classes, no methods. Objects reference objects at construction;
shared identity makes the graph reflective.

```js
import { catalogue } from './domain-model/catalogue.js';
import { resolve, ancestors, descendants, classes, sessionsFor, isPublished } from './domain-model/query.js';
import { catalogFromCsv } from './domain-model/csv.js';
import { formatClass, formatSession } from './domain-model/print.js';
```

## Entities

| Entity | Fields | Label |
|---|---|---|
| track | plain string specifier (`'LCS'`) — not an entity | — |
| `Year` | `track`, `number` | `LCS3` |
| `Specialty` | `code`, `track`, `startsYear`, `durationSemesters` | `GLSI` |
| `Semester` | `specialty`, `index` (1-based on path), `year`, `withinYear` (derived) | `GLSI3` = GLSI's 3rd semester |
| `Class` | `semester` (`Semester` or trunk `Year`), `group` (`string\|null`), `cohort` (`1\|2\|null`) | `GLSI3 A1` |
| `Session` | `population` (`Class\|Semester`), `subject`, `teacher`/`room`/`kind`/`color` (nullable), `day`, `slot`, `weekPattern` (`every\|A\|B`), `source` | — |

## Construction (`objects.js`)

Factories only — constructors throw on programmer errors (bad enum,
cohort-without-group, stage/year mismatch) and nothing else:

```js
makeYear('LCS', 3)
makeSpecialty('GLSI', 'LCS', { startsYear: 2, durationSemesters: 3 })
makeSemester(glsi, 3, lcs3)        // derives withinYear; throws if year ≠ Y3
makeClass(semester, 'A', 1)        // singleton when group omitted
makeClasses(semester, [{group:'A', cohorts:2}])   // [] → [singleton]
makeSession({ population, subject, teacher, room, day, slot, weekPattern, kind, source, color })
```

`catalogue.js` composes the institute from these calls; `makeCatalog(...)`
(`catalog.js`) only indexes them (`byLabel`, per-specialty/per-semester/
per-population maps) and throws on a duplicate `(kind, label)`.

## Reflective queries (`query.js`)

Catalog as explicit context; the graph answers the question:

```js
a.semester.specialty === b.semester.specialty        // same specialty
descendants(catalog, glsi).filter(isClass)           // classes studying GLSI
classes(catalog, c => c.semester === cls.semester && c.group === cls.group && c.cohort !== null)  // cohorts of cls
ancestors(cls) / parentOf(cls) / children(catalog, x) / commonAncestors(a, b)
sessionsFor(catalog, obj) / isPublished(catalog, obj)  // [] / false is normal (off-semester)
weeksOverlap('A', 'B')                                // false; 'every' overlaps all
```

## String resolution

`resolve(catalog, string, {as})` — canonical labels only, three stages
(normalize → `byLabel` lookup → optional `as` kind filter). Returns exactly
one of `found | ambiguous | notFound | wrongKind | invalid`.

```js
resolve(catalog, 'GLSI3 A1', { as: 'class' })   // → {type:'found', object}
resolve(catalog, 'EXR1')                        // → {type:'ambiguous', matches:[Semester, Class]} (singleton shares the label)
```

## CSV (`csv.js`)

```js
catalogFromCsv({ text, catalog })  // → {catalog, sessions, rejected:[{row, errors}]}
```

Owns the publication notation (`LBC2-BI_A Groupe 1` → `BI1 A1`, `MP1-EXR` →
singleton class `EXR1`). Missing teacher → `teacher:null`; `week:'S1'` is
rejected as a semester label; nothing is silently dropped.

## Testing

```sh
cd domain-model && npm test   # node --test model.test.js
```

15 tests: construction + invariants, catalogue counts (11 years, 7
specialties, 23 semesters, 210 classes), resolution, reflective queries,
all publication-notation shapes, rejection cases, and the full `time.csv`
(2093 sessions, 94 published classes, 4 null teachers).
