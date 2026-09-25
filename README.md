# You Can’t Paste with Us

Swap real names for stand-ins before you paste text anywhere public.

Keep a list of things to find (people, companies, hostnames) and what each should become. Paste text from
anywhere, such as a web page, Word, Google Docs, an email, or a code editor. Press **Replace** to get the
same text back, with the same formatting, and every name on your list swapped out. Then press
**Copy result**.

- Your swap list is only saved if you turn on **Save list in this browser** in the swap list. It's off by
  default.
  - On: the whole list, with each swap's on/off state, is written to this browser's localStorage and kept
    up to date.
  - Off: the saved copy is deleted straight away. The list stays on the page until you close the tab.
  - On again: everything is written back.
- Whether saving is on isn't stored separately: it's on exactly when a saved list exists. With it off,
  nothing of the list is left in storage. The theme and Reduce motion choices are remembered in
  localStorage too. No cookies.
- Your text is never saved. It lives in the tab and is gone when you close or reload it.
- Nothing is sent anywhere. The page's Content Security Policy blocks every outside request, including
  images inside what you paste.

## Where your data goes

Nowhere. This site is a handful of static files: HTML, CSS and JavaScript. There's no server code and no
database, and nothing to send your text to. Once the page loads, all the work happens in your browser:
finding and replacing, cleaning up what you paste, copying, and saving your list if you ask it to. The
page is also locked down so it can't contact any other site.

On GitHub Pages there's no Node at all; GitHub just hands your browser the files. If you run it yourself,
`npm start` starts a tiny Node file server that does one thing: it hands your browser the app's files. It
never receives your text or your list, because those never leave the page.

Like any website, the host (GitHub, or your own machine) can see that the page was loaded. That's an
ordinary web request. It never sees your text or your swap list.

## Run it

It's a static site with no dependencies and no build step. The code uses ES modules, so it has to be
served; opening `index.html` as a file won't work.

```sh
npm start        # serves this folder on http://localhost:8080 (PORT=3000 npm start to change it)
```

Any static host works too. All paths are relative.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`. It runs the unit tests, copies `index.html`,
`favicon.svg`, `src/` and `assets/` into `_site/`, and publishes that folder to GitHub Pages at
<https://kaseycolian.github.io/you-cant-paste-with-us/>. A failing test stops the deploy. You can also
start it from the Actions tab (**Run workflow**).

One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Rename it

The name lives in exactly one place: the `<title>` in `index.html`. `src/app-name.js` copies it into
the header. Saved lists are stored under `text-replacer:*` keys, so renaming the app doesn't lose them.

## How matching works

- **Case doesn't matter.** `acme` finds `Acme` and `ACME`.
- **Keys match inside words.** `Acme` also finds `AcmeCorp` and `acme.com`. A short key like `Al` will
  therefore also change `also`, so make short keys specific.
- **Copy-and-paste differences are ignored.**
  - Curly and straight quotes match (`O’Brien` and `O'Brien`).
  - Hyphen look-alikes match a plain hyphen.
  - Invisible characters inside a name (soft hyphens, zero-width spaces) don't hide it.
  - Any run of spaces, a non-breaking space, or a single line wrap between words counts as one space.
  - Composed and decomposed accents are the same (`José`).
- **A match never crosses a paragraph**, but it does cross formatting: `Ac<b>me</b>` is found.
- **The longest key wins** where two overlap, so `Acme Corp` beats `Acme`.
- **Replacements are never replaced again**, so swapping Alice→Bob and Bob→Carol at once works.
- **Link addresses and image alt text are searched too**, because they are copied along with the text.
  The status line says how many links the result keeps, so you know to check their addresses.
- **An empty "Replace with" deletes the match.**
- There's no limit on the number of swaps. Ten thousand search in about a fifth of a second.

## What happens to pasted content

Pasted HTML is cleaned before it goes into the editor:

- Formatting stays: headings, bold, italics, lists, tables, links, colors, and fonts.
- Anything that can run, load, or hide is removed:
  - scripts and styles
  - embedded frames and form controls
  - SVG and MathML
  - comments
  - hidden elements, including Word's hidden text
  - style properties that could load a URL, move, or animate content
- Images from the web become their alt text. Images embedded in the paste are kept, and the status line
  reminds you to check them yourself.
- Collapsed `<details>` sections are opened out, so nothing is left unseen.

On screen, both views use your theme's text color so any paste is readable. What you copy keeps the
original colors.

### Known limits

- Ligatures that some PDFs produce (a single `ﬀ` character) don't match `ff`.
- Word formatting that depends on class names (not inline styles) is lost, because `<style>` blocks are
  removed.
- **GitHub Pages:** every project on one `<user>.github.io` domain shares the same localStorage. Any
  other page on that domain could read your swap list. For a sensitive list, run it locally or give it
  its own domain.

## Accessibility

The target is WCAG 2.2 AA in every theme. The components follow the contracts in the a11y-library
(tabs, field, live region, switch, skip link, and others). The library's `[CORE]` scripts are vendored
in `assets/a11y/`.

- Everything works from the keyboard. **Ctrl+Enter** (⌘+Enter on a Mac) replaces from anywhere on the
  page.
- Nothing on the page moves when a result arrives. The text box keeps its size, and messages have space
  reserved for them.
- Focus stays where you are when you press Replace. Status is announced through one polite live region.
- "Reduce motion" stops every animation, and so does the device's own setting.
- Windows High Contrast (forced colors) keeps every state visible.

## Themes

Themes come from the theme-service and are vendored in `assets/theme/`. See
`assets/theme/THEME-SERVICE.md` for the version and the decisions on record. Update them with the
theme-service skill rather than by hand.

## Project layout

```text
index.html            page shell, templates, CSP
src/main.js           wires the modules together
src/workspace.js      the text card: editor, Original/Replaced views, Replace, Copy, Clear
src/swap-list.js      the swap list card: add, edit, delete, on/off
src/matcher.js        finds keys in text (pure)
src/text-rules.js     the character rules matching relies on (pure)
src/pairs.js          swap list operations and storage format (pure)
src/pair-store.js     keeps the list in localStorage when saving is on, in step across tabs
src/sanitize.js       cleans pasted HTML
src/replace-dom.js    replaces keys inside a DOM tree, keeping its formatting
src/plain-text.js     the text/plain half of a copy
src/clipboard.js      writes both formats to the clipboard
src/styles/           header (theme console) and app styles
assets/theme/         vendored theme-service files
assets/a11y/          vendored a11y-library scripts
test/*.test.js        unit tests (npm test)
test/browser/         DOM tests: npm start, then open /test/browser/
```

## Tests

```sh
npm test                                  # matcher, swap list, storage (node:test)
npm start  →  http://localhost:8080/test/browser/   # sanitizer, DOM replacement, plain text
```
