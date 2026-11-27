import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import type { Root as HastRoot, Element } from "hast";
import type { Root as MdastRoot } from "mdast";
import type { FilePath, FullSlug } from "@quartz-community/types";
import { VFile } from "vfile";
import { visit } from "unist-util-visit";
import { DEFAULT_OPTIONS, LeafletTransformer } from "../src/transformer";
import type { MapConfig } from "../src/types";
import { createCtx } from "./helpers";

let tmp: string;
let contentDir: string;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(tmpdir(), "leaflet-transform-"));
  contentDir = path.join(tmp, "content");
  await fs.mkdir(path.join(contentDir, "Maps"), { recursive: true });
  await fs.mkdir(path.join(contentDir, "Places"), { recursive: true });
  await fs.writeFile(path.join(contentDir, "Maps", "World Map.png"), "png");
  await fs.writeFile(path.join(contentDir, "Places", "local.png"), "png");
});

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

function ctx() {
  return createCtx({
    argv: { directory: contentDir },
    allSlugs: ["index", "places/utrecht", "places/town"] as FullSlug[],
    allFiles: ["index.md", "Maps/World Map.png", "Places/local.png"] as FilePath[],
  });
}

async function run(markdown: string, relativePath = "Places/Town.md", opts = {}) {
  const transformer = LeafletTransformer(opts);
  const file = new VFile({ value: markdown });
  file.data.relativePath = relativePath as FilePath;
  const processor = unified()
    .use(remarkParse)
    .use(transformer.markdownPlugins!(ctx()))
    .use(remarkRehype);
  const mdast = processor.parse(file) as MdastRoot;
  const tree = (await processor.run(mdast, file)) as HastRoot;
  const maps: Element[] = [];
  visit(tree, "element", (el: Element) => {
    const cls = el.properties?.className;
    if (Array.isArray(cls) && cls.includes("leaflet-map")) maps.push(el);
  });
  return { tree, file, maps, transformer };
}

function config(el: Element): MapConfig {
  return JSON.parse(String(el.properties!.dataLeafletConfig)) as MapConfig;
}

describe("LeafletTransformer", () => {
  it("leaves other code blocks alone", async () => {
    const { maps, file, tree } = await run("```js\nconst a = 1\n```");
    expect(maps).toHaveLength(0);
    expect(file.data.leafletMaps).toBeUndefined();
    expect(JSON.stringify(tree)).toContain("language-js");
  });

  it("replaces a real-world block with a placeholder carrying its config", async () => {
    const { maps, tree } = await run(
      [
        "```leaflet",
        "id: amsterdam-map",
        "lat: 52.3731",
        "long: 4.8922",
        "height: 300px",
        "defaultZoom: 13",
        "marker: default, 52.3731, 4.8922, [[Utrecht]], Dam square",
        "```",
      ].join("\n"),
    );
    expect(JSON.stringify(tree)).not.toContain("language-leaflet");
    expect(maps).toHaveLength(1);
    const map = maps[0]!;
    expect(map.properties!.dataLeafletId).toBe("amsterdam-map");
    const canvas = map.children[0] as Element;
    expect(canvas.properties!.className).toEqual(["leaflet-map-canvas"]);
    expect(canvas.properties!.style).toBe("height: 300px");
    const cfg = config(map);
    expect(cfg).toMatchObject({
      id: "amsterdam-map",
      type: "real",
      lat: 52.3731,
      long: 4.8922,
      height: "300px",
      width: "100%",
      minZoom: 1,
      // defaultZoom is clamped to Obsidian Leaflet's default maxZoom (10), as Leaflet would
      maxZoom: 10,
      defaultZoom: 10,
      darkMode: false,
      images: [],
    });
    expect(cfg.tileLayers).toEqual([
      {
        url: DEFAULT_OPTIONS.tileServer,
        alias: "OpenStreetMap",
        attribution: DEFAULT_OPTIONS.attribution,
      },
    ]);
    expect(cfg.markers).toEqual([
      {
        type: "default",
        lat: 52.3731,
        long: 4.8922,
        link: { href: "places/utrecht", text: "Utrecht", external: false },
        description: "Dam square",
      },
    ]);
  });

  it("uses Obsidian Leaflet's defaults", async () => {
    const { maps } = await run("```leaflet\nid: x\n```");
    expect(config(maps[0]!)).toMatchObject({
      type: "real",
      lat: DEFAULT_OPTIONS.defaultLat,
      long: DEFAULT_OPTIONS.defaultLong,
      height: "500px",
      minZoom: 1,
      maxZoom: 10,
      defaultZoom: 5,
      zoomDelta: 1,
      scale: 1,
    });
  });

  it("resolves image maps to paths below the site root, never to build-machine paths", async () => {
    const { maps, file } = await run(
      [
        "```leaflet",
        "id: world",
        "image:",
        "  - [[World Map.png|Overworld]]",
        "  - [[local.png]]",
        "darkMode: true",
        "height: 50%",
        "marker: inn, -10, 20, [[https://example.com]]",
        "```",
      ].join("\n"),
    );
    const html = JSON.stringify(maps[0]);
    expect(html).not.toContain(tmp);
    expect(html).not.toContain(contentDir);
    const cfg = config(maps[0]!);
    expect(cfg.type).toBe("image");
    expect(cfg.images).toEqual([
      { url: "maps/world-map.png", alias: "Overworld" },
      { url: "places/local.png", alias: undefined },
    ]);
    expect(cfg).toMatchObject({ lat: 50, long: 50, darkMode: true, height: "50vh" });
    expect(cfg.markers[0]!.link).toEqual({
      href: "https://example.com",
      text: "https://example.com",
      external: true,
    });
    expect(file.data.leafletMaps).toEqual([
      {
        id: "world",
        images: [
          {
            sourcePath: path.join(contentDir, "Maps", "World Map.png"),
            destRel: "maps/world-map.png",
          },
          { sourcePath: path.join(contentDir, "Places", "local.png"), destRel: "places/local.png" },
        ],
      },
    ]);
  });

  it("shows an error, and no config, when no image is found", async () => {
    const { maps, file } = await run("```leaflet\nid: lost\nimage: [[nope.png]]\n```");
    const map = maps[0]!;
    expect(map.properties!.dataLeafletConfig).toBeUndefined();
    const text = JSON.stringify(map);
    expect(text).toContain("No image of the map was found.");
    expect(text).toContain("Image not found: nope.png");
    expect(file.data.leafletMaps).toEqual([{ id: "lost", images: [] }]);
  });

  it("lists the block's warnings under the map", async () => {
    const { maps } = await run("```leaflet\nid: w\nmarker: default, x, 1\n```");
    const list = maps[0]!.children.find(
      (c): c is Element => c.type === "element" && c.tagName === "ul",
    );
    expect(list?.properties!.className).toEqual(["leaflet-map-warnings"]);
    expect(JSON.stringify(list)).toContain("latitude");
  });

  it("gives maps without id distinct ids and handles several blocks per page", async () => {
    const { maps, file } = await run("```leaflet\nlat: 1\n```\n\n```leaflet\nlat: 2\n```");
    expect(maps.map((m) => m.properties!.dataLeafletId)).toEqual([
      "leaflet-map-0",
      "leaflet-map-1",
    ]);
    expect(file.data.leafletMaps).toHaveLength(2);
  });

  it("honours plugin options", async () => {
    const { maps } = await run("```map\nid: o\nmarker: city, 1, 2\n```", "Places/Town.md", {
      blockLanguage: "map",
      tileServer: "https://tiles.example/{z}/{x}/{y}.png",
      markerColors: { city: "#f00" },
    });
    const cfg = config(maps[0]!);
    expect(cfg.tileLayers[0]!.url).toBe("https://tiles.example/{z}/{x}/{y}.png");
    expect(cfg.markerColors).toEqual({ city: "#f00" });
  });

  it("adds block tile servers after the default layer, or instead of it", async () => {
    const withOsm = await run(
      "```leaflet\nid: t\ntileServer: https://t.example/{z}/{x}/{y}.png|T\n```",
    );
    expect(config(withOsm.maps[0]!).tileLayers.map((t) => t.alias)).toEqual(["OpenStreetMap", "T"]);
    const without = await run(
      "```leaflet\nid: t\ntileServer: https://t.example/{z}/{x}/{y}.png|T\nosmLayer: false\n```",
    );
    expect(config(without.maps[0]!).tileLayers.map((t) => t.alias)).toEqual(["T"]);
  });

  it("ships its script and style, and Leaflet as a plugin asset", async () => {
    const { transformer } = await run("");
    const res = transformer.externalResources!(ctx())!;
    expect(res.js).toHaveLength(1);
    expect(res.js![0]).toMatchObject({ loadTime: "afterDOMReady", contentType: "inline" });
    expect(res.css).toHaveLength(1);
    const targets = res.assets!.map((a) => a.to);
    expect(targets).toEqual([
      "obsidian-plugin-leaflet/leaflet/leaflet.js",
      "obsidian-plugin-leaflet/leaflet/leaflet.css",
      "obsidian-plugin-leaflet/leaflet/images",
    ]);
    for (const asset of res.assets!) {
      await expect(fs.stat(asset.from)).resolves.toBeTruthy();
    }
  });
});
