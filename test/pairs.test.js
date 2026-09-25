import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addPair, parsePairs, removePair, serializePairs, setAllOn, updatePair, validateFind,
} from '../src/pairs.js';
import { createPairStore, memoryStorage } from '../src/pair-store.js';

const sample = () => [
  { id: 'a', find: 'Acme', replace: 'Company A', on: true },
  { id: 'b', find: 'O’Brien', replace: 'Person', on: false },
];

test('validateFind asks for text when Find is empty', () => {
  assert.equal(validateFind([], '   '), 'Enter the text to find.');
  assert.equal(validateFind([], '​'), 'Enter the text to find.');
});

test('validateFind rejects a duplicate in any case or quote style', () => {
  assert.equal(validateFind(sample(), 'acme'), '“Acme” is already on your list.');
  assert.equal(validateFind(sample(), "o'brien"), '“O’Brien” is already on your list.');
  assert.equal(validateFind(sample(), 'Acme  '), '“Acme” is already on your list.');
});

test('validateFind lets a pair keep its own key while editing', () => {
  assert.equal(validateFind(sample(), 'ACME', 'a'), '');
});

test('addPair trims, switches the pair on and puts it first', () => {
  const next = addPair(sample(), '  Globex ', ' G ');
  assert.equal(next.length, 3);
  assert.deepEqual({ ...next[0], id: undefined }, { id: undefined, find: 'Globex', replace: 'G', on: true });
  assert.equal(typeof next[0].id, 'string');
});

test('updatePair changes only the named pair', () => {
  const list = sample();
  const next = updatePair(list, 'b', { on: true });
  assert.equal(next[1].on, true);
  assert.equal(next[0], list[0]);
  assert.equal(list[1].on, false);
});

test('removePair drops the pair and says which one and where', () => {
  const list = sample();
  const { pairs, removed, index } = removePair(list, 'a');
  assert.deepEqual(pairs.map((p) => p.id), ['b']);
  assert.equal(removed.id, 'a');
  assert.equal(index, 0);
});

test('removePair on a missing id changes nothing', () => {
  const list = sample();
  assert.equal(removePair(list, 'zzz').pairs, list);
});

test('setAllOn switches every pair', () => {
  assert.ok(setAllOn(sample(), true).every((p) => p.on));
  assert.ok(setAllOn(sample(), false).every((p) => !p.on));
});

test('serialize and parse round-trip', () => {
  assert.deepEqual(parsePairs(serializePairs(sample())), sample());
});

test('parsePairs survives garbage and drops malformed entries', () => {
  assert.deepEqual(parsePairs(null), []);
  assert.deepEqual(parsePairs('not json'), []);
  assert.deepEqual(parsePairs('{"pairs": "nope"}'), []);
  const mixed = JSON.stringify({
    version: 1,
    pairs: [
      sample()[0],
      { id: 'x', find: '', replace: 'y', on: true },
      { id: 'y', find: 'ok', replace: 3, on: true },
      { find: 'no id', replace: '', on: true },
      sample()[0],
    ],
  });
  assert.deepEqual(parsePairs(mixed), [sample()[0]]);
});

test('saving is off by default, and nothing is written', () => {
  const storage = memoryStorage();
  const store = createPairStore(storage, 'k');
  assert.equal(store.isPersisting(), false);
  store.set(sample());
  assert.equal(storage.getItem('k'), null);
  assert.deepEqual(store.get(), sample());
});

test('turning saving on writes everything, off deletes it, on again writes it back', () => {
  const storage = memoryStorage();
  const store = createPairStore(storage, 'k');
  const heard = [];
  store.subscribe((source) => heard.push(source));
  store.set(sample());

  assert.equal(store.setPersisting(true), true);
  assert.deepEqual(parsePairs(storage.getItem('k')), sample());
  store.set([sample()[0]]);
  assert.deepEqual(parsePairs(storage.getItem('k')), [sample()[0]]);

  assert.equal(store.setPersisting(false), false);
  assert.equal(storage.getItem('k'), null);
  assert.deepEqual(store.get(), [sample()[0]], 'the list stays in memory');
  store.set(sample());
  assert.equal(storage.getItem('k'), null, 'and nothing is written while off');

  store.setPersisting(true);
  assert.deepEqual(parsePairs(storage.getItem('k')), sample());
  assert.deepEqual(heard, ['local', 'saving', 'local', 'saving', 'local', 'saving']);
});

test('a saved list comes back on the next visit, with saving on', () => {
  const storage = memoryStorage();
  storage.setItem('k', serializePairs(sample()));
  const store = createPairStore(storage, 'k');
  assert.equal(store.isPersisting(), true);
  assert.deepEqual(store.get(), sample());
});

test('reload follows another tab, and keeps this tab\'s list if that tab turned saving off', () => {
  const storage = memoryStorage();
  const store = createPairStore(storage, 'k');
  store.set(sample());
  storage.setItem('k', serializePairs([sample()[1]]));
  store.reload();
  assert.equal(store.isPersisting(), true);
  assert.deepEqual(store.get(), [sample()[1]]);
  storage.removeItem('k');
  store.reload();
  assert.equal(store.isPersisting(), false);
  assert.deepEqual(store.get(), [sample()[1]]);
});

test('if storage refuses to save, saving stays off and the list keeps working', () => {
  const refusing = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  const store = createPairStore(refusing, 'k');
  store.set(sample());
  assert.equal(store.setPersisting(true), false);
  assert.equal(store.isPersisting(), false);
  assert.equal(store.isSaved(), false);
  assert.deepEqual(store.get(), sample());
});
