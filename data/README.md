# data/

Source material and extractor for the timetable site.

- `pdfs/` — the raw input: one ISIM Mahdia timetable PDF per track and year,
  as distributed to students (`emplois de temps - <TRACK> - 2026-2027 - v5.pdf`).
- `extract.py` — the parser. Flattens every PDF into a single flat CSV:

```sh
python3 data/extract.py [--pdfs data/pdfs] [--out emplois.csv]
```

Run from the repo root. `--out` defaults to `emplois.csv` at the root, where
the site fetches it; the site reads that file and nothing else, so
re-running the extractor updates the site with no build step.

Output columns: `professor,day,time,room,subject,field,week,source,color`,
where `field` carries the class name, `week` carries the week-alternation
marker (`SA`/`SB`, empty = every week; `S1` is a semestre label stripped at
parse time, never a week), `source` identifies the exact PDF page
(`<pdf basename> p<page number>`), and `color` carries the background fill
of the timetable cell the session was parsed from (lowercase `#rrggbb`).

## Dependencies

- **Python 3**, standard library only (`argparse`, `csv`, `glob`, `os`,
  `re`, `shutil`, `subprocess`, `sys`, `tempfile`, `xml.etree`). No
  third-party packages.
- **Poppler utilities** (e.g. `apt install poppler-utils`):
  - `pdftohtml -xml` — text tokens with coordinates (sessions, teachers, rooms).
  - `pdftocairo -svg` — one page rendering per parsed page, for the `color`
    column (cell background fills).
