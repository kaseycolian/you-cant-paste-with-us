// Wires the page together. Each module gets what it needs passed in, so none of
// them reaches for another's internals.

import { createPairStore, pickStorage } from './pair-store.js';
import { createSwapList } from './swap-list.js';
import { createWorkspace } from './workspace.js';

// Never derived from the app's name, so renaming the app keeps everyone's list.
const STORAGE_KEY = 'text-replacer:pairs';

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform ?? navigator.platform ?? '');
const shortcut = isMac
  ? { aria: 'Meta+Enter', label: '⌘ + Enter', copy: '⌘ + C' }
  : { aria: 'Control+Enter', label: 'Ctrl + Enter', copy: 'Ctrl + C' };

const liveRegion = document.getElementById('announcer');
const announce = (text) => window.AC.speak(liveRegion, text);

const { storage } = pickStorage();
const store = createPairStore(storage, STORAGE_KEY);

const workspace = createWorkspace(document.getElementById('workspace'), {
  getPairs: store.get,
  announce,
  shortcut,
});
createSwapList(document.getElementById('swaps'), { store, announce });
store.subscribe(() => workspace.pairsChanged());

// Another tab edited the list.
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY) store.reload();
});

// Ctrl+Enter (⌘+Enter on a Mac) replaces from anywhere on the page.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.altKey || event.shiftKey) return;
  if (!(isMac ? event.metaKey : event.ctrlKey)) return;
  event.preventDefault();
  workspace.replace();
});

// A file dropped anywhere but the editor would open in place of the page and
// take the text with it.
document.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (!workspace.acceptsDrop(event.target)) event.dataTransfer.dropEffect = 'none';
});
document.addEventListener('drop', (event) => event.preventDefault());

// When the device already reduces motion, the page switch can't turn it back
// on, so it says so instead of pretending (a11y-library: motion-preferences).
// Runs after theme-select.js has set the switch up on DOMContentLoaded.
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('[data-motion-toggle]');
  const system = matchMedia('(prefers-reduced-motion: reduce)');
  if (!toggle) return;
  const apply = () => {
    if (system.matches) {
      toggle.checked = true;
      toggle.setAttribute('aria-disabled', 'true');
      toggle.setAttribute('aria-describedby', 'motion-note');
    } else {
      toggle.checked = document.documentElement.getAttribute('data-motion') === 'off';
      toggle.removeAttribute('aria-disabled');
      toggle.removeAttribute('aria-describedby');
    }
  };
  toggle.addEventListener('click', (event) => {
    if (toggle.getAttribute('aria-disabled') === 'true') event.preventDefault();
  });
  system.addEventListener('change', apply);
  apply();
});
