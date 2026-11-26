# OlaHub eBay Listing Assistant

A Chromium Manifest V3 extension for Chrome, Edge, and Opera. It targets eBay US and UK listing pages and currently supports men's sizes M4–M11. On eBay's Sell Similar listing page (`/lstng?mode=SellSimilarItem`), it opens its size assistant panel automatically and detects the current US Shoe Size when eBay's field is available.

## Load it locally

1. Open the extensions page in your browser (`chrome://extensions`, `edge://extensions`, or `opera://extensions`).
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Open or refresh an eBay listing edit page, click the extension icon, choose a size, select fields, then click **Apply Changes**.

The extension changes fields in the current page only. Review the listing and use eBay's own save/update action to commit changes. It does not submit listings for you.

## Current behavior and limits

- The popup reproduces the dark OlaHub layout and size reference panel.
- US, UK, and EU values use a simple men's conversion table. Confirm the mapping for the footwear brand/product before applying; size conversions vary.
- Size attributes are matched from nearby visible labels and common field metadata. eBay's page markup can vary by category, locale, and listing flow, so unmatched fields are reported in the popup.
- The title field is changed only when it already contains an `M<number>` or `US <number>` size marker. Other title wording is left intact.
- It does not transmit listing data to a developer server. The selected title and size values are applied locally to the open eBay form.
- The extension does not submit listings. Review the result and use eBay's own save/update action.

## Files

- `manifest.json` – extension permissions and eBay page matching
- `popup.html`, `popup.css`, `popup.js` – size picker and controls
- `content.js` – applies selected values to matching form controls

