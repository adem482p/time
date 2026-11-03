// app/src/lib/register.js — service-worker registration (issues 063, 070,
// 072, 087). The worker implements runtime response caching (issue 087): online
// serves from the network and writes every successful response into the app's
// runtime cache; offline serves from that cache — there is no build-time
// snapshot list and no install-time snapshot take any more.
// Issue 072 (two independently installable apps): both app pages load this
// module; the worker URL 'sw.js' resolves document-relative to the page, so
// /teachers/ registers teachers/sw.js (scope teachers/) and /classes/
// registers classes/sw.js (scope classes/). The root landing page and the
// online-only utility pages import nothing — no worker there.
// Dev (issue 087): the worker is a build artifact stamped into build/ by
// scripts/gen-sw.mjs — vite dev serves the source tree, never build/, so a
// registration here would always 404 (/teachers/sw.js -> [404]). Registration
// is therefore skipped in dev; production registers the stamped worker as
// before.
// Timing: registration waits for the window 'load' event — the worker and
// the page's runtime data (the CSV fetch) must not compete for bandwidth
// during boot. But on a page whose JS runs after load already fired (slow
// fonts, big bundles), a listener added then NEVER fires; so when
// document.readyState is already 'complete' the same registration body
// runs immediately instead.
// file:// and other non-http(s) origins have no serviceWorker API: guard +
// catch keep those a silent no-op.
function registerWorker() {
	navigator.serviceWorker
		.register('sw.js')
		.then(function (reg) {
			reg.update();
		}) // byte-diff check every load
		.catch(function () {
			/* unsupported origin or no sw.js (e.g. file://) */
		});
}
export function registerApp() {
	if (import.meta.env.DEV) return; // dev: no build-time worker to register (issue 087)
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	if (document.readyState === 'complete') {
		registerWorker();
	} else {
		window.addEventListener('load', registerWorker);
	}
}
