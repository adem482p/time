// app/src/lib/register.js — service-worker registration (issues 063, 070,
// 072). The worker implements the "last snapshot" model: online always
// serves from the network and only ever BUILDS the snapshot wholesale;
// offline serves the snapshot taken at the last online moment, which is
// erased and retaken from scratch every time the recorded status goes
// offline -> online (see teachers/sw.js, classes/sw.js).
// Issue 072 (two independently installable apps): both app pages load this
// module; the worker URL 'sw.js' resolves document-relative to the page, so
// /teachers/ registers teachers/sw.js (scope teachers/) and /classes/
// registers classes/sw.js (scope classes/). The root landing page and the
// online-only utility pages import nothing — no worker there.
// file:// and other non-http(s) origins have no serviceWorker API: guard +
// catch keep those a silent no-op.
export function registerApp() {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	window.addEventListener('load', function () {
		navigator.serviceWorker
			.register('sw.js')
			.then(function (reg) {
				reg.update();
			}) // byte-diff check every load
			.catch(function () {
				/* unsupported origin or no sw.js (e.g. file://) */
			});
	});
}
