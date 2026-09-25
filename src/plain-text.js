// The plain-text version of a tree, for the text/plain half of a copy.
//
// Works from the markup alone, so it gives the same answer whether or not the
// tree is on screen (innerText of a hidden panel loses every line break).
// Whitespace is collapsed the way a browser would render it, except where the
// element keeps its spacing (a <pre>, or white-space: pre / pre-wrap).

import { BLOCK_TAGS } from './text-rules.js';

const KEEPS_SPACING = /^(?:pre|pre-wrap|pre-line|break-spaces)$/;

function keepsSpacing(el) {
  return el.tagName === 'PRE' || KEEPS_SPACING.test(el.style?.whiteSpace ?? '');
}

/**
 * @param {Node} root
 * @returns {string}
 */
export function toPlainText(root) {
  let out = '';
  const endsLine = () => out === '' || out.endsWith('\n');
  const newline = () => {
    if (!endsLine()) out += '\n';
  };

  function walk(node, preserve) {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (preserve) {
          out += child.data;
        } else {
          let text = child.data.replace(/[ \t\n\r\f]+/g, ' ');
          if (endsLine() || out.endsWith(' ')) text = text.replace(/^ /, '');
          out += text;
        }
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const tag = child.tagName;
      if (tag === 'BR') {
        out = out.replace(/ $/, '') + '\n';
        continue;
      }
      if (tag === 'IMG') continue;

      const cell = tag === 'TD' || tag === 'TH';
      const block = BLOCK_TAGS.has(tag) && !cell;
      if (block) newline();
      walk(child, preserve || keepsSpacing(child));
      if (cell) out = out.replace(/ $/, '') + '\t';
      else if (block) {
        out = out.replace(/ $/, '');
        newline();
      }
    }
  }

  walk(root, root.nodeType === Node.ELEMENT_NODE && keepsSpacing(root));
  return out
    .replace(/\t\n/g, '\n')
    .replace(/ /g, ' ')
    .replace(/\n+$/, '');
}
