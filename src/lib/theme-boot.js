// Classic (non-module) script loaded in <head> of every page so the right
// theme is applied before first paint. chrome.storage is async, so the last
// choice is mirrored to localStorage for the synchronous first read.
(function () {
  var KEY = 'redirectory:appearance';
  var root = document.documentElement;
  var pref = { theme: 'ember', mode: 'system' };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) pref = Object.assign(pref, saved);
  } catch (e) {}

  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function apply(p, animate) {
    var mode = p.mode === 'light' || p.mode === 'dark' ? p.mode : mq.matches ? 'dark' : 'light';
    if (animate && (root.dataset.theme !== p.theme || root.dataset.mode !== mode)) {
      root.classList.add('theme-anim');
      setTimeout(function () {
        root.classList.remove('theme-anim');
      }, 400);
    }
    root.dataset.theme = p.theme || 'ember';
    root.dataset.mode = mode;
  }
  function remember() {
    try {
      localStorage.setItem(KEY, JSON.stringify(pref));
    } catch (e) {}
  }

  apply(pref, false);
  mq.addEventListener('change', function () {
    apply(pref, true);
  });

  if (window.chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('appearance').then(function (r) {
      if (r.appearance) {
        pref = Object.assign({ theme: 'ember', mode: 'system' }, r.appearance);
        remember();
        apply(pref, false);
      }
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes.appearance) return;
      pref = Object.assign({ theme: 'ember', mode: 'system' }, changes.appearance.newValue || {});
      remember();
      apply(pref, true);
    });
  }
})();
