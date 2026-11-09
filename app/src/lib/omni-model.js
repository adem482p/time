// app/src/lib/omni-model.js — Domain model integration and timetable derivations for the omni app.
// Uses the domain-model library in domain-model/ ($domain).
import { catalogue as baseCatalog } from '../../../domain-model/catalogue.js';
import { catalogFromCsv } from '../../../domain-model/csv.js';
import { DAYS, SLOTS, trackOf, yearOf } from '../../../domain-model/objects.js';
import { formatWeekPattern } from '../../../domain-model/print.js';
import { resolve, sessionsFor } from '../../../domain-model/query.js';
import { normStr, tokenize, fuzzyRanges, scoreMatch, mergeRanges, parseSearchQuery } from './search.js';

/** Normalize a search input (string or parsed query) to {terms, filters}. */
function normQuery(query) {
	if (typeof query === 'string' || query == null) {
		const parsed = parseSearchQuery(query ?? '');
		return { terms: parsed.terms.join(' '), filters: parsed.filters };
	}
	return { terms: (query.terms ?? []).join(' '), filters: query.filters ?? [] };
}

const EXACT_FILTER_KEYS = new Set(['day', 'cohort', 'group', 'track', 'year', 'specialty']);

/** Predicate evaluation: every filter must match one of the item's values. */
export function passesFilters(item, filters) {
	if (!filters?.length) return true;
	return filters.every((f) => {
		// Identity predicates read the item's own fields; session predicates
		// read its indexed session values.
		let values;
		if (['cohort', 'group', 'track', 'year', 'specialty'].includes(f.key)) values = [item[f.key]];
		else values = item.filterSets?.[f.key] ?? [];
		const v = String(f.value ?? '').toLowerCase();
		// `subject:` ≡ `subject:*` ≡ absent: no filtering until a value is typed.
		if (!v || v === '*') return true;
		return values.some((x) => {
			const sx = String(x ?? '').toLowerCase();
			return EXACT_FILTER_KEYS.has(f.key) ? sx === v : sx.includes(v);
		});
	});
}

// Day/slot sets come from the library — single source of truth.
export { DAYS, SLOTS };

const HOURS_PER_SESSION = 1.5;
const JS_DAY = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
const DAY_IDX = { LUNDI: 1, MARDI: 2, MERCREDI: 3, JEUDI: 4, VENDREDI: 5, SAMEDI: 6 };

/**
 * French day names display lowercase (lundi..samedi); data stays uppercase.
 */
export function frDay(d) {
	return String(d || '').toLowerCase();
}

/**
 * Format hours label: sessions count -> "57h00" or "57h30".
 */
export function hoursLabel(nSessions) {
	const h = nSessions * HOURS_PER_SESSION;
	const whole = Math.floor(h + 1e-9);
	return whole + 'h' + (h - whole >= 0.5 ? '30' : '00');
}

/**
 * "08h15-09h45" -> endpoints in minutes since midnight: [495, 585].
 */
export function slotMinutes(slot) {
	const m = /(\d+)h(\d+)-(\d+)h(\d+)/.exec(slot);
	if (!m) return [0, 0];
	return [+m[1] * 60 + +m[2], +m[3] * 60 + +m[4]];
}

/**
 * Check if the given session is happening at `now`.
 */
export function isCurrentSession(day, time, now) {
	now = now || new Date();
	if (JS_DAY[now.getDay()] !== day) return false;
	const se = slotMinutes(time);
	const cur = now.getHours() * 60 + now.getMinutes();
	return cur >= se[0] && cur < se[1];
}

/**
 * Calculate the day cursor for the week grid.
 */
export function dayCursor(now, slots) {
	now = now || new Date();
	slots = slots || SLOTS;
	const today = JS_DAY[now.getDay()];
	const isSunday = DAY_IDX[today] === undefined;
	const out = {
		today,
		isSunday,
		phase: isSunday ? 'sunday' : 'before',
		visible: false,
		cur: null,
		next: null,
		frac: null
	};
	if (isSunday) return out;
	const mins = now.getHours() * 60 + now.getMinutes();
	if (mins < slotMinutes(slots[0])[0]) return out;
	if (mins >= slotMinutes(slots[slots.length - 1])[1]) {
		out.phase = 'after';
		return out;
	}
	out.phase = 'during';
	out.visible = true;
	for (let i = 0; i < slots.length; i++) {
		const se = slotMinutes(slots[i]);
		if (mins >= se[0] && mins < se[1]) {
			out.cur = slots[i];
			out.frac = (mins - se[0]) / (se[1] - se[0]);
		}
		if (se[0] > mins && out.next === null) out.next = slots[i];
	}
	return out;
}

/**
 * Minutes from midnight to next occurrence of session strictly after `now`.
 */
export function nextKey(s, now) {
	const st = slotMinutes(s.time)[0];
	const cur = now.getHours() * 60 + now.getMinutes();
	let ahead = (DAY_IDX[s.day] - now.getDay() + 7) % 7;
	if (ahead === 0 && st <= cur) ahead = 7;
	return ahead * 1440 + st;
}

/**
 * Indices of the earliest next occurrence sessions.
 */
export function nextSessionIdx(sessions, now) {
	now = now || new Date();
	const keys = (sessions || []).map((s) => nextKey(s, now));
	const best = Math.min.apply(null, keys);
	const out = new Set();
	keys.forEach((k, i) => {
		if (k === best) out.add(i);
	});
	return out;
}

/**
 * Anchor day for start-from-today day rotation.
 */
function anchorDay(sessions, now) {
	now = now || new Date();
	const mins = now.getHours() * 60 + now.getMinutes();
	const today = JS_DAY[now.getDay()];
	const ss = sessions || [];
	// Sessions carry their slot as `slot` (domain) or `time` (fused view).
	const slotOf = (s) => s.time ?? s.slot;
	if (ss.some((s) => s.day === today && slotMinutes(slotOf(s))[1] > mins)) return today;
	// Sunday is not in DAYS: the week wraps to Monday (start = end-of-week).
	const start = DAY_IDX[today] === undefined ? 5 : DAY_IDX[today] - 1;
	for (let k = 1; k <= 6; k++) {
		const d = DAYS[(((start + k) % 6) + 6) % 6];
		if (ss.some((s) => s.day === d)) return d;
	}
	return null;
}

/**
 * Rotate a distinct day list cyclically so it starts at the anchor day.
 */
export function startFromToday(days, sessions, now) {
	const a = anchorDay(sessions, now);
	if (a === null) return days.slice();
	const i = days.indexOf(a);
	if (i <= 0) return days.slice();
	return days.slice(i).concat(days.slice(0, i));
}

/**
 * Format class shortcut representation: head carries the label without the
 * cohort digit, sub carries the cohort (rendered as <sub> by the page).
 */
export function classShortcut(cls) {
	if (cls.cohort != null) {
		return { head: cls.label.slice(0, -1), sub: String(cls.cohort) };
	}
	return { head: cls.label, sub: '' };
}

/**
 * Build the omni store from CSV text using the domain model library.
 */
export function buildOmniStore(csvText) {
	// The CSV reader constructs the catalog's sessions from the CSV data.
	// Rows that cannot be converted are reported, not silently dropped.
	const { catalog: catalogue, sessions: validRecords, rejected } = catalogFromCsv({
		text: csvText,
		catalog: baseCatalog
	});
	const rawRows = validRecords.length + rejected.length;

	// Collect unique teachers, session counts, subjects and classes.
	// Sessions with no teacher (teacher === null) are valid rows, but they
	// belong to no teacher, so they are skipped here.
	const teacherStats = {};
	const classFilterSets = new Map(); // class label -> predicate-searchable session values
	for (const r of validRecords) {
		const lbl = r.population?.label;
		if (lbl) {
			let cs = classFilterSets.get(lbl);
			if (!cs) classFilterSets.set(lbl, (cs = { subject: new Set(), room: new Set(), day: new Set(), teacher: new Set() }));
			if (r.subject) cs.subject.add(r.subject);
			if (r.room) cs.room.add(r.room);
			if (r.day) cs.day.add(r.day);
			if (r.teacher) cs.teacher.add(r.teacher);
		}
		if (r.teacher == null) continue;
		if (!teacherStats[r.teacher]) {
			teacherStats[r.teacher] = { count: 0, subjects: new Set(), classes: new Set(), rooms: new Set(), days: new Set() };
		}
		teacherStats[r.teacher].count += 1;
		if (r.subject) teacherStats[r.teacher].subjects.add(r.subject);
		if (lbl) teacherStats[r.teacher].classes.add(lbl);
		if (r.room) teacherStats[r.teacher].rooms.add(r.room);
		if (r.day) teacherStats[r.teacher].days.add(r.day);
	}

	const teachers = Object.keys(teacherStats)
		.sort((a, b) => a.localeCompare(b))
		.map((name) => ({
			name,
			sessionCount: teacherStats[name].count,
			subjects: Array.from(teacherStats[name].subjects),
			classes: Array.from(teacherStats[name].classes),
			filterSets: {
				subject: Array.from(teacherStats[name].subjects),
				room: Array.from(teacherStats[name].rooms),
				day: Array.from(teacherStats[name].days)
			}
		}));

	// Collect publication classes present in the CSV
	const publicationClasses = new Set(validRecords.map((r) => r.population?.label));

	// Match active leaf classes from catalogue.classes
	const classes = [];
	for (const c of catalogue.classes) {
		if (publicationClasses.has(c.label)) {
			const sc = classShortcut(c);
			const track = trackOf(c) || '';
			const yr = yearOf(c)?.number ?? '';

			const fs = classFilterSets.get(c.label);
			classes.push({
				identifier: c.label,
				classObj: c,
				shortcut: sc,
				track,
				year: yr,
				specialty: c.semester?.label || '',
				group: c.group || '',
				cohort: c.cohort != null ? String(c.cohort) : '',
				filterSets: fs
					? { subject: Array.from(fs.subject), room: Array.from(fs.room), day: Array.from(fs.day), teacher: Array.from(fs.teacher) }
					: { subject: [], room: [], day: [], teacher: [] }
			});
		}
	}

	// Sort classes deterministically
	classes.sort((a, b) => a.identifier.localeCompare(b.identifier));

	return {
		catalogue,
		records: validRecords,
		rejected,
		teachers,
		classes,
		size: validRecords.length,
		rawSize: rawRows
	};
}

/**
 * Polished teacher search with fuzzy matching across teacher name, subjects and classes.
 */
export function searchOmniTeachers(teachers, query) {
	const { terms, filters } = normQuery(query);
	const q = terms.trim();
	const corpus = teachers.filter((t) => passesFilters(t, filters));
	if (!q) {
		return corpus
			.map((t) => ({
				...t,
				exact: false,
				score: 0,
				nameRanges: null,
				subjectMatches: [],
				classMatches: []
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	const tokens = tokenize(q);
	const normQ = normStr(q);
	const out = [];

	corpus.forEach((t) => {
		let ok = true;
		let score = 0;
		const nameRanges = [];
		const subjectMatches = {};
		const classMatches = {};

		tokens.forEach((tok) => {
			let best = -1;
			const nr = fuzzyRanges(t.name, tok);
			if (nr) {
				best = scoreMatch(t.name, tok);
				nameRanges.push(...nr);
			}

			t.subjects.forEach((s) => {
				const sr = fuzzyRanges(s, tok);
				if (!sr) return;
				const sc = scoreMatch(s, tok);
				if (sc > best) best = sc;
				if (!subjectMatches[s]) subjectMatches[s] = { label: s, ranges: [] };
				subjectMatches[s].ranges.push(...sr);
			});

			t.classes.forEach((c) => {
				const cr = fuzzyRanges(c, tok);
				if (!cr) return;
				const sc = scoreMatch(c, tok);
				if (sc > best) best = sc;
				if (!classMatches[c]) classMatches[c] = { label: c, ranges: [] };
				classMatches[c].ranges.push(...cr);
			});

			if (best < 0) {
				ok = false;
				return;
			}
			score += best;
		});

		if (!ok) return;

		if (normStr(t.name) === normQ) score += 10000;

		out.push({
			...t,
			score,
			nameRanges: nameRanges.length ? mergeRanges(nameRanges) : null,
			subjectMatches: Object.keys(subjectMatches).map((k) => ({
				label: subjectMatches[k].label,
				ranges: mergeRanges(subjectMatches[k].ranges)
			})),
			classMatches: Object.keys(classMatches).map((k) => ({
				label: classMatches[k].label,
				ranges: mergeRanges(classMatches[k].ranges)
			}))
		});
	});

	return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/**
 * Polished class search with fuzzy matching across shortcut, track, specialty, and cohort.
 */
export function searchOmniClasses(classes, query) {
	const { terms, filters } = normQuery(query);
	const q = terms.trim();
	const corpus = classes.filter((c) => passesFilters(c, filters));
	if (!q) {
		return corpus
			.map((c) => ({
				...c,
				score: 0,
				headRanges: null,
				subRanges: null,
				attributeMatches: []
			}))
			.sort((a, b) => a.identifier.localeCompare(b.identifier));
	}

	const tokens = tokenize(q);
	const out = [];

	corpus.forEach((c) => {
		let ok = true;
		let score = 0;
		// Ranges are computed on the FULL identifier (the one string that
		// contains every part), then split at the head/sub boundary for
		// rendering. Per-fragment matching can never highlight a token
		// like "D2" that straddles head ('D') and sub ('2').
		const idRanges = [];
		const attributeMatches = {};

		tokens.forEach((tok) => {
			let matched = false;
			let best = -1;

			const ir = fuzzyRanges(c.identifier, tok);
			if (ir) {
				matched = true;
				const sc = scoreMatch(c.identifier, tok);
				if (sc > best) best = sc;
				idRanges.push(...ir);
			}

			const attrs = [
				['Track', c.track],
				['Specialty', c.specialty],
				['Year', c.year]
			];
			attrs.forEach(([attrName, attrVal]) => {
				if (!attrVal) return;
				const ar = fuzzyRanges(String(attrVal), tok);
				if (ar) {
					matched = true;
					const sc = scoreMatch(String(attrVal), tok);
					if (sc > best) best = sc;
					if (!attributeMatches[attrName]) {
						attributeMatches[attrName] = { name: attrName, value: String(attrVal), ranges: [] };
					}
					attributeMatches[attrName].ranges.push(...ar);
				}
			});

			if (!matched) {
				ok = false;
				return;
			}
			score += Math.max(best, 0);
		});

		// Split identifier ranges into head/sub ranges the page renders.
		const headLen = c.shortcut.head.length;
		const merged = mergeRanges(idRanges);
		const headRanges = merged.filter((r) => r[0] < headLen).map((r) => [r[0], Math.min(r[1], headLen)]);
		const subRanges = merged.filter((r) => r[1] > headLen).map((r) => [Math.max(r[0], headLen) - headLen, r[1] - headLen]);

		if (!ok) return;

		if (
			c.identifier.toLowerCase() === q.toLowerCase() ||
			c.shortcut.head.toLowerCase() === q.toLowerCase()
		) {
			score += 10000;
		}

		out.push({
			...c,
			score,
			headRanges: headRanges.length ? mergeRanges(headRanges) : null,
			subRanges: subRanges.length ? mergeRanges(subRanges) : null,
			attributeMatches: Object.keys(attributeMatches).map((k) => ({
				name: attributeMatches[k].name,
				value: attributeMatches[k].value,
				ranges: mergeRanges(attributeMatches[k].ranges)
			}))
		});
	});

	return out.sort((a, b) => b.score - a.score || a.identifier.localeCompare(b.identifier));
}

/**
 * Fuse teacher sessions sharing day and time.
 */
export function fuseTeacherSessions(sessions) {
	const slotGroups = {};
	for (const s of sessions) {
		const k = `${s.day}|${s.slot}`;
		if (!slotGroups[k]) {
			slotGroups[k] = [];
		}
		slotGroups[k].push(s);
	}

	const fused = [];
	for (const k of Object.keys(slotGroups)) {
		const list = slotGroups[k];
		const first = list[0];
		const rooms = Array.from(new Set(list.map((s) => s.room).filter(Boolean))).sort();
		const subjects = Array.from(new Set(list.map((s) => s.subject).filter(Boolean))).sort();
		const pills = Array.from(new Set(list.map((s) => s.population?.label).filter(Boolean))).sort();
		const weeks = Array.from(new Set(list.map((s) => s.weekPattern).filter(Boolean)));
		const week = weeks.length === 1 ? formatWeekPattern(weeks[0]) : '';

		fused.push({
			day: first.day,
			time: first.slot,
			room: rooms.join(' or ') || '—',
			subject: subjects.join(' or '),
			pills,
			week,
			rawSessions: list
		});
	}

	fused.sort((a, b) => {
		const dDiff = DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
		if (dDiff !== 0) return dDiff;
		const sDiff = SLOTS.indexOf(a.time) - SLOTS.indexOf(b.time);
		if (sDiff !== 0) return sDiff;
		return a.subject.localeCompare(b.subject);
	});

	return fused;
}

/**
 * Group already-sorted sessions by day, rotated to start from today.
 * Returns {dayOrder, byDay} where byDay[day] holds {s, i} entries.
 */
function groupByDay(sortedSessions, now) {
	const byDay = {};
	let dayOrder = [];
	sortedSessions.forEach((s, i) => {
		if (!byDay[s.day]) {
			byDay[s.day] = [];
			dayOrder.push(s.day);
		}
		byDay[s.day].push({ s, i });
	});
	// The day list is Monday-first by construction; rotation only moves the
	// anchor (today / next teaching day) to the front. On Sunday the anchor
	// is the first teaching day from Monday, so Monday stays first.
	dayOrder.sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
	dayOrder = startFromToday(dayOrder, sortedSessions, now);
	return { dayOrder, byDay };
}

/**
 * Interleave empty time slots ("breaks") between a day's first and last
 * session slots. Entries are {s, i} (groupByDay shape); result items are
 * {kind:'session', s, i} | {kind:'break', slot}. Multiple sessions in one
 * slot stay grouped (no break markers between them).
 */
export function withBreaks(entries, slotOf) {
	const present = new Set(entries.map((e) => slotOf(e.s)));
	let lo = Infinity, hi = -Infinity;
	for (const slot of present) {
		const i = SLOTS.indexOf(slot);
		if (i >= 0) { lo = Math.min(lo, i); hi = Math.max(hi, i); }
	}
	const items = [];
	for (let i = lo; i <= hi; i++) {
		const slot = SLOTS[i];
		const inSlot = entries.filter((e) => slotOf(e.s) === slot);
		if (!inSlot.length) items.push({ kind: 'break', slot });
		else for (const e of inSlot) items.push({ kind: 'session', s: e.s, i: e.i });
	}
	return items;
}

/** Rank counts of a key function into [{name, sessions, share}], desc. */
function rankBy(items, keyFn) {
	const counts = {};
	for (const item of items) {
		const k = keyFn(item);
		counts[k] = (counts[k] || 0) + 1;
	}
	const total = items.length;
	return Object.keys(counts)
		.sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))
		.map((name) => ({ name, sessions: counts[name], share: total ? counts[name] / total : 0 }));
}

/**
 * Build teacher detail view data.
 */
export function getTeacherDetail(omniStore, teacherName, now) {
	if (!omniStore || !teacherName) return null;
	const teacherSessions = omniStore.records.filter((r) => r.teacher === teacherName);
	if (!teacherSessions.length) return null;

	const fusedSessions = fuseTeacherSessions(teacherSessions);

	const now2 = now || new Date();
	const next = nextSessionIdx(fusedSessions, now2);


	const grouped = groupByDay(fusedSessions, now2);
	const dayOrder = grouped.dayOrder;
	const byDay = Object.fromEntries(
		Object.entries(grouped.byDay).map(([day, entries]) => [day, withBreaks(entries, (s) => s.time)])
	);
	const totalSessions = teacherSessions.length;
	const rankedSubjects = rankBy(teacherSessions, (s) => s.subject);
	const rankedClasses = rankBy(teacherSessions, (s) => s.population?.label || 'Other');

	return {
		name: teacherName,
		totalSessions,
		topSubject: rankedSubjects[0] ? rankedSubjects[0].name : '—',
		topClass: rankedClasses[0] ? rankedClasses[0].name : '—',
		rankedSubjects,
		rankedClasses,
		fusedSessions,
		upcoming: next,
		dayOrder,
		byDay
	};
}

/**
 * Build class detail view data using domain model resolution.
 */
export function getClassDetail(omniStore, classIdentifier, now) {
	if (!omniStore || !classIdentifier) return null;
	const resolution = resolve(omniStore.catalogue, classIdentifier, { as: 'class' });
	if (resolution.type !== 'found') return null;

	const cls = resolution.object;
	const sessions = sessionsFor(omniStore.catalogue, cls);
	if (!sessions.length) return null;

	// Domain sessions are returned as-is; the page reads slot/weekPattern directly.
	const sortedSessions = sessions.slice().sort((a, b) => {
		const dDiff = DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
		if (dDiff !== 0) return dDiff;
		return SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot);
	});

	const now2 = now || new Date();
	const cursor = dayCursor(now2, SLOTS);


	const grouped = groupByDay(sortedSessions, now2);
	const dayOrder = grouped.dayOrder;
	const dayGroups = dayOrder.map((day) => ({ day, items: withBreaks(grouped.byDay[day], (s) => s.slot) }));

	const byDaySlot = {};
	sortedSessions.forEach((s) => {
		const k = `${s.day}|${s.slot}`;
		(byDaySlot[k] = byDaySlot[k] || []).push(s);
	});

	const track = trackOf(cls) || '';
	const yr = yearOf(cls)?.number ?? '';
	const specialty = cls.semester?.label || '';
	const group = cls.group || '';
	const cohort = cls.cohort != null ? String(cls.cohort) : '';
	const groupe = group ? (cohort ? `${group}<sub>${cohort}</sub>` : group) : cohort || '';

	const facts = [];
	// Track + year number merge into the year designator (LCS3).
	if (track && yr) facts.push({ name: 'Year', value: `${track}${yr}`, raw: false });
	if (specialty) facts.push({ name: 'Specialty', value: specialty, raw: false });
	if (groupe) facts.push({ name: 'Groupe', value: groupe, raw: true });

	const shortcut = classShortcut(cls);

	return {
		identifier: classIdentifier,
		cls,
		shortcut,
		facts,
		sessions: sortedSessions,
		dayGroups,
		byDaySlot,
		cursor
	};
}
