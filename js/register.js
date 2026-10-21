// js/register.js — service-worker registration (issue 063).
// file:// and other non-http(s) origins have no serviceWorker API: guard + catch
// keep those a silent no-op.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js')
      .then(function (reg) { reg.update(); })   // byte-diff check every load
      .catch(function () { /* unsupported origin (e.g. file://) */ });
  });
}
