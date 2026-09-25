import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatcher, findMatches, replaceText } from '../src/matcher.js';

let nextId = 0;
const pair = (find, replace, on = true) => ({ id: `p${++nextId}`, find, replace, on });
const run = (pairs, text) => replaceText(text, createMatcher(pairs)).text;

test('matching ignores case', () => {
  assert.equal(run([pair('Acme', 'Company A')], 'ACME, acme and AcMe'), 'Company A, Company A and Company A');
});

test('keys also match inside longer words', () => {
  assert.equal(run([pair('acme', 'co')], 'AcmeCorp and acme.com'), 'coCorp and co.com');
});

test('the longest key wins where two overlap', () => {
  const pairs = [pair('Acme', 'A'), pair('Acme Corp', 'B')];
  assert.equal(run(pairs, 'Acme Corp and Acme'), 'B and A');
});

test('longest is measured after whitespace is collapsed', () => {
  const pairs = [pair('a    b', 'X'), pair('a bc', 'Y')];
  assert.equal(run(pairs, 'a bc'), 'Y');
});

test('regex syntax in a key is literal', () => {
  const pairs = [pair('C++', 'lang'), pair('a.b', 'dot'), pair('(x)', 'paren'), pair('a-b', 'dash'), pair('$5/mo', 'price')];
  assert.equal(run(pairs, 'C++ a.b axb (x) a-b $5/mo'), 'lang dot axb paren dash price');
});

test('spaces in a key match any run of spaces, a non-breaking space, or one line wrap', () => {
  const pairs = [pair('Acme Corp', 'X')];
  assert.equal(run(pairs, 'Acme   Corp'), 'X');
  assert.equal(run(pairs, 'Acme Corp'), 'X');
  assert.equal(run(pairs, 'Acme\n  Corp'), 'X');
  assert.equal(run(pairs, 'Acme\r\nCorp'), 'X');
});

test('a key never spans a blank line', () => {
  assert.equal(run([pair('Acme Corp', 'X')], 'Acme\n\nCorp'), 'Acme\n\nCorp');
});

test('curly and straight apostrophes are the same character', () => {
  assert.equal(run([pair("O'Brien", 'Person')], 'Hi O’Brien'), 'Hi Person');
  assert.equal(run([pair('O’Brien', 'Person')], "Hi O'Brien"), 'Hi Person');
  assert.equal(run([pair('"Acme"', 'X')], 'the “Acme” deal'), 'the X deal');
});

test('hyphen look-alikes match a plain hyphen', () => {
  assert.equal(run([pair('Jean-Luc', 'Person')], 'Jean‑Luc'), 'Person');
  assert.equal(run([pair('2020-2021', 'then')], '2020–2021'), 'then');
});

test('invisible characters inside a name do not hide it', () => {
  const pairs = [pair('Acme', 'X')];
  assert.equal(run(pairs, 'Ac­me'), 'X');
  assert.equal(run(pairs, 'A​cme'), 'X');
  assert.equal(run(pairs, 'Ac‎me'), 'X');
  // An invisible character just outside the match is left alone.
  assert.equal(run(pairs, '​Acme​'), '​X​');
});

test('composed and decomposed accents match each other, in any case', () => {
  const composed = 'José';
  const decomposed = 'José';
  assert.equal(run([pair(composed, 'P')], `${decomposed} and JOSÉ`), 'P and P');
  assert.equal(run([pair(decomposed, 'P')], composed), 'P');
});

test('switched-off pairs are ignored', () => {
  assert.equal(run([pair('Acme', 'X', false)], 'Acme'), 'Acme');
  assert.equal(createMatcher([pair('Acme', 'X', false)]), null);
});

test('empty and whitespace-only keys are dropped', () => {
  assert.equal(createMatcher([pair('', 'X'), pair('   ', 'Y'), pair('​', 'Z')]), null);
  assert.equal(run([pair(' ', 'X'), pair('b', 'B')], 'a b'), 'a B');
});

test('an empty value deletes the match', () => {
  assert.equal(run([pair('secret', '')], 'top-secret plan'), 'top- plan');
});

test('keys are trimmed, so the spaces around a deleted word stay', () => {
  assert.equal(run([pair(' secret ', '')], 'a secret thing'), 'a  thing');
});

test('split groups still find the leftmost, longest match', () => {
  // More keys than one group holds, with the overlapping pair in different groups.
  const filler = Array.from({ length: 1500 }, (_, i) => pair(`filler-${i}-xxxxxxxxxxxxxxxxxxxx`, 'F'));
  const pairs = [...filler, pair('ab', 'SHORT'), pair('abc', 'LONG'), pair('bcd', 'MID')];
  assert.equal(run(pairs, 'abcd'), 'LONGd');
  assert.equal(run(pairs, 'xbcd abc'), 'xMID LONG');
});

test('replacements are never replaced again', () => {
  const pairs = [pair('Alice', 'Bob'), pair('Bob', 'Carol')];
  assert.equal(run(pairs, 'Alice and Bob'), 'Bob and Carol');
});

test('findMatches reports offsets in the original text and the pair used', () => {
  const p = pair('acme', 'X');
  const matches = findMatches('Hi Ac­me!', createMatcher([p]));
  assert.deepEqual(matches, [{ start: 3, end: 8, value: 'X', id: p.id }]);
});

test('no matcher or no text finds nothing', () => {
  assert.deepEqual(findMatches('Acme', null), []);
  assert.deepEqual(findMatches('', createMatcher([pair('Acme', 'X')])), []);
});

test('ten thousand keys build and search quickly', () => {
  const pairs = Array.from({ length: 10000 }, (_, i) => pair(`Person Number ${i}`, `P${i}`));
  const started = performance.now();
  const matcher = createMatcher(pairs);
  const text = 'Hello Person Number 9999 and person number 42. '.repeat(200);
  const { matches } = replaceText(text, matcher);
  const elapsed = performance.now() - started;
  assert.equal(matches.length, 400);
  assert.equal(matches[0].value, 'P9999');
  assert.ok(elapsed < 3000, `took ${Math.round(elapsed)}ms`);
});
