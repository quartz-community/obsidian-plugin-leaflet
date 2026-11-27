/*
 * Mounts the maps of ```leaflet blocks. Leaflet itself (shipped by the plugin, see
 * transformer.ts) is loaded only on pages that have a map, once per visit.
 */
import type * as Leaflet from "leaflet";
import type { MapConfig, MarkerConfig } from "../types";

type L = typeof Leaflet;

declare global {
  interface Window {
    L?: L;
    __quartzLeaflet?: boolean;
  }
}

const ASSET_DIR = "plugins/obsidian-plugin-leaflet/leaflet/";

/** The site root (`<site>/`), from Quartz's `quartzStaticUrl`; holds across SPA navigation. */
function siteRoot(): URL {
  const staticUrl = window.quartzStaticUrl;
  return staticUrl ? new URL("../", staticUrl) : new URL("/", location.href);
}

/** A path below the site root, or an absolute URL, as a URL. */
function siteUrl(rootPath: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(rootPath)) return rootPath;
  return new URL(rootPath.replace(/^\/+/, ""), siteRoot()).href;
}

function assetUrl(file: string): string {
  return new URL(ASSET_DIR + file, siteUrl("static/")).href;
}

let leaflet: Promise<L> | undefined;

function loadLeaflet(): Promise<L> {
  leaflet ??= (async () => {
    const css = new Promise<void>((resolve, reject) => {
      const href = assetUrl("leaflet.css");
      const existing = document.head.querySelector<HTMLLinkElement>(
        `link[data-leaflet-css][href="${href}"]`,
      );
      if (existing) return resolve();
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.leafletCss = "";
      // Quartz's SPA navigation keeps only head elements marked data-persist
      link.setAttribute("data-persist", "");
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Could not load ${href}`));
      document.head.appendChild(link);
    });
    const js = new Promise<L>((resolve, reject) => {
      if (window.L) return resolve(window.L);
      const src = assetUrl("leaflet.js");
      const el = document.createElement("script");
      el.src = src;
      el.setAttribute("data-persist", "");
      el.onload = () => (window.L ? resolve(window.L) : reject(new Error(`${src} defined no L`)));
      el.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(el);
    });
    const [, L] = await Promise.all([css, js]);
    return L;
  })();
  leaflet.catch(() => {
    leaflet = undefined; // let the next navigation retry
  });
  return leaflet;
}

function pinSvg(color: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32" width="24" height="32" aria-hidden="true">` +
    `<path fill="${color}" stroke="rgba(0,0,0,.45)" stroke-width="1" d="M12 1C6 1 1.5 5.6 1.5 11.4 1.5 19.3 12 31 12 31s10.5-11.7 10.5-19.6C22.5 5.6 18 1 12 1z"/>` +
    `<circle cx="12" cy="11.5" r="4" fill="#fff" fill-opacity=".85"/></svg>`
  );
}

function escapeAttr(s: string): string {
  return s.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`);
}

function markerColor(cfg: MapConfig, type: string): string {
  const color = cfg.markerColors[type] ?? cfg.markerColors.default;
  // anything but a plain colour value falls back to the theme
  return color && /^[#a-z0-9(),.%\s-]+$/i.test(color) ? color : "var(--secondary, #284b63)";
}

function markerTooltip(m: MarkerConfig): HTMLElement | undefined {
  if (!m.link && !m.description) return undefined;
  const el = document.createElement("div");
  el.className = "leaflet-map-tooltip";
  if (m.link) {
    const strong = document.createElement("strong");
    strong.textContent = m.link.text;
    el.appendChild(strong);
  }
  if (m.description) {
    const p = document.createElement("div");
    p.textContent = m.description;
    el.appendChild(p);
  }
  return el;
}

function followLink(m: MarkerConfig) {
  if (!m.link) return;
  const url = new URL(siteUrl(m.link.href));
  if (m.link.external) {
    window.open(url.href, "_blank", "noopener");
  } else if (window.spaNavigate) {
    void window.spaNavigate(url, false);
  } else {
    location.href = url.href;
  }
}

function addMarkers(
  L: L,
  map: Leaflet.Map,
  cfg: MapConfig,
  toLatLng: (m: MarkerConfig) => Leaflet.LatLngExpression,
) {
  const group = L.layerGroup().addTo(map);
  const markers = cfg.markers.map((m) => {
    const icon = L.divIcon({
      className: `leaflet-map-marker leaflet-map-marker-${m.type.replace(/[^a-z0-9_-]/gi, "-")}`,
      html: pinSvg(escapeAttr(markerColor(cfg, m.type))),
      iconSize: [24, 32],
      iconAnchor: [12, 31],
      tooltipAnchor: [0, -28],
    });
    const marker = L.marker(toLatLng(m), {
      icon,
      keyboard: true,
      title: m.link?.text ?? m.description ?? "",
      alt: m.link?.text ?? m.description ?? "Marker",
    });
    const tooltip = markerTooltip(m);
    if (tooltip) marker.bindTooltip(tooltip, { direction: "top" });
    if (m.link) {
      marker.on("click", () => followLink(m));
      marker.on("add", () => marker.getElement()?.classList.add("leaflet-map-marker-link"));
    }
    return { m, marker };
  });
  const update = () => {
    const z = map.getZoom();
    for (const { m, marker } of markers) {
      const show =
        (m.minZoom === undefined || z >= m.minZoom) && (m.maxZoom === undefined || z <= m.maxZoom);
      if (show && !group.hasLayer(marker)) group.addLayer(marker);
      if (!show && group.hasLayer(marker)) group.removeLayer(marker);
    }
  };
  map.on("zoomend", update);
  update();
}

const IMPERIAL = new Set([
  "mi",
  "ft",
  "yd",
  "in",
  "mile",
  "miles",
  "feet",
  "foot",
  "yard",
  "yards",
]);

/** Image maps: a scale bar of `scale` units per map unit (Obsidian Leaflet's distance factor). */
function imageScale(L: L, map: Leaflet.Map, cfg: MapConfig) {
  const Control = L.Control.extend({
    onAdd() {
      const div = L.DomUtil.create("div", "leaflet-control-scale leaflet-bar-scale");
      const line = L.DomUtil.create("div", "leaflet-control-scale-line", div);
      const update = () => {
        // map units per screen pixel at this zoom, times the block's scale
        const perPx = (cfg.scale || 1) / Math.pow(2, map.getZoom());
        const max = perPx * 100;
        const pow = Math.pow(10, Math.floor(Math.log10(max)));
        const step = [5, 2, 1].map((s) => s * pow).find((s) => s <= max) ?? pow;
        line.style.width = `${Math.round(step / perPx)}px`;
        line.textContent = `${Number(step.toPrecision(6))} ${cfg.unit ?? ""}`.trim();
      };
      map.on("zoomend", update);
      update();
      return div;
    },
  });
  new Control({ position: "bottomleft" }).addTo(map);
}

function loadImage(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error(`Could not load the map image ${url}`));
    img.src = url;
  });
}

function showError(root: HTMLElement, message: string) {
  const p = document.createElement("p");
  p.className = "leaflet-map-error";
  p.textContent = message;
  root.appendChild(p);
}

async function mount(L: L, root: HTMLElement, cfg: MapConfig) {
  let canvas = root.querySelector<HTMLElement>(".leaflet-map-canvas");
  if (!canvas) return;
  if ("_leaflet_id" in canvas) {
    // still holds a map (an element reused by SPA navigation): start from a clean element
    const fresh = document.createElement("div");
    fresh.className = "leaflet-map-canvas";
    fresh.style.height = cfg.height;
    canvas.replaceWith(fresh);
    canvas = fresh;
  }
  const image = cfg.type === "image";
  const map = L.map(canvas, {
    crs: image ? L.CRS.Simple : L.CRS.EPSG3857,
    minZoom: cfg.minZoom,
    maxZoom: cfg.maxZoom,
    zoomDelta: cfg.zoomDelta,
    zoomSnap: cfg.zoomDelta,
    wheelPxPerZoomLevel: 60 / cfg.zoomDelta,
    scrollWheelZoom: !cfg.noScrollZoom,
    zoomControl: !cfg.noUI,
    attributionControl: !image,
    worldCopyJump: !image,
  });
  if (!image) map.attributionControl?.setPrefix(false);
  const removeMap = () => map.remove();
  const resize = new ResizeObserver(() => map.invalidateSize());
  resize.observe(canvas);
  // undefined only before Quartz's SPA script has run (or without it)
  window.addCleanup?.(() => {
    resize.disconnect();
    removeMap();
  });

  const layerClass = cfg.darkMode ? "leaflet-map-dark" : "";
  const baseLayers: Record<string, Leaflet.Layer> = {};
  let first: Leaflet.Layer | undefined;
  let bounds: Leaflet.LatLngBounds | undefined;

  if (image) {
    const urls = cfg.images.map((i) => siteUrl(i.url));
    const sizes = await Promise.allSettled(urls.map(loadImage));
    // the map may have been removed by a navigation while the images loaded
    if (!canvas.isConnected) return;
    sizes.forEach((res, i) => {
      if (res.status === "rejected") {
        showError(root, res.reason instanceof Error ? res.reason.message : String(res.reason));
        return;
      }
      const { w, h } = res.value;
      const layerBounds = cfg.bounds
        ? L.latLngBounds(cfg.bounds)
        : L.latLngBounds(
            map.unproject([0, h], cfg.maxZoom - 1),
            map.unproject([w, 0], cfg.maxZoom - 1),
          );
      const overlay = L.imageOverlay(urls[i]!, layerBounds, { className: layerClass });
      const name = cfg.images[i]!.alias ?? `Layer ${Object.keys(baseLayers).length + 1}`;
      baseLayers[name] = overlay;
      if (!first) {
        first = overlay;
        bounds = layerBounds;
      }
    });
    if (!first || !bounds) return;
    // lat/long are percent of the image from its top-left corner (unless bounds are given)
    const center = bounds.getCenter();
    const initial = cfg.bounds
      ? L.latLng(cfg.lat, cfg.long)
      : L.latLng((cfg.lat * center.lat) / 50, (cfg.long * center.lng) / 50);
    map.setView(initial, cfg.defaultZoom, { animate: false });
    if (cfg.recenter) map.setMaxBounds(bounds);
    if (cfg.unit || cfg.scale !== 1) imageScale(L, map, cfg);
  } else {
    cfg.tileLayers.forEach((t, i) => {
      const layer = L.tileLayer(t.url, {
        attribution: t.attribution ?? "",
        className: layerClass,
        ...(t.subdomains ? { subdomains: t.subdomains } : {}),
        maxZoom: cfg.maxZoom,
      });
      baseLayers[t.alias ?? `Layer ${i + 1}`] = layer;
      first ??= layer;
    });
    map.setView([cfg.lat, cfg.long], cfg.defaultZoom, { animate: false });
    if (cfg.unit) {
      const imperial = IMPERIAL.has(cfg.unit.toLowerCase());
      L.control.scale({ metric: !imperial, imperial }).addTo(map);
    }
  }
  first?.addTo(map);
  if (Object.keys(baseLayers).length > 1 && !cfg.noUI) L.control.layers(baseLayers).addTo(map);
  addMarkers(L, map, cfg, (m) => [m.lat, m.long]);
}

// Marked on the element, not kept in a set: Quartz's SPA navigation morphs the old page into the
// new one and may reuse a map's element for the next page's map, dropping the attribute.
const MOUNTED = "data-leaflet-mounted";

async function mountAll() {
  const roots = [
    ...document.querySelectorAll<HTMLElement>(
      `.leaflet-map[data-leaflet-config]:not([${MOUNTED}])`,
    ),
  ].filter((r) => !r.closest(".popover"));
  if (roots.length === 0) return;
  roots.forEach((r) => r.setAttribute(MOUNTED, ""));
  let L: L;
  try {
    L = await loadLeaflet();
  } catch (err) {
    console.error("[obsidian-plugin-leaflet]", err);
    roots.forEach((r) => {
      r.removeAttribute(MOUNTED);
      if (r.isConnected) showError(r, "The map could not be loaded.");
    });
    return;
  }
  for (const root of roots) {
    if (!root.isConnected) continue;
    let cfg: MapConfig;
    try {
      cfg = JSON.parse(root.dataset.leafletConfig ?? "") as MapConfig;
    } catch {
      showError(root, "The map's configuration could not be read.");
      continue;
    }
    mount(L, root, cfg).catch((err: unknown) => {
      console.error("[obsidian-plugin-leaflet]", err);
      showError(root, "The map could not be shown.");
    });
  }
}

// The script can run again after an SPA navigation; register once.
if (!window.__quartzLeaflet) {
  window.__quartzLeaflet = true;
  document.addEventListener("nav", () => void mountAll());
  void mountAll();
}
