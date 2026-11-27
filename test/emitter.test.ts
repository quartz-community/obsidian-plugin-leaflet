import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import type { FilePath, ProcessedContent } from "@quartz-community/types";
import { VFile } from "vfile";
import { LeafletEmitter } from "../src/emitter";
import type { LeafletMapData } from "../src/types";
import { createCtx } from "./helpers";

let tmp: string;
let contentDir: string;
let outputDir: string;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(tmpdir(), "leaflet-emit-"));
  contentDir = path.join(tmp, "content");
  outputDir = path.join(tmp, "public");
  await fs.mkdir(path.join(contentDir, "Maps"), { recursive: true });
  await fs.writeFile(path.join(contentDir, "Maps", "World Map.png"), "world");
  await fs.writeFile(path.join(contentDir, "Maps", "floor.png"), "floor");
});

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

function content(...pages: (LeafletMapData[] | undefined)[]): ProcessedContent[] {
  return pages.map((maps) => {
    const vfile = new VFile("");
    if (maps) vfile.data.leafletMaps = maps;
    return [{ type: "root", children: [] }, vfile];
  });
}

async function collect(result: FilePath[] | AsyncGenerator<FilePath>): Promise<FilePath[]> {
  if (Array.isArray(result)) return result;
  const out: FilePath[] = [];
  for await (const p of result) out.push(p);
  return out;
}

const world = () => ({
  sourcePath: path.join(contentDir, "Maps", "World Map.png"),
  destRel: "maps/world-map.png",
});
const floor = () => ({
  sourcePath: path.join(contentDir, "Maps", "floor.png"),
  destRel: "maps/floor.png",
});
const resources = { css: [], js: [], additionalHead: [] };

describe("LeafletEmitter", () => {
  it("emits nothing for pages without maps", async () => {
    const ctx = createCtx({ argv: { directory: contentDir, output: outputDir } });
    const paths = await collect(await LeafletEmitter().emit(ctx, content(undefined), resources));
    expect(paths).toEqual([]);
  });

  it("copies each map image once, to its path below the output", async () => {
    const ctx = createCtx({ argv: { directory: contentDir, output: outputDir } });
    const paths = await collect(
      await LeafletEmitter().emit(
        ctx,
        content([{ id: "a", images: [world(), floor()] }], [{ id: "b", images: [world()] }]),
        resources,
      ),
    );
    expect(paths.sort()).toEqual(
      [
        path.join(outputDir, "maps", "floor.png"),
        path.join(outputDir, "maps", "world-map.png"),
      ].sort(),
    );
    expect(await fs.readFile(path.join(outputDir, "maps", "world-map.png"), "utf8")).toBe("world");
    expect(await fs.readFile(path.join(outputDir, "maps", "floor.png"), "utf8")).toBe("floor");
  });

  it("skips missing sources and paths outside the output", async () => {
    const ctx = createCtx({ argv: { directory: contentDir, output: outputDir } });
    const paths = await collect(
      await LeafletEmitter().emit(
        ctx,
        content([
          {
            id: "c",
            images: [
              { sourcePath: path.join(contentDir, "gone.png"), destRel: "gone.png" },
              { sourcePath: world().sourcePath, destRel: "../escape.png" },
            ],
          },
        ]),
        resources,
      ),
    );
    expect(paths).toEqual([]);
    await expect(fs.stat(path.join(tmp, "escape.png"))).rejects.toThrow();
  });

  it("emits the same files on partial rebuilds", async () => {
    const ctx = createCtx({ argv: { directory: contentDir, output: outputDir } });
    const emitter = LeafletEmitter();
    const result = await emitter.partialEmit!(
      ctx,
      content([{ id: "a", images: [floor()] }]),
      resources,
      [],
    );
    const paths = result ? await collect(result) : [];
    expect(paths).toEqual([path.join(outputDir, "maps", "floor.png")]);
  });
});
