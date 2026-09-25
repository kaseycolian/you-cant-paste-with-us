// Holds the swap list and keeps it in storage. The storage object is passed in,
// so tests can use a plain in-memory one.

import { parsePairs, serializePairs } from './pairs.js';

/** @typedef {{getItem(key: string): string | null, setItem(key: string, value: string): void}} StorageLike */
/** @typedef {'local' | 'external'} ChangeSource */

/**
 * @param {StorageLike} storage
 * @param {string} key
 */
export function createPairStore(storage, key) {
  const listeners = new Set();
  let saved = true;
  let pairs = read();

  function read() {
    try {
      return parsePairs(storage.getItem(key));
    } catch {
      return [];
    }
  }

  function write() {
    try {
      storage.setItem(key, serializePairs(pairs));
      saved = true;
    } catch {
      saved = false;
    }
  }

  /** @param {ChangeSource} source */
  function emit(source) {
    for (const fn of listeners) fn(source);
  }

  return {
    get: () => pairs,
    /** Replace the list, save it, and tell subscribers. */
    set(next) {
      pairs = next;
      write();
      emit('local');
    },
    /** Re-read storage after another tab changed it. */
    reload() {
      pairs = read();
      emit('external');
    },
    /** False when the last save failed (quota, or storage blocked). */
    isSaved: () => saved,
    /** @param {(source: ChangeSource) => void} fn @returns {() => void} unsubscribe */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** A StorageLike that lives only as long as the page. */
export function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
}

/**
 * localStorage when the browser allows it, otherwise memory.
 * @returns {{storage: StorageLike, persistent: boolean}}
 */
export function pickStorage() {
  try {
    const probe = '__text-replacer-probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return { storage: window.localStorage, persistent: true };
  } catch {
    return { storage: memoryStorage(), persistent: false };
  }
}
