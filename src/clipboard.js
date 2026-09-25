// Writing to the clipboard, with the formats spelled out rather than left to the
// browser. A browser's own copy bakes in the page's computed colors, which here
// are the theme's, so light text from a dark theme would paste invisibly.

import { toPlainText } from './plain-text.js';

/**
 * @typedef {{html: string | null, text: string}} Payload html is null for plain-only
 * @typedef {'rich' | 'plain' | 'failed'} CopyOutcome
 */

function payloadOutcome(payload) {
  return payload.html === null ? 'plain' : 'rich';
}

/** Copy through a one-off copy event, for browsers without ClipboardItem. */
function copyByCommand(payload) {
  const onCopy = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.clipboardData.setData('text/plain', payload.text);
    if (payload.html !== null) event.clipboardData.setData('text/html', payload.html);
  };
  document.addEventListener('copy', onCopy, { capture: true });
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  document.removeEventListener('copy', onCopy, { capture: true });
  return copied;
}

/**
 * Must be called straight from the click handler: Safari only accepts a
 * ClipboardItem created while the click is still being handled.
 * @param {Payload} payload
 * @returns {Promise<CopyOutcome>}
 */
export async function writeClipboard(payload) {
  if (typeof ClipboardItem === 'function' && navigator.clipboard?.write) {
    const items = { 'text/plain': new Blob([payload.text], { type: 'text/plain' }) };
    if (payload.html !== null) items['text/html'] = new Blob([payload.html], { type: 'text/html' });
    try {
      await navigator.clipboard.write([new ClipboardItem(items)]);
      return payloadOutcome(payload);
    } catch {
      // Fall through to the older route.
    }
  }
  return copyByCommand(payload) ? payloadOutcome(payload) : 'failed';
}

/**
 * The payload for a whole tree.
 * @param {Element} root
 * @param {boolean} rich false when every bit of it was pasted as plain text
 * @returns {Payload}
 */
export function payloadFor(root, rich) {
  return { html: rich ? root.innerHTML : null, text: toPlainText(root) };
}

/**
 * The payload for the current selection inside `root`, wrapped in copies of the
 * elements around it so a word selected inside <b> is still bold.
 * @param {Range} range
 * @param {Element} root
 * @param {boolean} rich
 * @returns {Payload}
 */
export function payloadForRange(range, root, rich) {
  let content = range.cloneContents();
  let el = range.commonAncestorContainer;
  if (el.nodeType !== Node.ELEMENT_NODE) el = el.parentElement;
  for (; el && el !== root && root.contains(el); el = el.parentElement) {
    const shell = el.cloneNode(false);
    shell.append(content);
    content = shell;
  }
  const box = document.createElement('div');
  box.append(content);
  return payloadFor(box, rich);
}

/** Selects everything in `root`, for a person to copy with the keyboard. */
export function selectAll(root) {
  const range = document.createRange();
  range.selectNodeContents(root);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}
