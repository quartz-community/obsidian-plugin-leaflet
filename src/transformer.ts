import path from "node:path";
import { createRequire as moduleRequire } from "node:module";
import type { PluggableList, Plugin } from "unified";
import type { Root as MdastRoot, Code } from "mdast";
import type { Element, ElementContent } from "hast";
import type { VFile } from "vfile";
import { visit } from "unist-util-visit";
import type {
  BuildCtx,
  QuartzTransformerPlugin,
  StaticAsset,
  StaticResources,
} from "@quartz-community/types";
import { parseLeafletBlock, type LeafletBlock } from "./parser";
import { encodePath, isUrl, noteRelativePath, resolveImage, resolveMarkerLink } from "./resolve";
import type { LeafletMapData, LeafletOptions, MapConfig, ResolvedImage } from "./types";
// @ts-expect-error Inline script bundled as a string at build time
import script from "./scripts/leaflet.inline.ts";
import style from "./styles/leaflet.scss";

declare module "vfile" {
  interface DataMap {
    leafletMaps?: LeafletMapData[];
  }
}

export const DEFAULT_OPTIONS: LeafletOptions = {
  blockLanguage: "leaflet",
  tileServer: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileSubdomains: [],
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  defaultLat: 39.983334,
  defaultLong: -82.98333,
  markerColors: {},
};

/** Obsidian Leaflet's defaults (src/utils/constants.ts DEFAULT_BLOCK_PARAMETERS). */
const BLOCK_DEFAULTS = {
  height: "500px",
  width: "100%",
  minZoom: 1,
  maxZoom: 10,
  defaultZoom: 5,
  zoomDelta: 1,
  scale: 1,
};

/** Where Quartz copies Leaflet (below `static/plugins/`), and the files the browser loads. */
export const LEAFLET_ASSET_DIR = "obsidian-plugin-leaflet/leaflet";

function leafletAssets(): StaticAsset[] {
  const pkg = moduleRequire(import.meta.url).resolve("leaflet/package.json");
  const dist = path.join(path.dirname(pkg), "dist");
  return [
    { from: path.join(dist, "leaflet.js"), to: `${LEAFLET_ASSET_DIR}/leaflet.js` },
    { from: path.join(dist, "leaflet.css"), to: `${LEAFLET_ASSET_DIR}/leaflet.css` },
    { from: path.join(dist, "images"), to: `${LEAFLET_ASSET_DIR}/images` },
  ];
}

/** `50%` of the note's height in Obsidian; a Quartz page has no fixed height, so of the window. */
function cssHeight(height: string): string {
  return height.endsWith("%") ? `${parseFloat(height)}vh` : height;
}

export interface BuiltMap {
  config: MapConfig;
  images: ResolvedImage[];
  /** Set when the map cannot be shown at all. */
  error?: string;
}

/** Turn a parsed block into what the page and the emitter need. */
export function buildMap(
  block: LeafletBlock,
  index: number,
  ctx: BuildCtx,
  noteRelPath: string,
  options: LeafletOptions,
): BuiltMap {
  const warnings = [...block.warnings];
  const images: ResolvedImage[] = [];
  const imageLayers: MapConfig["images"] = [];
  for (const img of block.images) {
    if (isUrl(img.target)) {
      imageLayers.push({ url: img.target, alias: img.alias });
      continue;
    }
    const resolved = resolveImage(ctx, img.target, noteRelPath);
    if (!resolved) {
      warnings.push(`Image not found: ${img.target}`);
      continue;
    }
    if (!images.some((i) => i.sourcePath === resolved.sourcePath)) images.push(resolved);
    imageLayers.push({ url: encodePath(resolved.destRel), alias: img.alias });
  }
  const type = block.images.length > 0 ? "image" : "real";

  const tileLayers: MapConfig["tileLayers"] = [];
  if (type === "real") {
    if (block.osmLayer) {
      tileLayers.push({
        url: options.tileServer,
        alias: "OpenStreetMap",
        subdomains: options.tileSubdomains.length > 0 ? options.tileSubdomains : undefined,
        attribution: options.attribution,
      });
    }
    for (const t of block.tileServers) {
      tileLayers.push({ url: t.url, alias: t.alias, subdomains: block.tileSubdomains });
    }
  }

  const minZoom = block.minZoom ?? BLOCK_DEFAULTS.minZoom;
  const maxZoom = Math.max(block.maxZoom ?? BLOCK_DEFAULTS.maxZoom, minZoom);
  const defaultZoom = Math.min(
    Math.max(block.defaultZoom ?? BLOCK_DEFAULTS.defaultZoom, minZoom),
    maxZoom,
  );
  const config: MapConfig = {
    id: block.id ?? `leaflet-map-${index}`,
    type,
    images: imageLayers,
    tileLayers,
    lat: block.lat ?? (type === "image" ? 50 : options.defaultLat),
    long: block.long ?? (type === "image" ? 50 : options.defaultLong),
    height: cssHeight(block.height ?? BLOCK_DEFAULTS.height),
    width: block.width ?? BLOCK_DEFAULTS.width,
    minZoom,
    maxZoom,
    defaultZoom,
    zoomDelta: block.zoomDelta && block.zoomDelta > 0 ? block.zoomDelta : BLOCK_DEFAULTS.zoomDelta,
    unit: block.unit,
    scale: block.scale ?? BLOCK_DEFAULTS.scale,
    darkMode: block.darkMode,
    bounds: block.bounds,
    noScrollZoom: block.noScrollZoom,
    noUI: block.noUI,
    recenter: block.recenter,
    markers: block.markers.map((m) => ({
      type: m.type,
      lat: m.lat,
      long: m.long,
      link: m.link ? resolveMarkerLink(ctx, m.link, m.linkText) : undefined,
      description: m.description,
      minZoom: m.minZoom,
      maxZoom: m.maxZoom,
    })),
    markerColors: options.markerColors,
    warnings,
  };
  const error =
    type === "image" && imageLayers.length === 0 ? "No image of the map was found." : undefined;
  return { config, images, error };
}

function text(value: string): ElementContent {
  return { type: "text", value };
}

/** The placeholder the browser script turns into a map. */
export function placeholder(map: BuiltMap): Element {
  const { config } = map;
  const children: ElementContent[] = [];
  if (map.error) {
    children.push({
      type: "element",
      tagName: "p",
      properties: { className: ["leaflet-map-error"] },
      children: [text(`Leaflet map "${config.id}": ${map.error}`)],
    });
  } else {
    children.push({
      type: "element",
      tagName: "div",
      properties: {
        className: ["leaflet-map-canvas"],
        style: `height: ${config.height}`,
      },
      children: [],
    });
  }
  if (config.warnings.length > 0) {
    children.push({
      type: "element",
      tagName: "ul",
      properties: { className: ["leaflet-map-warnings"] },
      children: config.warnings.map((w): ElementContent => ({
        type: "element",
        tagName: "li",
        properties: {},
        children: [text(w)],
      })),
    });
  }
  return {
    type: "element",
    tagName: "div",
    properties: {
      className: ["leaflet-map"],
      dataLeafletId: config.id,
      ...(map.error ? {} : { dataLeafletConfig: JSON.stringify(config) }),
      style: `width: ${config.width}`,
    },
    children,
  };
}

export const LeafletTransformer: QuartzTransformerPlugin<Partial<LeafletOptions>> = (
  userOptions?: Partial<LeafletOptions>,
) => {
  const options: LeafletOptions = { ...DEFAULT_OPTIONS, ...userOptions };
  return {
    name: "ObsidianLeaflet",
    markdownPlugins(ctx: BuildCtx): PluggableList {
      const plugin: Plugin<[], MdastRoot> = () => (tree: MdastRoot, file: VFile) => {
        const maps: LeafletMapData[] = [];
        const noteRelPath = noteRelativePath(ctx, file.data as Record<string, unknown>);
        visit(tree, "code", (node: Code, index, parent) => {
          if (node.lang !== options.blockLanguage || !parent || index === undefined) return;
          const built = buildMap(
            parseLeafletBlock(node.value),
            maps.length,
            ctx,
            noteRelPath,
            options,
          );
          maps.push({ id: built.config.id, images: built.images });
          const el = placeholder(built);
          // mdast-util-to-hast turns an unknown node with `data.hName` into that element
          parent.children[index] = {
            type: "leafletMap",
            data: { hName: el.tagName, hProperties: el.properties, hChildren: el.children },
          } as unknown as Code;
        });
        if (maps.length > 0) file.data.leafletMaps = maps;
      };
      return [plugin];
    },
    externalResources(): Partial<StaticResources> {
      return {
        css: [{ content: style, inline: true }],
        js: [
          {
            script,
            loadTime: "afterDOMReady",
            contentType: "inline",
            moduleType: "module",
          },
        ],
        assets: leafletAssets(),
      };
    },
  };
};
