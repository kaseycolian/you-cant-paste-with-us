// Character rules shared by the matcher, the DOM rewriter and the plain-text writer.

/** Elements that start a new line of text. A match never runs across one. */
export const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'CAPTION', 'DD', 'DETAILS', 'DIV', 'DL',
  'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5',
  'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE',
  'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);

/** Characters that render as nothing but can sit inside a name: soft hyphen,
    zero-width spaces and joiners, bidi marks, word joiner, byte-order mark. */
const INVISIBLE = /[­​-‏‪-‮⁠-⁤⁦-⁯﻿]/;

/** Look-alikes folded to one character, so O’Brien matches O'Brien. Each is a
    single code unit mapped to a single code unit, so text offsets survive. */
const FOLD = {
  '‘': "'", '’': "'", '‛': "'", 'ʼ': "'",
  '“': '"', '”': '"',
  '‐': '-', '‑': '-', '‒': '-', '–': '-',
};

const SPACE = /\s/;

/**
 * The text the matcher actually searches, plus where each of its characters
 * came from: `map[i]` is the index in `text` of `view[i]`.
 *
 * Look-alikes are folded and invisible characters dropped. Every run of
 * whitespace becomes one space, so "Acme Corp" also finds "Acme  Corp", a
 * non-breaking space, or a single line wrap; a run holding a blank line becomes
 * "\n" instead, which no key contains, so a match never joins two paragraphs.
 * @param {string} text
 * @returns {{view: string, map: number[]}}
 */
export function buildView(text) {
  const chars = [];
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (INVISIBLE.test(ch)) continue;
    if (SPACE.test(ch)) {
      let end = i;
      let breaks = 0;
      while (end < text.length && (SPACE.test(text[end]) || INVISIBLE.test(text[end]))) {
        if (text[end] === '\n') breaks++;
        end++;
      }
      chars.push(breaks > 1 ? '\n' : ' ');
      map.push(i);
      i = end - 1;
      continue;
    }
    chars.push(FOLD[ch] ?? ch);
    map.push(i);
  }
  return { view: chars.join(''), map };
}

/** A key reduced to the form every comparison uses: folded, invisible
    characters removed, whitespace collapsed, trimmed. */
export function canonicalKey(text) {
  return buildView(String(text)).view.replace(/\s+/g, ' ').trim();
}

/** Canonical and case-free, for "is this the same key?" questions. */
export function sameKeyForm(text) {
  return canonicalKey(text).normalize('NFC').toLowerCase();
}
