/* theme-service v1.5.0 — theme-select.js  (GENERATED; theme list mirrors themes.index.json)
   Populates and wires any <select data-theme-select> and any [data-motion-toggle] checkbox.
   Load via <script src="theme/theme-select.js"></script> (NOT inline — MV3/strict CSP blocks inline).
   Markup you provide:  <select data-theme-select aria-label="Theme"></select>
                        <input type="checkbox" data-motion-toggle> Reduce motion  (optional)

   Options are grouped by theme name (<optgroup>), Automatic first and then A→Z, so
   each row carries only what the heading has not said — "Dark", "Dark · No
   Background". They also carry data-dropdown-swatch (the theme's four accents) and
   data-dropdown-full-label (the composed "Hot Neon · Dark · No Background", used for
   the closed trigger and type-ahead); Automatic alone adds data-dropdown-secondary
   ("follows your OS"). A plain <select> ignores all three; add data-dropdown AND
   load dropdown.js to render them.

   For React/Angular, prefer the framework's own provider (see the skill) instead of this file. */
(function () {
  var THEMES = [{"id":"","label":"Auto (Rink Classic)","group":"Automatic","secondary":"follows your OS","swatch":"#ff2ec4,#5bff3a,#3ceaff,#b57fff"},{"id":"acid-arcade-dark","label":"Dark","group":"Acid Arcade","full":"Acid Arcade · Dark","swatch":"#ff4de0,#c6ff2e,#38f0ff,#b98cff"},{"id":"acid-arcade-light","label":"Light","group":"Acid Arcade","full":"Acid Arcade · Light","swatch":"#c01e9c,#5a7a00,#0a7099,#7028d0"},{"id":"acid-arcade-light-no-background","label":"Light · No Background","group":"Acid Arcade","full":"Acid Arcade · Light · No Background","swatch":"#c01e9c,#5a7a00,#0a7099,#7028d0"},{"id":"hot-neon-dark","label":"Dark","group":"Hot Neon","full":"Hot Neon · Dark","swatch":"#ff3ec8,#6bff45,#22e0ff,#cf7bff"},{"id":"hot-neon-dark-no-background","label":"Dark · No Background","group":"Hot Neon","full":"Hot Neon · Dark · No Background","swatch":"#ff3ec8,#6bff45,#22e0ff,#cf7bff"},{"id":"hot-neon-light","label":"Light","group":"Hot Neon","full":"Hot Neon · Light","swatch":"#c8127f,#1e7714,#0a72a8,#8b1fd0"},{"id":"midnight-arcade-dark","label":"Dark","group":"Midnight Arcade","full":"Midnight Arcade · Dark","swatch":"#f060c4,#54ffc4,#5cc8ff,#a888f5"},{"id":"midnight-arcade-dark-no-background","label":"Dark · No Background","group":"Midnight Arcade","full":"Midnight Arcade · Dark · No Background","swatch":"#f060c4,#54ffc4,#5cc8ff,#a888f5"},{"id":"midnight-arcade-light","label":"Light","group":"Midnight Arcade","full":"Midnight Arcade · Light","swatch":"#b81e7f,#0f7a63,#1257c4,#5b3ad0"},{"id":"midnight-arcade-light-no-background","label":"Light · No Background","group":"Midnight Arcade","full":"Midnight Arcade · Light · No Background","swatch":"#b81e7f,#0f7a63,#1257c4,#5b3ad0"},{"id":"neo-dark","label":"Dark","group":"NEO","full":"NEO · Dark","swatch":"#798aa4,#35da65,#798aa4,#c9fbd4"},{"id":"neo-dark-no-background","label":"Dark · No Background","group":"NEO","full":"NEO · Dark · No Background","swatch":"#798aa4,#35da65,#798aa4,#c9fbd4"},{"id":"neo-light","label":"Light","group":"NEO","full":"NEO · Light","swatch":"#314058,#117e16,#314058,#001800"},{"id":"neo-light-no-background","label":"Light · No Background","group":"NEO","full":"NEO · Light · No Background","swatch":"#314058,#117e16,#314058,#001800"},{"id":"rfg-dark","label":"Dark","group":"RFG","full":"RFG · Dark","swatch":"#ececec,#98c93d,#78a8fe,#49c6e5"},{"id":"rfg-dark-no-background","label":"Dark · No Background","group":"RFG","full":"RFG · Dark · No Background","swatch":"#ececec,#98c93d,#78a8fe,#49c6e5"},{"id":"rfg-light","label":"Light","group":"RFG","full":"RFG · Light","swatch":"#353535,#597d01,#386ed5,#077d95"},{"id":"rfg-light-no-background","label":"Light · No Background","group":"RFG","full":"RFG · Light · No Background","swatch":"#353535,#597d01,#386ed5,#077d95"},{"id":"rink-classic-dark","label":"Dark","group":"Rink Classic","full":"Rink Classic · Dark","swatch":"#ff2ec4,#5bff3a,#3ceaff,#b57fff"},{"id":"rink-classic-dark-no-background","label":"Dark · No Background","group":"Rink Classic","full":"Rink Classic · Dark · No Background","swatch":"#ff2ec4,#5bff3a,#3ceaff,#b57fff"},{"id":"rink-classic-light","label":"Light","group":"Rink Classic","full":"Rink Classic · Light","swatch":"#b60f86,#1f7d2f,#0a6a9e,#6d28d9"},{"id":"rink-classic-light-no-background","label":"Light · No Background","group":"Rink Classic","full":"Rink Classic · Light · No Background","swatch":"#b60f86,#1f7d2f,#0a6a9e,#6d28d9"},{"id":"synthwave-sunset-dark","label":"Dark","group":"Synthwave Sunset","full":"Synthwave Sunset · Dark","swatch":"#ff5d8f,#ffb03a,#4ad8ff,#c17bff"},{"id":"synthwave-sunset-light","label":"Light","group":"Synthwave Sunset","full":"Synthwave Sunset · Light","swatch":"#c81e5c,#9c5000,#0a6f9e,#7d2fc8"}];
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  ready(function () {
    var root = document.documentElement;
    // Same keys theme-init.js reads: <html data-theme-storage> / <html data-motion-storage>
    // when set, else 'theme' / 'motion'.
    var key = root.getAttribute('data-theme-storage') || 'theme';
    var motionKey = root.getAttribute('data-motion-storage') || 'motion';
    var saved = '';
    try { saved = localStorage.getItem(key) || ''; } catch (e) {}
    document.querySelectorAll('select[data-theme-select]').forEach(function (sel) {
      if (!sel.options.length) {
        var groups = {};
        THEMES.forEach(function (t) {
          var opt = new Option(t.label, t.id);
          if (t.swatch) opt.setAttribute('data-dropdown-swatch', t.swatch);
          if (t.secondary) opt.setAttribute('data-dropdown-secondary', t.secondary);
          if (t.full) opt.setAttribute('data-dropdown-full-label', t.full);
          if (!t.group) { sel.appendChild(opt); return; }
          if (!groups[t.group]) {
            groups[t.group] = document.createElement('optgroup');
            groups[t.group].label = t.group;
            sel.appendChild(groups[t.group]);
          }
          groups[t.group].appendChild(opt);
        });
      }
      sel.value = root.getAttribute('data-theme') || saved || '';
      sel.addEventListener('change', function () {
        var id = sel.value;
        if (id) { root.setAttribute('data-theme', id); try { localStorage.setItem(key, id); } catch (e) {} }
        else { root.removeAttribute('data-theme'); try { localStorage.removeItem(key); } catch (e) {} }
      });
      // Opt-in upgrade to the accessible listbox. Order-independent: createDropdown
      // is idempotent, so if dropdown.js auto-init already ran on the empty <select>
      // this returns that instance, and rebuild() picks up the options added above.
      // Without data-dropdown nothing changes — apps on the old markup keep the
      // native control through an update.
      if (sel.hasAttribute('data-dropdown') && window.ThemeService && window.ThemeService.createDropdown) {
        var dd = window.ThemeService.createDropdown(sel);
        if (dd) dd.rebuild();
      }
    });
    document.querySelectorAll('[data-motion-toggle]').forEach(function (cb) {
      cb.checked = root.getAttribute('data-motion') === 'off';
      cb.addEventListener('change', function () {
        if (cb.checked) { root.setAttribute('data-motion', 'off'); try { localStorage.setItem(motionKey, 'off'); } catch (e) {} }
        else { root.removeAttribute('data-motion'); try { localStorage.removeItem(motionKey); } catch (e) {} }
      });
    });
  });
})();
