# System model

## Meta

This document defines the system-side concepts that carry the domain model
from the university's raw timetable publications into the static application.
It distinguishes raw PDF data, normalized data, notation, and application
projections.

The official PDFs are the external publication source. The normalized CSV is
the application's canonical dataset. A CSV cell contains one scalar field:
arrays and lists are never serialized inside a CSV cell. Repeated values are
represented by repeated records.

## Raw timetable publication

**Relational definition.** A raw timetable publication is the collection of
official PDFs distributed by the university. It contains PDF documents, pages,
grids, cells, and source text from which normalized records are extracted.

**Editorial definition.** A raw timetable publication is the unnormalized
source material as published, before it is interpreted by the parser.

**Alternative terms.** official publication; source publication; raw source.

## PDF

**Relational definition.** A PDF belongs to a raw timetable publication and
contains ordered PDF pages. It normally covers one track and year; master
branches may be published as separate files. The parser reads the PDF
to produce normalized records.

**Editorial definition.** A PDF is an official timetable document distributed
to students.

**Alternative terms.** timetable document; schedule document; source document.

## PDF page

**Relational definition.** A PDF page belongs to one PDF and contains one
timetable grid. It may name a class directly or inherit the class context from
the preceding page. A page for a sectionless branch represents that branch's
singleton class. The page identity of included pages is retained as provenance
on normalized records.

**Editorial definition.** A PDF page is one timetable sheet. A cohort-divided
class contributes a combined page followed by `Groupe 1` and `Groupe 2`
pages; a class without cohorts contributes one page. A sectionless branch
contributes the page for its singleton class.

**Alternative terms.** timetable sheet; schedule page; source page.

## Timetable grid

**Relational definition.** A timetable grid is the source-page layout formed
by six day rows and six time-slot columns. Its cells contain source text and
may contain fill colors. The parser interprets cells as session-specifier
evidence.

**Editorial definition.** A timetable grid is the fixed six-by-six table
printed on a timetable page. Text may spill across column boundaries and a
cell may contain multiple session lines.

**Alternative terms.** timetable matrix; schedule matrix; source grid.

## Source cell

**Relational definition.** A source cell belongs to a timetable grid and
provides text and optional color for one or more normalized records. Its color
is provenance metadata, not a domain property of the session or class.

**Editorial definition.** A source cell is one visual day/time location in a
PDF grid.

**Alternative terms.** timetable cell; grid cell; source-grid cell.

## Source label

**Relational definition.** A source label is text printed in a PDF as part of
the publication's structure. Different source-label kinds may identify a
class, session kind, subject, teacher, room, semester, or week pattern. The
normalization process interprets those labels into domain concepts and fields.

**Editorial definition.** A source label is a unit of raw timetable text whose
meaning depends on its position and role in the PDF.

**Alternative terms.** printed label; source text; document label.

## Semester source label

**Relational definition.** A semester source label identifies the academic
semester of the current year in the source publication. `S1` means semester 1
of the current year. It is separate from `SA` and `SB`, which identify
alternating weeks, and it is not stored as a week pattern.

**Editorial definition.** `S1` is a source marker for the current year's
academic semester 1. The parser removes it from the normalized week-pattern
field.

**Alternative terms.** semester marker; publication-semester label; term label.

## Normalized data model

**Relational definition.** The normalized data model is the parser's
structured interpretation of the raw timetable publication. It represents
domain concepts and provenance with scalar fields and records, and it is the
input to the application.

**Editorial definition.** The normalized data model is the machine-readable
representation produced after raw PDF text has been parsed and classified.

**Alternative terms.** canonical data model; normalized representation;
structured schedule data.

## Notation

**Relational definition.** Notation is the set of textual conventions used to
write domain concepts and their relationships, including source labels,
class notation, prefixes, year specifiers, and programme-semester
specifiers. Notation is distinct from the underlying normalized objects.

**Editorial definition.** Notation is how the model writes and parses names,
codes, and source-derived markers.

**Alternative terms.** naming convention; syntax; identifier notation.

## CSV record

**Relational definition.** A CSV record is one partial normalized
representation of a session specifier in the application dataset. It relates
one population reference to one subject, teacher, room, day, time slot, and
week pattern, with source provenance and optional cell color. The current record
representation does not specify the session kind/session scope. Every record
has one scalar value per column; repeated relationships use multiple records
rather than list-valued cells.

**Editorial definition.** The current CSV record has these columns, one field
per line. They are a partial representation of the complete domain schedule:

`professor,day,time,room,subject,field,week,source,color`

The physical column `field` is semantically named **class reference** for
compatibility, but its value may be the population reference required by the
session's scope. In the singleton-class exception, it may contain a branch
reference that is also the identifier of the branch's only class; consumers
choose the branch or singleton-class interpretation. `week` contains an empty value, `SA`, or
`SB`; `source` identifies the exact PDF page; `color` is a lowercase
`#rrggbb` value or empty. Session kind/session scope is not currently a CSV
field.

**Alternative terms.** timetable record; schedule record; normalized record.

## Record identity

**Relational definition.** A normalized record represents a schedule
relationship together with its provenance. Distinct records may describe
equivalent schedule relationships when their source evidence differs.
Normalization preserves those records and their provenance rather than
destroying information through implicit merging.

**Editorial definition.** Record identity is deliberately not defined here as
a storage key. The model requires only that normalized records preserve the
schedule information and the evidence from which each record was derived.

**Alternative terms.** record distinction; source-preserving record model;
normalization policy.

## Provenance

**Relational definition.** Provenance links a normalized record back to its
raw PDF, page, and source cell. It explains where the record came from without
changing the domain meaning of the session.

**Editorial definition.** Provenance is the retained source information that
allows a normalized record to be traced to the published timetable.

**Alternative terms.** source traceability; lineage; source metadata.

## Source of truth

**Relational definition.** The official PDFs are the university's publication
source, while the normalized CSV is the application's canonical source of
truth. The parser is the controlled transformation between them, and the web
application reads the CSV rather than the PDFs.

**Editorial definition.** “Source of truth” must be scoped: PDFs are the
official source; `emplois.csv` is the application's canonical dataset.

**Alternative terms.** authoritative source; canonical dataset; reference
dataset.

## Parser

**Relational definition.** The parser reads raw PDFs and emits normalized CSV
records. It recognizes inherited class context, session kinds, subjects,
teachers, rooms, week patterns, source pages, and source-cell colors. It
removes `S1` as a semester source label and never stores it as a week pattern.

**Editorial definition.** The parser is `data/extract.py`, which flattens the
PDF publications into `emplois.csv`.

**Alternative terms.** document parser; data extractor; ingestion process.

## Catalogue maintenance

**Relational definition.** Catalogue maintenance populates the fixed catalogue
structure from raw data and editorial judgment. Raw evidence may reveal
elements, while the editor may normalize names, correct relationships, or add
missing elements. Resolution uses the maintained union.

**Editorial definition.** Catalogue maintenance is the process of keeping the
known tracks, branches, and class populations complete and interpretable even
when a publication is incomplete.

**Alternative terms.** catalogue curation; reference-data maintenance; data
stewardship.

## Timetable projection

**Relational definition.** A timetable projection is an application view
computed from normalized records and the schedule model. Teacher, class,
subject, room, day, and time views are projections of the same data and do not
create new domain session specifiers.

**Editorial definition.** A timetable projection is a filtered and arranged
display of schedule data.

**Alternative terms.** schedule view; timetable view; query projection.

## Web application

**Relational definition.** The web application reads the normalized CSV,
constructs schedule and timetable projections, and exposes search and
timetable services. It has no backend and does not modify the source
publication or normalized dataset.

**Editorial definition.** The web application is the SvelteKit static site in
`app/`. It is JavaScript-only and runs its queries client-side.

**Alternative terms.** timetable application; schedule portal; web interface.

## Static build

**Relational definition.** The static build is the deployable output of the
web application. It contains prerendered route pages, the bundled CSV, and
generated service workers. It is produced from the application source and
normalized dataset.

**Editorial definition.** The static build is the `app/build/` tree generated
by `npm run build`. It should be served over HTTP for local checks.

**Alternative terms.** generated site; deployable website; static-site output.
