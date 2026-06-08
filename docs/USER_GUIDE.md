# User Guide

This guide explains how to use SHEIN Material Viewer after loading it as an unpacked Chrome extension.

## Install in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the extension folder.
5. Open a SHEIN page.
6. Refresh any SHEIN tab that was already open before loading or reloading the extension.

## Main Workflow

1. Open a SHEIN listing, category, search, sale, or product page.
2. Click the extension icon.
3. Keep **Card behavior** set to **Show materials only**.
4. Click **Scan visible details**.
5. Watch badges appear on visible product cards.
6. Hover a card to expand a compact badge.
7. Use **Retry** on `Material unknown` or scan-error badges.

## Card Badge States

- **Unscanned**: the extension has found the product card but has not fetched material data.
- **Queued**: the card is waiting for the scan queue.
- **Scanning**: the extension is fetching the product detail page.
- **Material**: material data was found and parsed.
- **Material unknown**: no material data was found in the fetched page.
- **Error**: the detail fetch failed or SHEIN sent a challenge page.

Viewer mode never marks products as `Match` or `No match`.

## Manual Scanning

Manual scanning is safest.

- Use **Scan visible details** to scan cards currently visible in the viewport.
- Use a card-level **Scan** button for one product.
- Use **Retry** after `Material unknown`, a failed request, or a solved challenge.

Unknown and error results are kept only for the current session. They are not cached.

## Auto Scan

Auto scan is intentionally slow.

- **Product pages: Auto slow** caches material when you open a product detail page normally.
- **Other pages: Auto slow** scans visible listing cards one at a time.
- **Delay seconds** sets the base wait between detail fetches.
- **Random +/- sec** adds jitter around the delay.

Recommended rate-limit-safe settings:

```text
Product pages: Manual only
Other pages: Manual only
Delay seconds: 8
Random +/- sec: 2
```

For slow auto scan, use a higher delay such as `10` to `20` seconds.

## Optional Filter Mode

Switch **Card behavior** to **Filter by rules** to enable filtering.

Filter mode shows:

- Presets
- All/any rule matching
- Display mode for non-matches
- Rule builder
- Match exports

Available presets:

- Rayon/Viscose > 30%
- 100% Cotton
- Polyester + Rayon
- No Polyester

Display modes:

- **Dim non-matches**
- **Hide non-matches**
- **Badge only**

## Exports

Use **Scanned CSV** or **Scanned JSON** to export scanned products from the current page context.

Filter mode also provides **Matches CSV** and **Matches JSON**.

Exports include:

- Product ID
- Title
- URL
- Price
- Raw material/composition text
- Parsed material summary
- Source
- Scan timestamp
- Error text, if any

## Clearing Cache

Click **Clear cache** to remove successful cached product scans and current session results.

Use this when:

- A product page changed.
- You want to force a fresh scan.
- Old extension behavior cached data you no longer want.

## After Updating the Extension

1. Open `chrome://extensions`.
2. Click the reload icon on SHEIN Material Viewer.
3. Refresh open SHEIN tabs.

Chrome keeps old content scripts in already-open tabs until those tabs are refreshed.
