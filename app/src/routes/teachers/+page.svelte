<script>
	// app/src/routes/teachers/+page.svelte — the teachers page. State machine
	// and funnels ported line-by-line from js/teachers.js: a two-facts mobile
	// nav machine (menuOpen / selectedTeacher -> 'list' | 'teacher' |
	// 'empty'), one selection funnel (selectTeacher), one deselect funnel
	// (showEmpty), one erase-only funnel for the clear X (eraseFilter), the
	// desktop autocomplete overlay + shadow-text ghost, grouped live search
	// (teacher:/class:/subject: constraints), the count line derivation
	// (issue 078/079: numbers show only while the box is empty AND nothing is
	// selected), and the one page clock (issue 051) re-ranking the list from
	// fresh availability and re-rendering the open detail on every tick.
	//
	// The legacy imperative render calls map to reactive derivations: the
	// live list and the open detail are derived from (store, query, avail,
	// now) — the derivations run the same render bodies the legacy
	// functions ran, only as data flow instead of innerHTML writes. What
	// stays imperative is exactly what was fact-write in the legacy code:
	// the suggest overlay updates, the selection funnels and the keyboard
	// edges. Class names are shortened only for display; every display-bound
	// string goes through the same escapers (headingHTML / nameHTML /
	// highlightHTML return pre-escaped markup, never raw model strings).
	//
	// The markup keeps the legacy ids (#layout, #listPane, #searchWrap, …)
	// so the stylesheet stays the single source of the visual vocabulary.
	//
	// Issue 078, kept: this page is NOT installable by default — the
	// manifest link is injected only under ?install=1, as early as mount
	// (the static tag was parse-time; same semantics for the install prompt
	// itself). Issue 072: this page registers its own worker (teachers/sw.js).
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { loadStore } from '$lib/load.js';
	import * as model from '$lib/model.js';
	import * as match from '$lib/match.js';
	import * as color from '$lib/color.js';
	import { esc, nameHTML, redacted } from '$lib/data.js';
	import { headingHTML } from '$lib/display.js';
	import { clock } from '$lib/clock.js';
	import * as kaomoji from '$lib/kaomoji.js';
	import { registerApp } from '$lib/register.js';

	let store = $state(null);
	let modelObjs = $state(null);
	let index = $state(null);
	let loadError = $state('');

	// the filter (source of truth for the list; never rewritten by selection)
	let query = $state('');
	// mobile nav machine facts (issue 056): three named states —
	//   menuOpen                 -> 'list'   (filterable list + back arrow)
	//   !menuOpen && selected    -> 'teacher' (timeline + name overlay)
	//   !menuOpen && !selected   -> 'empty'  (kaomoji; the default)
	// Blur writes neither fact (a press in flight must never lose its row);
	// only openMenu/closeMenu (menu edges), selectTeacher and showEmpty write.
	let menuOpen = $state(false);
	let selectedTeacher = $state(null);
	// the no-match page the committed query produced (cleared by any
	// selection/deselect; the filter itself never clears it in onInput)
	let noMatch = $state('');
	// the autocomplete overlay: rows + active index (-1 = none; mobile has
	// no pre-focus, so Enter must commit the typed query — issue 007)
	let suggestRows = $state([]);
	let suggestIdx = $state(-1);

	let now = $state(new Date());

	onMount(() => {
		let unsub = null;
		// issue 078: the manifest link ships only on explicit opt-in
		if (/[?&]install=1(&|$)/.test(location.search)) {
			const l = document.createElement('link');
			l.rel = 'manifest';
			l.href = 'manifest.json';
			document.head.appendChild(l);
		}
		registerApp();
		loadStore(base)
			.then((s) => {
				store = s;
				modelObjs = model.buildAll(s);
				index = match.buildIndex(s, modelObjs);
				// the page subscribes once at mount; the clock owns the cadence (issue 051)
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

	// ---- the giant faint emoticon (empty detail) ---------------------------

	// The faces come from the vendored kaomoji library (one drawn per page
	// load); only the short ones are used — they must fit the detail column,
	// with a lone face as a no-library fallback. Pressing the empty area hops
	// (decorative, mouse/tap-only easter egg).
	const shortFaces = kaomoji.all().filter((f) => f.length <= 12);
	let emptyFace = $state(
		shortFaces.length
			? shortFaces[Math.floor(Math.random() * shortFaces.length)]
			: kaomoji.random() || '(＾▽＾)'
	);

	/** pick a face from the same pool that differs from the current one; the
	 * pool bounds the choice, so the selection always terminates. */
	function nextFace() {
		const pool = shortFaces.filter((f) => f !== emptyFace);
		if (!pool.length) return emptyFace;
		return pool[Math.floor(Math.random() * pool.length)];
	}

	// Decorative hop: every press immediately swaps in a different face and
	// restarts the animation from 0% (remove-class -> forced reflow ->
	// re-add-class; re-adding a live class alone does not replay a CSS
	// animation). Reduced motion swaps instantly with no hop.
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
	// clears the hop class when the animation ends
	function onEmptyAnimEnd(e) {
		e.currentTarget.classList.remove('hopping');
	}

	// ---- availability (the clock's payload) --------------------------------

	// availability is time-dependent: rebuilt on every clock tick (issue 051),
	// for list ordering only (never a committed-query key, no visual encoding).
	const avail = $derived.by(() => {
		const map = {};
		if (!store) return map;
		store.teachers.forEach((n) => {
			map[n] = model.availability(store.sessionsOf(n), now);
		});
		return map;
	});

	// ---- grouped live search ------------------------------------------------

	// the live search result of the current filter (the successor of the
	// legacy onInput/commit renderList calls)
	const res = $derived(index ? match.searchSections(index, query, avail) : null);

	// the flat list: a header row introduces each fallback section; the
	// primary matches-all block stays unlabelled, and a lone section needs
	// none (identical on all viewports)
	const listRows = $derived.by(() => {
		const r = res;
		if (!r) return [];
		const rows = [];
		const many = r.sections.length > 1;
		r.sections.forEach((sec) => {
			if (many && sec.key !== 'all' && sec.label && sec.hits.length)
				rows.push({ head: sec.label });
			sec.hits.forEach((h) => rows.push({ hit: h }));
		});
		return rows;
	});
	const listTotal = $derived(res ? res.total : 0);

	/** the single hit of a one-result section (used for auto-jump). */
	function onlyHit(r) {
		let found = null;
		r.sections.forEach((sec) => {
			if (sec.hits.length === 1) found = sec.hits[0];
		});
		return found;
	}

	/** An exact teacher name selects even among partial matches: tapping a
	 * suggest row commits its text, and that text may still match others
	 * (e.g. "Ben Haj" also matches "Ben Hadj Belkacem") — the exact hit wins
	 * so every selection dismisses the menu. */
	function exactTeacher(r, q) {
		const want = model.normStr(q.trim());
		let found = null;
		r.sections.forEach((sec) => {
			(sec.hits || []).forEach((h) => {
				if (!found && h.teacher && model.normStr(h.teacher) === want) found = h.teacher;
			});
		});
		return found;
	}

	// ---- the one selection / deselect / erase funnels -----------------------

	// every path that picks a teacher lands here; blurs because the overlay
	// owns the box in state=teacher
	function selectTeacher(name) {
		selectedTeacher = name;
		noMatch = '';
		renderSuggest([]);
		searchEl.blur();
		menuOpen = false;
	}

	// every deselect funnels through here; the filter text is preserved.
	// showsEmpty writes no suggest ghost of its own (dropping the overlay
	// happens in the same breath in every caller)
	function showEmpty() {
		selectedTeacher = null;
		noMatch = '';
		renderSuggest([]);
		// deselecting reveals the count line again (issue 079).
	}

	// the clear X lands here (issue 060), never in onInput()/commit(): it
	// never deselects and never arms the menu. Keyboard emptying still
	// deselects through onSearchInput (pinned 056) — a deliberate
	// divergence: the keyboard runs the live-search derivation, the X is an
	// explicit erase-only command.
	function eraseFilter() {
		query = '';
		renderSuggest([]);
	}

	// menu edges: the list is open or not — blur writes neither fact
	function openMenu() {
		menuOpen = true;
	}
	function closeMenu() {
		menuOpen = false;
		searchEl.blur();
	}

	// ---- the autocomplete overlay + shadow text -----------------------------

	/** replace the overlay rows; hides the overlay when there are none.
	 * Desktop pre-focuses row 0; mobile (coarse pointer) has no pre-focus,
	 * so Enter must commit the typed query until the user explicitly picks
	 * a row (issue 007). Ghost derives from suggestIdx, so -1 also means no
	 * ghost. */
	function renderSuggest(rows) {
		suggestRows = rows;
		suggestIdx = rows.length ? (isCoarsePointer() ? -1 : 0) : -1;
	}

	// Mobile gate (issue 007): coarse pointers (touch/soft keyboard) have no
	// Escape key to opt out of the pre-focused first suggestion. Defaults to
	// false (desktop) when window/matchMedia is absent (e.g. node tests).
	function isCoarsePointer() {
		if (typeof window === 'undefined' || !window.matchMedia) return false;
		try {
			return !!window.matchMedia('(pointer: coarse)').matches;
		} catch (e) {
			return false;
		}
	}

	/** Class names for a suggestion row: kind-aware, index-aware. */
	function suggestClasses(r, i) {
		return color.suggestion({ kind: r.kind, active: i === suggestIdx }).join(' ');
	}

	/** a teacher list row body: redaction-aware name + the relevant-hours
	 * line + the first few subject/class match chips (the legacy renderItem
	 * innerHTML walk). */
	function rowHTML(r) {
		let h = match.nameHTML(r.teacher, r.nameRanges);
		if (r.relevantSessions > 0)
			h +=
				' <span class="relevant">(' + model.hoursLabel(r.relevantSessions) + ' relevant)</span>';
		(r.subjectMatches || []).slice(0, 3).forEach((m) => {
			h += '<span class="fmatch"><b>Subject:</b> ' + match.highlightHTML(m.label, m.ranges) + '</span>';
		});
		(r.classMatches || []).slice(0, 3).forEach((m) => {
			h += '<span class="cmatch"><b>Class:</b> ' + headingHTML(m.label) + '</span>';
		});
		return h;
	}

	/** the overlay row body: class rows show the shortcut form, teacher rows
	 * go through the redaction-aware nameHTML (issue 061), subjects are
	 * highlighted ranges (the count badge was removed, issue 062). */
	function rowBodyHTML(r) {
		let body;
		if (r.kind === 'class') {
			body =
				headingHTML(r.label) +
				(r.detail ? ' <span class="alias">— ' + headingHTML(r.detail) + '</span>' : '');
		} else if (r.kind === 'teacher') {
			body = match.nameHTML(r.label, r.ranges);
		} else {
			body = match.highlightHTML(r.label, r.ranges);
		}
		return body;
	}

	// the shadow ghost (issue 061: no ghost under redaction — the faint
	// completion would leak the rest of a teacher name)
	const sh = $derived.by(() => {
		const row = redacted() ? null : suggestRows[suggestIdx];
		return row ? match.shadowText(query, row) : null;
	});
	let searchEl = $state(null);
	let ghostPreEl = $state(null);

	// The prefix hint renders before the typed run, so the real input's text
	// origin (and caret) must move right by the hint's width; the transparent
	// typed run then sits exactly under the real text. Measured after the
	// ghost renders.
	$effect(() => {
		const w = ghostPreEl && sh && sh.pre ? ghostPreEl.getBoundingClientRect().width : 0;
		if (searchEl) {
			if (w) searchEl.style.setProperty('--ghost-pre', w + 'px');
			else searchEl.style.removeProperty('--ghost-pre');
		}
	});

	/** commit the overlay row into the filter and fall to commit() */
	function acceptSuggest(row) {
		query = row.commit;
		renderSuggest([]);
		commit();
	}

	// ---- committed queries + the input funnel -------------------------------

	// the input listener: the filter drives the list/count/count-away through
	// `query` derivations; these are the legacy side effects that are still
	// fact-writes: re-filling the suggest rows, back to the empty state on an
	// empty filter (keyboard emptying STILL deselects — pinned 056), and the
	// exactly-one-result auto-jump to the table view.
	function onSearchInput(e) {
		query = e.currentTarget.value;
		const r = res;
		renderSuggest(index ? match.suggest(index, query) : []);
		// an empty filter means nothing is selected: back to the empty state
		if (!query.trim()) showEmpty();
		// exactly one result left -> auto-jump to the table view
		if (r && r.total === 1) {
			const only = onlyHit(r);
			if (only) selectTeacher(only.teacher);
		}
	}

	function commit() {
		renderSuggest([]);
		if (!query.trim()) {
			showEmpty();
			return;
		}
		const r = res;
		const exact = exactTeacher(r, query);
		if (exact) {
			selectTeacher(exact);
		} else if (r.total === 0) {
			// the no-match page: the empty filter in onInput never writes this
			noMatch = query;
		} else if (r.total === 1) {
			const only = onlyHit(r);
			if (only) selectTeacher(only.teacher);
		}
		// no trailing syncList here either: a selection closes the menu and
		// the is-list class cannot resurrect a closed one
	}

	// ---- keyboard + focus/blur edges ----------------------------------------

	function onKeydown(e) {
		if (e.key === 'Escape') {
			// <input type="search"> clears the field on Esc by default; cancel
			// that so Esc keeps the typed filter: it drops the suggest overlay
			// if open, else closes the menu — it never deselects.
			e.preventDefault();
			if (suggestRows.length) {
				renderSuggest([]);
				return;
			}
			closeMenu();
		} else if (e.key === 'Tab') {
			// issue 007: Tab must not accept an implicit (non-explicit)
			// selection on mobile (suggestIdx -1) — same gate as Enter.
			if (suggestRows.length && suggestIdx >= 0) {
				e.preventDefault();
				acceptSuggest(suggestRows[suggestIdx]);
			}
		} else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			if (suggestRows.length) {
				e.preventDefault();
				suggestIdx =
					e.key === 'ArrowDown'
						? (suggestIdx + 1) % suggestRows.length
						: (suggestIdx - 1 + suggestRows.length) % suggestRows.length;
			}
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (suggestRows.length && suggestIdx >= 0) acceptSuggest(suggestRows[suggestIdx]);
			else commit();
		}
	}

	// blur only drops the autocomplete overlay: menu visibility is
	// selection/back-driven, never blur-driven, so losing focus must never
	// hide the row a press is about to land on.
	function onBlur() {
		renderSuggest([]);
	}

	// tapping the filter box always brings the menu back: focus alone does
	// not refire while the box never lost focus (row taps keep it focused),
	// but click fires on every tap.
	function onSearchFocus() {
		openMenu();
	}
	function onSearchClick() {
		openMenu();
	}

	// ---- the open detail table ----------------------------------------------

	/** the teacher whose detail the page owns (null = none): the derived
	 * detailGroups runs the legacy showTeacher body per render. */
	const detailGroups = $derived.by(() => {
		if (!store || !modelObjs || !selectedTeacher) return null;
		const t = modelObjs.teachers[selectedTeacher];
		if (!t) return null;
		const ss = model.fuseSessions(store.sessionsOf(selectedTeacher), modelObjs.groups);
		const now2 = now;
		const next = model.nextSessionIdx(ss, now2);
		// days with no live stake (no now/next session) render dimmed
		const liveDays = {};
		ss.forEach((s, i) => {
			if (model.isCurrentSession(s.day, s.time, now2) || next.has(i)) liveDays[s.day] = true;
		});
		// one section per non-empty day, cyclic from today (issue 050: the
		// first-seen Monday-first day order is rotated to the anchor day)
		let dayOrder = [];
		const byDay = {};
		ss.forEach((s, i) => {
			if (!byDay[s.day]) {
				byDay[s.day] = [];
				dayOrder.push(s.day);
			}
			byDay[s.day].push({ s: s, i: i });
		});
		dayOrder = model.startFromToday(dayOrder, ss, now2);
		const upcoming = next;
		return { t, ss, upcoming, liveDays, dayOrder, byDay, name: selectedTeacher };
	});

	/** classes for one session row (now/next driven only). */
	function rowClasses(entry) {
		const isNow = model.isCurrentSession(entry.s.day, entry.s.time, now);
		const isNext = !isNow && detailGroups.upcoming.has(entry.i);
		return color.sessionRow({ isNow: isNow, isNext: isNext, dimIdle: false }).join(' ');
	}
</script>

<svelte:head>
	<title>Teachers — Emplois</title>
	<meta
		name="description"
		content="Emplois — the ISIM Mahdia timetable, searchable by teacher, class or subject."
	/>
	<meta name="theme-color" content="#0b4da2" />
	<link rel="icon" href={`${base}/assets/icon-192.png`} sizes="192x192" type="image/png" />
	<link rel="apple-touch-icon" href={`${base}/assets/apple-touch-icon.png`} />
</svelte:head>

<div id="layout" class={menuOpen ? 'is-list' : ''}>
	<div id="listPane">
		<button type="button" id="themeCycle" title="Cycle color preset" aria-label="Cycle color preset"
		></button>
		<h1>Find Teachers</h1>
		<p class="author-credit">
			<span>By </span><a href="https://github.com/adem482p" target="_blank" rel="noopener"
				>Adem Moussa</a
			>
		</p>
		<div id="searchWrap">
			<div id="ghost" aria-hidden="true" hidden={!sh}>
				{#if sh}<span id="ghostPre" bind:this={ghostPreEl}>{sh.pre}</span><span id="ghostTyped"
						>{query}</span
					><span id="ghostRest">{sh.rest}</span>{/if}
			</div>
			<input
				id="search"
				type="search"
				placeholder="Search teacher, class (GLSI3D1) or subject…"
				autocomplete="off"
				value={query}
				bind:this={searchEl}
				oninput={onSearchInput}
				onkeydown={onKeydown}
				onfocus={onSearchFocus}
				onclick={onSearchClick}
				onblur={onBlur}
			/>
			<button type="button" id="searchBack" aria-label="Back" onclick={closeMenu}>
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
				aria-label="Back to the teacher list"
				hidden={!(selectedTeacher !== null && query === '')}
				onmousedown={(e) => e.preventDefault()}
				onclick={() => showEmpty()}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12h-14M12 6l-7 6 7 6" /></svg>
			</button>
			<div id="searchOverlay" hidden={selectedTeacher === null || menuOpen} onclick={openMenu}>
				<button
					type="button"
					id="overlayClear"
					aria-label="Clear the selection"
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
						{#if redacted()}{@html nameHTML(selectedTeacher)}{:else}{selectedTeacher}{/if}
					</span>
				{/if}
				<svg class="overlay-drop" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
			</div>
			<ul id="suggest" hidden={!suggestRows.length}>
				{#each suggestRows as r, i (i)}
					<li class={suggestClasses(r, i)} onmousedown={(e) => { e.preventDefault(); acceptSuggest(r); }}>
						<span class="kind kind-{r.kind}">{r.kind}</span>
						{@html rowBodyHTML(r)}
					</li>
				{/each}
			</ul>
		</div>
		<p id="status" class={!!(query || selectedTeacher) ? 'count-away' : ''}>
			{#if loadError}Failed to load emplois.csv: {loadError}{:else if store}{store.size} sessions · {store
				.teachers
				.length} teachers{:else}Loading emplois.csv…{/if}
		</p>
		<ul id="teacherList">
			{#if res && !listTotal}
				<li class="empty">No teachers match.</li>
			{/if}
			{#each listRows as row, i (i)}
				{#if row.head}
					<li class="group-head">{row.head}</li>
				{:else}
					{@const r = row.hit}
					<li
						data-name={r.teacher}
						class={color
							.teacherItem({ active: r.teacher === selectedTeacher })
							.concat(r.exact ? [color.CLASSES.exact] : [color.CLASSES.partial])
							.join(' ')}
						onclick={() => selectTeacher(r.teacher)}
					>
						<!-- The filter is the source of truth for the list: selecting a
						     row must not rewrite it, so the result list stays as-is
						     and the user can move to the next hit. -->
						{@html rowHTML(r)}
					</li>
				{/if}
			{/each}
		</ul>
	</div>
	<div id="detail">
		{#if noMatch}
			<p class="nomatch">No match for "{noMatch}".</p>
		{:else if detailGroups}
			<!-- showTeacher: this page owns the detail from here (issue 051) —
			     re-renders unconditional on every clock tick, no gating -->
			<h2>{@html nameHTML(detailGroups.name)}</h2>
			<dl class="class-facts teacher-facts">
				<div class="fact-card">
					<dt class="fact-name">Subject</dt>
					<dd class="fact-value">~ {esc(detailGroups.t.topSubject ? detailGroups.t.topSubject.name : '—')}</dd>
				</div>
				<div class="fact-card">
					<dt class="fact-name">Class</dt>
					<dd class="fact-value"
						>~ {@html headingHTML(
							detailGroups.t.topClass ? detailGroups.t.topClass.compactName() : '—'
						)}</dd
					>
				</div>
			</dl>
			{#each detailGroups.dayOrder as day (day)}
				<h3 class="day-head">{model.frDay(day)}</h3>
				<section class="day-group{detailGroups.liveDays[day] ? '' : ' dim'}">
					<table class="t-sessions">
						<tbody>
							<tr><th></th><th>Time</th><th>Room</th><th>Subject</th><th>Class</th></tr>
							{#each detailGroups.byDay[day] as entry (entry.i)}
								<tr class={rowClasses(entry)}>
								<td>
									{#if model.isCurrentSession(entry.s.day, entry.s.time, now)}
										<span class="nowtag">● NOW</span>
									{:else if detailGroups.upcoming.has(entry.i)}
										<span class="nexttag"
											><svg class="nextarrow" viewBox="0 0 24 24" aria-hidden="true"
												><path d="M4 12h14M12 6l6 6-6 6" /></svg
											>NEXT</span
										>
									{/if}
								</td>
								<td class="c-time">{esc(entry.s.time)}</td>
								<td class="c-room">{esc(entry.s.room || '—')}</td>
								<td class="c-subject">{esc(entry.s.subject)}</td>
								<td class="c-class">
									{#each entry.s.pills as p (p)}<span class="pill">{@html headingHTML(p)}</span>{/each}
								</td>
							</tr>
							{/each}
						</tbody>
					</table>
				</section>
			{/each}
			<!-- the breakdown trees: subjects by hours; classes by hours -->
			<h3>Subjects (ranked by hours)</h3>
			<ul class="subjlist">
				{#each detailGroups.t.subjects as s (s.name)}
					<li>
						{esc(s.name)}
						<span class="hours"
							>{model.hoursLabel(s.sessions)} ({(s.share * 100).toFixed(1)}%)</span
						>
					</li>
				{/each}
			</ul>
			<h3>Classes (ranked by hours)</h3>
			<ul class="ctree">
				{#each detailGroups.t.classStats.children as b (b.key)}
					{@render treeHTML(b)}
				{/each}
			</ul>
		{:else}
			<!-- heading first, face below it: the empty-state flex `gap` separates
			     the two, so the heading reads on top of the emoticon -->
			<div
				class="empty-state"
				aria-hidden="true"
				onclick={onEmptyClick}
				onanimationend={onEmptyAnimEnd}
			>
				<div class="no-teacher-selected">No Teacher Selected</div>
				<div class="empty-face">{emptyFace}</div>
			</div>
		{/if}
	</div>
</div>

{#snippet treeHTML(nd)}
	<li>
		{@html headingHTML(nd.key)}
		<span class="hours">{model.hoursLabel(nd.sessions)} ({(nd.shareOfParent * 100).toFixed(1)}%)</span>
		{#if nd.children.length}
			<ul>
				{#each nd.children as k (k.key)}
					{@render treeHTML(k)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}
