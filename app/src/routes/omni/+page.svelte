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
	import * as color from '$lib/color.js';
	import { esc } from '$lib/data.js';
	import { headingHTML, teacherName, highlightHTML } from '$lib/display.js';
	import { clock } from '$lib/clock.js';
	import * as kaomoji from '$lib/kaomoji.js';
	import { registerApp } from '$lib/register.js';
	let omniStore = $state(null);
	let loadError = $state('');

	// Filter query
	let query = $state('');

	// Browse mode tab: 'teachers' | 'classes' (no "all")
	let browseTab = $state('teachers');

	// Search mode type filters
	let filterTeachers = $state(true);
	let filterClasses = $state(true);

	// Mobile navigation state: menuOpen controls .is-list on #layout
	let menuOpen = $state(false);

	// Selection state
	let selectedTeacher = $state(null);
	let selectedClass = $state(null);
	let noMatch = $state('');

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
				} else if (rc) {
					try {
						if (getClassDetail(omniStore, rc, new Date())) selectedClass = rc;
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
		omniStore ? searchOmniTeachers(omniStore.teachers, query) : []
	);

	const filteredClasses = $derived(
		omniStore ? searchOmniClasses(omniStore.classes, query) : []
	);

	const searchMode = $derived(query.trim().length > 0);

	// Which lists are visible
	const showTeachers = $derived(searchMode ? filterTeachers : browseTab === 'teachers');
	const showClasses = $derived(searchMode ? filterClasses : browseTab === 'classes');

	// Unified, score-sorted results in search mode
	const searchResults = $derived.by(() => {
		if (!searchMode) return [];
		const items = [];
		if (filterTeachers) {
			filteredTeachers.forEach((t) => items.push({ kind: 'teacher', score: t.score, data: t }));
		}
		if (filterClasses) {
			filteredClasses.forEach((c) => items.push({ kind: 'class', score: c.score, data: c }));
		}
		return items.sort((a, b) => b.score - a.score || String(a.data.name || a.data.identifier).localeCompare(String(b.data.name || b.data.identifier)));
	});

	// Total results count in list
	const listTotal = $derived(
		searchMode ? searchResults.length : (showTeachers ? filteredTeachers.length : 0) + (showClasses ? filteredClasses.length : 0)
	);

	// Transition browse <-> search
	let prevQuery = $state('');
	$effect(() => {
		const q = query.trim();
		if (q && !prevQuery.trim()) {
			// entering search: seed filters from browse tab
			if (browseTab === 'teachers') {
				filterTeachers = true;
				filterClasses = false;
			} else {
				filterTeachers = false;
				filterClasses = true;
			}
		} else if (!q && prevQuery.trim()) {
			// leaving search: restore browse tab from filters
			if (filterTeachers && !filterClasses) browseTab = 'teachers';
			else if (filterClasses && !filterTeachers) browseTab = 'classes';
			else browseTab = 'teachers';
		}
		// ensure at least one filter active
		if (searchMode && !filterTeachers && !filterClasses) {
			filterTeachers = true;
			filterClasses = true;
		}
		prevQuery = query;
	});

	// Selection funnels
	function selectTeacher(name) {
		selectedTeacher = name;
		selectedClass = null;
		noMatch = '';
		writeStoredTeacher(name);
		writeStoredClass(null);
		menuOpen = false;
		if (searchEl) searchEl.blur();
	}

	function selectClass(identifier) {
		selectedClass = identifier;
		selectedTeacher = null;
		noMatch = '';
		writeStoredClass(identifier);
		writeStoredTeacher(null);
		menuOpen = false;
		if (searchEl) searchEl.blur();
	}

	function showEmpty() {
		selectedTeacher = null;
		selectedClass = null;
		noMatch = '';
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

	let searchEl = $state(null);

	function onKeydown(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			closeMenu();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const q = query.trim().toLowerCase();
			if (!q) return;

			// Exact teacher hit wins
			const exactT = filteredTeachers.find((t) => t.name.toLowerCase() === q);
			if (exactT) {
				selectTeacher(exactT.name);
				return;
			}
			// Exact class hit wins
			const exactC = filteredClasses.find(
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
			if (filteredTeachers.length === 1 && filteredClasses.length === 0) {
				selectTeacher(filteredTeachers[0].name);
				return;
			}
			if (filteredClasses.length === 1 && filteredTeachers.length === 0) {
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
				value={query}
				bind:this={searchEl}
				oninput={(e) => {
					query = e.currentTarget.value;
					if (!query.trim()) showEmpty();
				}}
				onkeydown={onKeydown}
				onfocus={openMenu}
				onclick={openMenu}
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

		<!-- Browse mode tabs -->
		{#if !searchMode}
			<div class="omni-tabs" role="tablist">
				<button
					type="button"
					class="omni-tab-btn"
					class:active={browseTab === 'teachers'}
					onclick={() => (browseTab = 'teachers')}
				>
					Teachers
				</button>
				<button
					type="button"
					class="omni-tab-btn"
					class:active={browseTab === 'classes'}
					onclick={() => (browseTab = 'classes')}
				>
					Classes
				</button>
			</div>
		{:else}
			<!-- Search mode: type filters -->
			{#if (filteredTeachers.length > 0 ? 1 : 0) + (filteredClasses.length > 0 ? 1 : 0) > 1}
			<div class="omni-filters" role="group" aria-label="Result types">
				{#if filteredTeachers.length > 0}
					<button
						type="button"
						class="omni-chip"
						class:active={filterTeachers}
						aria-pressed={filterTeachers}
						onclick={() => {
							if (filterTeachers && !filterClasses) return;
							filterTeachers = !filterTeachers;
						}}
					>
						<span class="omni-chip-check" aria-hidden="true">{filterTeachers ? '✓' : ''}</span>
						Teachers
					</button>
				{/if}
				{#if filteredClasses.length > 0}
					<button
						type="button"
						class="omni-chip"
						class:active={filterClasses}
						aria-pressed={filterClasses}
						onclick={() => {
							if (filterClasses && !filterTeachers) return;
							filterClasses = !filterClasses;
						}}
					>
						<span class="omni-chip-check" aria-hidden="true">{filterClasses ? '✓' : ''}</span>
						Classes
					</button>
				{/if}
			</div>
			{/if}
		{/if}

		<p id="status" class={query || selectedTeacher || selectedClass ? 'count-away' : ''}>
			{#if loadError}
				Failed to load data: {loadError}
			{:else if omniStore}
				{omniStore.size} sessions · {omniStore.teachers.length} teachers · {omniStore.classes
					.length} classes
			{:else}
				Loading timetable data…
			{/if}
		</p>

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
									{#each t.subjectMatches.slice(0, 3) as sm}
										<span class="fmatch">
											<b>Subject:</b> {@html highlightHTML(sm.label, sm.ranges)}
										</span>
									{/each}
									{#each t.classMatches.slice(0, 3) as cm}
										<span class="cmatch">
											<b>Class:</b> {@html headingHTML(cm.label)}
										</span>
									{/each}
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
								{#each t.subjectMatches.slice(0, 3) as sm}
									<span class="fmatch">
										<b>Subject:</b> {@html highlightHTML(sm.label, sm.ranges)}
									</span>
								{/each}
								{#each t.classMatches.slice(0, 3) as cm}
									<span class="cmatch">
										<b>Class:</b> {@html headingHTML(cm.label)}
									</span>
								{/each}
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
				<section class="day-group{currentTeacherDetail.liveDays[day] ? '' : ' dim'}">
					<table class="t-sessions">
						<tbody>
							<tr><th></th><th>Time</th><th>Room</th><th>Subject</th><th>Class</th></tr>
							{#each currentTeacherDetail.byDay[day] as entry (entry.i)}
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
							{/each}
						</tbody>
					</table>
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
					<div class="fact-card">
						<dt class="fact-name">{f.name}</dt>
						<dd class="fact-value">{@html f.raw ? f.value : esc(f.value)}</dd>
					</div>
				{/each}
			</dl>

			<!-- Mobile Day-group session cards -->
			{#each currentClassDetail.dayGroups as g (g.day)}
				<h3 class="day-head">{frDay(g.day)}</h3>
				<section class="day-group{currentClassDetail.liveDays[g.day] ? '' : ' dim'}">
					<table class="c-sessions">
						<tbody>
							<tr><th></th><th>Time</th><th>Teacher</th><th>Subject</th><th>Room</th></tr>
							{#each g.sessions as s, i (i)}
								{@const c = currentClassDetail.cursor}
								{@const isNow = isCurrentSession(s.day, s.time, now)}
								{@const isNext = !isNow && !!c && c.visible && s.day === c.today && s.time === c.next}
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
									<td class="c-time">{s.time}</td>
									<td class="c-teacher">{@html teacherName(s.teacher, '—')}</td>
									<td class="c-subject">{s.subject}</td>
									<td class="c-room">{s.room || '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
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
										{#each cell.sessions as s (s.reference + s.subject + s.room)}
											<div class="session" style={s.provenance?.color ? `--fill: ${s.provenance.color}` : ''}>
												<div class="s-subject">{s.subject}</div>
												<span class="s-teacher">{@html teacherName(s.teacher, '—')}</span>
												<div class="s-room">{s.room || '—'}</div>
												{#if s.week_pattern_specifier}
													<span class="week-pill">{s.week_pattern_specifier}</span>
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
				<div class="no-teacher-selected no-class-selected">No Teacher or Class Selected</div>
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
	.omni-tabs {
		display: flex;
		gap: 0.35rem;
		margin: 0.4rem 0 0.5rem;
		padding: 0.2rem;
		background: var(--md-surface-variant, #f0f3f8);
		border-radius: 8px;
		flex-shrink: 0;
	}

	.omni-tab-btn {
		flex: 1;
		font-family: inherit;
		font-size: 0.82rem;
		padding: 0.35rem 0.5rem;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--md-on-surface-variant, #555);
		cursor: pointer;
		font-weight: 500;
		text-align: center;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.omni-tab-btn:hover {
		color: var(--md-on-surface, #222);
	}

	.omni-tab-btn.active {
		background: var(--md-surface, #ffffff);
		color: var(--md-primary, #0b4da2);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
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
</style>
