# Theme Service

This app's theming comes from the shared **theme-service**, currently on version `1.5.0`.
The files in this folder are vendored copies of the source of truth. Don't hand-edit generated
token files, and don't hardcode colors; use the theme tokens (`var(--…)`).

## For agents working in this repo
This repo **already uses the theme-service** (see History below). Use the **theme-service skill**
(or its `AGENTS.md`) for any theme work here. Don't improvise, and don't re-apply from scratch.
- Update to latest:  "Update this repo to the latest theme-service version."
- Add/change themes:  see the theme-service repo's `CREATING-THEMES.md`.

Rules: keep WCAG 2.2 AA. The default theme is Rink Classic. The selector uses the **external**
`theme-init.js` / `theme-select.js` (never inline scripts, because the page's CSP blocks them).

## Applied configuration (current decisions on record)
- Component styling: `full component classes` (greenfield app built on `components.css`: `.btn`,
  `.input`, `.field-label`, `.choice`, `.switch`, `.btn-icon`, `.notice`). The tabs are app-specific
  (`.sheet-tab` in `src/styles/app.css`), drawn as folder tabs joined to the text sheet.
- Fonts: `theme fonts` (`--font-ui` / `--font-mono`).
- Background effect: `page background only`. `.fx-grid` is on `<body>` and nowhere else, so cards,
  header and footer stay flat.
- Selector: `theme-service selector`, rendered with `dropdown.js` (grouped by family, dot swatches).
  - Placement: the page header, top right, beside the Reduce motion switch.
  - The markup and styling match the theme-service site header (`.theme-console` with cap and lamps);
    the CSS is ported into `src/styles/header.css`.
- Storage keys: `data-theme-storage="text-replacer:theme"` and
  `data-motion-storage="text-replacer:motion"` on `<html>`, so this app doesn't share its choice with
  other sites on the same origin.
- Existing themes: `none`.

## Repo-specific notes
- `index.html` has a strict CSP (`default-src 'none'`, `script-src 'self'`,
  `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`). Every vendored file works under it: the
  NEO rain is a `data:` SVG, and `dropdown.js` only uses CSSOM.
- `components.css` has no forced-colors rules. `src/styles/app.css` adds them for everything the app
  uses (tabs, switch, soft-disabled buttons, highlight). Keep that block if components are added.
- App-specific color pairs are verified in every theme. Accent colors used as text are mixed 80%
  toward `--text`, and the swap highlight sets its own text color (`--text`), because link blue on it
  fell under 4.5:1 in NEO and RFG.

## History
<!-- Append one entry per apply/update. Most recent last. Never edit past entries. -->
- `2026-09-24` — Applied theme-service `v1.5.0` to a new app. Vendored `theme.css`, `effects.css`,
  `components.css`, `dropdown.css`, `dropdown.js`, `theme-init.js`, `theme-select.js`,
  `themes.index.json`. Full component classes, theme fonts, `.fx-grid` on the page background only.
  Theme console and Reduce motion switch in the header, ported from the theme-service site header.
  Verified: axe (WCAG 2.2 AA + best practice) clean and color-contrast clean in all 24 themes;
  reduced motion (OS and switch) and forced colors checked.
