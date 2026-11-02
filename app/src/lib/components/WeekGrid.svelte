<script>
	// app/src/lib/WeekGrid.svelte — Desktop week grid component
	// Renders the timetable as a grid with days as columns and slots as rows.
	// Receives all derived state as props from the parent page.
	import * as model from '$lib/model.js';
	import * as color from '$lib/color.js';
	import { esc } from '$lib/data.js';
	import { teacherName } from '$lib/display.js';

	let { store, week, cursor, weekWrapEl, cursorLineEl } = $props();

	function indexByDaySlot(week) {
		const by = {};
		week.sessions.forEach((s) => {
			const k = s.day + '|' + s.time;
			(by[k] = by[k] || []).push(s);
		});
		return by;
	}

	const byDaySlot = $derived(indexByDaySlot(week));

	/** the today class gate for a day header. */
	function isTodayCell(d) {
		const c = cursor;
		return !!c && c.visible && d === c.today;
	}

	/** one grid cell: its sessions lookup plus the now/next/today classes. */
	function weekCell(d, slot) {
		const c = cursor;
		const isNow = !!c && c.visible && d === c.today && slot === c.cur;
		const isNext = !!c && c.visible && d === c.today && slot === c.next;
		const classes = color.weekCell({ isNow: isNow, isNext: isNext });
		if (c && c.visible && d === c.today) classes.push(color.CLASSES.today);
		return { classes: classes, sessions: byDaySlot[d + '|' + slot] || [] };
	}

	// ---- cursor positioning (the successor of applyCursor) --------------------
	// Every tick re-renders from the fresh clock, and the markup derives the
	// now/next/today classes itself; what needs the DOM is red cursor line.
	// Idempotent: repositions (and shows/hides) the line without a full
	// re-render, every time the week or the clock changes.

	$effect(() => {
		const c = cursor;
		const wrap = weekWrapEl;
		const line = cursorLineEl;
		if (!week || !wrap || !line || !store || !c) return;
		if (!c.visible) {
			line.style.display = 'none';
			return;
		}
		line.style.display = '';
		const trs = wrap.querySelectorAll('tbody tr');
		// In the short gaps between slots no slot is current; the line
		// then rests on the boundary — the next row's top edge (frac is
		// null there, hence the || 0).
		const slot = c.cur || c.next;
		const idx = slot ? store.slots.indexOf(slot) : -1;
		if (idx < 0 || idx >= trs.length) return;
		const tr = trs[idx];
		const wrapRect = wrap.getBoundingClientRect();
		const trRect = tr.getBoundingClientRect();
		line.style.top = trRect.top - wrapRect.top + (c.frac || 0) * trRect.height + 'px';
		// Span the full (possibly scrollable) grid: on narrow screens the
		// grid scrolls horizontally inside .weekwrap, and the absolutely
		// positioned line must keep crossing it at every scroll offset.
		line.style.width = wrap.scrollWidth + 'px';
	});
</script>

<!-- the week grid (days as columns), after the day sections
     (issue 048). Desktop labels it WHOLE WEEK below; on narrow
     screens the label and this grid are display:none — the day cards
     are the whole narrow view. -->
<h3 class="day-head week-head">WHOLE WEEK</h3>
<div class="weekwrap" bind:this={weekWrapEl}>
	<table class="week">
		<thead>
			<tr>
				<th class="cgutter"></th><th class="timecol"></th>
				{#each store.days as d (d)}
					<th
						class="c-day{isTodayCell(d) ? ' ' + color.CLASSES.today : ''}"
						data-day={d}
					>
						{model.frDay(d)}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each store.slots as slot (slot)}
				<tr data-slot={slot}>
					<td class="cgutter"></td>
					<td class="c-time">{slot}</td>
					{#each store.days as d (d)}
						{@const cell = weekCell(d, slot)}
						{@const sessions = cell.sessions}
						<td
							class="c-cell{cell.classes.length ? ' ' + cell.classes.join(' ') : ''}"
							data-day={d}
							data-slot={slot}
						>
							{#each sessions as s, i (i)}
								<div class="sess">
									<span class="s-subject">{s.subject}</span>
									<span class="s-teacher"> {@html teacherName(s.professor, '—')}</span>
									<span class="s-room">{s.room || '—'}</span>
								</div>
							{/each}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
	<!-- the semi-transparent red cursor line (positioned by the
	     effect above) -->
	<div class="cursor" aria-hidden="true" bind:this={cursorLineEl}
		style={'display:' + (cursor && cursor.visible ? '' : 'none')}
	>
		<div class="cursor-arrow"></div>
	</div>
</div>