// Turns pasted HTML into a safe fragment that keeps its formatting.
//
// Allowlist, not blocklist: an element or attribute survives only if it is
// named below. Anything that cannot be seen is removed, because what cannot be
// seen cannot be checked before it is copied back out. Nothing pasted can make
// a network request: remote images become their alt text, and style is rebuilt
// from a short list of properties that cannot hold a URL.

const HTML_NS = 'http://www.w3.org/1999/xhtml';

/** Removed along with everything inside them. */
const DROP = new Set([
  'SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'IFRAME', 'FRAME', 'FRAMESET', 'OBJECT', 'EMBED',
  'APPLET', 'PARAM', 'MARQUEE', 'META', 'LINK', 'BASE', 'TITLE', 'HEAD', 'INPUT', 'BUTTON',
  'SELECT', 'OPTION', 'OPTGROUP', 'DATALIST', 'TEXTAREA', 'OUTPUT', 'PROGRESS', 'METER',
  'CANVAS', 'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'MAP', 'AREA', 'DIALOG', 'SLOT', 'PORTAL',
]);

/** Kept, with the attributes each may carry (on top of GLOBAL_ATTRS). */
const KEEP = {
  A: ['href'], ABBR: [], ADDRESS: [], B: [], BDI: [], BDO: [], BIG: [], BLOCKQUOTE: [], BR: [],
  CAPTION: [], CENTER: [], CITE: [], CODE: [], COL: ['span'], COLGROUP: ['span'], DD: [],
  DEL: [], DFN: [], DIV: [], DL: [], DT: [], EM: [], FIGCAPTION: [], FIGURE: [],
  FONT: ['color', 'face', 'size'], H1: [], H2: [], H3: [], H4: [], H5: [], H6: [], HR: [],
  I: [], INS: [], KBD: [], LI: ['value'], MARK: [], OL: ['start', 'reversed', 'type'], P: [],
  PRE: [], Q: [], RP: [], RT: [], RUBY: [], S: [], SAMP: [], SMALL: [], SPAN: [], STRIKE: [],
  STRONG: [], SUB: [], SUP: [], TABLE: ['border'], TBODY: [], TD: ['colspan', 'rowspan'],
  TFOOT: [], TH: ['colspan', 'rowspan', 'scope'], THEAD: [], TIME: [], TR: [], TT: [], U: [],
  UL: [], VAR: [], WBR: [],
};

/** Kept as a plain <div>: landmarks would add regions to this page, and
    <details>/<summary> would hide their content behind a toggle. */
const AS_DIV = new Set(['HEADER', 'FOOTER', 'NAV', 'MAIN', 'ASIDE', 'SECTION', 'ARTICLE', 'HGROUP', 'DETAILS', 'SUMMARY', 'MENU']);

const GLOBAL_ATTRS = ['dir', 'lang'];

/** What each attribute's value must look like to be kept. */
const ATTR_VALUE = {
  border: /^\d{1,2}$/,
  color: /^#?[\w]{1,20}$/,
  colspan: /^\d{1,4}$/,
  dir: /^(?:ltr|rtl|auto)$/i,
  face: /^[\w ,'"-]{1,100}$/,
  lang: /^[a-z]{1,8}(?:-[a-z0-9]{1,8})*$/i,
  reversed: /^(?:|reversed)$/i,
  rowspan: /^\d{1,4}$/,
  scope: /^(?:row|col|rowgroup|colgroup)$/i,
  size: /^[+-]?\d$/,
  span: /^\d{1,4}$/,
  start: /^-?\d{1,6}$/,
  type: /^[1aAiI]$/,
  value: /^-?\d{1,6}$/,
};

/** The only style properties that survive. None of them can hold a URL, hide
    text, move it, or animate it. */
const STYLE_PROPS = [
  'color', 'background-color', 'font-family', 'font-size', 'font-style', 'font-weight',
  'font-variant', 'text-decoration-line', 'text-decoration-style', 'text-decoration-color',
  'text-align', 'vertical-align', 'white-space', 'text-indent', 'margin-left', 'padding-left',
  'list-style-type', 'border-collapse',
  ...['top', 'right', 'bottom', 'left'].flatMap((side) =>
    ['width', 'style', 'color'].map((part) => `border-${side}-${part}`)),
];
const UNSAFE_VALUE = /url\(|image|expression|var\(|attr\(|\\/i;

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * An absolute http(s), mailto or tel URL, normalized, or null. Relative and
 * protocol-relative links are dropped: they would point at this page.
 * @param {string} value
 */
export function safeHref(value) {
  try {
    const url = new URL(value);
    return LINK_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function isHidden(el) {
  if (el.hasAttribute('hidden')) return true;
  const s = el.style;
  return (
    s.display === 'none' ||
    s.visibility === 'hidden' ||
    s.visibility === 'collapse' ||
    s.opacity === '0' ||
    /^0(?:\.0*)?[a-z%]*$/i.test(s.fontSize) ||
    /mso-hide\s*:\s*all/i.test(el.getAttribute('style') ?? '')
  );
}

function cleanStyle(style) {
  const kept = [];
  for (const prop of STYLE_PROPS) {
    const value = style.getPropertyValue(prop);
    if (value && !UNSAFE_VALUE.test(value)) kept.push(`${prop}: ${value}`);
  }
  return kept.join('; ');
}

function copyAttributes(from, to) {
  for (const name of [...GLOBAL_ATTRS, ...(KEEP[from.tagName] ?? [])]) {
    const value = from.getAttribute(name);
    if (value === null) continue;
    if (name === 'href') {
      const href = safeHref(value.trim());
      if (href) to.setAttribute('href', href);
    } else if (ATTR_VALUE[name] ? ATTR_VALUE[name].test(value.trim()) : true) {
      to.setAttribute(name, value.trim());
    }
  }
  if (from.hasAttribute('style')) {
    const style = cleanStyle(from.style);
    if (style) to.setAttribute('style', style);
  }
}

/** A data: image survives; anything else becomes its alt text, if it has any. */
function cleanImage(img, doc) {
  const src = (img.getAttribute('src') ?? '').trim();
  const alt = (img.getAttribute('alt') ?? '').trim();
  if (!/^data:image\//i.test(src)) return alt ? doc.createTextNode(alt) : null;
  const out = doc.createElement('img');
  out.setAttribute('src', src);
  out.setAttribute('alt', alt);
  for (const name of ['width', 'height']) {
    const value = img.getAttribute(name);
    if (value && /^\d{1,5}$/.test(value)) out.setAttribute(name, value);
  }
  return out;
}

/** Copies the allowed parts of `source`'s children into `dest`. */
function appendClean(source, dest, doc) {
  for (const node of source.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      dest.append(doc.createTextNode(node.data));
      continue;
    }
    // Comments, processing instructions, and SVG or MathML subtrees go.
    if (node.nodeType !== Node.ELEMENT_NODE || node.namespaceURI !== HTML_NS) continue;
    const tag = node.tagName;
    if (DROP.has(tag) || isHidden(node)) continue;

    if (tag === 'IMG') {
      const img = cleanImage(node, doc);
      if (img) dest.append(img);
      continue;
    }

    let kept = null;
    if (AS_DIV.has(tag)) kept = doc.createElement('div');
    else if (tag in KEEP) kept = doc.createElement(tag.toLowerCase());

    if (kept) {
      copyAttributes(node, kept);
      // A link whose address did not survive is just its text.
      if (tag === 'A' && !kept.hasAttribute('href')) kept = null;
    }
    if (kept) {
      appendClean(node, kept, doc);
      dest.append(kept);
    } else {
      // Unknown or unsafe wrapper (a custom element, Word's <o:p>): keep what is inside.
      appendClean(node, dest, doc);
    }
  }
}

/**
 * @param {string} html
 * @param {Document} [doc] the document the fragment is for
 * @returns {DocumentFragment}
 */
export function htmlToFragment(html, doc = document) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const fragment = doc.createDocumentFragment();
  appendClean(parsed.body, fragment, doc);
  return fragment;
}

/**
 * Plain text, with its spacing and line breaks kept exactly.
 * @param {string} text
 * @param {Document} [doc]
 * @returns {DocumentFragment}
 */
export function textToFragment(text, doc = document) {
  const fragment = doc.createDocumentFragment();
  const span = doc.createElement('span');
  span.setAttribute('style', 'white-space: pre-wrap');
  span.textContent = text.replace(/\r\n?/g, '\n');
  fragment.append(span);
  return fragment;
}
