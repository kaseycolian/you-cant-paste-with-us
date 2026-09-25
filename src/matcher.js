// Finds every enabled key in a piece of text. Pure: no DOM, no storage.
//
// Matching is case-insensitive and ignores the differences a copy-paste
// introduces: curly vs straight quotes, hyphen look-alikes, invisible characters
// inside a word, any run of spaces (including a non-breaking one) or a single
// line wrap between words, and composed vs decomposed accents. The search runs
// on the "view" from text-rules.js, which is where those differences are erased.

import { buildView, canonicalKey, sameKeyForm } from './text-rules.js';

const SYNTAX = /[\\^$.*+?()[\]{}|/]/g;
// Keys per regular expression. One expression for every key hits the engine's
// size limit somewhere past a few thousand keys, so they are split into groups
// and findMatches merges the groups' results.
const GROUP_SIZE = 1000;

const escape = (text) => text.replace(SYNTAX, '\\$&');

/**
 * @typedef {{id: string, find: string, replace: string, on: boolean}} Pair
 * @typedef {{regexes: RegExp[], pairFor: (matched: string) => Pair | undefined}} Matcher
 */

/**
 * @param {Pair[]} pairs
 * @returns {Matcher | null} null when no pair is on
 */
export function createMatcher(pairs) {
  const alternatives = [];
  const byForm = new Map();

  for (const pair of pairs) {
    if (!pair.on) continue;
    const key = canonicalKey(pair.find);
    if (!key) continue;
    const form = sameKeyForm(key);
    if (!byForm.has(form)) byForm.set(form, pair);
    for (const variant of new Set([key.normalize('NFC'), key.normalize('NFD')])) {
      alternatives.push({ variant, pair });
    }
  }
  if (!alternatives.length) return null;

  // Longest first, so "Acme Corp" wins over "Acme" where both would match. The
  // sort is stable, so equal lengths keep list order.
  alternatives.sort((a, b) => b.variant.length - a.variant.length);
  const regexes = [];
  for (let i = 0; i < alternatives.length; i += GROUP_SIZE) {
    const group = alternatives.slice(i, i + GROUP_SIZE);
    regexes.push(new RegExp(group.map((a) => escape(a.variant)).join('|'), 'giu'));
  }

  // The fast path is a lookup by canonical form. Case folding in a regex and
  // toLowerCase() can disagree on rare letters, so fall back to asking each key.
  let exact = null;
  function pairFor(matched) {
    const hit = byForm.get(sameKeyForm(matched));
    if (hit) return hit;
    exact ??= alternatives.map((a) => ({ pair: a.pair, test: new RegExp(`^(?:${escape(a.variant)})$`, 'iu') }));
    return exact.find((e) => e.test.test(matched))?.pair;
  }

  return { regexes, pairFor };
}

/**
 * The leftmost match, and the longest one where several start at the same
 * place — what a single expression holding every key would find.
 * @param {string} text
 * @param {Matcher | null} matcher
 * @returns {{start: number, end: number, value: string, id: string}[]}
 *   offsets into `text`, in order, never overlapping
 */
export function findMatches(text, matcher) {
  if (!matcher || !text) return [];
  const { view, map } = buildView(text);
  const { regexes } = matcher;
  const nextFrom = (regex, from) => {
    regex.lastIndex = from;
    return regex.exec(view);
  };

  const heads = regexes.map((regex) => nextFrom(regex, 0));
  const found = [];
  for (;;) {
    let best = null;
    for (const m of heads) {
      if (m && (!best || m.index < best.index || (m.index === best.index && m[0].length > best[0].length))) best = m;
    }
    if (!best) break;

    const pair = matcher.pairFor(best[0]);
    if (pair) {
      found.push({
        start: map[best.index],
        end: map[best.index + best[0].length - 1] + 1,
        value: pair.replace,
        id: pair.id,
      });
    }
    // Every group whose next match overlaps this one searches again from its end.
    const resume = best.index + best[0].length;
    heads.forEach((m, i) => {
      if (m && m.index < resume) heads[i] = nextFrom(regexes[i], resume);
    });
  }
  return found;
}

/**
 * @param {string} text
 * @param {Matcher | null} matcher
 * @returns {{text: string, matches: ReturnType<typeof findMatches>}}
 */
export function replaceText(text, matcher) {
  const matches = findMatches(text, matcher);
  let out = '';
  let pos = 0;
  for (const m of matches) {
    out += text.slice(pos, m.start) + m.value;
    pos = m.end;
  }
  return { text: out + text.slice(pos), matches };
}
