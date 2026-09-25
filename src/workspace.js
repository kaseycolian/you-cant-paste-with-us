// The text card: the editor, the Original / Replaced views, and what acts on them.

import { createMatcher } from './matcher.js';
import { replaceInTree } from './replace-dom.js';
import { htmlToFragment, textToFragment } from './sanitize.js';
import { payloadFor, payloadForRange, selectAll, writeClipboard } from './clipboard.js';

const ORIGINAL = 0;
const REPLACED = 1;

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * @param {HTMLElement} section
 * @param {object} deps
 * @param {() => import('./matcher.js').Pair[]} deps.getPairs
 * @param {(text: string) => void} deps.announce
 * @param {{aria: string, label: string, copy: string}} deps.shortcut
 */
export function createWorkspace(section, { getPairs, announce, shortcut }) {
  const $ = (selector) => section.querySelector(selector);
  const replaceButton = $('#replace');
  const copyButton = $('#copy');
  const removeLinks = $('#remove-links');
  const status = $('#ws-status');
  const sheet = $('#sheet');
  const source = $('#source');
  const output = $('#result');
  const emptyState = $('#replaced-empty');
  const panelOriginal = $('#panel-original');
  const panelReplaced = $('#panel-replaced');
  const tabReplaced = $('#tab-replaced');

  const tabs = window.AC.createTabs(sheet);
  // Each view scrolls on its own; `content` is what a scroll position is measured against.
  const views = [
    { panel: panelOriginal, scroller: source, content: source, anchor: null, top: 0, frame: 0 },
    { panel: panelReplaced, scroller: panelReplaced, content: output, anchor: null, top: 0, frame: 0 },
  ];

  let rich = false; // true once any HTML has been pasted since the editor was last empty
  let result = null; // { summary, stale } after a Replace
  let note = ''; // a one-off message, such as "Copied", cleared by the next change
  let pendingAnchor = null;

  replaceButton.setAttribute('aria-keyshortcuts', shortcut.aria);

  /* ---- state ------------------------------------------------------------ */

  function hasText() {
    return source.textContent.trim() !== '' || source.querySelector('img') !== null;
  }

  /** Why Replace can't run right now, or '' when it can. */
  function problem() {
    if (!hasText()) return 'Paste some text to start.';
    if (!getPairs().some((p) => p.on)) return 'Turn on at least one swap in your list.';
    return '';
  }

  function markStale() {
    note = '';
    if (result) result.stale = true;
  }

  /** Soft-disabled: still focusable, and it says why through the status line. */
  function setUnavailable(button, reason) {
    if (reason) {
      button.setAttribute('aria-disabled', 'true');
      button.setAttribute('aria-describedby', status.id);
    } else {
      button.removeAttribute('aria-disabled');
      button.removeAttribute('aria-describedby');
    }
  }

  function refresh() {
    const reason = problem();
    setUnavailable(replaceButton, reason);
    setUnavailable(copyButton, reason);
    let text = reason || note;
    if (!text && result) text = result.stale ? 'Out of date. Press Replace to refresh.' : result.summary;
    if (!text) text = `Ready. ${shortcut.label} replaces from anywhere on the page.`;
    status.textContent = text;
    tabReplaced.toggleAttribute('data-stale', Boolean(result?.stale));
    panelOriginal.toggleAttribute('data-empty', !hasText());
  }

  /* ---- scroll position, kept in step between the two views --------------- */

  /** Where a view is scrolled to: the path of child indexes to the element at its top edge. */
  function anchorOf(view) {
    const top = view.scroller.getBoundingClientRect().top;
    const path = [];
    let el = view.content;
    let offset = 0;
    for (let depth = 0; depth < 16 && el.children.length; depth++) {
      const children = [...el.children];
      const index = children.findIndex((child) => child.getBoundingClientRect().bottom > top + 1);
      if (index === -1) break;
      el = children[index];
      path.push(index);
      offset = el.getBoundingClientRect().top - top;
      if (offset >= 0) break;
    }
    const room = view.scroller.scrollHeight - view.scroller.clientHeight;
    return { path, offset, ratio: room > 0 ? view.scroller.scrollTop / room : 0 };
  }

  /** The Replaced view is a copy of the Original's structure, so a path means the same place in both. */
  function applyAnchor(view, anchor) {
    const { scroller } = view;
    let el = view.content;
    for (const index of anchor.path) {
      el = el?.children[index];
    }
    if (el && el !== view.content) {
      scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchor.offset;
    } else {
      scroller.scrollTop = anchor.ratio * (scroller.scrollHeight - scroller.clientHeight);
    }
  }

  for (const view of views) {
    view.scroller.addEventListener('scroll', () => {
      view.top = view.scroller.scrollTop;
      if (view.frame || view.panel.hidden) return;
      view.frame = requestAnimationFrame(() => {
        view.frame = 0;
        view.anchor = anchorOf(view);
      });
    }, { passive: true });
  }

  sheet.addEventListener('ac:tabs:change', (event) => {
    const to = views[event.detail.index];
    const from = views[1 - event.detail.index];
    const anchor = pendingAnchor ?? (result && !result.stale ? from.anchor : null);
    pendingAnchor = null;
    if (anchor) applyAnchor(to, anchor);
    else to.scroller.scrollTop = to.top;
  });

  /* ---- replace ----------------------------------------------------------- */

  function summarize(outcome) {
    if (!outcome.count) return 'No matches, so the text is unchanged.';
    let text = `Replaced ${count(outcome.count, 'match', 'matches')} using ${count(outcome.usedIds.size, 'swap', 'swaps')}.`;
    const kept = [];
    if (outcome.links) kept.push(count(outcome.links, 'link', 'links'));
    if (outcome.images) kept.push(`${count(outcome.images, 'image', 'images')} to check`);
    if (kept.length) text += ` Kept ${kept.join(' and ')}.`;
    return text;
  }

  function paintHighlights(marks) {
    if (!globalThis.CSS?.highlights || typeof Highlight !== 'function') return;
    const highlight = new Highlight();
    for (const { node, start, end } of marks) {
      if (end <= start) continue;
      const range = new Range();
      range.setStart(node, start);
      range.setEnd(node, end);
      highlight.add(range);
    }
    CSS.highlights.set('swap', highlight);
  }

  /** @returns {boolean} whether it ran */
  function replace() {
    if (problem()) return false;
    let matcher;
    try {
      matcher = createMatcher(getPairs());
    } catch {
      note = 'Your swap list is too long to search in one go.';
      refresh();
      return false;
    }

    const anchor = anchorOf(views[tabs.selected()]);
    const focusWasInOriginal = panelOriginal.contains(document.activeElement);

    // A fresh copy every time, so the original is never touched.
    const copy = document.createDocumentFragment();
    for (const node of source.childNodes) copy.append(node.cloneNode(true));
    output.replaceChildren(copy);
    const outcome = replaceInTree(output, matcher, { removeLinks: removeLinks.checked });
    emptyState.hidden = true;
    paintHighlights(outcome.marks);
    result = { summary: summarize(outcome), stale: false };
    note = '';

    if (tabs.selected() === REPLACED) {
      applyAnchor(views[REPLACED], anchor);
    } else {
      pendingAnchor = anchor;
      tabs.select(REPLACED);
    }
    // The focused editor has just been hidden. The Replaced view sits in the same box.
    if (focusWasInOriginal) panelReplaced.focus({ preventScroll: true });
    refresh();
    announce(`${result.summary} Showing the replaced text.`);
    return true;
  }

  async function copyResult() {
    if (problem()) return;
    // Never copy an out-of-date result. Replace runs synchronously, so the click
    // still counts as the gesture the clipboard needs.
    if (!result || result.stale) replace();
    const outcome = await writeClipboard(payloadFor(output, rich));
    if (outcome === 'failed') {
      selectAll(output);
      note = `Your browser blocked the copy. The result is selected, so press ${shortcut.copy}.`;
    } else {
      note = outcome === 'rich' ? 'Copied, with formatting.' : 'Copied as plain text.';
    }
    refresh();
    announce(note);
  }

  function clear() {
    source.replaceChildren();
    output.replaceChildren();
    globalThis.CSS?.highlights?.delete('swap');
    rich = false;
    result = null;
    note = '';
    emptyState.hidden = false;
    for (const view of views) {
      view.anchor = null;
      view.top = 0;
    }
    tabs.select(ORIGINAL);
    source.focus();
    refresh();
    announce('Cleared.');
  }

  replaceButton.addEventListener('click', replace);
  copyButton.addEventListener('click', copyResult);
  $('#clear').addEventListener('click', clear);
  removeLinks.addEventListener('change', () => {
    markStale();
    refresh();
  });

  /* ---- the editor ------------------------------------------------------- */

  function rangeInEditor() {
    const selection = getSelection();
    if (selection.rangeCount) {
      const range = selection.getRangeAt(0);
      if (source.contains(range.startContainer) && source.contains(range.endContainer)) return range;
    }
    const end = document.createRange();
    end.selectNodeContents(source);
    end.collapse(false);
    return end;
  }

  function rangeAtPoint(x, y) {
    let range = null;
    if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(x, y);
      if (position) {
        range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
      }
    } else if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    }
    return range && source.contains(range.startContainer) ? range : null;
  }

  /** Scrolls the editor, and only the editor, so `node` is in view. */
  function revealInEditor(node) {
    const target = document.createRange();
    target.selectNode(node);
    const rect = target.getBoundingClientRect();
    const box = source.getBoundingClientRect();
    if (rect.bottom > box.bottom) source.scrollTop += rect.bottom - box.bottom + 16;
  }

  /** Puts clipboard or dropped content into the editor, cleaned. */
  function insert(data, range) {
    if (!data || !range) return;
    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    let fragment = html.trim() ? htmlToFragment(html) : null;
    let isRich = Boolean(fragment?.hasChildNodes());
    if (!isRich) fragment = text ? textToFragment(text) : null;
    if (!fragment?.hasChildNodes()) return;
    rich ||= isRich;

    range.deleteContents();
    const last = fragment.lastChild;
    range.insertNode(fragment);
    const caret = document.createRange();
    caret.setStartAfter(last);
    caret.collapse(true);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(caret);
    revealInEditor(last);
    source.dispatchEvent(new Event('input', { bubbles: true }));
  }

  source.addEventListener('paste', (event) => {
    event.preventDefault();
    insert(event.clipboardData, rangeInEditor());
  });
  source.addEventListener('drop', (event) => {
    event.preventDefault();
    insert(event.dataTransfer, rangeAtPoint(event.clientX, event.clientY) ?? rangeInEditor());
  });
  // Dragging text around inside the page would carry the theme's colors with it.
  for (const el of [source, output]) el.addEventListener('dragstart', (event) => event.preventDefault());

  source.addEventListener('input', () => {
    if (!hasText()) rich = false;
    markStale();
    refresh();
  });

  /** Copies (and cuts) write the markup as it is, not the page's computed colors. */
  function onCopy(event, root, cut) {
    const selection = getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const payload = payloadForRange(range, root, rich);
    event.preventDefault();
    event.clipboardData.setData('text/plain', payload.text);
    if (payload.html !== null) event.clipboardData.setData('text/html', payload.html);
    if (cut) {
      range.deleteContents();
      source.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  source.addEventListener('copy', (event) => onCopy(event, source, false));
  source.addEventListener('cut', (event) => onCopy(event, source, true));
  output.addEventListener('copy', (event) => onCopy(event, output, false));

  // A link in the result opens in a new tab, so following it never loses the text.
  output.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    event.preventDefault();
    window.open(link.href, '_blank', 'noopener,noreferrer');
  });

  refresh();

  return {
    replace,
    /** Call when the swap list changes. */
    pairsChanged() {
      markStale();
      refresh();
    },
    /** Whether a drop on `target` is one the editor will take. */
    acceptsDrop: (target) => source.contains(target),
  };
}
