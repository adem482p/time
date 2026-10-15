#!/usr/bin/env python3
"""Parse ISIM Mahdia timetable PDFs (data/pdfs/) into a flat CSV.

Usage:
    python3 data/extract.py [--out emplois.csv]

Output columns: professor,day,time,room,subject,field,week,source,color

Strategy (no third-party deps, uses poppler `pdftohtml -xml` and
`pdftocairo -svg`):
- Each PDF = N sections x 3 pages (combined + Groupe 1 + Groupe 2).
  Only Groupe pages are parsed (combined pages would duplicate).
  Sections with no Groupe pages (e.g. LBC3-EB_A) are parsed directly.
- Grid is fixed: 6 time slots (columns) x 6 days (rows).
- xml <text> tokens are assigned to a (day, col) cell by coordinates,
  merged into lines by y, then split into sessions anchored on
  subject lines starting with C_/TD_/TP_.
- `color` is the background fill of the timetable cell each session was
  parsed from, read from a per-page `pdftocairo -svg` rendering and
  normalized to lowercase `#rrggbb` (empty when no fill contains the
  session's probe point). SVG extraction failures degrade to empty
  `color`, never abort the run.
"""
import argparse
import csv
import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

DAYS = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI"]
SLOTS = ["08h15-09h45", "10h00-11h30", "11h40-13h10",
         "13h20-14h50", "15h00-16h30", "16h45-18h15"]

SUBJECT_RE = re.compile(r"^(C_|TD_|TP_)\s*(.+?)\s*$")
GROUP_RE = re.compile(r"<[^>]*>\s*Groupe\s*[12]", re.IGNORECASE)
# Strip S1/SA/SB from teacher/room text. S1 is a semestre label ("Semestre 1",
# cf. page titles "Semestre 1 (du 14/09/26 au 10/01/27)"), NOT a week marker —
# only SA/SB denote alternating weeks. Week capture below uses SA/SB only.
WEEK_RE = re.compile(r"\bS1\b|\bSA\b|\bSB\b")
WEEK_MARK_RE = re.compile(r"^(SA|SB)$")
ROOM_KEYWORDS = ("FSEG", "INFO", "info", "Info", "Amphi", "AMPHI",
                 "Salle", "salle", "Labo", "labo", "Grand", "Internet",
                 "internet", "Accée", "accée", "lib", "Lang", "lang")
ROOM_SINGLE_RE = re.compile(r"^[A-Ga-g]\d{1,3}[a-zA-Z]?$")
TITLE_RE = re.compile(r"(.+?)\s*-\s*Semestre")


def pdf_to_xml(pdf_path, xml_path):
    subprocess.run(["pdftohtml", "-xml", "-stdout", pdf_path],
                   check=True, stdout=open(xml_path, "wb"))


# SVG cell fills: session cells are axis-aligned filled rect <path>s
# (grid lines are stroked paths with fill="none"). Tiny filled rects are
# text highlights behind day labels and SA/SB markers, not session cells:
# half-cell session fills are ~106x39 svg units, highlights are ~17x10.
FILL_MIN_W = 50.0
FILL_MIN_H = 20.0
CONTAIN_EPS = 0.5

RGB_PCT_RE = re.compile(
    r"rgb\(\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)")
RGB_INT_RE = re.compile(
    r"rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)")
PATH_TAG_RE = re.compile(r"<path\b([^>]*)>")
ATTR_RE = re.compile(r'([\w-]+)="([^"]*)"')
FLOATS_RE = re.compile(r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?")
VIEWBOX_RE = re.compile(
    r"<svg\b[^>]*viewBox=\"\s*[\d.eE+-]+\s+[\d.eE+-]+\s+"
    r"([\d.eE+-]+)\s+([\d.eE+-]+)\s*\"")


def fill_to_hex(fill):
    """Normalize an SVG fill to lowercase #rrggbb. Returns '' if unknown."""
    fill = (fill or "").strip().lower()
    m = RGB_PCT_RE.fullmatch(fill)
    if m:
        vals = tuple(max(0, min(255, int(round(float(v) * 255 / 100))))
                     for v in m.groups())
        return "#%02x%02x%02x" % vals
    m = RGB_INT_RE.fullmatch(fill)
    if m:
        vals = tuple(max(0, min(255, int(v))) for v in m.groups())
        return "#%02x%02x%02x" % vals
    if re.fullmatch(r"#[0-9a-f]{6}", fill):
        return fill
    if re.fullmatch(r"#[0-9a-f]{3}", fill):
        return "#" + "".join(c * 2 for c in fill[1:])
    return ""


def parse_svg_fills(svg_text):
    """Extract session-cell fills from one pdftocairo -svg page.

    Returns (svg_w, svg_h, rects) with rects as
    [(x0, y0, x1, y1, '#rrggbb'), ...] in SVG user units.
    Only untransformed axis-aligned rect paths large enough to be
    session cells are kept; strokes, highlights and unknown fills
    are ignored.
    """
    rects = []
    m = VIEWBOX_RE.search(svg_text)
    if not m:
        return 0, 0, []
    svg_w, svg_h = float(m.group(1)), float(m.group(2))
    for pm in PATH_TAG_RE.finditer(svg_text):
        attrs = dict(ATTR_RE.findall(pm.group(1)))
        fill = attrs.get("fill", "")
        if not fill or fill == "none":
            continue
        if "transform" in attrs:
            continue
        d = attrs.get("d", "")
        nums = [float(v) for v in FLOATS_RE.findall(d)]
        if len(nums) < 8 or len(nums) % 2:
            continue
        xs = nums[0::2]
        ys = nums[1::2]
        # axis-aligned rectangle: at most 2 distinct x and y values
        if len(set(round(v, 3) for v in xs)) > 2:
            continue
        if len(set(round(v, 3) for v in ys)) > 2:
            continue
        x0, x1 = min(xs), max(xs)
        y0, y1 = min(ys), max(ys)
        if x1 - x0 < FILL_MIN_W or y1 - y0 < FILL_MIN_H:
            continue
        hexcol = fill_to_hex(fill)
        if not hexcol:
            continue
        rects.append((x0, y0, x1, y1, hexcol))
    return svg_w, svg_h, rects


def svg_color_at(pdf_path, page_no, page_el, svg_prefix):
    """Build an (x, y)-xml-coords -> '#rrggbb' lookup for one PDF page.

    Renders the page with `pdftocairo -svg`, then self-calibrates per
    page: pdftohtml-xml coords and SVG user units share the page origin
    and differ by scale only, so sx = xml_w / svg_w, sy = xml_h / svg_h
    (SVG text is vectorized glyph <use> paths, so no shared text anchors
    exist to fit an offset; empirically the offset is ~0: the page-title
    x maps at 1.5004 vs the dimension scale 1.4990, a 0.2-unit gap).
    Each session probes with its subject token's left-edge-plus-epsilon
    point; the smallest containing fill wins (handles stacked half-cell
    fills over full-cell backgrounds). Raises on any failure — the
    caller degrades to empty colors.
    """
    subprocess.run(["pdftocairo", "-svg", "-f", str(page_no),
                    "-l", str(page_no), pdf_path, svg_prefix],
                   check=True)
    svg_path = (svg_prefix if os.path.exists(svg_prefix)
                else svg_prefix + ".svg")
    with open(svg_path, encoding="utf-8", errors="replace") as f:
        svg_text = f.read()
    svg_w, svg_h, rects = parse_svg_fills(svg_text)
    if not svg_w or not svg_h:
        raise ValueError("no viewBox in SVG output")
    xml_w = float(page_el.get("width", 1262))
    xml_h = float(page_el.get("height", 892))
    sx = xml_w / svg_w
    sy = xml_h / svg_h

    def color_at(x, y):
        px, py = x / sx, y / sy
        best = None
        for (x0, y0, x1, y1, c) in rects:
            if (x0 - CONTAIN_EPS <= px <= x1 + CONTAIN_EPS
                    and y0 - CONTAIN_EPS <= py <= y1 + CONTAIN_EPS):
                area = (x1 - x0) * (y1 - y0)
                key = (area, x0, y0)
                if best is None or key < best[0]:
                    best = (key, c)
        return best[1] if best else ""

    return color_at


def clean_token(s):
    return " ".join(s.replace("\xa0", " ").split())


def split_teacher_room(s):
    """Split a merged 'teacher room' line. Returns (teacher, room)."""
    s = s.strip().lstrip("_").strip()
    s = WEEK_RE.sub("", s).strip()
    s = GROUP_RE.sub("", s).strip()
    s = re.sub(r"\s{2,}", " ", s).strip()
    if not s:
        return "", ""
    # room keyword at the very start -> whole string is a room
    # (e.g. "info B1", "salle Internet", "Amphi C").
    for kw in ROOM_KEYWORDS:
        if s.startswith(kw):
            return "", s
    # split at first room keyword occurrence
    low = s
    idx = None
    for kw in ROOM_KEYWORDS:
        j = low.find(kw)
        if j != -1 and (idx is None or j < idx):
            idx = j
    if idx is not None and idx > 0:
        return s[:idx].strip().lstrip("_").strip(), s[idx:].strip()
    parts = s.split()
    if len(parts) >= 2 and ROOM_SINGLE_RE.match(parts[-1]):
        # last token is a room code (C1, A2, B4...) -> split it off.
        # ("Dhouib C1" -> Dhouib / C1, but "Ben Kahla" stays whole
        # because "Kahla" is not room-like.)
        return " ".join(parts[:-1]).strip(), parts[-1].strip()
    return s, ""


def is_room_like(s):
    s = s.strip()
    if not s:
        return False
    if any(kw in s for kw in ROOM_KEYWORDS):
        return True
    if ROOM_SINGLE_RE.match(s):
        return True
    # multi-token room e.g. "info B1", "Amphi B", "Grand Amphi"
    parts = s.split()
    if parts and (parts[0].lower() in ("info", "amphi", "grand", "salle", "labo")
                  or ROOM_SINGLE_RE.match(parts[-1])):
        return True
    return False


def parse_page(page_el, pdf_name="", page_no=None, color_at=None):
    """Return list of session dicts (without field) for one Groupe page.

    Hybrid anchor method:
    - subject tokens (C_/TD_/TP_ prefix) define sessions (day/time from coords).
    - other tokens attach to the same-row subject (same y, nearest x — this
      also catches teacher/room text spilling over a column boundary), else
      to the preceding subject in the same grid cell (teacher/room lines below).
    - week-alternation markers (standalone SA/SB tokens) attach to the
      nearest subject in the same grid column by |dy| and are reported in
      the session's `week` value instead of being silently stripped.
      (S1 tokens are stripped from teacher/room text like SA/SB but never
      populate `week`: S1 is the semestre label, not a week. Reference for
      future week-aware display: current week is B, next week is A, and
      weeks start on Monday.)
    - `pdf_name`/`page_no` identify the source page (`<basename> p<n>`,
      1-based); both optional so unit tests can call parse_page(page_el).
    - `color_at` is an optional (x, y)-in-xml-coords -> '#rrggbb'
      lookup for the page (see svg_color_at); without it `color` is ''.
    """
    W = float(page_el.get("width", 1262))
    H = float(page_el.get("height", 892))
    texts = []
    for tx in page_el.findall("text"):
        try:
            left = float(tx.get("left", 0)); top = float(tx.get("top", 0))
            width = float(tx.get("width", 0)); height = float(tx.get("height", 0))
        except (TypeError, ValueError):
            continue
        s = clean_token("".join(tx.itertext()))
        if not s:
            continue
        texts.append({"x": left, "y": top, "w": width, "h": height,
                      "xc": left + width / 2, "yc": top + height / 2, "s": s})

    # day-row anchors
    day_ys = {}
    for t in texts:
        if t["s"] in DAYS:
            day_ys[t["s"]] = t["y"]
    if len(day_ys) < 6:
        return []
    ordered_days = sorted(day_ys, key=lambda d: day_ys[d])
    bounds = []
    ys = [day_ys[d] for d in ordered_days]
    for i in range(6):
        top_b = 120.0 if i == 0 else (ys[i - 1] + ys[i]) / 2
        bot_b = H if i == 5 else (ys[i] + ys[i + 1]) / 2
        bounds.append((top_b, bot_b))

    grid_left = W * 0.087
    grid_right = W * 0.985
    col_w = (grid_right - grid_left) / 6
    col_bounds = [(grid_left + i * col_w, grid_left + (i + 1) * col_w) for i in range(6)]

    def day_of(y):
        for i, (a, b) in enumerate(bounds):
            if a <= y < b:
                return i
        return None

    def col_of_left(x):
        for i, (a, b) in enumerate(col_bounds):
            if a <= x < b:
                return i
        return None

    def col_of_center(xc):
        for i, (a, b) in enumerate(col_bounds):
            if a <= xc < b:
                return i
        return None

    subjects = []
    others = []
    for t in texts:
        if t["y"] < 120 or t["s"] in DAYS:
            continue
        if t["s"].startswith("Institut Sup") or t["s"].startswith("(C) INDEX"):
            continue
        if re.match(r"^(C_|TD_|TP_)", t["s"].strip()):
            m = SUBJECT_RE.match(t["s"].strip())
            if not m:
                continue
            di = day_of(t["y"])
            ci = col_of_left(t["x"])
            if di is None or ci is None:
                continue
            subjects.append({"tok": t, "di": di, "col": ci, "y": t["y"],
                             "x": t["x"], "subject": m.group(2).strip(),
                             "rest_toks": [], "week_toks": []})
        else:
            others.append(t)

    # attach other tokens
    for t in others:
        di = day_of(t["y"])
        if di is None:
            continue
        # 0) week-alternation markers: a standalone SA/SB token (after
        # GROUP strip) names the weeks its session runs on. S1 looks
        # identical in the grid but is the semestre label ("Semestre 1"),
        # not a week, so it is never captured here — it is still stripped
        # from teacher/room text by WEEK_RE in split_teacher_room/parse_rest.
        # Capture it here — before WEEK_RE stripping in
        # split_teacher_room/parse_rest can see it — and attach it to the
        # nearest subject in the same grid column by |dy|. Ties go to the
        # following (below) subject, since markers sit above their session.
        # (Display reference: current week B, next A, weeks start Monday.)
        if WEEK_MARK_RE.match(GROUP_RE.sub("", t["s"]).strip()):
            tc = col_of_left(t["x"])
            if tc is None:
                tc = col_of_center(t["xc"])
            cand = [s for s in subjects
                    if s["col"] == tc] if tc is not None else []
            if cand:
                best = min(cand, key=lambda s: (abs(s["y"] - t["y"]),
                                                0 if s["y"] > t["y"] else 1))
                best["week_toks"].append(t)
            continue
        # 1) same-cell subjects: token's own column (by left edge) with a
        # generous vertical window (~1.2 text lines). This handles subjects
        # that sit higher than their teacher/room lines (vertically centred
        # or SA/SB-shifted cells) without letting a neighbouring cell's
        # subject at nearly equal height steal the token. Prefer the
        # subject above the token, then smallest |dy|, then smallest |dx|.
        tc = col_of_left(t["x"])
        if tc is not None:
            own = [s for s in subjects
                   if s["di"] == di and s["col"] == tc
                   and abs(s["y"] - t["y"]) < 20]
            if own:
                best = min(own, key=lambda s: ((s["y"] > t["y"]),
                                               abs(s["y"] - t["y"]),
                                               abs(s["x"] - t["x"])))
                best["rest_toks"].append(t)
                continue
        # 2) same-row subjects (same day, |dy| < 5): nearest by x. Catches
        # teacher/room text spilling over a column boundary onto the
        # subject's own line.
        # Constrained to plausible columns so a teacher line under one
        # session is not stolen by a neighbouring session whose subject
        # happens to sit at nearly the same height (stacked SA/SB cells).
        same = [s for s in subjects
                if s["di"] == di and abs(s["y"] - t["y"]) < 5
                and s["x"] <= t["x"] + 40
                and (t["x"] - s["x"]) < col_w * 1.8]
        if same:
            best = min(same, key=lambda s: abs(s["x"] - t["x"]))
            best["rest_toks"].append(t)
            continue
        # below-line: preceding subject in same cell
        ci = col_of_center(t["xc"])
        if ci is None:
            continue
        prev = [s for s in subjects
                if s["di"] == di and s["col"] == ci and s["y"] < t["y"]]
        if prev:
            owner = max(prev, key=lambda s: s["y"])
            # don't cross a following subject: token must be above next subject
            nxt = [s for s in subjects
                   if s["di"] == di and s["col"] == ci and s["y"] > owner["y"]]
            if nxt and t["y"] > min(s["y"] for s in nxt):
                continue
            owner["rest_toks"].append(t)

    sessions = []
    for b in sorted(subjects, key=lambda s: (s["col"], s["y"])):
        rest_sorted = sorted(b["rest_toks"], key=lambda t: (t["y"], t["x"]))
        # merge tokens sharing a row into single strings
        lines = []
        for t in rest_sorted:
            done = False
            for ln in lines:
                if abs(ln["y"] - t["y"]) < 4:
                    ln["toks"].append(t)
                    done = True
                    break
            if not done:
                lines.append({"y": t["y"], "toks": [t]})
        rest = [" ".join(p["s"] for p in sorted(ln["toks"], key=lambda t: t["x"]))
                for ln in sorted(lines, key=lambda l: l["y"])]
        teacher, room = parse_rest(rest)
        # first attached marker wins if several landed on one subject.
        week = ""
        if b["week_toks"]:
            week = GROUP_RE.sub("", sorted(
                b["week_toks"], key=lambda t: (t["y"], t["x"]))[0]["s"]).strip()
        source = f"{pdf_name} p{page_no}" if pdf_name and page_no else ""
        if color_at is not None:
            try:
                color = color_at(b["tok"]["x"] + 2,
                                 b["tok"]["y"] + b["tok"]["h"] / 2)
            except Exception:
                color = ""
        else:
            color = ""
        sessions.append({"day": ordered_days[b["di"]],
                         "time": SLOTS[b["col"]],
                         "room": room.strip(), "subject": b["subject"].strip(),
                         "professor": teacher, "week": week,
                         "source": source, "color": color})
    return sessions


def parse_rest(rest_list):
    """Parse teacher/room from rest strings. Returns (teacher, room)."""
    teacher, room = "", ""
    rest = [r for r in (rest_list or []) if r and r.strip()]
    if len(rest) == 0:
        pass
    elif len(rest) == 1:
        r = GROUP_RE.sub("", rest[0]).strip()
        r = WEEK_RE.sub("", r).strip()
        r = re.sub(r"\s{2,}", " ", r).strip().lstrip("_").strip()
        if not r:
            pass
        elif is_room_like(r) and " " not in r and "." not in r:
            room = r  # room-only line
        else:
            t2, rm2 = split_teacher_room(r)
            if rm2:
                teacher, room = t2, rm2
            elif is_room_like(t2):
                room = t2
            else:
                teacher = t2
    else:
        first = rest[0]
        t2, rm2 = split_teacher_room(first)
        if rm2:
            teacher, room = t2, rm2
        else:
            if is_room_like(t2) and not teacher:
                room = t2
            else:
                teacher = t2
            for r in rest[1:]:
                rc = GROUP_RE.sub("", r).strip()
                rc = WEEK_RE.sub("", rc).strip()
                rc = re.sub(r"\s{2,}", " ", rc).strip()
                if not rc:
                    continue
                if is_room_like(rc) or not room:
                    a, b2 = split_teacher_room(rc)
                    if b2:
                        if not teacher:
                            teacher = a
                        room = (room + " " + b2).strip() if room else b2
                    else:
                        if not room and (is_room_like(a) or teacher):
                            room = a
                        elif not teacher:
                            teacher = a
                elif not teacher:
                    teacher = rc
    teacher = teacher.strip().lstrip("_").strip()
    return teacher, room


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdfs", default="data/pdfs")
    ap.add_argument("--out", default="emplois.csv")
    args = ap.parse_args()

    pdfs = sorted(glob.glob(os.path.join(args.pdfs, "*.pdf")))
    if not pdfs:
        print(f"No PDFs found in {args.pdfs}", file=sys.stderr)
        sys.exit(1)

    rows = []
    svg_tmpdir = tempfile.mkdtemp(prefix="extract-svg-")
    svg_prefix = os.path.join(svg_tmpdir, "pg")
    for pdf in pdfs:
        with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as f:
            xml_path = f.name
        try:
            pdf_to_xml(pdf, xml_path)
            tree = ET.parse(xml_path)
        except subprocess.CalledProcessError as e:
            print(f"pdftohtml failed for {pdf}: {e}", file=sys.stderr)
            continue
        finally:
            pass
        pages = tree.getroot().findall("page")
        # collect titles to decide which pages to parse
        titles = []
        for pg in pages:
            alls = " ".join(clean_token("".join(tx.itertext())) for tx in pg.findall("text"))
            m = TITLE_RE.search(alls)
            titles.append(m.group(1).strip() if m else "")
        # group pages by section: combined page sets current section
        current = None
        sec_has_group = set()
        for t in titles:
            if t.startswith("Groupe"):
                if current:
                    sec_has_group.add(current)
            elif t:
                current = t.split()[0]
        current = None
        pdf_base = os.path.basename(pdf)
        # pages to parse (Groupe pages + standalone sections): render each
        # once with pdftocairo -svg for the color column; an SVG failure
        # degrades that page to empty colors, never aborts the run.
        want = set()
        tmp_current = None
        for pg_no, t in enumerate(titles, start=1):
            if t.startswith("Groupe"):
                want.add(pg_no)
            elif t:
                tmp_current = t.split()[0]
                if tmp_current not in sec_has_group:
                    want.add(pg_no)
        color_ats = {}
        for pg_no in sorted(want):
            try:
                color_ats[pg_no] = svg_color_at(
                    pdf, pg_no, pages[pg_no - 1], svg_prefix)
            except Exception as e:
                print(f"SVG color skipped for {pdf_base} p{pg_no}: {e}",
                      file=sys.stderr)
                color_ats[pg_no] = None
        for pg_no, (pg, t) in enumerate(zip(pages, titles), start=1):
            if t.startswith("Groupe"):
                section = current
                grp = "Groupe " + ("1" if "Groupe 1" in t else "2")
                if section is None:
                    continue
                field = f"{section} {grp}"
                for s in parse_page(pg, pdf_base, pg_no,
                                    color_at=color_ats.get(pg_no)):
                    s["field"] = field
                    rows.append(s)
            elif t:
                section = t.split()[0]
                current = section
                if section not in sec_has_group:
                    # standalone section (e.g. LBC3-EB_A): parse combined page
                    field = section
                    for s in parse_page(pg, pdf_base, pg_no,
                                        color_at=color_ats.get(pg_no)):
                        s["field"] = field
                        rows.append(s)
                # else: skip combined page (dup of Groupe pages)
        os.unlink(xml_path)
        print(f"{os.path.basename(pdf)}: {len(pages)} pages -> {len([r for r in rows if True])} rows total so far")

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["professor", "day", "time", "room",
                                          "subject", "field", "week", "source",
                                          "color"])
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in
                        ["professor", "day", "time", "room",
                         "subject", "field", "week", "source", "color"]})
    print(f"Wrote {len(rows)} rows to {args.out}")
    shutil.rmtree(svg_tmpdir, ignore_errors=True)


if __name__ == "__main__":
    main()
