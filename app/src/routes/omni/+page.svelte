<script>
	// app/src/routes/omni/+page.svelte — Unified omni timetable application.
	// Combines Teachers and Classes into a single page powered by the new
	// domain model library ($domain).
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import {
		buildOmniStore,
		getTeacherDetail,
		getClassDetail,
		searchOmniTeachers,
		searchOmniClasses,
		DAYS,
		SLOTS,
		frDay,
		hoursLabel,
		isCurrentSession
	} from '$lib/omni-model.js';
	import { formatWeekPattern } from '../../../../domain-model/print.js';
	import { parseSearchQuery, tokenAt, completeTypeAt, completePredicateValueAt, addPredicateAt } from '$lib/search.js';
	import * as color from '$lib/color.js';
	import { esc } from '$lib/data.js';
	import { headingHTML, teacherName, highlightHTML, highlightClassLabel } from '$lib/display.js';
	import { clock } from '$lib/clock.js';
	import * as kaomoji from '$lib/kaomoji.js';
	import { registerApp } from '$lib/register.js';
	let omniStore = $state(null);
	let loadError = $state('');

	// Filter query. Starts EMPTY on every viewport: an empty query (by the
	// parser — no type, terms, or filters) IS the type-selection state.
	let query = $state('');
	// Caret position: read-only detection state (which token the caret is
	// inside/touching). Edits are pure token replacements at this position.
	let caret = $state(0);

	// Browse mode tab: 'teachers' | 'classes' (no "all")
	let browseTab = $state('teachers');

	const parsedQuery = $derived(parseSearchQuery(query));

	// Result-type filter: derived from a `type:` predicate in the query
	// (type:teacher / type:classes), so the chips and the query stay in sync.
	const wantTeachers = $derived(!parsedQuery.type || parsedQuery.type === 'teacher');
	const wantClasses = $derived(!parsedQuery.type || parsedQuery.type === 'class');

	// Completions write to the query; the browser puts the caret in the
	// natural place. No selection management anywhere.
	function completeTypePredicate(kind) {
		query = completeTypeAt(query, kind, caret).query;
		searchEl?.focus();
	}

	// Completion state derives from the token the caret is inside or
	// touching (tokenAt) — including mid-query, so placing the caret
	// beside `type:class` reopens the menu to switch values. An entirely
	// empty query (no type/terms/filters per the parser) is the
	// type-selection state itself.
	const isEmptyQuery = $derived(
		parsedQuery.type === null && parsedQuery.terms.length === 0 && parsedQuery.filters.length === 0
	);
	const caretToken = $derived(tokenAt(query, caret));
	const completingType = $derived(isEmptyQuery || (caretToken ? /^type:(\*|[a-z]*)$/i.test(caretToken.token) : false));
	const insideTypeNode = $derived(caretToken ? /^type:/i.test(caretToken.token) : false);
	const insidePredicateNode = $derived.by(() =>
		caretToken ? /^(subject|room|teacher|day|cohort|group|track|year|specialty):/i.test(caretToken.token) : false
	);
	const typePartial = $derived.by(() => {
		const m = caretToken && /^type:(\*|[a-z]*)$/i.exec(caretToken.token);
		return m ? m[1].toLowerCase().replace('*', '') : '';
	});

	// Mobile navigation state: menuOpen controls .is-list on #layout
	let menuOpen = $state(false);

	// Selection state
	let selectedTeacher = $state(null);
	let selectedClass = $state(null);
	let noMatch = $state('');
	// Where the user came from: prefill the search predicate to match.
	let lastViewKind = $state(null); // 'teacher' | 'class' | null
	let hoveredType = $state(null); // completion tab under the mouse
	// Hover preview, derived from query + hovered kind only. The overlay
	// renders the whole line (input text is transparent), so preview and
	// model can never diverge.
	const ghostPreview = $derived.by(() => {
		if (!hoveredType || !caretToken) return null;
		if (!/^type:(\*|[a-z]*)$/i.test(caretToken.token)) return null;
		return {
			prefix: query.slice(0, caretToken.start) + 'type:',
			rest: hoveredType,
			suffix: query.slice(caretToken.end)
		};
	});

	const previewEnter = (kind) => (hoveredType = kind);
	const previewLeave = () => (hoveredType = null);

	// Remember the last selection (teacher or class) across reloads.
	const TEACHER_STORE_KEY = 'time-omni-teacher';
	const CLASS_STORE_KEY = 'time-omni-class';

	function readStoredTeacher() {
		try {
			if (typeof localStorage === 'undefined' || !localStorage) return null;
			const v = localStorage.getItem(TEACHER_STORE_KEY);
			return typeof v === 'string' && v ? v : null;
		} catch (e) {
			return null;
		}
	}

	function readStoredClass() {
		try {
			if (typeof localStorage === 'undefined' || !localStorage) return null;
			const v = localStorage.getItem(CLASS_STORE_KEY);
			return typeof v === 'string' && v ? v : null;
		} catch (e) {
			return null;
		}
	}

	function writeStoredTeacher(ref) {
		try {
			if (typeof localStorage === 'undefined' || !localStorage) return;
			if (ref) localStorage.setItem(TEACHER_STORE_KEY, ref);
			else localStorage.removeItem(TEACHER_STORE_KEY);
		} catch (e) {}
	}

	function writeStoredClass(ref) {
		try {
			if (typeof localStorage === 'undefined' || !localStorage) return;
			if (ref) localStorage.setItem(CLASS_STORE_KEY, ref);
			else localStorage.removeItem(CLASS_STORE_KEY);
		} catch (e) {}
	}

	let now = $state(new Date());

	// ---- Kaomoji Emoticon Animation -----------------------------------------
	const shortFaces = kaomoji.all().filter((f) => f.length <= 12);
	let emptyFace = $state(
		shortFaces.length
			? shortFaces[Math.floor(Math.random() * shortFaces.length)]
			: kaomoji.random() || '(＾▽＾)'
	);

	function nextFace() {
		const pool = shortFaces.filter((f) => f !== emptyFace);
		if (!pool.length) return emptyFace;
		return pool[Math.floor(Math.random() * pool.length)];
	}

	let reducedMotion =
		typeof window !== 'undefined' && window.matchMedia
			? window.matchMedia('(prefers-reduced-motion: reduce)')
			: null;

	function onEmptyClick(e) {
		emptyFace = nextFace();
		const empty = e.currentTarget;
		if (reducedMotion && reducedMotion.matches) return;
		const angle = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 12);
		empty.style.setProperty('--hop-rot', angle + 'deg');
		const transX = (Math.random() - 0.5) * 1.2;
		const transY = (Math.random() - 0.5) * 1.2;
		empty.style.setProperty('--hop-trans-x', transX + 'em');
		empty.style.setProperty('--hop-trans-y', transY + 'em');
		// overshoot: ~15% of throw distance, opposite direction (spring-back)
		empty.style.setProperty('--hop-overshoot-x', -transX * 0.15 + 'em');
		empty.style.setProperty('--hop-overshoot-y', -transY * 0.15 + 'em');
		empty.classList.remove('hopping');
		void empty.offsetWidth;
		empty.classList.add('hopping');
	}

	function onEmptyAnimEnd(e) {
		e.currentTarget.classList.remove('hopping');
	}

	onMount(() => {
		let unsub = null;
		registerApp();
		fetch(`${base}/time.csv`)
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.text();
			})
			.then((csvText) => {
				omniStore = buildOmniStore(csvText);
				// restore last selection
				const rt = readStoredTeacher();
				const rc = readStoredClass();
				if (rt && omniStore.teachers.some((t) => t.name === rt)) {
					selectedTeacher = rt;
					lastViewKind = 'teacher';
				} else if (rc) {
					try {
						if (getClassDetail(omniStore, rc, new Date())) {
							selectedClass = rc;
							lastViewKind = 'class';
						}
					} catch (e) {}
				}
				unsub = clock((t) => {
					now = t;
				});
			})
			.catch((err) => {
				loadError = String(err);
			});

		return () => {
			if (unsub) unsub();
		};
	});

	// Polished search results
	const filteredTeachers = $derived(
		omniStore ? searchOmniTeachers(omniStore.teachers, parsedQuery) : []
	);

	const filteredClasses = $derived(
		omniStore ? searchOmniClasses(omniStore.classes, parsedQuery) : []
	);

	// Contextual predicate suggestions: keys that can still narrow the
	// current results (with counts), shown when NOT completing `type:`.
	const predicateSuggestions = $derived.by(() => {
		if (!searchMode || insideTypeNode || insidePredicateNode) return [];
		// Only predicates that make sense for the current result kind are
		// suggested (classes: their identity; teachers: what they teach).
		// Anything else still works when typed explicitly. `type` follows
		// the same rule — absent from the AST means it is suggestable.
		const candidates = [];
		if (!parsedQuery.type && (filteredTeachers.length || filteredClasses.length)) {
			candidates.push({ key: 'type', label: 'Type', pool: [...filteredTeachers, ...filteredClasses] });
		}
		if (wantClasses && filteredClasses.length) {
			candidates.push(
				{ key: 'track', label: 'Track', pool: filteredClasses },
				{ key: 'year', label: 'Year', pool: filteredClasses },
				{ key: 'specialty', label: 'Specialty', pool: filteredClasses }
			);
		}
		if (wantTeachers && filteredTeachers.length) {
			candidates.push({ key: 'subject', label: 'Subject', pool: filteredTeachers });
		}
		const out = [];
		for (const { key, label, pool } of candidates) {
			if (parsedQuery.filters.some((f) => f.key === key)) continue;
			const distinct =
				key === 'type'
					? 2
					: new Set(
							pool.flatMap((item) =>
								['cohort', 'group', 'track', 'year', 'specialty'].includes(key)
									? [item[key]]
									: item.filterSets?.[key] ?? []
							)
						).size;
			out.push({ key, label, count: pool.length, distinct });
		}
		// One predicate with a single possible value is not a choice — hide.
		if (out.length === 1 && out[0].distinct <= 1) return [];
		return out;
	});

	// The token being typed, if it prefixes a filter key (e.g. `subj`),
	// narrows the suggestion list to the matching keys.
	const keyPrefix = $derived.by(() => {
		const tok = caretToken?.token ?? '';
		return /^[a-z]+$/i.test(tok) ? tok.toLowerCase() : '';
	});
	const visibleSuggestions = $derived(
		keyPrefix
			? predicateSuggestions.filter((p) => p.key.startsWith(keyPrefix))
			: predicateSuggestions
	);

	// Values menu: while inside a predicate value, list contextual values —
	// distinct session values across current results, narrowed by the partial.
	const valueMenu = $derived.by(() => {
		const tok = caretToken?.token ?? '';
		const m = /^(subject|room|teacher|day|cohort|group|track|year|specialty):(.*)$/i.exec(tok);
		if (!m) return null;
		const key = m[1].toLowerCase();
		const partial = m[2].toLowerCase();
		const pool = [
			...(wantTeachers ? filteredTeachers : []),
			...(wantClasses ? filteredClasses : [])
		];
		const counts = new Map();
		for (const item of pool) {
			// Identity predicates read the item's own field (like the filter).
			const vals =
				['cohort', 'group', 'track', 'year', 'specialty'].includes(key)
					? [item[key]]
					: item.filterSets?.[key] ?? [];
			for (const v of new Set(vals)) {
				if (!v) continue;
				const sv = String(v);
				if (partial && !sv.toLowerCase().includes(partial)) continue;
				counts.set(sv, (counts.get(sv) ?? 0) + 1);
			}
		}
		const values = [...counts.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([value, count]) => ({ value, count }));
		return { key, values };
	});

	function completePredicateValue(value) {
		query = completePredicateValueAt(query, value, caret).query;
		searchEl?.focus();
	}

	function addPredicate(key) {
		query = addPredicateAt(query, key, caret).query;
		searchEl?.focus();
	}

	const searchMode = $derived(query.trim().length > 0);

	// Which lists are visible
	const showTeachers = $derived(searchMode ? wantTeachers : browseTab === 'teachers');
	const showClasses = $derived(searchMode ? wantClasses : browseTab === 'classes');

	// Unified, score-sorted results in search mode
	const searchResults = $derived.by(() => {
		if (!searchMode) return [];
		const items = [];
		if (wantTeachers) {
			filteredTeachers.forEach((t) => items.push({ kind: 'teacher', score: t.score, data: t }));
		}
		if (wantClasses) {
			filteredClasses.forEach((c) => items.push({ kind: 'class', score: c.score, data: c }));
		}
		return items.sort((a, b) => b.score - a.score || String(a.data.name || a.data.identifier).localeCompare(String(b.data.name || b.data.identifier)));
	});

	// Total results count in list
	const listTotal = $derived(
		searchMode ? searchResults.length : (showTeachers ? filteredTeachers.length : 0) + (showClasses ? filteredClasses.length : 0)
	);

	// Leaving search: restore the browse tab from the active predicate.
	let prevQuery = $state('');
	$effect(() => {
		const q = query.trim();
		if (!q && prevQuery.trim()) {
			if (parsedQuery.type === 'teacher') browseTab = 'teachers';
			else if (parsedQuery.type === 'class') browseTab = 'classes';
		}
		prevQuery = query;
	});

	// Selection funnels
	function selectTeacher(name) {
		selectedTeacher = name;
		selectedClass = null;
		lastViewKind = 'teacher';
		noMatch = '';
		writeStoredTeacher(name);
		writeStoredClass(null);
		menuOpen = false;
		if (searchEl) searchEl.blur();
	}

	function selectClass(identifier) {
		selectedClass = identifier;
		selectedTeacher = null;
		lastViewKind = 'class';
		noMatch = '';
		writeStoredClass(identifier);
		writeStoredTeacher(null);
		menuOpen = false;
		if (searchEl) searchEl.blur();
	}

	// Toggle between cohort variants of the selected class (e.g. A1 <-> A2)
	// by switching to the sibling class entry that shares the same group
	// specifier but carries a different cohort specifier.
	function toggleCohort() {
		if (!selectedClass || !omniStore) return;
		const current = omniStore.classes.find((c) => c.identifier === selectedClass);
		if (!current || !current.cohort) return;
		const sibling = omniStore.classes.find(
			(c) =>
				c.specialty === current.specialty &&
				c.group === current.group &&
				c.cohort !== '' &&
				c.cohort !== current.cohort
		);
		if (sibling) selectClass(sibling.identifier);
	}

	function showEmpty() {
		selectedTeacher = null;
		selectedClass = null;
		noMatch = '';
		query = '';
		// Closing a timetable forgets it: no origin state for prefill.
		lastViewKind = null;
		writeStoredTeacher(null);
		writeStoredClass(null);
	}

	function eraseFilter() {
		query = '';
		noMatch = '';
	}

	function openMenu() {
		menuOpen = true;
	}

	function closeMenu() {
		menuOpen = false;
		if (searchEl) searchEl.blur();
	}

	// Focus search input after menu opens (runs after DOM update)
	$effect(() => {
		if (menuOpen && (selectedTeacher !== null || selectedClass !== null) && searchEl) {
			searchEl.focus();
		}
	});

	let searchEl = $state(null);

	function onKeydown(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			closeMenu();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const q = query.trim().toLowerCase();
			if (!q) return;

			// Exact hit wins, respecting any type: predicate.
			const exactT = wantTeachers && filteredTeachers.find((t) => t.name.toLowerCase() === q);
			if (exactT) {
				selectTeacher(exactT.name);
				return;
			}
			const exactC =
				wantClasses &&
				filteredClasses.find(
					(c) =>
						c.identifier.toLowerCase() === q ||
						c.shortcut.head.toLowerCase() === q ||
						`${c.shortcut.head}${c.shortcut.sub}`.toLowerCase() === q
				);
			if (exactC) {
				selectClass(exactC.identifier);
				return;
			}
			// Lone hit auto-jump
			if (wantTeachers && !wantClasses && filteredTeachers.length === 1) {
				selectTeacher(filteredTeachers[0].name);
				return;
			}
			if (wantClasses && !wantTeachers && filteredClasses.length === 1) {
				selectClass(filteredClasses[0].identifier);
				return;
			}
			if (filteredTeachers.length === 0 && filteredClasses.length === 0) {
				noMatch = query.trim();
			}
		}
	}

	// Derived teacher detail data
	const currentTeacherDetail = $derived(
		selectedTeacher ? getTeacherDetail(omniStore, selectedTeacher, now) : null
	);

	// Derived class detail data
	const currentClassDetail = $derived(
		selectedClass ? getClassDetail(omniStore, selectedClass, now) : null
	);

	function rowClasses(isNow, isNext) {
		return color.sessionRow({ isNow, isNext, dimIdle: false }).join(' ');
	}

	// Grid element references for cursor positioning
	let weekWrapEl = $state(null);
	let cursorLineEl = $state(null);

	function isTodayCell(d, cursor) {
		return !!cursor && cursor.visible && d === cursor.today;
	}

	function weekCell(d, slot, classDetail) {
		const cursor = classDetail.cursor;
		const isNow = !!cursor && cursor.visible && d === cursor.today && slot === cursor.cur;
		const isNext = !!cursor && cursor.visible && d === cursor.today && slot === cursor.next;
		const classes = color.weekCell({ isNow, isNext });
		if (cursor && cursor.visible && d === cursor.today) classes.push(color.CLASSES.today);
		return { classes, sessions: classDetail.byDaySlot[`${d}|${slot}`] || [] };
	}

	$effect(() => {
		const detail = currentClassDetail;
		const wrap = weekWrapEl;
		const line = cursorLineEl;
		if (!detail || !wrap || !line || !detail.cursor) return;
		const c = detail.cursor;
		if (!c.visible) {
			line.style.display = 'none';
			return;
		}
		line.style.display = '';
		const trs = wrap.querySelectorAll('tbody tr');
		const slot = c.cur || c.next;
		const idx = slot ? SLOTS.indexOf(slot) : -1;
		if (idx < 0 || idx >= trs.length) return;
		const tr = trs[idx];
		const wrapRect = wrap.getBoundingClientRect();
		const trRect = tr.getBoundingClientRect();
		line.style.top = trRect.top - wrapRect.top + (c.frac || 0) * trRect.height + 'px';
		line.style.width = wrap.scrollWidth + 'px';
	});
</script>

<svelte:head>
	<title>Omni Timetable — Time</title>
	<meta
		name="description"
		content="Omni Timetable — ISIM Mahdia teachers and classes schedules in one place."
	/>
	<meta name="theme-color" content="#0b4da2" />

	<!-- Font preconnects & Google Fonts -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=DynaPuff:wght@400..700&family=Tiny5&display=swap"
	/>

	<!-- Preload vendored kaomoji symbol webfonts -->
	<link
		rel="preload"
		href={`${base}/vendor/dejavu-sans.woff2`}
		as="font"
		type="font/woff2"
		crossorigin="anonymous"
	/>
	<link
		rel="preload"
		href={`${base}/vendor/noto-sans-kannada.woff2`}
		as="font"
		type="font/woff2"
		crossorigin="anonymous"
	/>
	<link
		rel="preload"
		href={`${base}/vendor/noto-sans-symbols.woff2`}
		as="font"
		type="font/woff2"
		crossorigin="anonymous"
	/>

	<link rel="stylesheet" href={`${base}/omni.css`} />
	<link rel="icon" href={`${base}/assets/icon-192.png`} sizes="192x192" type="image/png" />
	<link rel="apple-touch-icon" href={`${base}/assets/apple-touch-icon.png`} />
</svelte:head>

{#snippet matchLine(kind, m)}
	<span class={kind === 'class' ? 'cmatch' : 'fmatch'}>
		<b>{kind === 'class' ? 'Class' : 'Subject'}:</b> {@html kind === 'class' ? highlightClassLabel(m.label, m.ranges) : highlightHTML(m.label, m.ranges)}
	</span>
{/snippet}

<div id="layout" class={menuOpen ? 'is-list' : ''}>
	<div id="listPane">
		<button
			type="button"
			id="themeCycle"
			title="Cycle color preset"
			aria-label="Cycle color preset"
		></button>
		<h1>Omni Timetable</h1>
		<p class="author-credit">
			<span>By</span>&nbsp;<a href="https://github.com/adem482p" target="_blank" rel="noopener"
				>Adem Moussa</a
			>
		</p>

		<div id="searchWrap">
			<input
				id="search"
				type="search"
				placeholder="Search teacher, class, or subject…"
				autocomplete="off"
				value={ghostPreview ? ghostPreview.prefix + ghostPreview.rest + ghostPreview.suffix : query}
				bind:this={searchEl}
				oninput={(e) => {
					// Writing commits the displayed text and leaves hover mode.
					hoveredType = null;
					query = e.currentTarget.value;
					caret = e.currentTarget.selectionStart ?? query.length;
					if (!query.trim()) showEmpty();
				}}
				class:previewing={!!ghostPreview}
				onkeydown={onKeydown}
				onfocus={(e) => {
					// Prefill a COMPLETE value from where the user came from.
					// An empty box needs no prefill — it is already the
					// type-selection state.
					if (!query.trim() && lastViewKind) {
						query = `type:${lastViewKind}`;
					} else {
						caret = e.currentTarget.selectionStart ?? query.length;
					}
					openMenu();
				}}
				onclick={(e) => {
					caret = e.currentTarget.selectionStart ?? query.length;
					openMenu();
				}}
				onselect={(e) => {
					caret = e.currentTarget.selectionStart ?? query.length;
				}}
				onkeyup={(e) => {
					caret = e.currentTarget.selectionStart ?? query.length;
				}}
			/>
			<button type="button" id="searchBack" aria-label="Back" onclick={() => { closeMenu(); showEmpty(); }}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
			</button>
			<button
				type="button"
				id="searchClear"
				aria-label="Clear the search"
				hidden={!query}
				onmousedown={(e) => e.preventDefault()}
				onclick={eraseFilter}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</button>
			<button
				type="button"
				id="searchDeselect"
				aria-label="Back to selection"
				hidden={!((selectedTeacher !== null || selectedClass !== null) && query === '')}
				onmousedown={(e) => e.preventDefault()}
				onclick={showEmpty}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12h-14M12 6l-7 6 7 6" /></svg>
			</button>

			<!-- Selection overlay -->
			<div
				id="searchOverlay"
				hidden={(selectedTeacher === null && selectedClass === null) || menuOpen}
			>
				<button
					type="button"
					id="overlayToggle"
					aria-label="Open menu"
					onmousedown={(e) => e.preventDefault()}
					onclick={() => {
						openMenu();
						if (searchEl) searchEl.focus();
					}}
				></button>
				<button
					type="button"
					id="overlayClear"
					aria-label="Clear selection"
					onmousedown={(e) => e.preventDefault()}
					onclick={(e) => {
						e.stopPropagation();
						showEmpty();
					}}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
				</button>
				{#if selectedTeacher !== null}
					<span id="overlayName">
						{@html teacherName(selectedTeacher)}
					</span>
				{:else if selectedClass !== null && currentClassDetail}
					<span id="overlayName">
						{@html headingHTML(currentClassDetail.shortcut.head)}{#if currentClassDetail.shortcut.sub}<sub>{currentClassDetail.shortcut.sub}</sub>{/if}
					</span>
				{/if}
				<svg class="overlay-drop" viewBox="0 0 24 24" aria-hidden="true"
					><path d="M6 9l6 6 6-6" /></svg
				>
			</div>
		</div>

		<!-- Sub-row: completion UI or status — one fixed slot. Hidden only
		     while a timetable detail is shown (not while filtering it). -->
		{#if !((selectedTeacher || selectedClass) && !menuOpen)}
		<div class="omni-subrow">
			<!-- One completion slot: type tabs inside a `type:` node, else
			     next-predicate suggestions, else the status line. -->
			{#if completingType}
			<div class="omni-tabs" role="tablist" aria-label="Result types">
				<button
					type="button"
					class="omni-tab-btn"
					class:active={parsedQuery.type === 'teacher' || (typePartial !== '' && 'teacher'.startsWith(typePartial))}
					onmouseenter={() => previewEnter('teacher')}
					onmouseleave={() => previewLeave()}
					onmousedown={(e) => e.preventDefault()}
					onclick={() => completeTypePredicate('teacher')}
				>
					Teachers
				</button>
				<button
					type="button"
					class="omni-tab-btn"
					class:active={parsedQuery.type === 'class' || (typePartial !== '' && 'class'.startsWith(typePartial))}
					onmouseenter={() => previewEnter('class')}
					onmouseleave={() => previewLeave()}
					onmousedown={(e) => e.preventDefault()}
					onclick={() => completeTypePredicate('class')}
				>
					Classes
				</button>
			</div>
			{:else if valueMenu && valueMenu.values.length}
			<div class="value-menu" role="listbox" aria-label="Values">
				{#each valueMenu.values.slice(0, 12) as v (v.value)}
				<button
					type="button"
					class="value-chip"
					onmousedown={(e) => e.preventDefault()}
					onclick={() => completePredicateValue(v.value)}
				>
					{v.value} <b>{v.count}</b>
				</button>
				{/each}
			</div>
			{:else if visibleSuggestions.length}
			<div class="predicate-row" role="group" aria-label="Filter by">
				<span class="predicate-hint">Filter by</span>
				{#each visibleSuggestions as p (p.key)}
				<button
					type="button"
					class="predicate-chip"
					onmousedown={(e) => e.preventDefault()}
					onclick={() => addPredicate(p.key)}
				>
					{p.label}: <b>{p.count}</b>
				</button>
				{/each}
			</div>
			{:else}
			<p class="omni-substatus">
				{#if loadError}
					Failed to load data: {loadError}
				{:else if omniStore}
					{omniStore.size} sessions · {omniStore.teachers.length} teachers · {omniStore.classes.length} classes
				{:else}
					Loading timetable data…
				{/if}
			</p>
			{/if}
		</div>
		{/if}

		<!-- Lists container -->
		<div class="omni-lists">
			<div class="omni-lists-scroll">
				<ul id="omniList">
				{#if searchMode}
					{#if searchResults.length === 0}
						<li class="empty">No teachers or classes match "{query}".</li>
					{/if}
					{#each searchResults as item (item.kind + (item.kind === 'teacher' ? item.data.name : item.data.identifier))}
						{#if item.kind === 'teacher'}
							{@const t = item.data}
							<li
								data-name={t.name}
								class={color
									.teacherItem({ active: t.name === selectedTeacher })
									.concat([color.CLASSES.exact])
									.join(' ')}
							>
								<button
									type="button"
									class="rowhit"
									onmousedown={(e) => e.preventDefault()}
									onclick={() => selectTeacher(t.name)}
								>
									{@html teacherName(t.name, t.nameRanges)}
									{#each t.subjectMatches.slice(0, 3) as sm}{@render matchLine('subject', sm)}{/each}
									{#each t.classMatches.slice(0, 3) as cm}{@render matchLine('class', cm)}{/each}
								</button>
							</li>
						{:else}
							{@const c = item.data}
							<li
								data-key={c.identifier}
								class={color.classItem({ active: c.identifier === selectedClass }).join(' ')}
							>
								<button
									type="button"
									class="rowhit"
									onmousedown={(e) => e.preventDefault()}
									onclick={() => selectClass(c.identifier)}
								>
									{@html highlightHTML(c.shortcut.head, c.headRanges)}{#if c.shortcut.sub}<sub>{@html highlightHTML(c.shortcut.sub, c.subRanges)}</sub>{/if}
									{#each c.attributeMatches as a}
										<span class="class-attribute{a.name === 'Track' ? ' class-track' : ''}">
											<b>{a.name}:</b> {@html highlightHTML(a.value, a.ranges)}
										</span>
									{/each}
								</button>
							</li>
						{/if}
					{/each}
				{:else if browseTab === 'teachers'}
					{#if filteredTeachers.length === 0}
						<li class="empty">No teachers match.</li>
					{/if}
					{#each filteredTeachers as t (t.name)}
						<li
							data-name={t.name}
							class={color
								.teacherItem({ active: t.name === selectedTeacher })
								.concat([color.CLASSES.exact])
								.join(' ')}
						>
							<button
								type="button"
								class="rowhit"
								onmousedown={(e) => e.preventDefault()}
								onclick={() => selectTeacher(t.name)}
							>
								{@html teacherName(t.name, t.nameRanges)}
								{#each t.subjectMatches.slice(0, 3) as sm}{@render matchLine('subject', sm)}{/each}
								{#each t.classMatches.slice(0, 3) as cm}{@render matchLine('class', cm)}{/each}
							</button>
						</li>
					{/each}
				{:else}
					{#if filteredClasses.length === 0}
						<li class="empty">No classes match.</li>
					{/if}
					{#each filteredClasses as c (c.identifier)}
						<li
							data-key={c.identifier}
							class={color.classItem({ active: c.identifier === selectedClass }).join(' ')}
						>
							<button
								type="button"
								class="rowhit"
								onmousedown={(e) => e.preventDefault()}
								onclick={() => selectClass(c.identifier)}
							>
								{@html highlightHTML(c.shortcut.head, c.headRanges)}{#if c.shortcut.sub}<sub>{@html highlightHTML(c.shortcut.sub, c.subRanges)}</sub>{/if}
								{#each c.attributeMatches as a}
									<span class="class-attribute{a.name === 'Track' ? ' class-track' : ''}">
										<b>{a.name}:</b> {@html highlightHTML(a.value, a.ranges)}
									</span>
								{/each}
							</button>
						</li>
					{/each}
				{/if}
			</ul>
			</div>
		</div>
	</div>

	<!-- Detail pane -->
	<div id="detail">
		{#if noMatch}
			<p class="nomatch">No match for "{noMatch}".</p>
		{:else if selectedTeacher && currentTeacherDetail}
			<!-- Time View -->
			<h2>{@html teacherName(currentTeacherDetail.name)}</h2>
			<dl class="class-facts teacher-facts">
				<div class="fact-card">
					<dt class="fact-name">Subject</dt>
					<dd class="fact-value">~ {currentTeacherDetail.topSubject}</dd>
				</div>
				<div class="fact-card">
					<dt class="fact-name">Class</dt>
					<dd class="fact-value">~ {currentTeacherDetail.topClass}</dd>
				</div>
			</dl>

			{#each currentTeacherDetail.dayOrder as day (day)}
				<h3 class="day-head">{frDay(day)}</h3>
				<section class="day-group">
					<table class="t-sessions desktop-sessions">
						<tbody>
							<tr><th></th><th>Time</th><th>Room</th><th>Subject</th><th>Class</th></tr>
							{#each currentTeacherDetail.byDay[day] as item (item.kind === 'break' ? 'b' + item.slot : 's' + item.i)}
								{#if item.kind === 'session'}
								{@const entry = item}
								{@const isNow = isCurrentSession(entry.s.day, entry.s.time, now)}
								{@const isNext = !isNow && currentTeacherDetail.upcoming.has(entry.i)}
								<tr class={rowClasses(isNow, isNext)}>
									<td>
										{#if isNow}
											<span class="nowtag">● NOW</span>
										{:else if isNext}
											<span class="nexttag">
												<svg class="nextarrow" viewBox="0 0 24 24" aria-hidden="true">
													<path d="M4 12h14M12 6l6 6-6 6" />
												</svg>
												NEXT
											</span>
										{/if}
									</td>
									<td class="c-time">{entry.s.time}</td>
									<td class="c-room">{entry.s.room}</td>
									<td class="c-subject">{entry.s.subject}</td>
									<td class="c-class">
										{#each entry.s.pills as p (p)}
											<span class="pill">{@html headingHTML(p)}</span>
										{/each}
									</td>
								</tr>
								{/if}
							{/each}
						</tbody>
					</table>
					<div class="msession-list">
						{#each currentTeacherDetail.byDay[day] as item (item.kind === 'break' ? 'b' + item.slot : 's' + item.i)}
							{#if item.kind === 'break'}
								<article class="msession break">
									<span class="msession-leading">
										<svg class="msession-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 4v16M14 4v16M5 8h14M5 16h14" /></svg>
									</span>
									<div class="msession-body">
										<h4 class="msession-subject">Break</h4>
										<p class="msession-meta"><span class="msession-time">{item.slot}</span></p>
									</div>
								</article>
							{:else}
							{@const entry = item}
							{@const isNow = isCurrentSession(entry.s.day, entry.s.time, now)}
							{@const isNext = !isNow && currentTeacherDetail.upcoming.has(entry.i)}
							<article class="msession {rowClasses(isNow, isNext)}">
								<span class="msession-leading">
									<svg class="msession-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
								</span>
								<div class="msession-body">
									<div class="msession-head">
										<h4 class="msession-subject">{entry.s.subject}</h4>
										{#if isNow}
											<span class="msession-flag now">● NOW</span>
										{:else if isNext}
											<span class="msession-flag next">
											<svg class="nextarrow" viewBox="0 0 24 24" aria-hidden="true">
												<path d="M4 12h14M12 6l6 6-6 6" />
											</svg>
											NEXT
										</span>
										{/if}
									</div>
									<p class="msession-room">{entry.s.room}</p>
									<p class="msession-meta">
										<span class="msession-time">{entry.s.time}</span>
										{#each entry.s.pills as p (p)}
											<span class="pill">{@html headingHTML(p)}</span>
										{/each}
									</p>
								</div>
							</article>
							{/if}
						{/each}
					</div>
				</section>
			{/each}

			<h3>Subjects (ranked by hours)</h3>
			<ul class="subjlist">
				{#each currentTeacherDetail.rankedSubjects as s (s.name)}
					<li>
						{s.name}
						<span class="hours">
							{hoursLabel(s.sessions)} ({(s.share * 100).toFixed(1)}%)
						</span>
					</li>
				{/each}
			</ul>

			<h3>Classes (ranked by hours)</h3>
			<ul class="subjlist">
				{#each currentTeacherDetail.rankedClasses as c (c.name)}
					<li>
						{@html headingHTML(c.name)}
						<span class="hours">
							{hoursLabel(c.sessions)} ({(c.share * 100).toFixed(1)}%)
						</span>
					</li>
				{/each}
			</ul>
		{:else if selectedClass && currentClassDetail}
			<!-- Class Timetable View -->
			<h2>
				{@html headingHTML(currentClassDetail.shortcut.head)}{#if currentClassDetail.shortcut.sub}<sub>{currentClassDetail.shortcut.sub}</sub>{/if}
			</h2>

			<!-- Hierarchy facts -->
			<dl class="class-facts">
				{#each currentClassDetail.facts as f (f.name)}
					<div class="fact-card" class:clickable={f.name === 'Groupe'} onclick={f.name === 'Groupe' ? toggleCohort : null}>
						<dt class="fact-name">{f.name}</dt>
						<dd class="fact-value">{@html f.raw ? f.value : esc(f.value)}</dd>
					</div>
				{/each}
			</dl>

			<!-- Session cards, grouped by day (Material 3) -->
			{#each currentClassDetail.dayGroups as g (g.day)}
				<h3 class="day-head">{frDay(g.day)}</h3>
				<section class="day-group">
					<table class="c-sessions desktop-sessions">
						<tbody>
							<tr><th></th><th>Time</th><th>Teacher</th><th>Subject</th><th>Room</th></tr>
							{#each g.items as item (item.kind === 'break' ? 'b' + item.slot : 's' + item.i + item.s.subject)}
								{#if item.kind === 'session'}
								{@const s = item.s}
								{@const c = currentClassDetail.cursor}
								{@const isNow = isCurrentSession(s.day, s.slot, now)}
								{@const isNext = !isNow && !!c && c.visible && s.day === c.today && s.slot === c.next}
								<tr class={rowClasses(isNow, isNext)}>
									<td>
										{#if isNow}
											<span class="nowtag">● NOW</span>
										{:else if isNext}
											<span class="nexttag">
												<svg class="nextarrow" viewBox="0 0 24 24" aria-hidden="true">
													<path d="M4 12h14M12 6l6 6-6 6" />
												</svg>
												NEXT
											</span>
										{/if}
									</td>
									<td class="c-time">{s.slot}</td>
									<td class="c-teacher">{@html teacherName(s.teacher, '—')}</td>
									<td class="c-subject">{s.subject}</td>
									<td class="c-room">{s.room || '—'}</td>
								</tr>
								{/if}
							{/each}
						</tbody>
					</table>
					<div class="msession-list">
						{#each g.items as item (item.kind === 'break' ? 'b' + item.slot : 's' + item.i + item.s.subject)}
							{#if item.kind === 'break'}
								<article class="msession break">
									<span class="msession-leading">
										<svg class="msession-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 4v16M14 4v16M5 8h14M5 16h14" /></svg>
									</span>
									<div class="msession-body">
										<h4 class="msession-subject">Break</h4>
										<p class="msession-meta"><span class="msession-time">{item.slot}</span></p>
									</div>
								</article>
							{:else}
							{@const s = item.s}
							{@const c = currentClassDetail.cursor}
							{@const isNow = isCurrentSession(s.day, s.slot, now)}
							{@const isNext = !isNow && !!c && c.visible && s.day === c.today && s.slot === c.next}
							<article class="msession {rowClasses(isNow, isNext)}">
								<span class="msession-leading">
									<svg class="msession-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
								</span>
								<div class="msession-body">
									<div class="msession-head">
										<h4 class="msession-subject">{s.subject}</h4>
										{#if isNow}
											<span class="msession-flag now">● NOW</span>
									{:else if isNext}
											<span class="msession-flag next">
											<svg class="nextarrow" viewBox="0 0 24 24" aria-hidden="true">
												<path d="M4 12h14M12 6l6 6-6 6" />
											</svg>
											NEXT
										</span>
									{/if}
									</div>
									<p class="msession-room">{s.room || '—'}</p>
									<p class="msession-meta">
										<span class="msession-time">{s.slot}</span>
										<span class="msession-teacher">{@html teacherName(s.teacher, '—')}</span>
										{#if formatWeekPattern(s.weekPattern)}
											<span class="week-pill">{formatWeekPattern(s.weekPattern)}</span>
										{/if}
									</p>
								</div>
							</article>
							{/if}
						{/each}
					</div>
				</section>
			{/each}

			<!-- Desktop Whole Week Grid -->
			<h3 class="day-head week-head">WHOLE WEEK</h3>
			<div class="weekwrap" bind:this={weekWrapEl}>
				<table class="week">
					<thead>
						<tr>
							<th class="cgutter"></th>
							<th class="timecol"></th>
							{#each DAYS as d (d)}
								<th
									class="c-day{isTodayCell(d, currentClassDetail.cursor) ? ' ' + color.CLASSES.today : ''}"
									data-day={d}
								>
									{frDay(d)}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each SLOTS as slot (slot)}
							<tr data-slot={slot}>
								<td class="cgutter"></td>
								<td class="c-time">{slot}</td>
								{#each DAYS as d (d)}
									{@const cell = weekCell(d, slot, currentClassDetail)}
									<td class={cell.classes.join(' ')}>
										{#each cell.sessions as s (s.population?.label + s.subject + s.room)}
											<div class="session" style={s.color ? `--fill: ${s.color}` : ''}>
												<div class="s-subject">{s.subject}</div>
												<span class="s-teacher">{@html teacherName(s.teacher, '—')}</span>
												<div class="s-room">{s.room || '—'}</div>
												{#if formatWeekPattern(s.weekPattern)}
													<span class="week-pill">{formatWeekPattern(s.weekPattern)}</span>
												{/if}
											</div>
										{/each}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
				<div class="cursor" bind:this={cursorLineEl} style="display: none;"><div class="cursor-arrow"></div></div>
			</div>
		{:else}
			<!-- Empty state with ported animation and styled heading -->
			<div
				class="empty-state"
				aria-hidden="true"
				onclick={onEmptyClick}
				onanimationend={onEmptyAnimEnd}
			>
				<div class="no-teacher-selected no-class-selected">Nothing is selected</div>
				<div class="empty-face">{emptyFace}</div>
			</div>
		{/if}
	</div>
</div>

<style>
	@font-face {
		font-family: 'Tiny5';
		font-style: normal;
		font-weight: 400;
		font-display: swap;
		src: url('/vendor/tiny5.ttf') format('truetype');
	}

	@font-face {
		font-family: 'DynaPuff';
		font-style: normal;
		font-weight: 400 700;
		font-display: swap;
		src: url('/vendor/dynapuff.ttf') format('truetype');
	}

	/* Tabs positioned directly under the search box */
	/* Segmented button group (M3): one connected control, shared outer
	   border, hairline divider, selected segment tonally filled. */
	.omni-tabs {
		display: flex;
		gap: 0;
		margin: 0.4rem 0 0.5rem;
		border: 1px solid var(--md-outline-variant, #ccc);
		border-radius: 999px;
		overflow: hidden;
		flex-shrink: 0;
		background: var(--md-surface, #fff);
	}

	.omni-tab-btn {
		flex: 1;
		font-family: inherit;
		font-size: 0.82rem;
		padding: 0.5rem 1rem;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--md-on-surface-variant, #555);
		cursor: pointer;
		font-weight: 500;
		text-align: center;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.omni-tab-btn + .omni-tab-btn {
		border-left: 1px solid var(--md-outline-variant, #ccc);
	}

	@media (hover: hover) {
		.omni-tab-btn:hover {
			background: color-mix(in srgb, var(--md-on-surface, #1b1b1b) 8%, transparent);
			color: var(--md-on-surface, #222);
		}
	}

	.omni-tab-btn.active {
		background: var(--md-secondary-container, #eef4ff);
		color: var(--md-on-secondary-container, #1b1b1b);
	}

	.omni-lists-scroll {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
	}

	.empty-list-notice {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.omni-filters {
		display: flex;
		gap: 0.4rem;
		margin: 0.4rem 0 0.5rem;
		flex-shrink: 0;
		flex-wrap: wrap;
	}

	.omni-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-family: inherit;
		font-size: 0.82rem;
		font-weight: 500;
		padding: 0.3rem 0.75rem 0.3rem 0.55rem;
		border: 1px solid var(--md-outline, #8e9099);
		border-radius: 999px;
		background: transparent;
		color: var(--md-on-surface-variant, #555);
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
	}

	.omni-chip:hover {
		color: var(--md-on-surface, #222);
	}

	.omni-chip.active {
		background: var(--md-secondary-container, #eef4ff);
		color: var(--md-on-secondary-container, #1b1b1b);
		border-color: transparent;
	}

	.omni-chip-check {
		font-size: 0.9em;
		line-height: 1;
		min-width: 0.9em;
	}

	@media (max-width: 700px) {
		:global(#layout:not(.is-list)) .omni-filters {
			display: none;
		}

		:global(#layout.is-list) .omni-filters {
			display: flex;
			margin: 0.4rem 0;
			gap: 0.4rem;
		}
	}

	/* On mobile, tabs visibility mirrors the list: hidden unless .is-list */
	@media (max-width: 700px) {
		:global(#layout:not(.is-list)) .omni-tabs {
			display: none;
		}

		:global(#layout.is-list) .omni-tabs {
			display: flex;
			margin: 0.4rem 0;
		}
	}

	.fact-card.clickable {
		cursor: pointer;
	}
	@media (hover: hover) {
		.fact-card.clickable:hover {
			background: color-mix(in srgb, var(--md-primary, #0b4da2) 16%, var(--md-surface, #fff));
		}
	}
	.fact-card.clickable:active {
		background: color-mix(in srgb, var(--md-primary, #0b4da2) 22%, var(--md-surface, #fff));
	}
</style>
