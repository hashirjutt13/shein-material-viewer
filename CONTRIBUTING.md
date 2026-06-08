# Contributing

Thanks for improving `shein-material-viewer`.

## Good Contributions

- Add parser cases for material strings found on real SHEIN pages.
- Add safe material aliases in `src/shared/logic.js`.
- Improve badge placement for new SHEIN grid layouts.
- Improve documentation and troubleshooting notes.
- Add focused tests for parser, settings, and matching behavior.

## Development Rules

- Keep the extension vanilla JavaScript.
- Do not add a build step unless it is clearly necessary.
- Keep network behavior conservative; avoid features that aggressively fetch product pages.
- Do not cache unknown or failed material scans.
- Preserve raw material names when adding normalization aliases.

## Test Before Sending Changes

```sh
npm test
npm run check
```

## Adding a Material Alias

1. Add the display material to `COMMON_MATERIALS` if it should appear as a common option.
2. Add normalization logic in `normalizeMaterialName`.
3. Add listing-hint recognition in `inferMaterialsFromText` only if it is unlikely to create false positives.
4. Add parser tests in `tests/parser.test.mjs`.

## Screenshots

Documentation screenshots live in `docs/screenshots/`. Current screenshots are SVG mockups. Replace them with real screenshots if you capture stable extension states.
