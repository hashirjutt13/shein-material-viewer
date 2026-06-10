# Technical Architecture

SHEIN Material Viewer is a vanilla JavaScript Chrome Manifest V3 extension. It has no build step and runs as a content script on `https://*.shein.com/*`.

## File Map

```text
manifest.json             Chrome MV3 manifest
src/content.js            Content script for SHEIN pages
src/content.css           Product-card badge styles
src/popup.html            Extension popup markup
src/popup.css             Extension popup styles
src/popup.js              Popup state, settings, exports
src/shared/logic.js       Parser, matching, settings, CSV helpers
tests/parser.test.mjs     Parser/settings/matching tests
```

## Manifest

The extension requests:

- `storage`: store settings, product cache, and material index.
- `activeTab` and `tabs`: communicate from popup to the active SHEIN tab.
- Host permission for `https://*.shein.com/*`.

The content script loads:

1. `src/shared/logic.js`
2. `src/content.js`
3. `src/content.css`

It runs at `document_idle`.

## Storage Keys

Defined in `src/shared/logic.js`:

- `smf:settings`
- `smf:productCache`
- `smf:materialIndex`

Only successful product scans are stored in `smf:productCache`. Unknown and failed scans are kept in memory as session results.

## Settings

Default settings:

```js
{
  enabled: true,
  cardMode: "viewer",
  displayMode: "dim",
  productPageScanMode: "manual",
  otherPageScanMode: "manual",
  scanDelaySeconds: 8,
  scanRandomnessSeconds: 2,
  combineMode: "all",
  rules: [{ material: "rayon", comparator: ">", value: 30 }]
}
```

`cardMode` controls the main behavior:

- `viewer`: show material data only.
- `filter`: evaluate rules and show match/miss behavior.

## Content Script Flow

`src/content.js` owns page behavior.

1. Load settings, product cache, and material index from `chrome.storage.local`.
2. Remove stale cached entries with errors or empty material arrays.
3. Set up a `MutationObserver` for dynamic SHEIN grid changes.
4. Set up an `IntersectionObserver` for visible card detection.
5. Find product anchors using URLs that contain `-p-` and `.html`.
6. Normalize product ID, variant-aware cache key, URL, title, price, image, and card element.
7. Attach a single direct `.smf-badge` to each active card.
8. Apply cached/session material data if available.
9. Queue manual or slow-auto detail scans when requested.

Product titles and listing-card text are not parsed as material data. They are used only for product metadata such as title, price, image, and export fields.

Cache keys are variant-aware. A plain product URL uses the base product ID, while a URL with `attr_ids` uses a key like `10630788:attr_ids=160_212`.

The queue runs one detail fetch at a time and waits according to `scanDelaySeconds` plus or minus `scanRandomnessSeconds`.

## Product Detail Fetching

The content script fetches product detail HTML with:

```js
fetch(record.url, { credentials: "include" })
```

If the response URL or HTML indicates a SHEIN challenge/captcha page, the queue stops and the product is marked with an error. The user must solve the challenge manually and retry.

Fetch URLs preserve `mallCode` and `attr_ids` while dropping noisy tracking parameters. Preserving `attr_ids` matters because SHEIN variants can have different material compositions.

## Material Extraction

`extractMaterialsFromHtml` in `src/shared/logic.js` does the main parsing.

Primary strategy:

1. Locate `materialExposed` in the detail-page HTML/scripts.
2. Parse the object.
3. Read `materialInfoList`.
4. Extract values whose attribute name looks like composition, material, fabric, case, or strap.

Fallback strategy:

1. Strip scripts, styles, and HTML tags.
2. Search text for labels such as `Composition`, `Material`, `Case Material`, and `Strap Material`.
3. Parse up to the first few likely values.

There is no title/listing fallback. If detail-page material fields are missing, the product is marked `Material unknown`.

## Parser Behavior

The parser supports:

- Percent before name: `65% Polyester`
- Name before percent: `Viscose 40%`
- Multiple materials separated by commas, semicolons, slashes, pipes, plus signs, or `and`
- Plain material strings without percentages

Common aliases:

- `viscose`, `rayon`, `modal`, `lyocell` -> `rayon`
- `spandex`, `elastane` -> `elastane`
- `polyamide`, `nylon` -> `polyamide`
- `PC`, `polycarbonate` -> `polycarbonate`
- `PU Leather`, `polyurethane leather`, `faux leather`, `vegan leather` -> `pu-leather`

Unknown raw material names are preserved and displayed in title case.

## Popup Flow

`src/popup.js`:

1. Finds the active tab.
2. Requests page status via `SMF_GET_STATUS`.
3. Falls back to stored settings/material index if the content script is unavailable.
4. Renders viewer controls by default.
5. Reveals filter controls only when `cardMode` is `filter`.
6. Persists setting changes to storage.
7. Sends setting updates to the active tab.
8. Requests refresh, cache clear, or export actions.

## Message API

Popup to content script:

- `SMF_GET_STATUS`
- `SMF_UPDATE_SETTINGS`
- `SMF_REFRESH_VISIBLE`
- `SMF_CLEAR_CACHE`
- `SMF_EXPORT`

Content script to popup/runtime:

- `SMF_STATUS`

Status includes:

- `cardCount`
- `scannedCount`
- `materialCount`
- `matchCount`
- `pendingCount`
- `errorCount`
- `settings`
- `materials`

## Badge Behavior

Viewer mode states:

- `pending`: queued/scanning/unscanned
- `material`: successful material result
- `unknown`: no material found
- `error`: fetch/challenge failure

Filter mode can additionally use:

- `match`
- `miss`

Badge cleanup keeps one direct badge per active product card and removes stale badges after SHEIN replaces grid nodes.

## CSV Export

`productToExportRows` and `rowsToCsv` in `src/shared/logic.js` convert current products to CSV rows.

Rows include variant-aware product ID, base product ID, product metadata, raw material text, parsed material summary, source, timestamp, and error.
