<script>
	// app/src/routes/classes/+page.svelte — student-facing class timetable
	// (issue 032). Wiring ported line-by-line from js/classes.js: the class is
	// chosen through a live search over the leaf classes only (match.
	// classSearch filtered to groups.leaves; issue 075: no autocomplete —
	// typing filters the list, it never opens suggestions); selecting one
	// draws its week as a grid — days as columns, the six slots as rows —
	// with a semi-transparent red cursor at the current time and the
	// current/next slot cells highlighted. Broader classes (interior nodes)
	// are not selectable: they never appear in the catalogue and exact
	// references to them take the no-match path. On narrow screens the grid
	// is replaced by a teacher-style session card list (table.c-sessions).
	//
	// The legacy imperative render calls map to reactive derivations (the
	// live list and the open week derive from store + query + now); what
	// stays imperative is exactly what was fact-write in the legacy code:
	// the selection funnels, the stored-class write and the keyboard edges.
	// Class names are shortened only for display; every display-bound string
	// goes through the same escapers (headingHTML / highlightHTML return
	// pre-escaped markup, never raw model strings). The markup keeps the
	// legacy ids (#layout, #classList, #searchWrap, …) so the stylesheet
	// stays the single source of the visual vocabulary. Issue 072: this page
	// registers its own worker (classes/sw.js).
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { loadStore } from '$lib/load.js';
	import * as model from '$lib/model.js';
	import * as searchClasses from '$lib/search-classes.js';
	import * as color from '$lib/color.js';
	import { shortcutOf } from '$lib/libgroups.js';
	import { esc } from '$lib/data.js';
	import { headingHTML, highlightHTML } from '$lib/display.js';
	import { clock } from '$lib/clock.js';
	import * as kaomoji from '$lib/kaomoji.js';
	import { registerApp } from '$lib/register.js';
	import WeekGrid from '$lib/components/WeekGrid.svelte';
	import DayGroupCards from '$lib/components/DayGroupCards.svelte';

	let store = $state(null);
	let modelObjs = $state(null);
	let index = $state(null);
	let loadError = $state('');

	// the filter (source of truth for the list; never rewritten by selection)
	let query = $state('');
	// mobile nav machine facts (issue 058): three named states —
	//   menuOpen                    -> 'list'  (filterable list + back arrow)
	//   !menuOpen && selectedClass  -> 'class' (week view + name overlay)
	//   !menuOpen && !selectedClass -> 'empty' (kaomoji; the default)
	// Blur writes neither fact (a press in flight must never lose its row);
	// only openMenu/closeMenu (menu edges), selectClass and showEmpty write.
	let menuOpen = $state(false);
	let selectedClass = $state(null);
	// the no-match page the committed query produced ("No match for …";
	// cleared by any selection/deselect — the filter itself never clears it)
	let noMatch = $state('');

	let now = $state(new Date());

	onMount(() => {
		let unsub = null;
		loadStore(base)
			.then((s) => {
				store = s;
				modelObjs = model.buildAll(s);
				index = searchClasses.buildClassIndex(modelObjs.groups);
				// last selected class (issue 065): read BEFORE the empty state
				// stands (showEmpty clears storage — reached only through the
				// deselect funnels, which boot state never triggers), then
				// restored: a stored ref that still resolves against the live
				// catalogue re-enters the one selection funnel, so the page
				// boots into the exact state a fresh row click produces.
				// Anything stale/unknown falls through to the empty state.
				const stored = readStoredClass();
				if (stored && restorable(modelObjs.groups, stored)) selectClass(stored);
				// the page subscribes once at mount; the clock owns the cadence
				// (issue 051)
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

	// ---- last selected class (issue 065) ------------------------------------
	// The page mirrors its selection fact under 'emplois-class' — localStorage,
	// not sessionStorage: "remember the last class" spans browser sessions,
	// like the theme does. The value is the raw ref selectClass received.
	// One write site per funnel and nowhere else, so fact and storage can
	// never diverge; every access is wrapped like theme.js's readState/
	// writeState — private mode, quota exceptions, or a context without
	// localStorage degrade to today's no-memory behavior and never break boot.
	const CLASS_STORE_KEY = 'emplois-class';

	function readStoredClass() {
		try {
			if (typeof localStorage === 'undefined' || !localStorage) return null;
			const v = localStorage.getItem(CLASS_STORE_KEY);
			return typeof v === 'string' && v ? v : null;
		} catch (e) {
			return null;
		}
	}

	// one writer: a ref persists it, a falsy ref clears it (the deselect
	// funnel and the stale-key clear at boot both land here)
	function writeStoredClass(ref) {
		try {
			if (typeof localStorage === 'undefined' || !localStorage) return;
			if (ref) localStorage.setItem(CLASS_STORE_KEY, ref);
			else localStorage.removeItem(CLASS_STORE_KEY);
		} catch (e) {
			/* storage unavailable (private mode) */
		}
	}

	// Boot validation gate: the CSV is the single source of truth, so a stored
	// ref must still resolve to exactly one live leaf or it is stale (class
	// removed/renamed since it was selected) and the empty funnel stands. The
	// check runs inside try/catch because groups.byKey is a plain object
	// (libgroups.js): prototype keys ('constructor'…) throw instead of
	// missing, and a tampered stored value must never break boot.
	function restorable(groups, ref) {
		if (!ref || typeof ref !== 'string') return false;
		try {
			return model.classWeek(groups, ref).leaves.length === 1;
		} catch (e) {
			return false;
		}
	}

	// The narrow-screen overlay (#overlayName) heads the selected class, but
	// the selection itself is a compact key (`GLSI3D2`), not a field name —
	// shortcutOf only understands field shapes, so the key has to be resolved
	// back to the canonical class name first (model.classWeek → the week's
	// fullName, same source the detail <h2> heads). An unresolvable ref
	// (removed data, tampered storage) falls back to the raw ref, which
	// headingHTML then escapes verbatim — never a blank heading.
	function overlayHeading(groups, ref) {
		try {
			const week = model.classWeek(groups, ref);
			if (week && week.name) return week.name;
		} catch (e) {
			/* fall through to the raw ref */
		}
		return ref;
	}

	// ---- leaf-only catalogue -------------------------------------------------

	// Leaf-only selection: the catalogue and the commit gate only ever offer
	// the leaf classes (one timetable each). Interior nodes (broader classes)
	// are excluded everywhere below.
	const groups = $derived(modelObjs ? modelObjs.groups : null);
	const leafSet = $derived.by(() => {
		const set = {};
		if (groups) groups.leaves.forEach((n) => (set[n.key] = true));
		return set;
	});

	/** keep only rows whose node is a leaf (or whose label is a leaf key). */
	function leafRows(rows) {
		return rows.filter((r) => {
			const k = (r.node && r.node.key) || r.label;
			return !!leafSet[k];
		});
	}

	// the live filter's leaf rows (the successor of the legacy renderList calls;
	// the empty catalogue case renders as the list's "No classes match." row)
	const rows = $derived(index ? leafRows(searchClasses.searchClasses(index, query)) : []);

	// ---- the one selection / deselect / erase funnels ------------------------

	// the single selection funnel: every path that picks a class lands here;
	// blurs because the overlay owns the box in state=class
	function selectClass(ref) {
		selectedClass = ref;
		writeStoredClass(ref); // persist the committed selection (issue 065)
		noMatch = '';
		searchEl.blur();
		menuOpen = false;
	}

	// every deselect funnels through here; the filter text is preserved.
	// Explicit deselect forgets the class (issue 065).
	function showEmpty() {
		selectedClass = null;
		writeStoredClass(null);
		noMatch = '';
	}

	// the clear X lands here (issue 060), never in onInput()/commit(): it
	// never deselects and never arms the menu. Keyboard emptying still
	// deselects through onSearchInput (pinned 058) — a deliberate divergence:
	// the keyboard runs the live-search derivation (empty filter derives no
	// selection), the X is an explicit erase-only command whose landing state
	// (selected + empty) presents the deselect arrow.
	function eraseFilter() {
		query = '';
	}

	// menu edges: the list is open or not — blur writes neither fact
	function openMenu() {
		menuOpen = true;
	}
	function closeMenu() {
		menuOpen = false;
		searchEl.blur();
	}

	// ---- the giant faint emoticon (empty detail) -----------------------------

	// One is drawn per page load; only short faces are used — they must
	// comfortably fit the detail column — with a lone face as a no-library
	// fallback. Pressing the empty area makes the face hop (decorative,
	// mouse/tap-only easter egg).
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

	// ---- selection resolution (the successor of showClass) -------------------

	// A selected ref resolves through model.classWeek: exactly one live leaf
	// gives the week to draw; anything else was a broader-class reference (or
	// stale/tampered storage) and takes the "No class matches" path — the
	// markActive(false) of the legacy gate drops the row highlight too.
	const sel = $derived.by(() => {
		if (!groups || selectedClass === null) return null;
		let week = null;
		try {
			week = model.classWeek(groups, selectedClass);
		} catch (e) {
			week = null;
		}
		if (week && week.leaves.length === 1) return { ref: selectedClass, week: week };
		return { ref: selectedClass, week: null };
	});

	// the list's active mark: any spelling the user typed may reach selectClass
	// (classSearch is case-insensitive); node keys are uppercase. Set only when
	// the selection resolved (the legacy markActive(ref) runs after the gate).
	/** the casing-insensitive active key for the list, or '' for none. */
	const activeKey = $derived(sel && sel.week ? String(sel.ref) : '');

	// ---- the open week render (the successor of renderWeek) -------------------

	// the one fresh clock per render pass (issue 051): the cursor
	const cursor = $derived(store ? model.dayCursor(now, store.slots) : null);

	// days with no live stake (no now/next session) render dimmed
	const liveDays = $derived.by(() => {
		const map = {};
		if (!sel || !sel.week) return map;
		const c = cursor;
		sel.week.sessions.forEach((s) => {
			if (
				model.isCurrentSession(s.day, s.time, now) ||
				(c && c.visible && s.day === c.today && s.time === c.next)
			)
				map[s.day] = true;
		});
		return map;
	});

	// ---- search funnels -------------------------------------------------------

	// An exact class label selects even among partial matches (mirror of
	// the teachers exactTeacher): the committed text may still match others —
	// the exact leaf wins.
	function exactClass(foundRows, q) {
		const want = model.normStr(q.trim());
		for (let i = 0; i < foundRows.length; i++) {
			if (model.normStr(foundRows[i].label) === want) return foundRows[i].label;
		}
		return null;
	}

	// the input listener: the filter drives list/count/count-away through
	// `query` derivations; these are the legacy side effects that are still
	// fact-writes: back to the empty state on an empty filter (keyboard
	// emptying STILL deselects — pinned 058), and the exactly-one-result
	// auto-jump to the week view.
	function onSearchInput(e) {
		query = e.currentTarget.value;
		const found = rows;
		// an empty filter means nothing is selected: back to the empty state
		if (!query.trim()) showEmpty();
		// exactly one result left -> auto-jump to the week view
		else if (found.length === 1) selectClass(found[0].label);
	}

	function commit() {
		const found = rows;
		const like = exactClass(found, query);
		const q = query;
		if (!q.trim()) {
			showEmpty();
			return;
		}
		if (model.classWeek(modelObjs.groups, q).leaves.length === 1) {
			selectClass(q);
		} else if (like) {
			selectClass(like);
		} else if (found.length === 1) {
			selectClass(found[0].label);
		} else if (!found.length) {
			// the no-match page: the empty filter in onSearchInput never writes this
			noMatch = q;
		}
		// no trailing syncList: a selection closes the menu and the is-list
		// class cannot resurrect a closed one
	}

	// Only Escape and Enter are handled. Tab and the arrow keys were pure
	// suggestion-row navigation (issue 075 removed the autocomplete), so they
	// fall back to their native input behavior.
	function onKeydown(e) {
		if (e.key === 'Escape') {
			// <input type="search"> clears the field on Esc by default; cancel
			// that so Esc keeps the typed filter: it closes the menu — it never
			// deselects. (Issue 075: no suggest overlay to drop any more.)
			e.preventDefault();
			closeMenu();
		} else if (e.key === 'Enter') {
			// Enter commits the typed query (issue 007's rule, kept after the
			// autocomplete left in issue 075): nothing pre-selects on this page.
			e.preventDefault();
			commit();
		}
	}

	// tapping the filter box always brings the menu back: focus alone does
	// not refire while the box never lost focus (row taps keep it focused),
	// but click fires on every tap. No blur handler (issue 075): its only job
	// was dropping the suggest overlay — losing focus writes nothing.
	function onSearchFocus() {
		openMenu();
	}
	function onSearchClick() {
		openMenu();
	}

	let searchEl = $state(null);

	// ---- display helpers (the legacy classes.js head + week walks) -----------

	// The display heading for a name is display.headingHTML (the issue-075
	// shortcut). List rows highlight the matched ranges, which live on the
	// raw label — the ranges are re-mapped onto the shortcut's head/sub runs
	// here (divided at head.length), exactly like the legacy overlay helper.
	/**
	 * the highlighted heading markup for a label and match ranges.
	 * @param {string} name — a raw class label
	 * @param {Array<Array<number>>} ranges — highlight ranges on `name`
	 * @returns {string} safe HTML
	 */
	function highlightedHeadingHTML(name, ranges) {
		const sc = shortcutOf(name);
		if (!sc || !ranges || !ranges.length) return headingHTML(name);
		const headRanges = [];
		const subRanges = [];
		ranges.forEach((r) => {
			const headEnd = Math.min(r[1], sc.head.length);
			if (r[0] < headEnd) headRanges.push([r[0], headEnd]);
			if (sc.sub && r[1] > sc.head.length) {
				subRanges.push([
					Math.max(0, r[0] - sc.head.length),
					Math.min(sc.sub.length, r[1] - sc.head.length)
				]);
			}
		});
		return (
			highlightHTML(sc.head, headRanges) +
			(sc.sub ? '<sub>' + highlightHTML(sc.sub, subRanges) + '</sub>' : '')
		);
	}

	// ---- hierarchy fact cards (issue 078) ------------------------------------
	// Under the shortcut heading the detail lists the class's hierarchy levels
	// (CONTEXT.md's grouping table). Values are read from the resolved leaf
	// node the week already carries — never re-parsed from the display string.
	// A level a class does not have is omitted, not rendered empty; section
	// and cohort are presented together as one Groupe value with a real
	// subscript. Like the heading, every value is escaped before the markup
	// is appended.
	/**
	 * the class-facts `<dl>` markup for one leaf node.
	 * @param {null|Object} node — a libgroups ClassNode (or null: nothing)
	 * @returns {string} safe HTML
	 */
	function classFactsHTML(node) {
		if (!node) return '';
		function valueHTML(value) {
			return value ? esc(value) : null;
		}
		const facts = [
			['Track', valueHTML(node.track)],
			['Year', valueHTML(node.year)],
			[
				'Specialty',
				node.commonBranch
					? valueHTML(String(node.track) + String(node.year))
					: valueHTML(node.specialization)
			],
			[
				'Groupe',
				node.section
					? esc(node.section) + (node.cohort ? '<sub>' + esc(node.cohort) + '</sub>' : '')
					: valueHTML(node.cohort)
			]
		];
		let h = '<dl class="class-facts">';
		facts.forEach((f) => {
			if (!f[1]) return;
			h +=
				'<div class="fact-card"><dt class="fact-name">' +
				esc(f[0]) +
				'</dt><dd class="fact-value">' +
				f[1] +
				'</dd></div>';
		});
		return h + '</dl>';
	}

	// ---- list row body (the legacy renderList innerHTML walk) -----------------

	function rowHTML(r) {
		// Use display form (shortcut head + sub) directly with ranges computed on it
		const sc = r.sc || { head: r.label, sub: '' };
		let h = highlightHTML(sc.head, r.ranges);
		if (sc.sub) h += '<sub>' + highlightHTML(sc.sub, r.ranges) + '</sub>';
		if (query.trim() && r.attributeMatches)
			r.attributeMatches.forEach((a) => {
				h +=
					'<span class="class-attribute' +
					(a.name === 'Track' ? ' class-track' : '') +
					'"><b>' +
					esc(a.name) +
					':</b> ' +
					highlightHTML(a.value, a.ranges) +
					'</span>';
			});
		return h;
	}

	/** list row class: catalogue rows carry only the active selection. */
	function rowClasses(r) {
		return color
			.classItem({
				active: !!activeKey && String(r.label).toUpperCase() === activeKey.toUpperCase()
			})
			.join(' ');
	}
</script>

<svelte:head>
	<title>Classes — Emplois</title>
	<meta
		name="description"
		content="Emplois — the ISIM Mahdia timetable, searchable by class or subject."
	/>
	<meta name="theme-color" content="#0b4da2" />
	<link rel="manifest" href="manifest.json" />
	<link rel="icon" href={`${base}/assets/icon-192.png`} sizes="192x192" type="image/png" />
	<link rel="apple-touch-icon" href={`${base}/assets/apple-touch-icon.png`} />
</svelte:head>

<div id="layout" class={menuOpen ? 'is-list' : ''}>
	<div id="listPane">
		<button type="button" id="themeCycle" title="Cycle color preset" aria-label="Cycle color preset"
		></button>
		<h1>Find Classes</h1>
		<p class="author-credit">
			<span>By </span><a href="https://github.com/adem482p" target="_blank" rel="noopener"
				>Adem Moussa</a
			>
		</p>
		<div id="searchWrap">
			<input
				id="search"
				type="search"
				placeholder="Search class (LCS, GLSI3D1…)"
				autocomplete="off"
				value={query}
				bind:this={searchEl}
				oninput={onSearchInput}
				onkeydown={onKeydown}
				onfocus={onSearchFocus}
				onclick={onSearchClick}
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
				aria-label="Back to the class list"
				hidden={!(selectedClass !== null && query === '')}
				onmousedown={(e) => e.preventDefault()}
				onclick={() => showEmpty()}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12h-14M12 6l-7 6 7 6" /></svg>
			</button>
			<!-- The name overlay belongs to the 'class' state: hidden unless a
			     class is selected AND the menu is closed (issue 058). It carries
			     the same heading the detail pane does — the issue-075 shortcut,
			     rendered as markup (headingHTML escapes both parts) instead of
			     raw text. The stored selection is a compact key, so overlayHeading
			     resolves it back to the canonical class name first. -->
			<div
				id="searchOverlay"
				hidden={selectedClass === null || menuOpen}
			>
				<button
					type="button"
					id="overlayToggle"
					aria-label="Open class menu"
					onclick={() => {
						openMenu();
						searchEl.focus();
					}}
				></button>
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
				{#if selectedClass !== null}
					<span id="overlayName">
						{@html headingHTML(overlayHeading(modelObjs.groups, selectedClass))}
					</span>
				{/if}
				<svg class="overlay-drop" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
			</div>
		</div>
		<p id="status" class={!!(query || selectedClass !== null) ? 'count-away' : ''}>
			{#if loadError}Failed to load emplois.csv: {loadError}{:else if store}{store.size} sessions · {groups
				.leaves
				.length} classes{:else}Loading emplois.csv…{/if}
		</p>
		<ul id="classList">
			{#if index && !rows.length}
				<li class="empty">No classes match.</li>
			{/if}
			{#each rows as r (r.label)}
				<li
					data-key={r.label}
					class={rowClasses(r)}
				>
					<button type="button" class="rowhit" onclick={() => selectClass(r.label)}>
						<!-- The filter is the source of truth for the list: selecting a row
						     must not rewrite it, so the result list stays as-is and the
						     user can move to the next hit. -->
						{@html rowHTML(r)}
					</button>
				</li>
			{/each}
		</ul>
	</div>
	<div id="detail">
		{#if noMatch}
			<p class="nomatch">No match for "{noMatch}".</p>
		{:else if sel && sel.week}
			<!-- the detail heading: the issue-075 shortcut for a full field name
			     (`LCS3-GLSI_D Groupe 2` -> `GLSI3 D<sub>2</sub>`), anything else
			     (an interior node name) falls back inside headingHTML -->
			<h2>{@html headingHTML(sel.week.name)}</h2>
			{@html classFactsHTML(sel.week.leaves[0])}
			<!-- Day-group session cards (mobile) and week grid (desktop) are
			     now separate components that share the same derived state.
			     The CSS controls which one is visible per viewport. -->
			<DayGroupCards
				week={sel.week}
				cursor={cursor}
				now={now}
				liveDays={liveDays}
			/>
			<WeekGrid
				store={store}
				week={sel.week}
				cursor={cursor}
				now={now}
			/>
		{:else if sel && !sel.week}
			<!-- the legacy showClass gate: a non-leaf (or stale) reference -->
			<p class="nomatch">No class matches "{sel.ref}".</p>
		{:else}
			<!-- heading first, face below it: the empty-state flex `gap` separates
			     the two, so the heading reads on top of the emoticon -->
			<div class="empty-state" aria-hidden="true" onclick={onEmptyClick} onanimationend={onEmptyAnimEnd}>
				<div class="no-class-selected">No Class Selected</div>
				<div class="empty-face">{emptyFace}</div>
			</div>
		{/if}
	</div>
</div>
