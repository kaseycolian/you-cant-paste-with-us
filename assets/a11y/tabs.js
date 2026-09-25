/* Vendored from the a11y-library (a11y-component-examples v0.1.0):
   library/components/tabs/component.js — the [CORE] and [AUTO-INIT] blocks only,
   copied verbatim. The page-checking demo code is left out. Re-copy from the
   library rather than editing here. */
(function (global) {
  'use strict';

  var uid = 0;

  /* === [CORE] ============================================================== */

  /**
   * @param {HTMLElement} root element carrying [data-ac-tabs]
   * @param {object} [options]
   * @param {'automatic'|'manual'} [options.activation] also read from
   *   [data-ac-activation]. Automatic selects as the arrows move, which is
   *   right whenever the panels are already in the DOM.
   * @returns {{select: Function, selected: Function, tabs: HTMLElement[],
   *            panels: HTMLElement[], destroy: Function}|null}
   */
  function createTabs(root, options) {
    // Idempotent: initializing twice would double up the listeners.
    if (!root || root._acTabs) return root && root._acTabs;

    var list = root.querySelector('[role="tablist"]');
    if (!list) return null;

    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return null;

    var settings = options || {};
    var manual = (settings.activation || root.getAttribute('data-ac-activation')) === 'manual';
    var id = root.id || 'ac-tabs-' + ++uid;

    var minted = [];
    var cleanups = [];

    /** Set an attribute only if the markup did not, and remember that we did,
        so destroy() really is the inverse of create(). */
    function mint(el, attr, value) {
      if (el.hasAttribute(attr)) return el.getAttribute(attr);
      el.setAttribute(attr, value);
      minted.push([el, attr]);
      return value;
    }

    function on(el, type, fn) {
      el.addEventListener(type, fn);
      cleanups.push(function () {
        el.removeEventListener(type, fn);
      });
    }

    // Pairing. aria-controls wins when the markup has it; otherwise the panels
    // are taken in DOM order, which is the only pairing a reader can check by
    // eye. Both directions are wired, because a panel that does not point back
    // at its tab has no accessible name.
    var loose = Array.prototype.slice.call(root.querySelectorAll('[role="tabpanel"]'));
    var panels = tabs.map(function (tab, i) {
      var controls = tab.getAttribute('aria-controls');
      var panel = controls ? document.getElementById(controls) : loose[i];
      if (!panel) return null;
      mint(tab, 'id', id + '-tab-' + (i + 1));
      mint(panel, 'id', id + '-panel-' + (i + 1));
      mint(tab, 'aria-controls', panel.id);
      mint(panel, 'aria-labelledby', tab.id);
      return panel;
    });

    var selected = 0;
    tabs.forEach(function (tab, i) {
      if (tab.getAttribute('aria-selected') === 'true') selected = i;
    });

    /**
     * @param {number} index
     * @param {{focus?: boolean}} [opts]
     */
    function select(index, opts) {
      if (index < 0 || index >= tabs.length) return;
      var changed = index !== selected;
      selected = index;

      tabs.forEach(function (tab, i) {
        var isOn = i === index;
        tab.setAttribute('aria-selected', isOn ? 'true' : 'false');
        // Roving tabindex. The one line that decides whether this strip is a
        // single Tab stop or one per tab.
        tab.tabIndex = isOn ? 0 : -1;
        // `hidden`, never opacity and never a class that only moves it off
        // screen: an unselected panel has to leave the accessibility tree and
        // take its tab stops with it. Example 3 is what the other way costs.
        if (panels[i]) panels[i].hidden = !isOn;
      });

      if (opts && opts.focus) tabs[index].focus();

      if (changed) {
        root.dispatchEvent(
          new CustomEvent('ac:tabs:change', {
            bubbles: true,
            detail: { index: index, tab: tabs[index], panel: panels[index] },
          }),
        );
      }
    }

    /** Manual activation only: move focus and the roving tabindex with it,
        leaving aria-selected where it was. Tab still returns to the tab the
        person was last on, which is the reason the tabindex moves at all. */
    function moveFocus(index) {
      tabs.forEach(function (tab, i) {
        tab.tabIndex = i === index ? 0 : -1;
      });
      tabs[index].focus();
    }

    on(list, 'click', function (event) {
      var tab = event.target.closest && event.target.closest('[role="tab"]');
      var index = tabs.indexOf(tab);
      // No focus argument: the click has already moved it. Enter and Space
      // arrive here too, because a native <button> fires a click for both —
      // which is the whole of manual activation's keyboard story.
      if (index >= 0) select(index);
    });

    on(list, 'keydown', function (event) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      var tab = event.target.closest && event.target.closest('[role="tab"]');
      var from = tabs.indexOf(tab);
      if (from < 0) return;

      // A stacked list gets Up/Down instead. Answering to both would make the
      // strip swallow the arrow keys the page scrolls with.
      var vertical = list.getAttribute('aria-orientation') === 'vertical';
      var forward = vertical ? 'ArrowDown' : 'ArrowRight';
      var back = vertical ? 'ArrowUp' : 'ArrowLeft';

      var next = null;
      if (event.key === forward) next = (from + 1) % tabs.length;
      else if (event.key === back) next = (from - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;

      if (next === null) return;
      event.preventDefault();

      if (manual) moveFocus(next);
      else select(next, { focus: true });
    });

    // Whatever the markup said is now made true everywhere else.
    select(selected);

    var api = {
      select: function (index) {
        select(index);
      },
      selected: function () {
        return selected;
      },
      tabs: tabs,
      panels: panels,
      destroy: function () {
        cleanups.forEach(function (fn) {
          fn();
        });
        minted.forEach(function (pair) {
          pair[0].removeAttribute(pair[1]);
        });
        cleanups = [];
        minted = [];
        delete root._acTabs;
        // The selection itself is left alone. Putting every panel back on
        // screen would be a worse ending than leaving one showing.
      },
    };

    root._acTabs = api;
    return api;
  }

  global.AC = global.AC || {};
  global.AC.createTabs = createTabs;

  /* === [AUTO-INIT] delete this block if you construct instances yourself === */
  function initAll(scope) {
    var host = scope || document;
    host.querySelectorAll('[data-ac-tabs]').forEach(function (el) {
      createTabs(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initAll();
    });
  } else {
    initAll();
  }
})(window);
