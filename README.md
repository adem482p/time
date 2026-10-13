# emplois

A static website for browsing the 2026–2027 timetable of ISIM Mahdia (LBC,
LCE, LCS and MPExpRes sections)

## How it works

```
pdfs/*.pdf                     raw timetable PDFs (input)
   └─ parse_timetables.py       Python parser (no third-party deps)
        └─ emplois.csv          single source of truth: professor,day,time,room,subject,field
             └─ *.html + js/    every page reads the CSV and nothing else
```

Re-running the parser updates the site; no other step is needed.

## JavaScript layers

| File             | Role                                                    |
|------------------|---------------------------------------------------------|
| `js/data.js`     | Data layer: CSV parsing + in-memory store (pure, testable in node) |
| `js/model.js`    | Analysis: grouping, pills, class weeks, teacher summaries |
| `js/match.js`    | Search: fuzzy matching, typed queries, autocomplete     |
| `js/libgroups.js`| Class-hierarchy library: section resolution, catalogue   |
| `js/app.js`      | DOM wiring for the pages (the only file that touches the DOM state) |
| `js/theme.js`    | Material You (HCT) theme engine + palette cycling        |
| `js/color.js`    | Color-class vocabulary shared by theme + app             |

Vendored assets (kaomoji webfonts, DejaVu/Noto woff2) live in `vendor/`.
