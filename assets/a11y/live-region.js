/* Vendored from the a11y-library (a11y-component-examples v0.1.0):
   library/components/live-region/component.js — the [CORE] block (AC.speak),
   copied verbatim. Re-copy rather than editing here. */
(function (global) {
  'use strict';

  /* === [CORE] ============================================================ */

  /**
   * Write `text` into an existing live region so that it is announced even when
   * it is the same text the region already holds.
   *
   * @param {HTMLElement} el an element already carrying role="status",
   *   role="alert" or aria-live. It must be in the document and not hidden.
   * @param {string} text
   * @returns {number} the frame handle, so a caller can cancel a pending write
   */
  function speak(el, text) {
    if (!el) return 0;

    // Clear first. Without this, assigning the same string twice changes
    // nothing and announces nothing.
    el.textContent = '';

    return requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.textContent = text;
      });
    });
  }

  global.AC = global.AC || {};
  global.AC.speak = speak;
})(window);
