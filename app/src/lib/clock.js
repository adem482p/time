// app/src/lib/clock.js — the one 30 s clock per page (issue 051). A single
// interval hands a fresh Date to every subscribed region; the first subscribe
// wires the interval and the tab-return catch-up; unsubscribing tears it down.
// In the old pages a module-level singleton guarded `wired` for the page's
// lifetime; the Svelte components subscribe within $effect, so the clock
// reference-counts its subscribers and stops the timer when the last one
// unsubscribes (route teardown on the apps page, per the same figure).

/**
 * Subscribe a clock callback.
 *
 * @param {(now: Date) => void} fn — called with a fresh Date on every tick
 *   and once immediately on subscription (so a subscriber never misses a
 *   first render's >= 30 s window).
 * @ returns {() => void} an unsubscribe function.
 */
export function clock(fn) {
	let subscribers = 0;
	let intervalId = null;

	function tick() {
		fn(new Date());
	}

	function subscribe() {
		subscribers++;
		if (subscribers === 1) {
			intervalId = setInterval(tick, 30000);
			// catch-up when the tab becomes visible again
			document.addEventListener('visibilitychange', onVisibility);
		}
		return () => {
			subscribers--;
			if (subscribers === 0 && intervalId !== null) {
				clearInterval(intervalId);
				intervalId = null;
				document.removeEventListener('visibilitychange', onVisibility);
			}
		};
	}

	function onVisibility() {
		if (!document.hidden) tick();
	}

	tick(); // immediate first hand-off
	return subscribe();
}
