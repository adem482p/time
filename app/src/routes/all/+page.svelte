<script>
	// app/src/routes/all/+page.svelte — the matrix page: teachers crossed with
	// the six time slots, filtered by day and by a live teacher query. Online-
	// only by design (issue 073: reachable only by its URL), and it runs no
	// clock (the matrix is static per load — issue 051).
	import { base } from '$lib/base.js';
	import { onMount } from 'svelte';
	import { loadStore } from '$lib/load.js';
	import * as model from '$lib/model.js';
	import { esc } from '$lib/data.js';
import { teacherName } from '$lib/display.js';

	const DAYS = model.JS_DAY.slice(1); // Monday-first listing for the filter

	let store = $state(null);
	let dayFilter = $state('');
	let search = $state('');
	let modelObjs = $state(null);
	let loadError = $state('');

	onMount(() => {
		loadStore(base)
			.then((s) => {
				store = s;
				// the matrix only needs the corpus grouping for parity — the
				// boot orders match the legacy app.js (buildAll before render)
				modelObjs = model.buildAll(s);
			})
			.catch((err) => {
				loadError = String(err);
			});
	});

	// The visible rows: every teacher whose name contains the filter text.
	const visibleTeachers = $derived.by(() => {
		if (!store) return [];
		const q = search.trim().toLowerCase();
		return store.teachers.filter((n) => !q || n.toLowerCase().includes(q));
	});

	/** Sessions of one teacher in one slot under the day filter, sorted.
	 * @param {string} n — teacher name
	 * @param {string} slot — slot string */
	function sessionsInSlot(n, slot) {
		const ss = store.sessionsOf(n).filter((s) => s.time === slot && (!dayFilter || s.day === dayFilter));
		return ss.sort(model.cmpSession);
	}

	function statusText() {
		if (loadError) return 'Failed to load time.csv: ' + loadError;
		if (store)
			return (
				store.teachers.length + ' teachers × ' + store.slots.length + ' time slots.'
			);
		return 'Loading time.csv…';
	}
</script>

<svelte:head>
	<title>Timetable matrix — Time</title>
	<link rel="icon" href={`${base}/assets/icon-192.png`} sizes="192x192" type="image/png" />
	<link rel="apple-touch-icon" href={`${base}/assets/apple-touch-icon.png`} />
</svelte:head>

<button type="button" id="themeCycle" title="Cycle color preset" aria-label="Cycle color preset"></button>
<h1>Teachers × Time slots</h1>
<p id="status">{statusText()}</p>
<div id="controls">
	<label>Day:
		<select id="dayFilter" bind:value={dayFilter}>
			<option value="">All days</option>
			{#each DAYS as d (d)}
				<option value={d}>{model.frDay(d)}</option>
			{/each}
		</select>
	</label>
	<label>Teacher: <input id="search" type="search" placeholder="Filter…" autocomplete="off" bind:value={search} /></label>
</div>
{#if store}
	<div id="matrixWrap">
		<table id="matrix">
			<!-- the legacy bare <tr> rows: the HTML parse always repaired them
			     into an implicit <tbody>, so the tbody wrapper here is exact
			     parity (Svelte's tree checks just make the repair explicit) -->
			<tbody>
				<tr>
					<th>Teacher</th>
					{#each store.slots as s (s)}
						<th>{s}</th>
					{/each}
				</tr>
				{#each visibleTeachers as n (n)}
					<tr>
						<td>{@html teacherName(n)}</td>
						{#each store.slots as slot (slot)}
							<td>
								{#each sessionsInSlot(n, slot) as s (s.field + '|' + s.subject + '|' + s.room)}
									<div class="cell">
										<span class="room">{s.room || '—'}</span><br />
										<span class="day">{model.frDay(s.day)}</span>
										{s.subject}
									</div>
								{/each}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
