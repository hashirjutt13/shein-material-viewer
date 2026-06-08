# Development Guide

SHEIN Material Viewer is intentionally small: vanilla JavaScript, no framework, no bundler, and no build step.

## Requirements

- Chrome or a Chromium browser
- Node.js for tests

## Local Setup

```sh
git clone <repo-url> shein-material-viewer
cd shein-material-viewer
npm test
npm run check
```

Load the repo folder through `chrome://extensions` as an unpacked extension.

## Test Commands

```sh
npm test
npm run check
```

Direct commands:

```sh
node tests/parser.test.mjs
node --check src/shared/logic.js
node --check src/content.js
node --check src/popup.js
```

## Code Areas

- Parser/settings/export helpers: `src/shared/logic.js`
- SHEIN page scanning and badge behavior: `src/content.js`
- Product-card badge CSS: `src/content.css`
- Popup UI: `src/popup.html`, `src/popup.css`, `src/popup.js`
- Tests: `tests/parser.test.mjs`

## Adding Material Support

1. Add a common material display entry if useful.
2. Add normalization in `normalizeMaterialName`.
3. Add listing hint support in `inferMaterialsFromText` only if the keyword is unlikely to create false positives.
4. Add parser tests.
5. Run tests and syntax checks.

Example test:

```js
assert.ok(byKey(logic.parseCompositionString("PC + TPU"), "polycarbonate"));
assert.ok(byKey(logic.parseCompositionString("PC + TPU"), "tpu"));
```

## Adding a Filter Preset

1. Add a preset to `PRESETS` in `src/shared/logic.js`.
2. Use normalized material keys.
3. Use one of the supported comparators.
4. Add matching tests if behavior is new.

## Release Checklist

1. Update `manifest.json` version.
2. Update `package.json` version.
3. Add a `CHANGELOG.md` entry.
4. Run `npm test`.
5. Run `npm run check`.
6. Reload the unpacked extension.
7. Test viewer mode on a listing page.
8. Test filter mode on a clothing listing page.
9. Test `Material unknown` retry.
10. Test scanned CSV/JSON export.

## Packaging

No packaging is required for local use. For distribution, zip the repo contents excluding ignored files:

```sh
zip -r shein-material-viewer.zip . -x "*.git*" "node_modules/*" "*.DS_Store"
```

Do not include private keys, `.pem` files, or local test artifacts.
