# Obsidian Leaflet — Quartz v5 Plugin

Renders the maps of the Obsidian plugin [Obsidian Leaflet](https://github.com/javalent/obsidian-leaflet)
on a Quartz v5 site: a ` ```leaflet ` code block becomes an interactive [Leaflet](https://leafletjs.com)
map (image maps from vault images, or real-world maps from a tile server) with its markers. The
maps are read-only; author them in Obsidian with the original plugin.

## Installation

```bash
npx quartz plugin add @quartz-community/obsidian-plugin-leaflet
```

```yaml title="quartz.config.yaml"
plugins:
  - source: "@quartz-community/obsidian-plugin-leaflet"
    enabled: true
```

One entry registers both parts: the transformer that turns the code blocks into maps, and the
emitter that copies the map images to the site. Requires Quartz 5.1 or later (plugin assets).

## Configuration

| Option           | Type     | Default                                            | Description                                                                                                         |
| ---------------- | -------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `blockLanguage`  | string   | `"leaflet"`                                        | Code block language rendered as a map.                                                                              |
| `tileServer`     | string   | `"https://tile.openstreetmap.org/{z}/{x}/{y}.png"` | Default layer of real-world maps (Obsidian Leaflet's "OpenStreetMap" layer).                                        |
| `tileSubdomains` | string[] | `[]`                                               | Subdomains for `{s}` in `tileServer`.                                                                               |
| `attribution`    | string   | OpenStreetMap contributors                         | Attribution (HTML) shown for `tileServer`.                                                                          |
| `defaultLat`     | number   | `39.983334`                                        | Latitude of a real-world map without `lat` (Obsidian Leaflet's default).                                            |
| `defaultLong`    | number   | `-82.98333`                                        | Longitude of a real-world map without `long`.                                                                       |
| `markerColors`   | object   | `{}`                                               | Marker colour per marker type, e.g. `{ default: "#2b6cb0", inn: "#c05621" }`. Others use the theme's `--secondary`. |

Obsidian Leaflet's marker types (icons and colours) live in the Obsidian plugin's settings, not in
the vault's notes, so Quartz can't read them: every marker is drawn as a pin, coloured by
`markerColors`.

Using OpenStreetMap's tiles on a public site is subject to its
[tile usage policy](https://operations.osmfoundation.org/policies/tiles/); set `tileServer` to
another provider for heavier use.

## Syntax

Write the blocks as for Obsidian Leaflet:

````markdown
```leaflet
id: amsterdam
lat: 52.3731
long: 4.8922
height: 400px
defaultZoom: 13
maxZoom: 16
marker: default, 52.3731, 4.8922, [[Dam Square]], The centre
marker: cafe, 52.3600, 4.8850, , "Coffee, cake"
```
````

````markdown
```leaflet
id: world
image:
  - [[World Map.png|Overworld]]
  - [[Dungeon.png|Dungeon]]
lat: 50%
long: 50%
minZoom: 7
maxZoom: 10
defaultZoom: 8
unit: miles
scale: 2
darkMode: true
marker: default, -0.55, 0.75, [[Capital]]
```
````

### Supported parameters

| Parameter                                        | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                             | Map id (used for the element's `data-leaflet-id`).                                                                                                                                                                                                                                                                                                                                                                     |
| `image`                                          | One image, a YAML list, or repeated `image:` lines. `[[wikilink]]`, `[[path\|Alias]]`, a vault path or an `https://` URL. Images are found like Obsidian links: relative to the note, from the vault root, then by file name. Several images become base layers with a layer switcher (alias = layer name). Without `image`, the map is a real-world map.                                                              |
| `tileServer`                                     | Extra tile layers for real-world maps: `url\|alias`, one or a YAML list.                                                                                                                                                                                                                                                                                                                                               |
| `tileSubdomains`                                 | Subdomains for `{s}` in the block's `tileServer`s (`a,b,c`).                                                                                                                                                                                                                                                                                                                                                           |
| `osmLayer`                                       | `false` drops the default layer (only together with a `tileServer`).                                                                                                                                                                                                                                                                                                                                                   |
| `lat`, `long`                                    | Initial centre. Real-world maps: degrees. Image maps: percent of the image from its top-left corner (default `50%`).                                                                                                                                                                                                                                                                                                   |
| `height`, `width`                                | `500px` and `100%` by default. A percentage height is taken of the window height (Obsidian: of the note's height).                                                                                                                                                                                                                                                                                                     |
| `minZoom`, `maxZoom`, `defaultZoom`, `zoomDelta` | Defaults `1`, `10`, `5`, `1`. `defaultZoom` is clamped to the zoom range.                                                                                                                                                                                                                                                                                                                                              |
| `unit`, `scale`                                  | Show a scale bar. Real-world maps: imperial for `mi`/`ft`/`yd`, metric otherwise. Image maps: `scale` units per map unit, labelled with `unit`.                                                                                                                                                                                                                                                                        |
| `marker`                                         | `marker: type, lat, long, link, description, minZoom, maxZoom`, one line per marker. Everything but `lat`/`long` may be empty; quote a description that contains commas. The link is a `[[wikilink]]` (with `#heading` and `\|alias`), a note name, a Markdown link or a URL: clicking the marker opens it, hovering shows the link text and description. `minZoom`/`maxZoom` hide the marker outside that zoom range. |
| `darkMode`                                       | Inverts the map's colours with Obsidian Leaflet's filter — on a Quartz site only while the site is in dark mode.                                                                                                                                                                                                                                                                                                       |
| `bounds`                                         | `[[lat, long], [lat, long]]`: where an image map's image lies (marker coordinates then use these units).                                                                                                                                                                                                                                                                                                               |
| `recenter`                                       | Keep an image map within its image.                                                                                                                                                                                                                                                                                                                                                                                    |
| `noScrollZoom`, `noUI`                           | Disable wheel zoom; hide the zoom and layer controls.                                                                                                                                                                                                                                                                                                                                                                  |

Marker coordinates of image maps are in Leaflet's units, as Obsidian Leaflet stores them (its
"copy coordinates" values): by default the image spans latitude `0` to `-height / 2^(maxZoom-1)`
and longitude `0` to `width / 2^(maxZoom-1)`.

Problems in a block (an image that isn't found, an unparseable marker) are listed under the map.

### Not supported

Quartz renders the maps read-only and without Obsidian's plugin settings or Dataview, so these
parameters are ignored: `markerFile`, `markerFolder`, `markerTag`, `filterTag`, `linksTo`,
`linksFrom`, `commandMarker`, `coordinates`, `zoomTag`, `overlay`, `overlayTag`, `overlayColor`,
`geojson`, `geojsonFolder`, `geojsonColor`, `gpx`, `gpxFolder`, `gpxMarkers`, `gpxColor`,
`imageOverlay`, `tileOverlay`, `draw`, `drawColor`, `lock`, `showAllMarkers`, `zoomFeatures`,
`preserveAspect`, `distanceMultiplier`, marker icons, distance measuring and the initiative
tracker. Maps in hover previews (popovers) are not drawn.

## How it works

- The transformer parses each block at build time (like Obsidian Leaflet: links are taken out
  before the YAML is parsed, `marker:` lines are read one by one), resolves images and links, and
  replaces the block with a `<div class="leaflet-map" data-leaflet-config="…">`. The config holds
  only paths below the site root, never paths on the build machine.
- The emitter copies the map images to the output, at the slug Quartz gives them.
- Leaflet 1.9 comes from this package's dependency and is shipped with the site as a plugin asset
  (`static/plugins/obsidian-plugin-leaflet/leaflet/`). A small inline script loads it only on pages
  that have a map, resolving URLs from `window.quartzStaticUrl` so maps work under a base path, and
  mounts the maps after every SPA navigation (`nav`), removing them on the way out
  (`window.addCleanup`).

## Development

```bash
npm ci
npm run build
npm test
npm run typecheck && npm run lint && npm run format
```

## License

MIT. Block syntax and defaults follow [Obsidian Leaflet](https://github.com/javalent/obsidian-leaflet)
by Jeremy Valentine (MIT); maps are drawn with [Leaflet](https://leafletjs.com) (BSD-2-Clause).
