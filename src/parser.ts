/*
 * Parsing of Obsidian Leaflet code blocks, following javalent/obsidian-leaflet
 * (src/utils/utils.ts getParamsFromSource, src/renderer/renderer.ts getImmutableMarkers):
 * links are taken out before the YAML is parsed (YAML reads `[[x]]` as a nested list), `marker:`
 * and repeated `image:` lines are read line by line, and marker lines are comma-separated values.
 */
import { parse as parseYaml } from "yaml";

/** A marker as written in the block, before its link is resolved. */
export interface RawMarker {
  type: string;
  lat: number;
  long: number;
  /** Link target as written, without brackets: `Note`, `Note#Heading`, `https://…`. */
  link?: string;
  /** Text of the link: the wikilink alias or the Markdown link's text. */
  linkText?: string;
  description?: string;
  minZoom?: number;
  maxZoom?: number;
}

export interface RawImage {
  /** Vault path or URL, as written. */
  target: string;
  alias?: string;
}

export interface RawTileServer {
  url: string;
  alias?: string;
}

export interface LeafletBlock {
  id?: string;
  images: RawImage[];
  tileServers: RawTileServer[];
  tileSubdomains?: string[];
  osmLayer: boolean;
  /** Numbers as written; `%` (image maps) is stripped. */
  lat?: number;
  long?: number;
  height?: string;
  width?: string;
  minZoom?: number;
  maxZoom?: number;
  defaultZoom?: number;
  zoomDelta?: number;
  unit?: string;
  scale?: number;
  darkMode: boolean;
  bounds?: [[number, number], [number, number]];
  noScrollZoom: boolean;
  noUI: boolean;
  recenter: boolean;
  markers: RawMarker[];
  /** Problems with the block, shown under the map. */
  warnings: string[];
}

/** `[text](url)` or `[[target]]`, as Obsidian Leaflet matches them. */
const LINK_RE = /(?:\[[^\]\n]*\]\(|\[\[)[^[\]\n]*(?:\)|\]\])/g;
const PLACEHOLDER = "LEAFLET_INTERNAL_LINK_";
/** Keys whose lines are read one by one (Obsidian Leaflet allows them more than once). */
const LINE_KEYS = ["marker", "image", "tileServer"] as const;
type LineKey = (typeof LINE_KEYS)[number];

/** Split `[[target|alias]]`, `[text](url)` or a bare string into target and text. */
export function parseLink(link: string): { target: string; text?: string } | undefined {
  const trimmed = link.trim();
  if (!trimmed) return undefined;
  const wiki = /^!?\[\[([^[\]]+)\]\]$/.exec(trimmed);
  if (wiki) {
    const [target, ...alias] = wiki[1]!.split("|");
    const text = alias.join("|").trim();
    return { target: target!.trim(), text: text || undefined };
  }
  const md = /^!?\[([^\]]*)\]\(([^)]*)\)$/.exec(trimmed);
  if (md) {
    const text = md[1]!.trim();
    return { target: md[2]!.trim(), text: text || undefined };
  }
  return { target: trimmed.replace(/[[\]]/g, "") };
}

/** One line of comma-separated values; `"…"` quotes a value that contains commas. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  let wasQuoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"' && cur.trim() === "") {
      quoted = true;
      wasQuoted = true;
      cur = "";
    } else if (ch === ",") {
      out.push(wasQuoted ? cur : cur.trim());
      cur = "";
      wasQuoted = false;
    } else if (!wasQuoted) {
      cur += ch;
    }
  }
  out.push(wasQuoted ? cur : cur.trim());
  return out;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(String(value).trim().replace(/%$/, ""));
  return Number.isFinite(n) ? n : undefined;
}

function toBool(value: unknown): boolean {
  return String(value).trim().toLowerCase() === "true";
}

function toList(value: unknown): unknown[] {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value.flat(Infinity) : [value];
}

/**
 * Parse one marker line (`type, lat, long, link, description, minZoom, maxZoom`). Every field but
 * the coordinates may be empty; an empty type is `default`.
 */
export function parseMarker(value: string): RawMarker | string {
  const [type, lat, long, link, description, minZoom, maxZoom] = parseCsvLine(value);
  const latN = toNumber(lat);
  const longN = toNumber(long);
  if (latN === undefined) return `Could not parse the latitude of marker "${value}".`;
  if (longN === undefined) return `Could not parse the longitude of marker "${value}".`;
  const marker: RawMarker = {
    type: type && type !== "undefined" ? type : "default",
    lat: latN,
    long: longN,
  };
  const parsedLink = link ? parseLink(link) : undefined;
  if (parsedLink?.target) {
    marker.link = parsedLink.target;
    if (parsedLink.text) marker.linkText = parsedLink.text;
  }
  if (description && description !== "undefined") marker.description = description;
  const min = toNumber(minZoom);
  const max = toNumber(maxZoom);
  if (min !== undefined) marker.minZoom = min;
  if (max !== undefined) marker.maxZoom = max;
  return marker;
}

function parseImage(value: string): RawImage | undefined {
  const link = parseLink(value);
  if (!link) return undefined;
  // `image: map.png|Alias` (no brackets) also takes an alias
  if (link.text === undefined && !/^[a-z][a-z0-9+.-]*:\/\//i.test(link.target)) {
    const [target, ...alias] = link.target.split("|");
    const text = alias.join("|").trim();
    return { target: target!.trim(), alias: text || undefined };
  }
  return { target: link.target, alias: link.text };
}

function parseTileServer(value: string): RawTileServer | undefined {
  const [url, ...alias] = value.trim().split("|");
  if (!url) return undefined;
  const text = alias.join("|").trim();
  return { url: url.trim(), alias: text || undefined };
}

function parseBounds(value: unknown): [[number, number], [number, number]] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const pts = value.map((p) => (Array.isArray(p) && p.length === 2 ? p.map(toNumber) : []));
  const [a, b] = pts;
  if (!a || !b || [...a, ...b].some((n) => n === undefined)) return undefined;
  return [
    [a[0]!, a[1]!],
    [b[0]!, b[1]!],
  ];
}

/** Parse the text of a ```leaflet block. */
export function parseLeafletBlock(source: string): LeafletBlock {
  const warnings: string[] = [];

  const links: string[] = [];
  const withPlaceholders = source.replace(LINK_RE, (link) => {
    links.push(link);
    return `${PLACEHOLDER}${links.length - 1}`;
  });
  const restore = (s: string) =>
    s.replace(new RegExp(`${PLACEHOLDER}(\\d+)`, "g"), (m, i) => links[Number(i)] ?? m);

  // Lines read one by one: every `marker: …`, and `image:`/`tileServer:` when repeated.
  const lineValues: Record<LineKey, string[]> = { marker: [], image: [], tileServer: [] };
  const lines = withPlaceholders.split(/\r?\n/);
  const keyLines = (key: LineKey) =>
    lines.filter((l) => new RegExp(`^${key}:\\s*\\S`).test(l)).length;
  const repeated = new Set<LineKey>(LINE_KEYS.filter((k) => k === "marker" || keyLines(k) > 1));
  const yamlLines = lines.filter((line) => {
    for (const key of repeated) {
      const m = new RegExp(`^${key}:\\s*(\\S.*)$`).exec(line);
      if (m) {
        lineValues[key].push(restore(m[1]!.trim()));
        return false;
      }
    }
    return true;
  });

  let params: Record<string, unknown> = {};
  try {
    const parsed: unknown = parseYaml(yamlLines.join("\n"), { uniqueKeys: false });
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      params = parsed as Record<string, unknown>;
    }
  } catch {
    // Like Obsidian Leaflet: fall back to `key: value` lines
    for (const line of yamlLines) {
      const m = /^([A-Za-z]+):\s?(.*)$/.exec(line);
      if (m) params[m[1]!] = m[2]!.trim();
    }
  }
  const restoreDeep = (v: unknown): unknown =>
    typeof v === "string"
      ? restore(v)
      : Array.isArray(v)
        ? v.map(restoreDeep)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, restoreDeep(x)]))
          : v;
  params = restoreDeep(params) as Record<string, unknown>;

  const str = (key: string): string | undefined => {
    const v = params[key];
    if (v === undefined || v === null || v === "") return undefined;
    return String(v).trim();
  };
  const num = (key: string): number | undefined => {
    const v = params[key];
    if (v === undefined || v === null || v === "") return undefined;
    const n = toNumber(v);
    if (n === undefined) warnings.push(`Could not parse ${key}: "${String(v)}".`);
    return n;
  };

  const markers: RawMarker[] = [];
  for (const value of [...lineValues.marker, ...toList(params.marker).map(String)]) {
    const marker = parseMarker(value);
    if (typeof marker === "string") warnings.push(marker);
    else markers.push(marker);
  }

  const images = [...lineValues.image, ...toList(params.image).map(String)]
    .map(parseImage)
    .filter((i): i is RawImage => i !== undefined && i.target !== "real");

  const tileServers = [...lineValues.tileServer, ...toList(params.tileServer).map(String)]
    .map(parseTileServer)
    .filter((t): t is RawTileServer => t !== undefined);

  const subdomains = toList(params.tileSubdomains)
    .flatMap((s) => String(s).split(","))
    .map((s) => s.trim())
    .filter(Boolean);

  const height = str("height");
  const width = str("width");

  const block: LeafletBlock = {
    id: str("id"),
    images,
    tileServers,
    tileSubdomains: subdomains.length > 0 ? subdomains : undefined,
    osmLayer: params.osmLayer === undefined ? true : toBool(params.osmLayer),
    lat: num("lat"),
    long: num("long"),
    height:
      height === undefined ? undefined : /^\d+(\.\d+)?$/.test(height) ? `${height}px` : height,
    width: width === undefined ? undefined : /^\d+(\.\d+)?$/.test(width) ? `${width}px` : width,
    minZoom: num("minZoom"),
    maxZoom: num("maxZoom"),
    defaultZoom: num("defaultZoom"),
    zoomDelta: num("zoomDelta"),
    unit: str("unit"),
    scale: num("scale"),
    darkMode: toBool(params.darkMode),
    bounds: params.bounds === undefined ? undefined : parseBounds(params.bounds),
    noScrollZoom: toBool(params.noScrollZoom),
    noUI: toBool(params.noUI),
    recenter: toBool(params.recenter),
    markers,
    warnings,
  };
  if (params.bounds !== undefined && !block.bounds) {
    warnings.push("Could not parse bounds (expected [[lat, long], [lat, long]]).");
  }
  if (block.height !== undefined && !/^\d+(\.\d+)?(px|%)$/.test(block.height)) {
    warnings.push(`Could not parse height "${block.height}"; using 500px.`);
    block.height = undefined;
  }
  if (!block.osmLayer && block.tileServers.length === 0) {
    warnings.push("osmLayer: false needs at least one tileServer; keeping the default layer.");
    block.osmLayer = true;
  }
  return block;
}
