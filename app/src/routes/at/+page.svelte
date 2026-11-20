<script>
	// app/src/routes/at/+page.svelte — the time page: the week grouped by day,
	// each day a bucket header followed by the six slot entries. Today's
	// section is marked and also scrolled into view at boot; the current and
	// next slots carry the now/next marks (today-only, no week wrap). Selecting
	// a slot lists who teaches then, where, and for which classes (issue 002
	// pill reduction). One page clock re-renders the slot list wholesale on
	// every tick (issue 051); the detail pane is slot-derived and never
	// clock-driven. Online-only by design (issue 073).
	import { base } from '$lib/base.js';
	import { onMount } from 'svelte';
	import { loadStore } from '$lib/load.js';
	import * as model from '$lib/model.js';
	import * as color from '$lib/color.js';
	import { esc } from '$lib/data.js';
import { teacherName } from '$lib/display.js';
	import { headingHTML } from '$lib/display.js';
	import { clock } from '$lib/clock.js';

	let store = $state(null);
	let groups = $state(null);
	let loadError = $state('');

	// the selected day|slot, restored on rebuilds (issue 051)
	let activeSlot = $state(null);
	// the page's clock tick: one fresh Date for the whole list render
	let now = $state(new Date());

	onMount(() => {
		let unsub = null;
		loadStore(base)
			.then((s) => {
				store = s;
				groups = model.buildAll(s).groups;
				// the page subscribes once at mount; the clock owns the cadence
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

	const todayName = $derived(model.JS_DAY[now.getDay()]);
	const isSunday = $derived(model.DAY_IDX[todayName] === undefined);
	// today-only "next": earliest slot start strictly after now; null on
	// Sunday or when nothing remains today (no week-wrap).
	const nextSlot = $derived.by(() => {
		if (isSunday || !store) return null;
		const curMins = now.getHours() * 60 + now.getMinutes();
		for (const slot of store.slots) {
			if (model.slotMinutes(slot)[0] > curMins) return slot;
		}
		return null;
	});
	// "Day over" line: between the last slot's end and midnight, with no live slot.
	const dayOver = $derived(
		!!store &&
			!isSunday &&
			nextSlot === null &&
			!store.slots.some((s) => model.isCurrentSession(todayName, s, now))
	);

	/** Row count for a day's bucket header.
	 * @param {string} day — a day name in DAYS */
	function countOf(day) {
		return store.rows.filter((r) => r.day === day).length;
	}

	/** Slot entry classes.
	 * @param {string} day — the entry's day
	 * @param {string} slot — the entry's slot */
	function entryClasses(day, slot) {
		const dim = !isSunday && day !== todayName;
		const m = marksFor(day, slot);
		const c = color.slotEntry({ isNow: m.isNow, isNext: m.isNext, dim });
		if (activeSlot === day + '|' + slot) c.push(color.CLASSES.active);
		return c;
	}

	/** Marks for one slot entry: isNow / isNext (today-only semantics). */
	function marksFor(day, slot) {
		return {
			isNow: model.isCurrentSession(day, slot, now),
			isNext: !isSunday && day === todayName && slot === nextSlot
		};
	}

	// auto-scroll the pane so today's bucket header lands at the pane top
	let slotListEl = $state(null);
	$effect(() => {
		if (!store || !slotListEl) return;
		const todayBucket = slotListEl.querySelector('li.today');
		if (todayBucket) slotListEl.scrollTop = todayBucket.offsetTop - slotListEl.offsetTop;
	});

	// ---- slot detail ---------------------------------------------------------

	/** The fused session rows shown in the detail table for one day+slot. */
	const detailRows = $derived.by(() => {
		if (!groups || !store || !activeSlot) return null;
		const [day, slot] = activeSlot.split('|');
		const rows = store.byDaySlot(day, slot);
		if (!rows.length) return [];
		return model.fuseSessions(rows, groups);
	});

	function show(day, slot) {
		activeSlot = day + '|' + slot;
	}
</script>

<svelte:head>
	<title>Time</title>
	<link rel="icon" href={`${base}/assets/icon-192.png`} sizes="192x192" type="image/png" />
	<link rel="apple-touch-icon" href={`${base}/assets/apple-touch-icon.png`} />
</svelte:head>

<button type="button" id="themeCycle" title="Cycle color preset" aria-label="Cycle color preset"></button>
<h1>Who teaches when</h1>
<p id="status">
	{#if loadError}Failed to load time.csv: {loadError}{:else if store}{store.size} sessions · {store.teachers.length} teachers{:else}Loading time.csv…{/if}
</p>
{#if store}
	<ul id="slotList" bind:this={slotListEl}>
		{#if isSunday}
			<li class="info">No sessions on Sunday — showing the full week.</li>
		{/if}
		{#each store.days as d (d)}
			{@const isToday = !isSunday && d === todayName}
			<li class="bucket {isSunday ? '' : isToday ? color.CLASSES.today : color.CLASSES.dim}">
				{d + (isToday ? ' (today) (' : ' (')}{countOf(d)})
			</li>			{#each store.slots as slot (d + '|' + slot)}
				<li class={entryClasses(d, slot).join(' ')}>
					<button type="button" class="rowhit" onclick={() => show(d, slot)}>
						{slot}
						{#if marksFor(d, slot).isNow}<span class="nowtag">● NOW</span>{/if}
						{#if marksFor(d, slot).isNext}<span class="nexttag"><svg class="nextarrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14M12 6l6 6-6 6" /></svg>NEXT</span>{/if}
					</button>
				</li>
			{/each}
			{#if isToday && dayOver}
				<li class="info">Day over — no more sessions today.</li>
			{/if}
		{/each}
	</ul>
	<div id="detail">
		{#if !activeSlot}
			<p>Select a day and time slot to see who teaches then.</p>
		{:else if detailRows && detailRows.length === 0}
			<p class="empty">No sessions {activeSlot.split('|')[0]} {activeSlot.split('|')[1]}.</p>
		{:else if detailRows}
			<table>
				<!-- tbody wrapper: the legacy bare <tr> rows were always repaired
				     into an implicit <tbody> by the HTML parser -->
				<tbody>
					<tr><th>Teacher</th><th>Room</th><th>Subject</th><th>Students</th></tr>
					{#each detailRows as s, i (i)}
						<tr>
							<td> {@html teacherName(s.professor, '—')}</td>
							<td>{s.room || '—'}</td>
							<td>{s.subject}</td>
							<td>
								{#each s.pills as p (p)}
									<span class="pill">{@html headingHTML(p)}</span>
								{/each}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
{/if}
