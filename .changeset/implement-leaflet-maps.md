---
"@quartz-community/obsidian-plugin-leaflet": minor
---

Implement the plugin: ` ```leaflet ` code blocks written for Obsidian Leaflet render as interactive Leaflet maps — image maps (one or several vault images, `[[wikilink]]` form too) and real-world maps (OpenStreetMap tiles by default, extra `tileServer`s), with `lat`/`long`, size, zoom, `unit`/`scale`, `darkMode` and `marker:` lines (links open their note). Leaflet is shipped with the site and loaded only on pages with a map; maps survive SPA navigation and work under a base path. Removes the plugin template's example transformer, filter, emitter and component, which the previous releases applied to every site that enabled the plugin. Requires Quartz 5.1 or later.
