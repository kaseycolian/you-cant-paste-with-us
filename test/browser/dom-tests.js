// In-browser tests for the modules that need a DOM.
import { htmlToFragment, textToFragment, safeHref } from '../../src/sanitize.js';
import { replaceInTree } from '../../src/replace-dom.js';
import { toPlainText } from '../../src/plain-text.js';
import { createMatcher } from '../../src/matcher.js';

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, message: error.message });
  }
}
function equal(actual, expected) {
  if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function ok(value, message) {
  if (!value) throw new Error(message);
}

const clean = (html) => {
  const box = document.createElement('div');
  box.append(htmlToFragment(html));
  return box;
};
const matcher = (...pairs) => createMatcher(pairs.map(([find, replace], i) => ({ id: `p${i}`, find, replace, on: true })));
const replaced = (html, m, options) => {
  const box = document.createElement('div');
  box.innerHTML = html;
  const outcome = replaceInTree(box, m, options);
  return { html: box.innerHTML, outcome };
};

/* ---- sanitizer --------------------------------------------------------- */

test('scripts, styles, event handlers and comments are removed', () => {
  const box = clean('<p onclick="x()">Hi<script>alert(1)</script><style>p{}</style><!-- secret --></p>');
  equal(box.innerHTML, '<p>Hi</p>');
});

test('javascript: links lose their address but keep their text, even disguised', () => {
  equal(clean('<a href="java&#9;script:alert(1)">go</a>').innerHTML, 'go');
  equal(clean('<a href=" JAVASCRIPT:alert(1)">go</a>').innerHTML, 'go');
  equal(clean('<a href="data:text/html,x">go</a>').innerHTML, 'go');
});

test('relative and protocol-relative links are dropped, absolute ones kept', () => {
  equal(clean('<a href="/team">a</a> <a href="//x.test/y">b</a>').innerHTML, 'a b');
  equal(clean('<a href="https://x.test/y" target="_blank" class="c">c</a>').innerHTML, '<a href="https://x.test/y">c</a>');
  equal(clean('<a href="mailto:a@b.test">m</a>').innerHTML, '<a href="mailto:a@b.test">m</a>');
});

test('SVG and MathML are removed whole', () => {
  equal(clean('<p>a<svg><a href="https://x.test"><text>b</text></a></svg><math><mi>c</mi></math>d</p>').innerHTML, '<p>ad</p>');
});

test('hidden content is removed, including Word hidden text', () => {
  const html = '<p>a<span style="display:none">b</span><span hidden>c</span><span style="font-size:0">d</span>'
    + '<span style="visibility:hidden">e</span><span style="opacity:0">f</span><span style="mso-hide:all">g</span>h</p>';
  equal(clean(html).innerHTML, '<p>ah</p>');
});

test('details and summary become plain blocks, so nothing is folded away', () => {
  equal(clean('<details><summary>s</summary>body</details>').innerHTML, '<div><div>s</div>body</div>');
});

test('landmarks become divs', () => {
  equal(clean('<nav>n</nav><main>m</main><section>s</section>').innerHTML, '<div>n</div><div>m</div><div>s</div>');
});

test('style keeps formatting and drops anything that loads, hides or moves', () => {
  const box = clean('<span style="font-weight:bold; color:#c00; background:url(https://x.test/t.gif); position:fixed; animation: spin 1s">x</span>');
  const style = box.firstElementChild.getAttribute('style');
  ok(/font-weight: bold/.test(style), style);
  ok(/color: rgb\(204, 0, 0\)/.test(style), style);
  ok(!/url|position|animation|background-image/.test(style), style);
});

test('escaped url() in style does not survive', () => {
  const box = clean('<span style="background-image: \\75 rl(https://x.test/a.png); color: red">x</span>');
  const style = box.firstElementChild.getAttribute('style') ?? '';
  ok(!/x\.test|url/i.test(style), style);
});

test('remote images become their alt text; data images stay', () => {
  equal(clean('<p><img src="https://x.test/a.png" alt="Logo">!</p>').innerHTML, '<p>Logo!</p>');
  equal(clean('<p><img src="https://x.test/pixel.gif"></p>').innerHTML, '<p></p>');
  const data = 'data:image/png;base64,iVBORw0KGgo=';
  equal(clean(`<img src="${data}" alt="a" onerror="x()">`).innerHTML, `<img src="${data}" alt="a">`);
});

test('tables, lists and emphasis keep their shape and allowed attributes', () => {
  const html = '<table border="1" class="t"><tr><td colspan="2" id="x">a</td></tr></table><ol start="3" type="a"><li>b</li></ol><p><b>c</b><i>d</i><u>e</u></p>';
  equal(clean(html).innerHTML, '<table border="1"><tbody><tr><td colspan="2">a</td></tr></tbody></table><ol start="3" type="a"><li>b</li></ol><p><b>c</b><i>d</i><u>e</u></p>');
});

test('unknown wrappers are unwrapped, keeping their text', () => {
  equal(clean('<p>a<o:p>b</o:p><custom-thing>c</custom-thing></p>').innerHTML, '<p>abc</p>');
});

test('forms and their controls go, and so does their text', () => {
  equal(clean('<form>a<button>Buy</button><input value="x"><select><option>o</option></select>b</form>').innerHTML, 'ab');
});

test('plain text keeps its spacing and line breaks', () => {
  const box = document.createElement('div');
  box.append(textToFragment('a  b\r\n\tc'));
  equal(box.innerHTML, '<span style="white-space: pre-wrap">a  b\n\tc</span>');
});

test('safeHref normalizes and filters', () => {
  equal(safeHref('HTTPS://X.test'), 'https://x.test/');
  equal(safeHref('ftp://x.test'), null);
  equal(safeHref('nonsense'), null);
});

/* ---- replace-dom ------------------------------------------------------- */

test('a name split across tags is found, and the value goes where it starts', () => {
  equal(replaced('<p>Ac<b>me</b> Corp!</p>', matcher(['Acme Corp', 'X'])).html, '<p>X<b></b>!</p>');
});

test('a match never joins two paragraphs', () => {
  equal(replaced('<p>Acme</p><p>Corp</p>', matcher(['Acme Corp', 'X'])).html, '<p>Acme</p><p>Corp</p>');
  equal(replaced('Acme<br>Corp', matcher(['Acme Corp', 'X'])).html, 'Acme<br>Corp');
});

test('text either side of a nested block is kept apart', () => {
  equal(replaced('<div>Ac<div>x</div>me</div>', matcher(['Acme', 'X'])).html, '<div>Ac<div>x</div>me</div>');
});

test('link addresses, alt text and styles are searched too', () => {
  const { html, outcome } = replaced(
    '<a href="https://acme.test/jane">Hi</a><img alt="Acme logo" src="data:image/png;base64,AA=="><span style="font-family: Acme">t</span>',
    matcher(['acme', 'co']),
  );
  ok(html.includes('href="https://co.test/jane"'), html);
  ok(html.includes('alt="co logo"'), html);
  ok(html.includes('font-family: co'), html);
  equal(outcome.count, 3);
});

test('a replacement that would make a link unsafe drops the address', () => {
  const { html } = replaced('<a href="https://acme.test/">x</a>', matcher(['https://acme.test/', 'javascript:alert(1)//']));
  equal(html, '<a>x</a>');
});

test('Remove links keeps each link\'s text', () => {
  const { html, outcome } = replaced('<p>see <a href="https://x.test"><b>here</b></a></p>', matcher(['zzz', 'y']), { removeLinks: true });
  equal(html, '<p>see <b>here</b></p>');
  equal(outcome.links, 0);
});

test('marks point at the replaced text in the rewritten nodes', () => {
  const box = document.createElement('div');
  box.innerHTML = '<p>Hi Acme and <i>acme</i></p>';
  const { marks, count, usedIds } = replaceInTree(box, matcher(['Acme', 'Co']));
  equal(count, 2);
  equal(usedIds.size, 1);
  equal(marks.map(({ node, start, end }) => node.data.slice(start, end)).join('|'), 'Co|Co');
});

test('no matcher leaves the tree alone', () => {
  equal(replaced('<p>Acme</p>', null).html, '<p>Acme</p>');
});

/* ---- plain text -------------------------------------------------------- */

test('plain text puts blocks on their own lines and collapses source spacing', () => {
  const box = document.createElement('div');
  box.innerHTML = '<h2>Title</h2>\n   <p>One   two\n three</p><ul><li>a</li><li>b</li></ul>x<br>y';
  equal(toPlainText(box), 'Title\nOne two three\na\nb\nx\ny');
});

test('plain text keeps pre-wrap spacing exactly', () => {
  const box = document.createElement('div');
  box.append(textToFragment('if (a) {\n    b();\n}\n'));
  equal(toPlainText(box), 'if (a) {\n    b();\n}');
});

test('plain text separates table cells with tabs', () => {
  const box = document.createElement('div');
  box.innerHTML = '<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>';
  equal(toPlainText(box), 'a\tb\nc\td');
});

test('non-breaking spaces become plain spaces', () => {
  const box = document.createElement('div');
  box.innerHTML = 'a&nbsp;b';
  equal(toPlainText(box), 'a b');
});

/* ---- report ------------------------------------------------------------ */

const list = document.getElementById('results');
for (const r of results) {
  const li = document.createElement('li');
  li.className = r.ok ? 'pass' : 'fail';
  li.textContent = r.ok ? r.name : `${r.name}: ${r.message}`;
  list.append(li);
}
const failed = results.filter((r) => !r.ok).length;
document.getElementById('summary').textContent = failed
  ? `${failed} of ${results.length} failed.`
  : `All ${results.length} passed.`;
document.body.dataset.result = failed ? 'fail' : 'pass';
