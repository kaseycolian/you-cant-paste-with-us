// Holds the swap list, and keeps it in storage only while the person has asked
// for that. The storage object is passed in, so tests can use an in-memory one.
//
// Whether saving is on is not stored separately: it is on exactly when a saved
// list exists. So with saving off, nothing of this app's is left in storage,
// and a reload still knows which way the switch should be.

import { parsePairs, serializePairs } from './pairs.js';

/**
 * @typedef {{getItem(key: string): string | null, setItem(key: string, value: string): void,
 *            removeItem(key: string): void}} StorageLike
 * @typedef {'local' | 'external' | 'saving'} ChangeSource
 */

/**
 * @param {StorageLike} storage
 * @param {string} key
 */
export function createPairStore(storage, key) {
  const listeners = new Set();
  let saved = true;
  let persisting = readRaw() !== null;
  let pairs = persisting ? parsePairs(readRaw()) : [];

  function readRaw() {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function write() {
    try {
      storage.setItem(key, serializePairs(pairs));
      saved = true;
    } catch {
      saved = false;
    }
    return saved;
  }

  function erase() {
    try {
      storage.removeItem(key);
    } catch {
      // Nothing was stored, or storage is unavailable: either way nothing is kept.
    }
  }

  /** @param {ChangeSource} source */
  function emit(source) {
    for (const fn of listeners) fn(source);
  }

  return {
    get: () => pairs,
    /** Replace the list, save it if saving is on, and tell subscribers. */
    set(next) {
      pairs = next;
      if (persisting) write();
      emit('local');
    },
    isPersisting: () => persisting,
    /**
     * Turning saving on writes the whole list now. Turning it off deletes the
     * saved copy; the list itself stays in memory.
     * @param {boolean} on
     * @returns {boolean} whether the list is now being saved
     */
    setPersisting(on) {
      if (on) {
        persisting = write();
        if (!persisting) erase();
      } else {
        persisting = false;
        saved = true;
        erase();
      }
      emit('saving');
      return persisting;
    },
    /** Another tab changed storage: follow it. If it turned saving off, keep this tab's list. */
    reload() {
      const raw = readRaw();
      persisting = raw !== null;
      if (persisting) pairs = parsePairs(raw);
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
    removeItem: (k) => data.delete(k),
  };
}

/**
 * localStorage when the browser allows it, otherwise memory.
 * @returns {{storage: StorageLike, available: boolean}} available is false when
 *   nothing can outlive the tab
 */
export function pickStorage() {
  try {
    const probe = '__text-replacer-probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return { storage: window.localStorage, available: true };
  } catch {
    return { storage: memoryStorage(), available: false };
  }
}
