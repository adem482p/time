# Domain model

## Meta

This document defines the normalized domain model and its notation. It
describes the scheduling data after the source documents have been interpreted,
not the visual structure of those documents.

Each concept has:

- **Relational definition** — what the concept means through its relationships
  with other concepts.
- **Editorial definition** — a self-contained explanation.
- **Alternative terms** — standard terms that may be used when communicating
  the same idea.

The model uses **specifiers** as primitive abstractions. A specifier is not
intended to stand alone as a complete domain object; it complements another
specifier or object and further specifies it. The model is therefore built
bottom up: an abstract track specifier and a year specifier combine to form a
concrete track. This gives the concrete object the shorter, more frequently
used name while retaining explicit names for the reusable parts.

The model uses both generic and level-specific terms. A generic term can refer
to a concept at any level of a hierarchy; a specific term identifies the level
more precisely. A branch is a curricular node such as `LCS1` or the non-common
branch represented compactly by `GLSI3`; normally a class is a branch together
with a section or with a section and cohort. A branch without sections also
contains a singleton class. Thus `GLSI3 A` and `GLSI3 A1` identify classes at
different levels of specificity.

The hierarchy is described from three complementary perspectives:

1. A **central concept** is the node currently being described.
2. Its **prefix** is the path of preceding levels by which that targeted node
   is reached.
3. Its **sub-branches** are the child nodes into which it divides. A branch
   does not itself have section or cohort sub-branches: once a branch is
   followed by a section, the result is a class.

The same hierarchy can be described from different central concepts. For
example, from the perspective of the class `GLSI3 A`, `GLSI3` is its prefix;
from the perspective of the cohort class `GLSI3 A1`, `GLSI3 A` is its prefix.
`GLSI3 A` is the central class concept, and its more specific class forms are
`GLSI3 A1` and `GLSI3 A2`.

## Schedule

**Relational definition.** The schedule is the complete normalized
description of teaching: classes, subjects, teachers, rooms, and session
specifiers. A teacher timetable, a class timetable, and other timetable views
are projections of the schedule; they do not constitute separate schedules.

**Editorial definition.** The schedule is the whole set of normalized
timetable facts for the publication being modelled. The domain schedule
includes session kind even when the current CSV does not yet
represent it.

**Alternative terms.** scheduling model; schedule dataset; teaching schedule.

## Track specifier

**Relational definition.** A track specifier is the reusable designation of a
degree family. It combines with a year specifier to form a track. It is not a
complete track object by itself.

**Editorial definition.** A track specifier is a tag such as `LBC`, `LCE`,
`LCS`, or `MP` that identifies the broad field of study without selecting a
year.

**Alternative terms.** track tag; degree-family specifier.
specifier.

## Year specifier

**Relational definition.** A year specifier is the reusable numeric designation
of a year within a track. It combines with a track specifier to form a
concrete track. It is not a branch-semester specifier.

**Editorial definition.** A year specifier is a value such as `1`, `2`, or `3`
that identifies the year of study once coupled with a track specifier.

**Alternative terms.** year number; study-year specifier; level specifier.

## Track

**Relational definition.** A track couples a track specifier and a year
specifier. It is the concrete level-specific object written as `LCS1`,
`LCS2`, or `MP1`. A common branch is formed directly from a track; a track
may also prefix non-common branches that begin at that level.

**Editorial definition.** A track identifies a degree family at one year of
study. The name `track` is reserved for this frequently used concrete object;
the abstract family is called a track specifier.

**Alternative terms.** track level; level-specific track; degree-family level.

## Branch semester

**Relational definition.** A branch semester is the semester position of a
non-common branch within its progression. Its number is counted from the
branch's starting point, not from the track's year specifier. It is the semester
number included in the branch's canonical identity and compact notation.

**Editorial definition.** A branch semester is a curriculum position such
as semester `1` or semester `3` for the non-common branch `GLSI3`. It is
calculated from the branch's starting point recorded in the catalogue and the
implicit current-semester context:

`branchSemester = 2 * (yearSpecifier - start) + YEAR_SEMESTER`

**Alternative terms.** semester of study; branch progression semester.

## Branch-semester specifier

**Relational definition.** A branch-semester specifier is the numeric
component attached to a non-common branch in compact notation. It identifies
the branch's semester and is distinct from the year specifier
attached to a track. In `GLSI3`, the `3` is counted from the start of GLSI.

**Editorial definition.** A branch-semester specifier is the digit in a
compact name such as the `3` in `GLSI3`. It means the third semester counted
from the beginning of the GLSI branch.

**Alternative terms.** semester number; branch-semester number; semester index.

## Year-semester specifier

**Relational definition.** A year-semester specifier identifies the first or
second semester within a year. It supplies the year-semester context used when
calculating branch-semester specifiers and interpreting source labels such as
`S1`. It is not itself encoded as a permanent property of a class.

**Editorial definition.** A year-semester specifier is `1` or `2`. It is
explicit input to calculations rather than a property repeated on every class
or session.

**Alternative terms.** year half; semester within year.

## Branch

**Relational definition.** A branch is an explicit curricular object in the
catalogue that prefixes classes. A common branch consists of a track and year
specifier, such as `LCS1`. A non-common branch is canonically identified by a
specialization identifier/name/branch name and the branch-semester number
counted from the start of that specialization, such as `GLSI3`. Its more
verbose notation may make the implied prefix explicit, such as `LCS3 GLSI3`.
A branch is not
subdivided into sections or cohorts as a branch object; the combination of a
branch and section is a class. From the perspective of that class, the branch
is its prefix.

**Editorial definition.** A branch is a curriculum subdivision such as `LCS1`
or `GLSI3`. For a non-common branch, **specialization** is the preferred term,
although specialization and branch are synonymous in this model. `LCS1` is
itself the complete common branch; `LCS1 A2` is a class below that branch, not a
branch. Branch is not a synonym for a section, cohort, or class.

**Alternative terms.** specialization; specialization name; specialization
identifier; branch name; study stream; study pathway; curriculum branch.

## Specialization specifier

**Relational definition.** A specialization specifier is the syntactic
component that names a non-common specialization within a reference. It
combines with a branch-semester specifier to identify a non-common branch.
By itself it does not identify a branch object, just as a year specifier or
branch-semester specifier does not identify its complete object by itself.

**Editorial definition.** In `GLSI3`, `GLSI` is the specialization specifier.
The complete branch object is `GLSI3`, which may also be written more
verbosely as `LCS3 GLSI3`.

**Alternative terms.** specialization code; specialization token; branch
specifier.

## Class

**Relational definition.** Normally, a class is exactly a branch plus a
section, or a branch plus a section and cohort. Its branch is the prefix by
which the class is reached. A section class such as `GLSI3 A` and a cohort
class such as `GLSI3 A1` are both classes; the latter is more specific, but
neither is a branch. If a branch has no section subdivision, it contains a
singleton class whose identifier is the same as the branch identifier.

**Editorial definition.** A class is a defined student group that follows a
timetable and a planned set of courses. It normally has a branch and section,
and may also have a cohort. A branch without sections is represented as a
singleton class for timetable purposes.

**Alternative terms.** student group; teaching group.

## Singleton class

**Relational definition.** A singleton class is the explicit class entry
contained by a branch that has no section subdivision. Every sectionless
branch has exactly one singleton class. Its class identifier/reference is equal
to the branch identifier/reference, so the same notation can resolve either
to the branch object or to its one class object.

**Editorial definition.** A singleton class is an explicit catalogue class
entry whose branch is also its complete class identifier, such as the master
entries `MP1-EXR`, `MP1-SD`, and `MP2-EXR` present in the current parsed data.

**Alternative terms.** undivided class; single-section class; branch-level
class.

## Section

**Relational definition.** A section is the section component of a class. Its
letter is scoped to its branch prefix: `LCE2-IoT A` and `LCE2-IRS A` are
different classes. A section specifier is the reusable letter component; a
section class combines it with a branch. A section may be followed by a cohort
specifier, producing a more specific class.

**Editorial definition.** A section is a lettered component of a class, such
as `A` or `E`. The section specifier is not a class by itself.

**Alternative terms.** section specifier; class section; section group;
section division.

## Cohort

**Relational definition.** A cohort is the cohort component of a class after
its branch and section. It is the deepest level where the source divides a
section into `Groupe 1` and `Groupe 2`. A cohort specifier is the reusable
numbered component; a cohort class combines it with a section class.

**Editorial definition.** A cohort is a numbered subgroup inside a section,
usually `1` or `2`. In this project it means the source's teaching subgroup,
not a year-of-entry population. The cohort specifier is not a class by
itself.

**Alternative terms.** cohort specifier; teaching group; subgroup; lab group.

## Population reference

**Relational definition.** A population reference is the generic audience
notation attached to a session specifier. It may identify a branch or a class,
depending on the session kind. A branch-lecture population reference addresses
a branch; a section-seminar reference addresses a section; and a cohort-lab-work
reference addresses a cohort.

**Editorial definition.** A population reference identifies the student
population to which a session applies without requiring every session to be
addressed at the same population specificity.

**Alternative terms.** audience reference; attendance reference; group
reference.

## Session specifier

**Relational definition.** A session specifier describes a recurring teaching
activity without selecting a specific calendar date. It combines a subject,
session kind, teacher, room, population reference, day, time slot, and
week-pattern specifier.

**Editorial definition.** A session specifier says that a class activity
occurs every week, in week A, or in week B at a specified day and time. It
does not identify one dated meeting.

**Alternative terms.** recurring class; scheduled activity pattern; recurrence
record.

## Session kind

**Relational definition.** A session kind combines instructional format and
population scope. The canonical values are `branch-lecture`,
`section-seminar`, and `cohort-lab-work`; each maps to exactly one population
scope. Lectures apply to branches, seminars to sections, and lab work to
cohorts.
The source currently writes the kinds with the prefixes `C_`, `TD_`, and
`TP_`, but those spellings are publication conventions rather than domain
invariants.

**Editorial definition.** A session kind says both what instructional activity
occurs and which population it addresses.

**Alternative terms.** activity type; instruction format.

## Subject

**Relational definition.** A subject is taught through one or more session
specifiers. The same subject may have lectures,
seminars, labs, or any combination, and different kinds may have different
teachers.

**Editorial definition.** A subject is an academic course or module.

**Alternative terms.** course; module; course unit.

## Teacher

**Relational definition.** A teacher teaches session specifiers. A teacher
timetable is a projection of the schedule containing the session specifiers
taught by that teacher, regardless of their classes.

**Editorial definition.** A teacher is the person responsible for teaching a
session.

**Alternative terms.** instructor; lecturer; teaching staff member.

## Room

**Relational definition.** A room is the location assigned to a session
specifier. It belongs to the teaching activity, not to the subject or class.

**Editorial definition.** A room is the place where a session occurs.

**Alternative terms.** classroom; teaching room; venue.

## Day

**Relational definition.** A day is a temporal coordinate of a session
specifier. It combines with a time slot to locate the activity in a timetable.

**Editorial definition.** A day is one of `Lundi`, `Mardi`, `Mercredi`,
`Jeudi`, `Vendredi`, or `Samedi`.

**Alternative terms.** day of week; weekday.

## Time slot

**Relational definition.** A time slot is the recurring time coordinate of a
session specifier. Each day has the same six slots, and a slot may contain
alternative session specifiers distinguished by their week-pattern specifiers.

**Editorial definition.** A time slot is one of these fixed intervals:

1. `08:15`–`09:45`
2. `10:00`–`11:30`
3. `11:40`–`13:10`
4. `13:20`–`14:50`
5. `15:00`–`16:30`
6. `16:45`–`18:15`

**Alternative terms.** class period; teaching period; timetable period.

## Week-pattern specifier

**Relational definition.** A week-pattern specifier qualifies a session
specifier within its day and time slot. An empty specifier means every week;
`SA` and `SB` mean the alternating weeks A and B. It is a recurrence
specifier, not a calendar week object.

**Editorial definition.** A week-pattern specifier is one of `''`, `SA`, or
`SB`. The source labels the alternating patterns `SA` and `SB`.

**Alternative terms.** recurrence specifier; alternating-week specifier;
weekly specifier.

## Timetable projection

**Relational definition.** A timetable projection selects and arranges
session specifiers from the schedule according to an owner or query. A class
projection shows a class's session specifiers; a teacher projection shows a
teacher's session specifiers. Different projections may contain the same
session specifier.

**Editorial definition.** A timetable projection is a view of the schedule
organized by day and time for a selected class, teacher, or other filter.

**Alternative terms.** schedule view; timetable view; schedule projection.

## Name

**Relational definition.** A name is a notation for a domain concept. A
source-facing name may preserve the publication's hierarchy, while a class
identifier encodes a branch, branch-semester specifier, section, and
cohort. The same object may be written with different levels of verbosity;
these are notation variants, not a separate alias concept.

**Editorial definition.** A name is a human-readable or machine-readable
designation for a track, branch, class, or other concept.

**Alternative terms.** designation; label; identifier.

## Identifier

**Relational definition.** An identifier is the canonical notation owned by a
concrete domain object. A reference is an input notation expected to resolve
to that object; when resolution is one-to-one, the reference and the object's
identifier have the same value. In the singleton case, one identifier can be
owned by both a branch and its singleton class.

**Editorial definition.** An identifier names the object it belongs to, while
a reference is the notation supplied for lookup. They are intentionally
combined in this model when the reference resolves one-to-one.

**Alternative terms.** designation; canonical reference; object notation.

## Branch identifier

**Relational definition.** A branch identifier is the canonical identifier of
a branch object. A common branch is written from a track and year specifier,
such as `LCS1`. A non-common branch is written from a specialization
specifier and branch-semester specifier, such as `GLSI3`; its verbose form
may make the prefix explicit, as in `LCS3 GLSI3`.

**Editorial definition.** A branch identifier identifies a branch. Usually its
classes have more specific class identifiers; for a branch without sections,
the same identifier also identifies its singleton class. A consumer can choose
which object interpretation it needs.

**Alternative terms.** branch reference; branch notation; specialization
identifier.

## Class identifier

**Relational definition.** A class identifier is the canonical identifier of a
class below a branch. It writes a branch, a space, a section, and optionally a cohort:
`GLSI3 A` or `GLSI3 A1`. A verbose non-common form may make the implied prefix
explicit, as in `LCS3 GLSI3 A2`. The parser may also accept compact input such
as `GLSI3A2`.

**Editorial definition.** A class identifier may be broad or specific.
`LCS1 A` and `GLSI3 A` are broad identifiers because they omit the cohort;
`LCS1 A2` and `GLSI3 A1` are specific identifiers because they include it.

**Alternative terms.** class reference; class notation; class designation.

## Resolution

**Relational definition.** Resolution is the interpretation of a branch or
class reference through three separate concepts: syntactical validity,
catalogue match, and publication presence. Resolution is not assumed to be a
function that returns one value; an attempt may produce multiple catalogue
matches or diagnostics. A consumer may provide an expected object kind before
parsing, such as branch or class, to choose between valid interpretations of
the same notation.

**Editorial definition.** Resolution is the process of determining what a
reference means and whether it is represented in the maintained catalogue and
current timetable data.

**Alternative terms.** lookup; interpretation; reference resolution.

## Syntactical validity

**Relational definition.** Syntactical validity describes whether a branch or
class reference follows the notation rules for tracks, branches, sections, and
cohorts. It is independent of whether the reference names anything in the
catalogue or appears in the current publication.

**Editorial definition.** A reference is syntactically valid when its written
form can be parsed according to the class notation.

**Alternative terms.** syntax validity; parse validity; well-formedness.

## Catalogue match

**Relational definition.** A catalogue match is the set of branch or class
objects identified by a syntactically valid reference. A branch match
represents a branch object whose classes can be queried; a class match
represents a class object. The set may contain zero, one, or multiple objects,
so absence and ambiguity are distinct outcomes.

**Editorial definition.** A catalogue match states which maintained catalogue
elements, if any, correspond to a reference.

**Alternative terms.** lookup match; candidate set; catalogue resolution.

## Publication presence

**Relational definition.** Publication presence states whether a matched
catalogue branch or class has corresponding records in the current timetable
publication. It is independent of syntax and catalogue existence.

**Editorial definition.** Publication presence is whether the current
normalized timetable data contains the referenced element.

**Alternative terms.** publication status; data presence; schedule presence.

## Catalogue

**Relational definition.** The catalogue describes the available tracks and
branches and the class populations associated with them through sections and
cohorts. It is not itself treated as a hierarchy of domain objects. Its
structure is fixed by the model, while its field values are populated by a
union of raw timetable evidence and editorial corrections, normalization, or
additions.

**Editorial definition.** The catalogue is the maintained description of known
tracks, branches, and class populations. It explicitly contains one singleton
class for every sectionless branch, and may contain branches or classes absent
from the current timetable publication.

**Alternative terms.** academic catalogue; curriculum catalogue; curriculum
catalogue.
