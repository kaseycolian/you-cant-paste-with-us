// Replaces keys inside a DOM tree without disturbing its formatting.
//
// Text is searched a "run" at a time: every text node between two block
// boundaries, joined. So a name split across tags (Ac<b>me</b>) is still found,
// and a match never joins the end of one paragraph to the start of the next.

import { BLOCK_TAGS } from './text-rules.js';
import { findMatches, replaceText } from './matcher.js';
import { safeHref } from './sanitize.js';

/** Attributes whose values leave with a copy, so they are searched too. */
const SEARCHED_ATTRS = ['href', 'alt', 'style'];

function nearestBlock(node, root) {
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
    if (BLOCK_TAGS.has(el.tagName)) return el;
  }
  return root;
}

/** Groups the tree's text nodes into runs, in document order. */
function textRuns(root) {
  const runs = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let run = [];
  let block = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (BLOCK_TAGS.has(node.tagName) && run.length) {
        runs.push(run);
        run = [];
      }
      continue;
    }
    const owner = nearestBlock(node, root);
    if (run.length && owner !== block) {
      runs.push(run);
      run = [];
    }
    block = owner;
    run.push(node);
  }
  if (run.length) runs.push(run);
  return runs;
}

/**
 * Rewrites a run's text nodes. A match's value goes into the node where the
 * match starts; the rest of the match is removed from the nodes after it.
 */
function rewriteRun(nodes, matches, result) {
  let offset = 0;
  let i = 0;
  for (const node of nodes) {
    const text = node.data;
    const start = offset;
    const end = offset + text.length;
    let out = '';
    let pos = start;
    while (i < matches.length && matches[i].start < end) {
      const m = matches[i];
      if (m.start >= start) {
        out += text.slice(pos - start, m.start - start);
        result.marks.push({ node, start: out.length, end: out.length + m.value.length });
        out += m.value;
      }
      pos = Math.min(m.end, end);
      if (m.end > end) break; // it carries on into the next node
      i++;
    }
    out += text.slice(pos - start);
    if (out !== text) node.data = out;
    offset = end;
  }
}

function count(result, matches) {
  result.count += matches.length;
  for (const m of matches) result.usedIds.add(m.id);
}

function replaceAttributes(el, matcher, result) {
  for (const name of SEARCHED_ATTRS) {
    const value = el.getAttribute(name);
    if (value === null) continue;
    const { text, matches } = replaceText(value, matcher);
    if (!matches.length) continue;
    count(result, matches);
    if (name !== 'href') {
      el.setAttribute(name, text);
      continue;
    }
    // A replacement could turn an address into something unsafe, so check again.
    const href = safeHref(text);
    if (href) el.setAttribute('href', href);
    else el.removeAttribute('href');
  }
}

/**
 * @param {Element} root the tree to rewrite, in place
 * @param {import('./matcher.js').Matcher | null} matcher
 * @param {{removeLinks?: boolean}} [options] removeLinks keeps each link's text
 *   and drops its address
 * @returns {{count: number, usedIds: Set<string>, marks: {node: Text, start: number, end: number}[],
 *            links: number, images: number}}
 */
export function replaceInTree(root, matcher, { removeLinks = false } = {}) {
  const result = { count: 0, usedIds: new Set(), marks: [], links: 0, images: 0 };

  if (removeLinks) {
    for (const a of root.querySelectorAll('a')) a.replaceWith(...a.childNodes);
  }

  for (const run of textRuns(root)) {
    const matches = findMatches(run.map((n) => n.data).join(''), matcher);
    if (!matches.length) continue;
    count(result, matches);
    rewriteRun(run, matches, result);
  }

  for (const el of root.querySelectorAll(SEARCHED_ATTRS.map((a) => `[${a}]`).join(','))) {
    replaceAttributes(el, matcher, result);
  }

  result.links = root.querySelectorAll('a[href]').length;
  result.images = root.querySelectorAll('img').length;
  return result;
}
