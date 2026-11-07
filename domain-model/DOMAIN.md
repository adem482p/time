# Domain model

## Meta

This document defines the normalized domain model and its notation.

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
concrete year. This gives the concrete object the shorter, more frequently
used name while retaining explicit names for the reusable parts.

The model uses both generic and level-specific terms. A generic term can refer
to a concept at any level of a hierarchy; a specific term identifies the level
more precisely. A specialty is a curricular node such as `LCS1` or the
non-common specialty represented compactly by `GLSI3`; normally a class is a
specialty together with a section or with a section and cohort. A specialty
without sections also contains a singleton class. Thus `GLSI3 A` and `GLSI3 A1`
identify classes at different levels of specificity.

The hierarchy is described from three complementary perspectives:

1. A **central concept** is the node currently being described.
2. Its **prefix** is the path of preceding levels by which that targeted node
   is reached.
3. Its **children** are the child nodes into which it divides. A specialty
   does not itself have section or cohort children: once a specialty is
   followed by a section, the result is a class.

## Curricular Tree Progression and Non-Convergence

Academic curricula follow a strict directed tree progression without loops or
re-convergence. The native temporal unit of course progression is the **academic semester**.
A degree family operates across global degree semesters $G \in \{1, 2, \dots, 2D\}$,
where for any academic year specifier $Y$ and year-semester specifier $S \in \{1, 2\}$:

$$G = 2(Y - 1) + S$$

Conversely, from global semester $G$:
$$Y = \lfloor (G - 1) / 2 \rfloor + 1, \quad S = ((G - 1) \bmod 2) + 1$$

Non-common specialties declare their start coordinate ($G_{\text{start}}$) and their
exact length in academic semesters (`duration_semesters`). A specialty does not necessarily
span a multiple of full years; for example, licence specialties such as `GLSI`
run for 3 semesters ($S3, S4, S5$), as semester 6 is reserved for the graduation project
(PFE) without scheduled course sessions.

A degree family represented by a track specifier begins either:

1. As an undivided **common trunk** (a sequence of common specialties starting
   strictly at year specifier 1 up to some level $k \ge 1$), or
2. Directly as **non-common specialties** from year specifier 1 (in which case
   no common trunk exists, $k = 0$).

**Derivation of Track Duration and Common Trunk:**
Tracks do not declare manual durations or trunks; these are pure derivations from
the specialty rules:
- Earliest specialty divergence: $G_{\min} = \min_{b} G_{\text{start}}(b)$.
- Common trunk depth in academic years: $Y_{\text{trunk}} = \lfloor (G_{\min} - 1) / 2 \rfloor$.
- Total degree years: $D = \lceil \max_{b} (G_{\text{start}}(b) + \text{duration\_semesters}(b) - 1) / 2 \rceil$.

**The Non-Convergence Invariant:** Curricular specialties **never merge back**.
Once a degree family diverges into specialties at semester $G_{\min}$,
common specialties permanently cease for that track specifier. Distinct specialties
cannot converge or recombine into a shared specialty at any subsequent semester.
A track specifier's progression may only stay common or divide into specialties;
it never returns to common.

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
degree family. It combines with a year specifier to form a year. It is not a
complete year object by itself.

**Editorial definition.** A track specifier is a tag such as `LBC`, `LCE`,
`LCS`, or `MP` that identifies the broad field of study without selecting a
year specifier.

**Alternative terms.** track tag; degree-family specifier.

## Year specifier

**Relational definition.** A year specifier is the reusable numeric designation
of a year level within a degree family. It combines with a track specifier to form a
concrete year. It is not a specialty-semester specifier.

**Editorial definition.** A year specifier is a value such as `1`, `2`, or `3`
that identifies the year of study once coupled with a track specifier.

**Alternative terms.** year number; study-year specifier; level specifier.

## Year

**Relational definition.** A year couples a track specifier and a year
specifier. It is the concrete level-specific object written as `LCS1`,
`LCS2`, or `MP1`. A common specialty is formed directly from a year; a year
may also prefix non-common specialties that begin at that level.

**Editorial definition.** A year identifies a degree family at one year of
study. The name `year` is reserved for this frequently used concrete object;
the abstract family is called a track specifier.

**Alternative terms.** year level; degree-family year; level-specific year.
Deprecated alternative term: track.

## Specialty semester

**Relational definition.** A specialty semester is the semester position of a
non-common specialty within the curriculum progression, counted from the start
of that specialty. The first semester of a specialty is semester 1, the second
is semester 2, etc. It is related to the global degree semester $G$ and the
specialty's start global semester $G_{\text{start}}$ by:

$\text{specialtySemester} = G - G_{\text{start}} + 1$

where $G = 2(Y - 1) + S$ for academic year specifier $Y$ and year-semester specifier $S$.

For example, `GLSI` starts at global semester 3 (year 2, semester 1). Its
semesters are: `GLSI1` (global 3), `GLSI2` (global 4), `GLSI3` (global 5).
A specialty spans a discrete number of active semesters given by its `duration_semesters`.

**Alternative terms.** semester of study; specialty progression semester.

## Specialty-semester specifier

**Relational definition.** A specialty-semester specifier is the numeric
component attached to a non-common specialty in compact notation. It identifies
the specialty's semester counted from the start of that specialty. In `GLSI3`,
the `3` means the third semester of the GLSI specialty.

**Editorial definition.** A specialty-semester specifier is the digit in a
compact name such as the `3` in `GLSI3`. It means the third semester counted
from the beginning of the GLSI specialty.

**Alternative terms.** semester number; specialty-semester number; semester index.

## Year-semester specifier

**Relational definition.** A year-semester specifier identifies the first or
second semester within a year. It supplies the year-semester context used when
calculating specialty-semester specifiers and interpreting source labels such as
`S1`. It is not itself encoded as a permanent property of a class.

**Editorial definition.** A year-semester specifier is `1` or `2`. It is
explicit input to calculations rather than a property repeated on every class
or session.

**Alternative terms.** semester within year; study half-year.

## Specialty

**Relational definition.** A specialty is an explicit curricular object in the
catalogue that prefixes classes. A common specialty consists of a year (the couple of a
track specifier and year specifier), such as `LCS1`, and belongs strictly to the
track's initial common trunk. A non-common specialty is canonically
identified by a specialty identifier/name and the specialty-semester number
counted from the start of that specialty, such as `GLSI3`. Its more
verbose notation may make the implied prefix explicit, such as `LCS3 GLSI3`.
A track progression has at most one common specialty stage (the common trunk), which
must begin at year specifier 1 and end before or at the emergence of specialties.
Once a curriculum divides into specialties, common specialties cease permanently
for that track specifier because specialties never merge back.
A specialty is not
subdivided into groups or cohorts as a specialty object; the combination of a
specialty and group is a class. From the perspective of that class, the specialty
is its prefix.

**Editorial definition.** A specialty is a curriculum subdivision such as `LCS1`
or `GLSI3`. `LCS1` is itself the complete common specialty; `LCS1 A2` is a
class below that specialty, not a specialty. Specialty is not a synonym for a
group, cohort, or class.

**Alternative terms.** study stream; study pathway; curriculum specialty;
specialty name; specialty identifier.

## Specialty specifier

**Relational definition.** A specialty specifier is the syntactic
component that names a non-common specialty within a reference. It
combines with a specialty-semester specifier to identify a non-common specialty.
By itself it does not identify a specialty object, just as a year specifier or
specialty-semester specifier does not identify its complete object by itself.

**Editorial definition.** In `GLSI3`, `GLSI` is the specialty specifier.
The complete specialty object is `GLSI3`, which may also be written more
verbosely as `LCS3 GLSI3`.

**Alternative terms.** specialty code; specialty token; specialty tag.

## Class

**Relational definition.** Normally, a class is exactly a specialty plus a
group, or a specialty plus a group and cohort. Its specialty is the prefix by
which the class is reached. A group class such as `GLSI3 A` and a cohort
class such as `GLSI3 A1` are both classes; the latter is more specific, but
neither is a specialty. If a specialty has no group subdivision, it contains a
singleton class whose identifier is the same as the specialty identifier.

**Editorial definition.** A class is a defined student group that follows a
timetable and a planned set of courses. It normally has a specialty and group,
and may also have a cohort. A specialty without groups is represented as a
singleton class for timetable purposes.

**Alternative terms.** student group; teaching group.

## Singleton class

**Relational definition.** A singleton class is the class entry produced for a
specialty whose specialty rule for the relevant year declares no groups. It
is a class-population shape, not a specialty kind: the specialty remains a
non-common (or common) specialty, and its identifier may differ from the
class identifier's source notation. Its class identifier/reference is equal
to the specialty identifier/reference.

**Editorial definition.** A singleton class is a catalogue class entry whose
specialty has no group subdivision for that year, such as the master entries
`MP1-EXR`, `MP1-SD`, and `MP2-EXR` present in the current parsed data.

**Alternative terms.** undivided class; single-group class; specialty-level
class.

## Group

**Relational definition.** A group is the group component of a class. Its
letter is scoped to its specialty prefix: `LCE2-IoT A` and `LCE2-IRS A` are
different classes. A group specifier is the reusable letter component; a
group class combines it with a specialty. A group may be followed by a cohort
specifier, producing a more specific class.

**Editorial definition.** A group is a lettered component of a class, such
as `A` or `E`. The group specifier is not a class by itself.

**Alternative terms.** group specifier; class group; group division.

## Cohort

**Relational definition.** A cohort is the cohort component of a class after
its specialty and group. It is the deepest level where the source divides a
group into `Groupe 1` and `Groupe 2`. A cohort specifier is the reusable
numbered component; a cohort class combines it with a group class.

**Editorial definition.** A cohort is a numbered subgroup inside a group,
usually `1` or `2`. In this project it means the source's teaching subgroup,
not a year-of-entry population. The cohort specifier is not a class by
itself.

**Alternative terms.** cohort specifier; teaching group; subgroup; lab group.

## Population reference

**Relational definition.** A population reference is the generic audience
notation attached to a session specifier. It may identify a specialty or a class,
depending on the session kind. A specialty-lecture population reference addresses
a specialty; a group-seminar reference addresses a group; and a cohort-lab-work
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
population scope. The canonical values are `specialty-lecture`,
`group-seminar`, and `cohort-lab-work`; each maps to exactly one population
scope. Lectures apply to specialties, seminars to groups, and lab work to
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
identifier encodes a specialty, specialty-semester specifier, group, and
cohort. The same object may be written with different levels of verbosity;
these are notation variants, not a separate alias concept.

**Editorial definition.** A name is a human-readable or machine-readable
designation for a track, specialty, class, or other concept.

**Alternative terms.** designation; label; identifier.

## Identifier

**Relational definition.** An identifier is the canonical notation owned by a
concrete domain object. A reference is an input notation expected to resolve
to that object; when resolution is one-to-one, the reference and the object's
identifier have the same value. In the singleton case, one identifier can be
owned by both a specialty and its singleton class.

**Editorial definition.** An identifier names the object it belongs to, while
a reference is the notation supplied for lookup. They are intentionally
combined in this model when the reference resolves one-to-one.

**Alternative terms.** designation; canonical reference; object notation.

## Specialty identifier

**Relational definition.** A specialty identifier is the canonical identifier of
a specialty object. A common specialty is written from a year (track specifier and
year specifier), such as `LCS1`. A non-common specialty is written from a specialty
specifier and specialty-semester specifier, such as `GLSI3`; its verbose form
may make the prefix explicit, as in `LCS3 GLSI3`.

**Editorial definition.** A specialty identifier identifies a specialty. Usually its
classes have more specific class identifiers; for a specialty without groups,
the same identifier also identifies its singleton class. A consumer can choose
which object interpretation it needs.

**Alternative terms.** specialty reference; specialty notation.

## Class identifier

**Relational definition.** A class identifier is the canonical identifier of a
class below a specialty. It writes a specialty, a space, a group, and optionally a cohort:
`GLSI3 A` or `GLSI3 A1`. A verbose non-common form may make the implied prefix
explicit, as in `LCS3 GLSI3 A2`. The parser may also accept compact input such
as `GLSI3A2`.

**Editorial definition.** A class identifier may be broad or specific.
`LCS1 A` and `GLSI3 A` are broad identifiers because they omit the cohort;
`LCS1 A2` and `GLSI3 A1` are specific identifiers because they include it.

**Alternative terms.** class reference; class notation; class designation.

## Resolution

**Relational definition.** Resolution is the interpretation of a specialty or
class reference through three separate concepts: syntactical validity,
catalogue match, and publication presence. Resolution is not assumed to be a
function that returns one value; an attempt may produce multiple catalogue
matches or diagnostics. A consumer may provide an expected object kind before
parsing, such as specialty or class, to choose between valid interpretations of
the same notation.

**Editorial definition.** Resolution is the process of determining what a
reference means and whether it is represented in the maintained catalogue and
current timetable data.

**Alternative terms.** lookup; interpretation; reference resolution.

## Syntactical validity

**Relational definition.** Syntactical validity describes whether a specialty or
class reference follows the notation rules for tracks, specialties, groups, and
cohorts. It is independent of whether the reference names anything in the
catalogue or appears in the current publication.

**Editorial definition.** A reference is syntactically valid when its written
form can be parsed according to the class notation.

**Alternative terms.** syntax validity; parse validity; well-formedness.

## Catalogue match

**Relational definition.** A catalogue match is the set of specialty or class
objects identified by a syntactically valid reference. A specialty match
represents a specialty object whose classes can be queried; a class match
represents a class object. The set may contain zero, one, or multiple objects,
so absence and ambiguity are distinct outcomes.

**Editorial definition.** A catalogue match states which maintained catalogue
elements, if any, correspond to a reference.

**Alternative terms.** lookup match; candidate set; catalogue resolution.

## Publication presence

**Relational definition.** Publication presence states whether a matched
catalogue specialty or class has corresponding records in the current timetable
publication. It is independent of syntax and catalogue existence.

**Editorial definition.** Publication presence is whether the current
normalized timetable data contains the referenced element.

**Alternative terms.** publication status; data presence; schedule presence.

## Catalogue

**Relational definition.** The catalogue describes the available track specifiers,
specialties, years, and class populations associated with
them through groups and cohorts. It is not itself treated as a hierarchy of
domain objects. Its structure is fixed by the model, while its field values are
populated by a union of raw timetable evidence and editorial corrections,
normalization, or additions.

**Editorial definition.** The catalogue is the maintained description of known
track specifiers, years, specialties, and class populations, expressed as a finite
grammar of specifiers and relationships. It contains no concrete years, specialties, or
classes; those are derived. It may contain specialties or classes absent from
the current timetable publication.

**Alternative terms.** academic catalogue; curriculum catalogue.
