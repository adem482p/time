<script>
	// app/src/lib/DayGroupCards.svelte — Mobile day-group session cards component
	// Renders the timetable as teacher-style session card list grouped by day.
	// Receives all derived state as props from the parent page.
	import * as model from '$lib/model.js';
	import * as color from '$lib/color.js';
	import { esc } from '$lib/data.js';
	import { headingHTML } from '$lib/display.js';
	import { nameHTML } from '$lib/data.js';

	let { week, cursor, now, liveDays } = $props();

	/** the detail's day groups, start-from-today order (issue 050). */
	const dayGroups = $derived.by(() => {
		if (!week) return [];
		let dayOrder = [];
		const byDay = {};
		week.sessions.forEach((s) => {
			if (!byDay[s.day]) {
				byDay[s.day] = [];
				dayOrder.push(s.day);
			}
			byDay[s.day].push(s);
		});
		dayOrder = model.startFromToday(dayOrder, week.sessions, now);
		return dayOrder.map((day) => ({ day: day, sessions: byDay[day] }));
	});

	/** today-only next mark for a session row: the clock's cursor slot on
	 * today, never nextSessionIdx (it wraps into the coming days). */
	function nextMark(s) {
		const c = cursor;
		return !!c && c.visible && s.day === c.today && s.time === c.next;
	}

	/** classes for one day-group session row (now/next driven only). */
	function sessionRowClasses(s) {
		const isNow = model.isCurrentSession(s.day, s.time, now);
		const isNext = !isNow && nextMark(s);
		return color.sessionRow({ isNow: isNow, isNext: isNext, dimIdle: false }).join(' ');
	}
</script>

<!-- Per-day session groups, rendered on every viewport: desktop
     shows the sections above the week grid, narrow screens shape
     them into cards (teacher-style, via the generic mobile table
     rules; the whole-week label and grid below are display:none on
     narrow). One day-group section per non-empty day, cyclic from
     today (issue 050), mirroring showTeacher — the day lives in the
     heading once, so there is no Day column and `dim` moves to the
     section. Row marking mirrors showTeacher with today-only
     semantics: the same `now` and the computed `cursor` keep the
     grid and the lists consistent; never nextSessionIdx (it wraps
     into the coming days). -->
{#each dayGroups as g (g.day)}
	<h3 class="day-head">{model.frDay(g.day)}</h3>
	<section class="day-group{liveDays[g.day] ? '' : ' dim'}">
		<table class="c-sessions">
			<tbody>
				<tr><th></th><th>Time</th><th>Teacher</th><th>Subject</th><th>Room</th></tr>
				{#each g.sessions as s, i (i)}
					<tr class={sessionRowClasses(s)}>
					<td>
						{#if model.isCurrentSession(s.day, s.time, now)}
							<span class="nowtag">● NOW</span>
						{:else if nextMark(s)}
							<span class="nexttag"
								><svg class="nextarrow" viewBox="0 0 24 24" aria-hidden="true"
									><path d="M4 12h14M12 6l6 6-6 6" /></svg
								>NEXT</span
							>
						{/if}
					</td>
					<td class="c-time">{esc(s.time)}</td>
					<td class="c-teacher">{@html nameHTML(s.professor, '—')}</td>
					<td class="c-subject">{esc(s.subject)}</td>
					<td class="c-room">{esc(s.room || '—')}</td>
				</tr>
				{/each}
			</tbody>
		</table>
	</section>
{/each}