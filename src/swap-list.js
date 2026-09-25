// The swap list card: the add form, the rows, editing, deleting and undo.

import { addPair, removePair, restorePair, setAllOn, updatePair, validateFind } from './pairs.js';

/**
 * @param {HTMLElement} section
 * @param {object} deps
 * @param {ReturnType<typeof import('./pair-store.js').createPairStore>} deps.store
 * @param {(text: string) => void} deps.announce
 */
export function createSwapList(section, { store, announce }) {
  const $ = (selector) => section.querySelector(selector);
  const form = $('#add-form');
  const findInput = $('#add-find');
  const replaceInput = $('#add-replace');
  const findField = window.AC.createField($('#add-find-field'));
  window.AC.createField($('#add-replace-field'));
  const list = $('#swap-list');
  const useAll = $('#use-all');
  const countText = $('#list-count');
  const undoZone = $('#undo-zone');
  const undoText = $('#undo-text');
  const undoButton = $('#undo');
  const emptyList = $('#empty-list');
  const storageNote = $('#storage-note');
  const rowTemplate = document.getElementById('swap-row');
  const editorTemplate = document.getElementById('swap-editor');

  /** Each pair's <li>, reused between renders so focus stays where it is. */
  const rows = new Map();
  let editingId = null;
  let lastDeleted = null; // { pair, index }

  /* ---- rendering -------------------------------------------------------- */

  function fillRow(li, pair) {
    li.dataset.id = pair.id;
    li.classList.toggle('is-off', !pair.on);
    const toggle = li.querySelector('.swap-toggle');
    toggle.id = `swap-${pair.id}`;
    toggle.checked = pair.on;
    li.querySelector('.swap-label').htmlFor = toggle.id;
    li.querySelector('.swap-find').textContent = pair.find;
    const removes = pair.replace === '';
    const value = li.querySelector('.swap-value');
    value.textContent = removes ? 'removed' : pair.replace;
    value.classList.toggle('is-empty', removes);
    li.querySelector('.swap-joiner').textContent = removes ? ' gets ' : ' becomes ';
    li.querySelector('.swap-edit').setAttribute('aria-label', `Edit ${pair.find}`);
    li.querySelector('.swap-delete').setAttribute('aria-label', `Delete ${pair.find}`);
  }

  function buildEditor(pair) {
    const li = editorTemplate.content.firstElementChild.cloneNode(true);
    li.dataset.id = pair.id;
    const base = `edit-${pair.id}`;
    const find = li.querySelector('.edit-find');
    const replace = li.querySelector('.edit-replace');
    find.id = `${base}-find`;
    replace.id = `${base}-replace`;
    li.querySelector('.edit-find-label').htmlFor = find.id;
    li.querySelector('.edit-replace-label').htmlFor = replace.id;
    li.querySelector('.edit-find-field').id = `${base}-find-field`;
    li.querySelector('.edit-replace-field').id = `${base}-replace-field`;
    find.value = pair.find;
    replace.value = pair.replace;
    const field = window.AC.createField(li.querySelector('.edit-find-field'));
    window.AC.createField(li.querySelector('.edit-replace-field'));

    li.querySelector('.edit-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const error = validateFind(store.get(), find.value, pair.id);
      if (error) {
        field.setError(error);
        find.focus();
        return;
      }
      clearUndo();
      editingId = null;
      store.set(updatePair(store.get(), pair.id, { find: find.value.trim(), replace: replace.value.trim() }));
      focusRow(pair.id, '.swap-edit');
      announce(`Saved ${find.value.trim()}.`);
    });
    li.querySelector('.edit-cancel').addEventListener('click', () => closeEditor(pair.id));
    li.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeEditor(pair.id);
    });
    find.addEventListener('input', () => {
      if (field.isInvalid() && !validateFind(store.get(), find.value, pair.id)) field.clearError();
    });
    return li;
  }

  function render() {
    const pairs = store.get();
    const ids = new Set(pairs.map((p) => p.id));
    const focusWasInList = list.contains(document.activeElement);
    if (editingId && !ids.has(editingId)) editingId = null;

    for (const [id, li] of rows) {
      if (!ids.has(id)) {
        li.remove();
        rows.delete(id);
      }
    }
    pairs.forEach((pair, index) => {
      const editing = pair.id === editingId;
      let li = rows.get(pair.id);
      if (!li || li.classList.contains('is-editing') !== editing) {
        li?.remove();
        li = editing ? buildEditor(pair) : rowTemplate.content.firstElementChild.cloneNode(true);
        rows.set(pair.id, li);
      }
      if (!editing) fillRow(li, pair);
      // Only move a row that is out of place: moving a focused element blurs it.
      if (list.children[index] !== li) list.insertBefore(li, list.children[index] ?? null);
    });

    const on = pairs.filter((p) => p.on).length;
    useAll.checked = pairs.length > 0 && on === pairs.length;
    useAll.indeterminate = on > 0 && on < pairs.length;
    useAll.disabled = pairs.length === 0;
    countText.textContent = pairs.length ? `${on} of ${pairs.length} on` : '';
    emptyList.hidden = pairs.length > 0;
    storageNote.hidden = store.isSaved();

    // If the focused row vanished (another tab deleted it), land somewhere sensible.
    if (focusWasInList && !list.contains(document.activeElement)) findInput.focus();
  }

  function focusRow(id, selector) {
    const target = rows.get(id)?.querySelector(selector);
    target?.focus();
    return Boolean(target);
  }

  /* ---- actions ---------------------------------------------------------- */

  function openEditor(id) {
    editingId = id; // one at a time: opening another closes the first unsaved
    render();
    rows.get(id)?.querySelector('.edit-find')?.focus();
  }

  function closeEditor(id) {
    editingId = null;
    render();
    focusRow(id, '.swap-edit');
  }

  function showUndo(find) {
    undoText.textContent = `Deleted “${find}”.`;
    undoZone.hidden = false;
    countText.hidden = true;
  }

  function clearUndo() {
    lastDeleted = null;
    undoZone.hidden = true;
    undoText.textContent = '';
    countText.hidden = false;
  }

  function remove(id) {
    const pairs = store.get();
    const { pairs: rest, removed, index } = removePair(pairs, id);
    if (!removed) return;
    const neighbour = pairs[index + 1]?.id ?? pairs[index - 1]?.id;
    lastDeleted = { pair: removed, index };
    store.set(rest);
    showUndo(removed.find);
    if (!(neighbour && focusRow(neighbour, '.swap-toggle'))) findInput.focus();
    announce(`Deleted ${removed.find}. Undo is beside Use all.`);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const error = validateFind(store.get(), findInput.value);
    if (error) {
      findField.setError(error);
      findInput.focus();
      return;
    }
    findField.clearError();
    const find = findInput.value.trim();
    clearUndo();
    store.set(addPair(store.get(), findInput.value, replaceInput.value));
    form.reset();
    findInput.focus();
    announce(`Added ${find}.`);
  });

  // Checked on the way out, never while typing. An empty field isn't an error
  // until someone tries to add it, so only a duplicate is flagged here.
  findInput.addEventListener('blur', () => {
    if (findInput.value.trim()) findField.setError(validateFind(store.get(), findInput.value));
  });
  findInput.addEventListener('input', () => {
    if (findField.isInvalid() && !validateFind(store.get(), findInput.value)) findField.clearError();
  });

  list.addEventListener('change', (event) => {
    const toggle = event.target.closest('.swap-toggle');
    if (!toggle) return;
    store.set(updatePair(store.get(), toggle.closest('.swap').dataset.id, { on: toggle.checked }));
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('.swap-edit, .swap-delete');
    if (!button) return;
    const { id } = button.closest('.swap').dataset;
    if (button.classList.contains('swap-edit')) openEditor(id);
    else remove(id);
  });

  useAll.addEventListener('change', () => {
    store.set(setAllOn(store.get(), useAll.checked));
  });

  undoButton.addEventListener('click', () => {
    if (!lastDeleted) return;
    const { pair, index } = lastDeleted;
    store.set(restorePair(store.get(), pair, index));
    focusRow(pair.id, '.swap-toggle'); // before the Undo button disappears
    clearUndo();
    announce(`Restored ${pair.find}.`);
  });

  store.subscribe((source) => {
    // Another tab changed the list, so the saved position may be wrong.
    if (source === 'external') clearUndo();
    render();
  });

  render();
}
