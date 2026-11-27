import { describe, expect, it } from "vitest";
import { parseCsvLine, parseLeafletBlock, parseLink, parseMarker } from "../src/parser";

describe("parseLink", () => {
  it("reads wikilinks with and without alias", () => {
    expect(parseLink("[[Utrecht]]")).toEqual({ target: "Utrecht", text: undefined });
    expect(parseLink("[[Notes/Town#Market|The market]]")).toEqual({
      target: "Notes/Town#Market",
      text: "The market",
    });
  });

  it("reads Markdown links and bare targets", () => {
    expect(parseLink("[OSM](https://openstreetmap.org)")).toEqual({
      target: "https://openstreetmap.org",
      text: "OSM",
    });
    expect(parseLink("Utrecht")).toEqual({ target: "Utrecht" });
    expect(parseLink("  ")).toBeUndefined();
  });
});

describe("parseCsvLine", () => {
  it("splits and trims fields, keeping empty ones", () => {
    expect(parseCsvLine("default, 1, 2,,desc")).toEqual(["default", "1", "2", "", "desc"]);
  });

  it("keeps commas inside double quotes", () => {
    expect(parseCsvLine('a, 1, 2, [[X]], "one, two", 3')).toEqual([
      "a",
      "1",
      "2",
      "[[X]]",
      "one, two",
      "3",
    ]);
  });
});

describe("parseMarker", () => {
  it("reads all fields", () => {
    expect(parseMarker('city, 52.1, 5.2, [[Utrecht|Home town]], "A city, in NL", 3, 9')).toEqual({
      type: "city",
      lat: 52.1,
      long: 5.2,
      link: "Utrecht",
      linkText: "Home town",
      description: "A city, in NL",
      minZoom: 3,
      maxZoom: 9,
    });
  });

  it("defaults an empty type and allows empty optional fields", () => {
    expect(parseMarker(",25,25,,,3")).toEqual({ type: "default", lat: 25, long: 25, minZoom: 3 });
  });

  it("reports unparseable coordinates", () => {
    expect(parseMarker("default, north, 5")).toMatch(/latitude/);
    expect(parseMarker("default, 5")).toMatch(/longitude/);
  });
});

describe("parseLeafletBlock", () => {
  it("reads the repro's real-world block", () => {
    const block = parseLeafletBlock(
      [
        "id: amsterdam-map",
        "lat: 52.3731",
        "long: 4.8922",
        "height: 300px",
        "defaultZoom: 13",
        "marker: default, 52.3731, 4.8922, [[Utrecht]]",
      ].join("\n"),
    );
    expect(block).toMatchObject({
      id: "amsterdam-map",
      images: [],
      lat: 52.3731,
      long: 4.8922,
      height: "300px",
      defaultZoom: 13,
      darkMode: false,
      osmLayer: true,
      warnings: [],
    });
    expect(block.markers).toEqual([
      { type: "default", lat: 52.3731, long: 4.8922, link: "Utrecht" },
    ]);
  });

  it("reads repeated marker lines (duplicate YAML keys)", () => {
    const block = parseLeafletBlock(
      "id: m\nmarker: default, 1, 2\nmarker: inn, 3, 4, [[The Inn#Rooms]], Cheap rooms",
    );
    expect(block.markers).toHaveLength(2);
    expect(block.markers[1]).toMatchObject({
      type: "inn",
      link: "The Inn#Rooms",
      description: "Cheap rooms",
    });
    expect(block.warnings).toEqual([]);
  });

  it("reads a single wikilink image (not a YAML nested list)", () => {
    const block = parseLeafletBlock("id: m\nimage: [[Maps/World.png]]\nlat: 50%\nlong: 25%");
    expect(block.images).toEqual([{ target: "Maps/World.png", alias: undefined }]);
    expect(block.lat).toBe(50);
    expect(block.long).toBe(25);
  });

  it("reads several images as a YAML list, with aliases", () => {
    const block = parseLeafletBlock(
      "id: m\nimage:\n  - [[Floor2.jpg|Second Floor]]\n  - [[Floor1.jpg]]\n  - https://example.com/a.png",
    );
    expect(block.images).toEqual([
      { target: "Floor2.jpg", alias: "Second Floor" },
      { target: "Floor1.jpg", alias: undefined },
      { target: "https://example.com/a.png", alias: undefined },
    ]);
  });

  it("reads several images as repeated image: lines", () => {
    const block = parseLeafletBlock("id: m\nimage: [[A.png]]\nimage: [[B.png|Bee]]");
    expect(block.images.map((i) => i.target)).toEqual(["A.png", "B.png"]);
    expect(block.images[1]!.alias).toBe("Bee");
  });

  it("reads zoom, size, unit, scale, darkMode and flags", () => {
    const block = parseLeafletBlock(
      [
        "id: m",
        "minZoom: 2",
        "maxZoom: 8",
        "defaultZoom: 4",
        "zoomDelta: 0.5",
        "height: 400",
        "width: 80%",
        "unit: mi",
        "scale: 2.5",
        "darkMode: true",
        "noScrollZoom: true",
        "bounds: [[0, 0], [100, 200]]",
      ].join("\n"),
    );
    expect(block).toMatchObject({
      minZoom: 2,
      maxZoom: 8,
      defaultZoom: 4,
      zoomDelta: 0.5,
      height: "400px",
      width: "80%",
      unit: "mi",
      scale: 2.5,
      darkMode: true,
      noScrollZoom: true,
      bounds: [
        [0, 0],
        [100, 200],
      ],
    });
  });

  it("reads tile servers with aliases and subdomains", () => {
    const block = parseLeafletBlock(
      [
        "id: m",
        "tileServer:",
        "  - https://{s}.tiles.example/{z}/{x}/{y}.png|Topo",
        "  - https://other.example/{z}/{x}/{y}.png",
        "tileSubdomains: a,b,c",
        "osmLayer: false",
      ].join("\n"),
    );
    expect(block.tileServers).toEqual([
      { url: "https://{s}.tiles.example/{z}/{x}/{y}.png", alias: "Topo" },
      { url: "https://other.example/{z}/{x}/{y}.png", alias: undefined },
    ]);
    expect(block.tileSubdomains).toEqual(["a", "b", "c"]);
    expect(block.osmLayer).toBe(false);
  });

  it("keeps the default layer when osmLayer: false has no tile server", () => {
    const block = parseLeafletBlock("id: m\nosmLayer: false");
    expect(block.osmLayer).toBe(true);
    expect(block.warnings[0]).toMatch(/osmLayer/);
  });

  it("collects warnings instead of failing", () => {
    const block = parseLeafletBlock("id: m\nheight: tall\nmarker: default, x, 1\nminZoom: low");
    expect(block.height).toBeUndefined();
    expect(block.markers).toEqual([]);
    expect(block.warnings).toHaveLength(3);
  });

  it("falls back to key: value lines on invalid YAML", () => {
    const block = parseLeafletBlock("id: m\nlat: [unclosed\nlong: 5");
    expect(block.id).toBe("m");
    expect(block.long).toBe(5);
  });
});
