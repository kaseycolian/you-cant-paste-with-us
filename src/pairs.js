// Pure operations on the swap list. Every function returns a new array and
// leaves its input alone, so callers can hand the result straight to the store.

import { sameKeyForm } from './text-rules.js';

const FORMAT_VERSION = 1;

/** @typedef {import('./matcher.js').Pair} Pair */

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The message to show for a Find value, or '' when it is fine.
 * @param {Pair[]} pairs
 * @param {string} find
 * @param {string} [exceptId] the pair being edited, which may keep its own key
 */
export function validateFind(pairs, find, exceptId) {
  const form = sameKeyForm(find);
  if (!form) return 'Enter the text to find.';
  const clash = pairs.find((p) => p.id !== exceptId && sameKeyForm(p.find) === form);
  return clash ? `“${clash.find}” is already on your list.` : '';
}

/** Adds a pair, switched on, at the top of the list. */
export function addPair(pairs, find, replace) {
  return [{ id: newId(), find: find.trim(), replace: replace.trim(), on: true }, ...pairs];
}

export function updatePair(pairs, id, changes) {
  return pairs.map((p) => (p.id === id ? { ...p, ...changes } : p));
}

/** @returns {{pairs: Pair[], removed: Pair | undefined, index: number}} */
export function removePair(pairs, id) {
  const index = pairs.findIndex((p) => p.id === id);
  if (index === -1) return { pairs, removed: undefined, index };
  return { pairs: pairs.filter((p) => p.id !== id), removed: pairs[index], index };
}

export function setAllOn(pairs, on) {
  return pairs.map((p) => (p.on === on ? p : { ...p, on }));
}

export function serializePairs(pairs) {
  return JSON.stringify({ version: FORMAT_VERSION, pairs });
}

function isPair(p) {
  return (
    p !== null &&
    typeof p === 'object' &&
    typeof p.id === 'string' &&
    p.id !== '' &&
    typeof p.find === 'string' &&
    p.find.trim() !== '' &&
    typeof p.replace === 'string' &&
    typeof p.on === 'boolean'
  );
}

/**
 * Reads what serializePairs wrote. Anything unreadable yields an empty list
 * rather than an error, and malformed entries are dropped one by one.
 * @param {string | null} json
 * @returns {Pair[]}
 */
export function parsePairs(json) {
  if (!json) return [];
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  const list = Array.isArray(data?.pairs) ? data.pairs : [];
  const seen = new Set();
  return list.filter((p) => isPair(p) && !seen.has(p.id) && seen.add(p.id));
}
