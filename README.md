# Google Maps Easy Scrape

A small Chrome extension that extracts listings from Google Maps Search results into a table you can export. This fork includes deduplication, persistence, keyboard shortcuts, and an HTML->.xls exporter that preserves clickable links in Excel.

---

## Features

- Scrape Google Maps Search results (title, rating, reviews, phone, industry, expensiveness, city, address, website, Instagram search link, Google Maps link).
- Deduplication by Maps URL (fallback: Title + Address) so entries don't repeat when scraping repeatedly.
- Persist results across popup opens via `chrome.storage.local`.
- Clear list with confirmation.
- Keyboard shortcuts:
  - Open popup: _extension action_ (default: Ctrl+Shift+Y) — may vary by browser/platform; see chrome://extensions/shortcuts to change.
  - Scrape active Maps tab: Ctrl+Shift+S (command name: `scrape`).
- Export table preview to an Excel-compatible `.xls` file that preserves visible link labels and underlying links.

## Columns and behavior

- Title — place name.
- Rating — star rating where available.
- Reviews — numeric review counts.
- Phone — extracted phone number if present.
- Industry — alphabetical-only industry name (e.g. `Pizza restaurant`).
- Expensiveness — non-letter characters extracted from the industry cell (only digits, `$`, `-`, en-dash, `+`).
- City — derived from the Maps search box (e.g. "Restaurants in X") when possible, otherwise heuristically from the address.
- Address — street address where available.
- Website — if a company website is present and is NOT a Maps link, shows `Goto Website`; otherwise shows `Search For Website` which performs a Google search for `{Title} {City} Website`.
- Insta Search — a Google search link for `{Title} {City} Instagram` (visible text shows the decoded query).
- Google Maps Link — `Open In Google maps`.

CSV/XLS export: The popup preview is used as the source for the export. The downloaded `.xls` file preserves the human-readable labels and the underlying clickable links.

## Installation (developer)

1. Open `chrome://extensions` (enable Developer mode).
2. Click "Load unpacked" and choose this project folder (the folder containing `manifest.json`).
3. Ensure the extension has the required permissions (activeTab, scripting, storage) when Chrome prompts.

## Usage

1. In Chrome, open a Maps Search page (URL containing `://www.google.com/maps/search`), e.g. search for "Restaurants in Houston".
2. Open the extension popup.
3. Click "Scrape Google Maps" (or use the keyboard shortcut) to extract the visible results. Clicking multiple times appends unique results.
4. Click "Download as CSV" (now produces an `.xls` file) to export the preview. Links remain clickable in Excel.
5. Click "Clear List" to remove the saved items (you'll be asked to confirm).

## Keyboard shortcuts

- Default values (you can edit at chrome://extensions/shortcuts):
  - Open popup: Ctrl+Shift+Y (this triggers the action button/opening the popup)
  - Scrape active tab: Ctrl+Shift+S

Notes: Keyboard shortcuts can vary by OS and may conflict with other system shortcuts. If a shortcut doesn't open the popup, set it manually in chrome://extensions/shortcuts.

## Implementation notes

- Manifest: MV3 with a background service worker (`background.js`) used for the `scrape` command.
- Persistence: Uses `chrome.storage.local` so the popup and background service worker share results.
- CSP: Extension pages disallow loading remote scripts by default. The project avoids loading remote libraries at runtime. To produce a true `.xlsx` binary with hyperlink objects we could bundle SheetJS locally into the extension, but the current approach builds an HTML-based `.xls` file which Excel and Google Sheets open and which preserves hyperlinks.

## Troubleshooting

- If the popup shows "Go to Google Maps Search." the active tab is not a Maps Search URL — navigate to the Maps Search page first.
- If keyboard shortcuts don't work: open `chrome://extensions/shortcuts` and assign keys.
- If an export fails or Excel doesn't open links: try opening the downloaded `.xls` in a different spreadsheet app (Google Sheets / LibreOffice). The HTML-based `.xls` is widely supported but not a true XLSX file.

## Extending/Customization

- To produce a true `.xlsx` file with hyperlink objects, download a local copy of SheetJS and bundle it with the extension (add it to the project and load it from `popup.html`). Note: bundling third-party libs increases extension size and should be done with appropriate licensing.
- To change dedupe rules, edit the key used when building `seenEntries` (currently `href` or `title + '|' + address`).
- To persist across devices, swap `chrome.storage.local` to `chrome.storage.sync` with attention to quotas.

Remove Chains (Ignore list)
- The popup now includes an "Ignore List URL" input and a "Remove Chains" button. Paste an Apps Script (or any URL) that returns either a JSON array of chain names or newline-separated plain text. Example return value:

  ["Subway", "McDonald's", "Starbucks"]

- When clicked the extension will fetch that list, persist it locally as `gmes_ignore_chains`, remove any existing leads whose title matches any token (case-insensitive substring match), and prevent future scrapes from adding matching titles. The background scrape command also respects this ignore list.

Sample minimal Google Apps Script web app that returns a JSON array (deploy as web app with access "Anyone, even anonymous" if you want unauthenticated fetch):

```javascript
function doGet(e) {
  var chains = ["Subway", "McDonald's", "Starbucks"]; // replace or generate from a Sheet
  return ContentService
    .createTextOutput(JSON.stringify(chains))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Note: the web app must allow cross-origin fetches (Apps Script returns JSON by default and works in many cases). If your fetch is blocked by CORS, consider returning newline-delimited text or enabling proper CORS headers from the server side.

## Contributing

1. Fork, edit, and create a pull request. Keep changes focused, with small commits.
2. Add tests for any non-trivial parsing logic (city extraction, industry/expensiveness parsing).

## License

MIT — feel free to adapt and reuse.

---

If you'd like, I can:
- Add a short CHANGELOG or a small screenshot.
- Add a true `.xlsx` exporter by bundling SheetJS locally (I can add the library file and update the exporter).
- Add an optional toggle to export either labels-only (current behavior) or label+URL columns.

Tell me which of those you'd like next and I'll implement it.