# T’au Empire Faction Pack — In-Game Reference (PWA)

A fast, offline, mobile-friendly reference for the **T’au Empire Faction Pack (Version 1.0, June 2026)**.
Built to use at the table: datasheets, stat lines, weapons, abilities, wargear, detachments,
stratagems, enhancements, and the rules-update errata + FAQs — all searchable.

> Unofficial personal reference compiled from the official Faction Pack PDF. Not a substitute for the official rules.

## Use it on your phone (install as an app)

1. On your Mac, from this folder, start a tiny web server:
   ```
   cd ~/tau-reference
   python3 -m http.server 8123
   ```
2. Find your Mac’s IP: **System Settings → Wi-Fi → Details → IP address** (e.g. `192.168.1.42`).
3. On your phone (same Wi-Fi), open Safari/Chrome to `http://192.168.1.42:8123`.
4. **Add to Home Screen** (Safari: Share → Add to Home Screen). It now launches like an app and
   **works fully offline** — you can stop the server and turn off Wi-Fi; it keeps working.

You can also just open `index.html` directly in a browser on the Mac to use it there.

## Features
- **Search** across unit names, weapons, keywords, abilities, stratagems, enhancements, and errata.
- **Tabs:** Units · Stratagems · Enhancements · Detachments · Rules & FAQ.
- Tap any unit for its full datasheet (stat line, ranged/melee weapon tables with keywords,
  abilities, wargear abilities, damaged bracket, wargear options, unit composition, keywords).
- Dark, high-contrast theme for dim venues.

## Files
- `index.html`, `styles.css`, `app.js` — the app (vanilla JS, no build step).
- `data.json` — all extracted faction data.
- `manifest.webmanifest`, `sw.js`, `icon-*.png` — PWA / offline support.
- `build/` — the extraction pipeline (see below). Not needed to run the app.

## Rebuilding the data (if the pack is updated)
The data was extracted from the PDF with `poppler` + small Node scripts (no dependencies):
```
cd build
pdftotext -bbox-layout "/path/to/faction_pack.pdf" bbox.html
node parse.js          # datasheets  -> datasheets.json
node parse_det.js      # detachments/stratagems/enhancements
node parse_updates.js  # rules updates + FAQs
node assemble.js       # -> ../data.json
node genicon.js        # app icons
```
After rebuilding, bump the cache name in `sw.js` (e.g. `tau-pack-v2`) so devices pick up the new data.
