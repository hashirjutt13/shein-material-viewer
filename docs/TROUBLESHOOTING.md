# Troubleshooting

## I updated the extension but the page still acts old

Chrome keeps old content scripts in open tabs.

1. Open `chrome://extensions`.
2. Reload SHEIN Material Viewer.
3. Refresh every open SHEIN tab.

## Product cards show `Unscanned`

This is normal. The extension has found product cards but has not fetched details.

Use:

- The card-level **Scan** button.
- The popup **Scan visible details** button.
- **Other pages: Auto slow** if you want slow automatic scanning.

## Product shows `Material unknown`

The extension fetched the product page but did not find parseable material data.

Possible reasons:

- SHEIN did not include material data for that product.
- The product uses a different detail-page structure.
- The material label is not near `materialExposed.materialInfoList`.
- The page returned partial or challenge content.

Use **Retry** after opening the product normally or after solving a challenge.

## SHEIN challenge or captcha appears

The extension stops the queue when it detects a challenge page.

1. Solve the challenge manually in the browser.
2. Return to the SHEIN page.
3. Use **Retry** or **Scan visible details** again.

Use a longer scan delay if challenges happen often.

## Official SHEIN filters changed products but badges look stale

The extension watches DOM changes and prunes missing cards, but some SHEIN updates are delayed.

Try:

1. Wait a second after applying official filters.
2. Scroll slightly.
3. Click **Scan visible details**.
4. Refresh the page if the grid was heavily replaced.

## Popup controls flicker or reset

This can happen when the content script and popup are from different extension reloads.

1. Reload the extension in `chrome://extensions`.
2. Refresh the SHEIN tab.
3. Reopen the popup.

The current popup avoids rebuilding controls during status-only updates.

## Scan or Retry opens the product page

The content script blocks navigation for extension badge buttons with capture-phase event handlers. If it still happens:

1. Reload the extension.
2. Refresh the SHEIN tab.
3. Confirm only one badge is visible on the product card.

## I see two badges on one card

The extension removes stale nested badges during card discovery. If duplicates remain:

1. Scroll the card out and back into view.
2. Apply **Clear cache**.
3. Refresh the page.

## It scans too slowly

That is intentional. SHEIN can rate-limit repeated product detail requests.

You can reduce **Delay seconds**, but safer scanning uses:

```text
Delay seconds: 8 or higher
Random +/- sec: 2 or higher
```

## It scans too many products

Set both scan modes to **Manual only**.

Then use only:

- Card-level **Scan**
- Popup **Scan visible details**

## Match exports are missing

Match exports appear only in **Filter by rules** mode. In viewer mode, use scanned exports.

## Material names look too broad

The parser normalizes common aliases for filtering, but preserves raw names in each material entry. Add or adjust aliases in `src/shared/logic.js`, then add tests in `tests/parser.test.mjs`.
