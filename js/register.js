// js/register.js — service-worker registration (issues 063, 070, 072).
// The worker implements the "last snapshot" model: online always serves from
// the network and only ever BUILDS the snapshot wholesale; offline serves the
// snapshot taken at the last online moment, which is erased and retaken from
// scratch every time the recorded status goes offline -> online (see sw.js).
// Issue 072 (two independently installable apps): this module is shared, but
// only the app pages load it, each from its own directory — 'sw.js' resolves
// document-relative, so teachers/index.html registers teachers/sw.js (scope
// teachers/) and classes/index.html registers classes/sw.js (scope classes/).
// The root landing page and the online-only utility pages load no worker.
// file:// and other non-http(s) origins have no serviceWorker API: guard + catch
// keep those a silent no-op.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js')
      .then(function (reg) { reg.update(); })   // byte-diff check every load
      .catch(function () { /* unsupported origin (e.g. file://) */ });
  });
}
