/* =============================================================================
   Theme Service — dropdown.js. Accessible dropdown / listbox behavior.

   The BEHAVIOR is a port of the `dropdown` component from the
   a11y-component-examples library. The NAMES are this repo's: `.dropdown-*`
   classes, `data-dropdown-*` hooks, `window.ThemeService`, matching `.btn` /
   `.input` / `.field` in components.css rather than upstream's `ac-` prefix —
   which exists over there precisely to avoid colliding with those names, and so
   has no reason to travel here.

   That means this is NOT a drop-in re-copy from upstream. Porting a fix means
   translating the identifiers, so diff the logic and not the text. The mapping
   is mechanical and total:

       ac-dropdown           ->  dropdown            (and __part -> -part)
       ac-dropdown--disabled ->  dropdown-disabled   (likewise --up)
       data-ac-<x>           ->  data-dropdown-<x>
       window.AC             ->  window.ThemeService
       select._acDropdown    ->  select._dropdown

   One behavior addition beyond upstream: `data-dropdown-anchor` / the `anchor`
   option (see "Panel anchor" below). Upstream always anchors the panel to the
   trigger, which leaves the panel narrower than its shell whenever the trigger
   sits in a group — as it does in this site's header. Additive and opt-in: with
   no attribute the behavior is upstream's exactly.

   Progressive enhancement of a real <select>. The native element stays in the
   DOM as the value store, so `.value`, `.selectedIndex`, `change` listeners and
   form submission keep working — you can drop this onto an existing form and
   nothing downstream needs to know.

   Focus model: when the panel opens, DOM focus moves onto the option itself
   (roving tabindex) rather than staying on the button with
   `aria-activedescendant`. Both are APG-legal. Real focus is used because
   activedescendant is unreliable on VoiceOver for iOS and on TalkBack, and
   mobile screen reader support is a requirement.

   The panel anchors to its trigger at every viewport width — it never becomes a
   bottom sheet, which is a different focus and dismissal model.

   Usage:  <label class="field-label" for="x">Region</label>
           <select id="x" data-dropdown>…</select>
   Anything with [data-dropdown] is enhanced automatically on DOMContentLoaded.
   Construct manually with ThemeService.createDropdown(el) — it is idempotent.

   No dependencies, no build step, external file (inline scripts are blocked by
   strict CSP / Manifest V3). Load AFTER theme-select.js is fine — that file
   re-enhances the theme picker once it has populated it.
   ============================================================================= */
(function (global) {
  'use strict';

  var uid = 0;

  /** The instance whose panel is currently open, if any. */
  var openInstance = null;

  var SUPPORTS_POPOVER =
    typeof HTMLElement !== 'undefined' &&
    Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'showPopover');

  /**
   * @param {HTMLSelectElement} select
   * @param {{ emptyText?: string }} [options]
   */
  function createDropdown(select, options) {
    if (!select || select._dropdown) return select && select._dropdown;

    // A multi-select is a different pattern with a different keyboard model.
    // Enhancing it would quietly break it, so leave it as the native control.
    if (select.multiple) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('dropdown: <select multiple> is not supported; leaving it native.', select);
      }
      return null;
    }

    var settings = options || {};
    var id = select.id || 'dropdown-' + ++uid;
    var emptyText =
      settings.emptyText || select.getAttribute('data-dropdown-empty-text') || 'No options available';

    // Panel anchor. By default the panel lines up with the trigger, the way a
    // native select does. When the trigger sits inside a group — a label cap, an
    // addon, an icon rail — the thing the user reads as "the control" is the
    // GROUP, and a panel that starts partway across it looks detached. Pass a
    // selector in data-dropdown-anchor (or an element as options.anchor) to anchor to
    // the nearest matching ancestor instead. Resolved from the <select>, which is
    // still in its original parent at this point. Opt-in: with no attribute the
    // anchor is the trigger, so no existing instance moves.
    var anchorSelector = select.getAttribute('data-dropdown-anchor');
    var anchorEl = settings.anchor || (anchorSelector ? select.closest(anchorSelector) : null);

    /* === Build the shell ================================================== */

    var wrap = document.createElement('div');
    wrap.className = 'dropdown';

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'dropdown-toggle';
    toggle.id = id + '-toggle';
    toggle.setAttribute('aria-haspopup', 'listbox');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', id + '-panel');

    var valueEl = document.createElement('span');
    valueEl.className = 'dropdown-value';

    var caret = document.createElement('span');
    caret.className = 'dropdown-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.innerHTML =
      '<svg viewBox="0 0 16 16" focusable="false"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    toggle.appendChild(valueEl);
    toggle.appendChild(caret);

    var panel = document.createElement('div');
    panel.className = 'dropdown-panel';
    panel.id = id + '-panel';
    panel.setAttribute('role', 'listbox');
    panel.hidden = true;
    if (SUPPORTS_POPOVER) {
      // "manual" rather than "auto": we handle Escape and outside-click
      // ourselves, and auto's light-dismiss races with the toggle's own click.
      panel.setAttribute('popover', 'manual');
    }

    var list = document.createElement('div');
    list.className = 'dropdown-list';
    panel.appendChild(list);

    /* === Accessible name ==================================================
       Carry over whatever labeled the <select>. A <label for> is the common case
       and the one this pattern usually drops. */

    function resolveLabel() {
      var labelledBy = select.getAttribute('aria-labelledby');
      if (labelledBy) return { ids: labelledBy, text: null };

      var ariaLabel = select.getAttribute('aria-label');
      if (ariaLabel) return { ids: null, text: ariaLabel };

      var labels = select.labels;
      if (labels && labels.length) {
        var ids = [];
        for (var i = 0; i < labels.length; i++) {
          if (!labels[i].id) labels[i].id = id + '-label-' + i;
          ids.push(labels[i].id);
        }
        return { ids: ids.join(' '), text: labels[0].textContent.trim() };
      }

      return { ids: null, text: null };
    }

    // The trigger's name is "<label>, <current value>", which is how a native
    // <select> announces. Referencing the value element rather than copying its
    // text means the name updates itself whenever the selection changes.
    valueEl.id = id + '-value';

    var label = resolveLabel();
    if (label.ids) {
      toggle.setAttribute('aria-labelledby', label.ids + ' ' + valueEl.id);
      panel.setAttribute('aria-labelledby', label.ids);
    } else if (label.text) {
      toggle.setAttribute('aria-label', label.text);
      panel.setAttribute('aria-label', label.text);
    }

    // Descriptions (hints, error text) apply to the visible control too.
    var describedBy = select.getAttribute('aria-describedby');
    if (describedBy) toggle.setAttribute('aria-describedby', describedBy);

    /* === Insert, and demote the native select to a value store ============ */

    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(toggle);
    wrap.appendChild(panel);
    wrap.appendChild(select);

    select.classList.add('dropdown-native');
    select.tabIndex = -1;
    // display:none already removes it from the accessibility tree; this makes the
    // intent explicit for anyone reading the DOM.
    select.setAttribute('aria-hidden', 'true');

    /* === Options ========================================================== */

    /** @type {HTMLElement[]} rows in visual order, index-aligned to enabled options */
    var rows = [];
    /** @type {number[]} select.options index for each row */
    var rowIndexes = [];

    function decorate(row, option) {
      /* An icon or a color strip. Both render aria-hidden, so no symbol name
         reaches the option's accessible name. */
      var swatch = option.getAttribute('data-dropdown-swatch');
      var icon = option.getAttribute('data-dropdown-icon');

      if (icon) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'dropdown-icon');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#' + icon);
        svg.appendChild(use);
        row.appendChild(svg);
      } else if (swatch) {
        var colors = swatch.split(',');
        var strip = document.createElement('span');
        strip.className = 'dropdown-swatch';
        strip.setAttribute('aria-hidden', 'true');
        for (var i = 0; i < colors.length; i++) {
          var dot = document.createElement('span');
          // The one place a literal color is legitimate: it comes from the
          // author's data, not from the stylesheet.
          dot.style.background = colors[i].trim();
          strip.appendChild(dot);
        }
        row.appendChild(strip);
      }

      /* The option's own text */
      var text = document.createElement('span');
      text.className = 'dropdown-text';

      var primary = document.createElement('span');
      primary.className = 'dropdown-primary';
      primary.textContent = option.textContent.trim();
      text.appendChild(primary);

      /* A muted second line. NOT aria-hidden: it is real information, so it
         belongs in the accessible name. */
      var secondary = option.getAttribute('data-dropdown-secondary');
      if (secondary) {
        var sub = document.createElement('span');
        sub.className = 'dropdown-secondary';
        sub.textContent = secondary;
        text.appendChild(sub);
      }

      row.appendChild(text);

      /* The tick, so selection is never shown by color alone */
      var check = document.createElement('span');
      check.className = 'dropdown-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';
      row.appendChild(check);
    }

    function buildRow(option, optionIndex) {
      var row = document.createElement('div');
      row.className = 'dropdown-option';
      row.id = id + '-option-' + optionIndex;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(optionIndex === select.selectedIndex));
      row.dataset.index = String(optionIndex);

      if (option.disabled) {
        // aria-disabled rather than removing it: the option stays discoverable, so
        // a screen reader user learns it exists and why it is unavailable.
        row.setAttribute('aria-disabled', 'true');
      } else {
        row.tabIndex = -1;
        rows.push(row);
        rowIndexes.push(optionIndex);
      }

      decorate(row, option);
      return row;
    }

    function rebuild() {
      list.textContent = '';
      rows = [];
      rowIndexes = [];

      var optionIndex = 0;
      var children = select.children;

      for (var i = 0; i < children.length; i++) {
        var child = children[i];

        /* <optgroup> becomes role="group". */
        if (child.tagName === 'OPTGROUP') {
          var group = document.createElement('div');
          group.setAttribute('role', 'group');
          group.className = 'dropdown-group';
          var groupLabel = document.createElement('div');
          groupLabel.className = 'dropdown-group-label';
          groupLabel.id = id + '-group-' + i;
          groupLabel.textContent = child.label;
          // aria-hidden on the visible text plus aria-label on the group stops the
          // label being announced twice, once as text and once as the name.
          groupLabel.setAttribute('aria-hidden', 'true');
          group.setAttribute('aria-label', child.label);
          group.appendChild(groupLabel);

          for (var j = 0; j < child.children.length; j++) {
            group.appendChild(buildRow(child.children[j], optionIndex++));
          }
          list.appendChild(group);
        } else if (child.tagName === 'OPTION') {
          list.appendChild(buildRow(child, optionIndex++));
        }
      }

      if (!select.options.length) {
        var empty = document.createElement('div');
        empty.className = 'dropdown-empty';
        empty.textContent = emptyText;
        list.appendChild(empty);
      }

      syncValue();
      syncDisabled();
    }

    /* A row can afford to be terse — the group heading above it supplies the rest.
       The CLOSED trigger cannot: it is the one label always on screen, with no
       heading near it, so a theme row reading "Dark · No Background" would leave
       the trigger saying that and nothing about WHICH theme. data-dropdown-full-label
       carries the composed name for exactly these cases. Optional: an option
       without one falls back to its own text, so plain dropdowns are unchanged. */
    function fullLabelOf(option) {
      return (option.getAttribute('data-dropdown-full-label') || option.textContent).trim();
    }

    function syncValue() {
      var option = select.options[select.selectedIndex];
      valueEl.textContent = option ? fullLabelOf(option) : emptyText;
      valueEl.classList.toggle('dropdown-value-empty', !option);

      var allRows = list.querySelectorAll('[role="option"]');
      for (var i = 0; i < allRows.length; i++) {
        allRows[i].setAttribute(
          'aria-selected',
          String(Number(allRows[i].dataset.index) === select.selectedIndex),
        );
      }
    }

    function syncDisabled() {
      // aria-disabled, not the disabled attribute: the control stays focusable, so
      // a keyboard user can still reach it and hear why it is unavailable.
      toggle.setAttribute('aria-disabled', String(select.disabled));
      wrap.classList.toggle('dropdown-disabled', select.disabled);
    }

    /* === Positioning ======================================================
       The panel is position:fixed and, where supported, in the top layer. That is
       what stops an ancestor with overflow:hidden or a transform from clipping it.
       Recomputed on scroll and resize rather than once at open time, so it cannot
       drift away from its trigger. */

    function position() {
      var rect = (anchorEl || toggle).getBoundingClientRect();
      var gap = 6;
      var margin = 8;
      var spaceBelow = window.innerHeight - rect.bottom - gap - margin;
      var spaceAbove = rect.top - gap - margin;
      // Flip up only when below is genuinely cramped AND above has more room.
      var flipUp = spaceBelow < 200 && spaceAbove > spaceBelow;

      // Match the anchor's width, the way a native select does, but never let the
      // panel hang off either edge of a narrow viewport.
      panel.style.width = rect.width + 'px';
      panel.style.left =
        Math.max(margin, Math.min(rect.left, window.innerWidth - rect.width - margin)) + 'px';
      panel.style.maxHeight = Math.max(120, flipUp ? spaceAbove : spaceBelow) + 'px';

      if (flipUp) {
        panel.style.top = '';
        panel.style.bottom = window.innerHeight - rect.top + gap + 'px';
      } else {
        panel.style.bottom = '';
        panel.style.top = rect.bottom + gap + 'px';
      }

      // A styling hook for consumers who want to square off the adjoining corners.
      wrap.classList.toggle('dropdown-up', flipUp);
    }

    /* === Open and close =================================================== */

    function isOpen() {
      return toggle.getAttribute('aria-expanded') === 'true';
    }

    function open() {
      if (isOpen() || select.disabled) return;
      if (openInstance && openInstance !== api) openInstance.close(false);

      panel.hidden = false;
      if (SUPPORTS_POPOVER) {
        try {
          panel.showPopover();
        } catch (e) {
          /* already open, or popover unsupported at runtime */
        }
      }

      position();
      toggle.setAttribute('aria-expanded', 'true');
      openInstance = api;

      document.addEventListener('pointerdown', onDocumentPointerDown, true);
      window.addEventListener('resize', position);
      // `true` for capture so we reposition even when a nested element scrolls.
      window.addEventListener('scroll', onScroll, true);

      // Focus the selected option so a screen reader announces the listbox and
      // where you are in it. Falling back to the first option when nothing is
      // selected keeps the arrow keys predictable.
      var target = rows[indexOfSelected()] || rows[0];
      if (target) {
        target.focus();
        scrollRowIntoView(target);
      } else {
        panel.tabIndex = -1;
        panel.focus();
      }
    }

    function close(restoreFocus) {
      if (!isOpen()) return;

      if (SUPPORTS_POPOVER) {
        try {
          panel.hidePopover();
        } catch (e) {
          /* already closed */
        }
      }
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('dropdown-up');
      if (openInstance === api) openInstance = null;

      document.removeEventListener('pointerdown', onDocumentPointerDown, true);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', onScroll, true);

      // Focus has to go somewhere. Hiding the element that holds it without moving
      // it first drops focus to <body>, and the user loses their place entirely.
      if (restoreFocus !== false) toggle.focus();
    }

    function onScroll() {
      position();
    }

    function onDocumentPointerDown(event) {
      if (!wrap.contains(event.target) && !panel.contains(event.target)) close(false);
    }

    function indexOfSelected() {
      var found = rowIndexes.indexOf(select.selectedIndex);
      return found === -1 ? 0 : found;
    }

    function scrollRowIntoView(row) {
      if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
    }

    function focusRow(index) {
      if (!rows.length) return;
      var clamped = Math.max(0, Math.min(rows.length - 1, index));
      rows[clamped].focus();
      scrollRowIntoView(rows[clamped]);
    }

    function currentRowIndex() {
      return rows.indexOf(document.activeElement);
    }

    function choose(rowIndex) {
      var optionIndex = rowIndexes[rowIndex];
      if (typeof optionIndex !== 'number') return;

      if (select.selectedIndex !== optionIndex) {
        select.selectedIndex = optionIndex;
        // Dispatched on the native element, so handlers already bound to the
        // <select> fire exactly as they did before this was enhanced.
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }

      syncValue();
      close();
    }

    /* === Type-ahead ======================================================= */

    var buffer = '';
    var bufferTime = 0;

    function typeAhead(char) {
      var now = Date.now();
      // An 800ms window, so "sy" lands on Synthwave rather than jumping to the
      // first "s" and then the first "y".
      buffer = (now - bufferTime > 800 ? '' : buffer) + char.toLowerCase();
      bufferTime = now;

      for (var i = 0; i < rows.length; i++) {
        /* The FULL name, not the row's own text: rows grouped under a heading drop
           the part the heading already said, so sixteen themes offer rows reading
           "Dark" and "Light" and typing "s" would match none of them. Matching the
           composed name keeps "sy" landing on Synthwave Sunset — the thing a user
           types is the theme's name, not the fragment left after grouping. */
        var text = fullLabelOf(select.options[rowIndexes[i]]).toLowerCase();
        if (text.indexOf(buffer) === 0) {
          if (isOpen()) focusRow(i);
          else choose(i);
          return;
        }
      }
    }

    /* === Events =========================================================== */

    function onToggleClick() {
      if (select.disabled) return;
      if (isOpen()) close();
      else open();
    }

    function onToggleKeydown(event) {
      if (select.disabled) return;
      var key = event.key;

      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        event.preventDefault();
        open();
        return;
      }

      if (key === 'Home' || key === 'End') {
        event.preventDefault();
        open();
        focusRow(key === 'Home' ? 0 : rows.length - 1);
        return;
      }

      if (key.length === 1 && /\S/.test(key)) {
        event.preventDefault();
        typeAhead(key);
      }
    }

    function onPanelKeydown(event) {
      var key = event.key;
      var index = currentRowIndex();

      if (key === 'ArrowDown') {
        event.preventDefault();
        focusRow(index === rows.length - 1 ? 0 : index + 1);
      } else if (key === 'ArrowUp') {
        event.preventDefault();
        focusRow(index <= 0 ? rows.length - 1 : index - 1);
      } else if (key === 'Home') {
        event.preventDefault();
        focusRow(0);
      } else if (key === 'End') {
        event.preventDefault();
        focusRow(rows.length - 1);
      } else if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        if (index > -1) choose(index);
      } else if (key === 'Escape') {
        event.preventDefault();
        // Stop it here, or a surrounding dialog closes at the same time.
        event.stopPropagation();
        close();
      } else if (key === 'Tab') {
        // Move focus back to the toggle first, then let the browser carry on
        // tabbing from there — otherwise focus sits on an element we are hiding.
        close();
      } else if (key.length === 1 && /\S/.test(key)) {
        event.preventDefault();
        typeAhead(key);
      }
    }

    function onListClick(event) {
      var row = event.target.closest('[role="option"]');
      if (!row) return;
      if (row.getAttribute('aria-disabled') === 'true') return;
      var index = rows.indexOf(row);
      if (index > -1) choose(index);
    }

    function onListPointerMove(event) {
      // Only follow a real mouse. On touch this fires during a scroll drag and
      // would yank focus to whatever passed under the finger.
      if (event.pointerType !== 'mouse') return;
      var row = event.target.closest('[role="option"]');
      if (!row || row.getAttribute('aria-disabled') === 'true') return;
      var index = rows.indexOf(row);
      if (index > -1 && document.activeElement !== rows[index]) rows[index].focus();
    }

    function onNativeChange() {
      syncValue();
    }

    toggle.addEventListener('click', onToggleClick);
    toggle.addEventListener('keydown', onToggleKeydown);
    panel.addEventListener('keydown', onPanelKeydown);
    list.addEventListener('click', onListClick);
    list.addEventListener('pointermove', onListPointerMove);
    select.addEventListener('change', onNativeChange);

    // Mirror the native element's own `hidden` and `disabled` so app code that
    // toggles them keeps working without knowing this wrapper exists.
    var observer = new MutationObserver(function () {
      wrap.hidden = select.hidden;
      syncDisabled();
      if (select.disabled && isOpen()) close(false);
    });
    observer.observe(select, { attributes: true, attributeFilter: ['hidden', 'disabled'] });
    wrap.hidden = select.hidden;

    /* === API ============================================================== */

    var api = {
      /** Re-read the <select> after its options changed. */
      rebuild: rebuild,
      /** Re-read the current value after setting select.value programmatically. */
      sync: syncValue,
      open: open,
      close: close,
      isOpen: isOpen,
      /** The enhanced wrapper, if you need to position something relative to it. */
      element: wrap,
      destroy: function () {
        close(false);
        observer.disconnect();
        toggle.removeEventListener('click', onToggleClick);
        toggle.removeEventListener('keydown', onToggleKeydown);
        panel.removeEventListener('keydown', onPanelKeydown);
        list.removeEventListener('click', onListClick);
        list.removeEventListener('pointermove', onListPointerMove);
        select.removeEventListener('change', onNativeChange);

        select.classList.remove('dropdown-native');
        select.removeAttribute('aria-hidden');
        select.tabIndex = 0;
        wrap.parentNode.insertBefore(select, wrap);
        wrap.remove();
        delete select._dropdown;
      },
    };

    select._dropdown = api;
    rebuild();
    return api;
  }

  global.ThemeService = global.ThemeService || {};
  global.ThemeService.createDropdown = createDropdown;

  /* === Auto-init ========================================================== */

  function initAll(scope) {
    (scope || document).querySelectorAll('select[data-dropdown]').forEach(function (el) {
      createDropdown(el);
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
