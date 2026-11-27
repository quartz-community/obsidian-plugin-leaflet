export type {
  BuildCtx,
  CSSResource,
  JSResource,
  ProcessedContent,
  QuartzEmitterPlugin,
  QuartzEmitterPluginInstance,
  QuartzPluginData,
  QuartzTransformerPlugin,
  QuartzTransformerPluginInstance,
  StaticAsset,
  StaticResources,
} from "@quartz-community/types";

/** Plugin options (`options:` of the plugin entry in quartz.config.yaml). */
export interface LeafletOptions {
  /** Code block language that is rendered as a map. */
  blockLanguage: string;
  /**
   * Tile server for real-world maps (blocks without `image:`), the layer Obsidian Leaflet calls
   * "OpenStreetMap". `{s}`, `{z}`, `{x}`, `{y}` are Leaflet placeholders.
   */
  tileServer: string;
  /** Subdomains for `{s}` in `tileServer`, if it uses them. */
  tileSubdomains: string[];
  /** Attribution shown for `tileServer` (HTML). Required by OpenStreetMap's tile usage policy. */
  attribution: string;
  /** Initial latitude of a real-world map without `lat:` (Obsidian Leaflet's default). */
  defaultLat: number;
  /** Initial longitude of a real-world map without `long:` (Obsidian Leaflet's default). */
  defaultLong: number;
  /**
   * Marker colours by marker type (`marker: <type>, …`). Types not listed here, and `default`
   * unless it is listed, use the site's `--secondary` colour.
   */
  markerColors: Record<string, string>;
}

/** A link of a marker, resolved at build time. */
export interface MarkerLink {
  /**
   * For an internal link: the page's path below the site root (`notes/page#heading`, no leading
   * slash), turned into a URL in the browser so it works under any base path. For an external
   * link: the URL as written.
   */
  href: string;
  /** Text shown in the marker's popup. */
  text: string;
  external: boolean;
}

export interface MarkerConfig {
  type: string;
  lat: number;
  long: number;
  link?: MarkerLink;
  description?: string;
  minZoom?: number;
  maxZoom?: number;
}

export interface ImageLayerConfig {
  /** Path below the site root (no leading slash), or an absolute http(s) URL. */
  url: string;
  alias?: string;
}

export interface TileLayerConfig {
  url: string;
  alias?: string;
  subdomains?: string[];
  attribution?: string;
}

/** What the page's placeholder carries to the browser (`data-leaflet-config`). */
export interface MapConfig {
  id: string;
  type: "image" | "real";
  /** Image maps: the image layers, first one shown. */
  images: ImageLayerConfig[];
  /** Real-world maps: the tile layers, first one shown. */
  tileLayers: TileLayerConfig[];
  /** Image maps: percent of the image from the top-left corner. Real maps: degrees. */
  lat: number;
  long: number;
  height: string;
  width: string;
  minZoom: number;
  maxZoom: number;
  defaultZoom: number;
  zoomDelta: number;
  unit?: string;
  scale: number;
  darkMode: boolean;
  bounds?: [[number, number], [number, number]];
  noScrollZoom: boolean;
  noUI: boolean;
  recenter: boolean;
  markers: MarkerConfig[];
  markerColors: Record<string, string>;
  /** Problems found while building the map, shown under it. */
  warnings: string[];
}

/** An image of a map, as found on disk: only the emitter needs `sourcePath`. */
export interface ResolvedImage {
  /** Absolute path of the image on the build machine. Never written into the page. */
  sourcePath: string;
  /** Path below the output directory (and below the site root). */
  destRel: string;
}

export interface LeafletMapData {
  id: string;
  images: ResolvedImage[];
}
