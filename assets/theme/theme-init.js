/* theme-service v1.5.0 — theme-init.js
   Applies the saved (or ?theme= / ?motion=) theme BEFORE first paint, so there's no flash.
   Load in <head> via <script src="theme/theme-init.js"></script> (NOT inline — inline is blocked
   by Manifest V3 / strict CSP). CSP-safe.
   The choices are saved under the localStorage keys 'theme' and 'motion'. Two sites on one
   origin (e.g. two GitHub Pages projects) share those keys, so either can name its own on <html>:
   <html data-theme-storage="my-site-theme" data-motion-storage="my-site-motion">.
   theme-select.js reads the same attributes. */
(function () {
  try {
    var p = new URLSearchParams(location.search);
    var root = document.documentElement;
    var k = root.getAttribute('data-theme-storage') || 'theme';
    var mk = root.getAttribute('data-motion-storage') || 'motion';
    var t = p.get('theme') || localStorage.getItem(k);
    if (t) root.setAttribute('data-theme', t);
    if ((p.get('motion') || localStorage.getItem(mk)) === 'off')
      root.setAttribute('data-motion', 'off');
  } catch (e) {}
})();
