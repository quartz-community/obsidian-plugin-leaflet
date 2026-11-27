import path from "node:path";
import { promises as fs } from "node:fs";
import type {
  BuildCtx,
  FilePath,
  ProcessedContent,
  QuartzEmitterPlugin,
} from "@quartz-community/types";

/**
 * Copies the images of image maps to the output, at the same path below the site root as in the
 * content directory (the page's map config points there).
 */
export const LeafletEmitter: QuartzEmitterPlugin = () => {
  const emit = async (ctx: BuildCtx, content: ProcessedContent[]): Promise<FilePath[]> => {
    const outputs: FilePath[] = [];
    const seen = new Set<string>();
    const outputRoot = path.resolve(ctx.argv.output);
    for (const [, vfile] of content) {
      for (const map of vfile.data.leafletMaps ?? []) {
        for (const image of map.images) {
          if (seen.has(image.sourcePath)) continue;
          seen.add(image.sourcePath);
          const dest = path.resolve(outputRoot, image.destRel);
          if (path.relative(outputRoot, dest).startsWith("..")) continue;
          try {
            await fs.mkdir(path.dirname(dest), { recursive: true });
            await fs.copyFile(image.sourcePath, dest);
            outputs.push(dest as FilePath);
          } catch {
            continue;
          }
        }
      }
    }
    return outputs;
  };

  return {
    name: "ObsidianLeafletImages",
    async emit(ctx, content) {
      return emit(ctx, content);
    },
    async *partialEmit(ctx, content) {
      for (const p of await emit(ctx, content)) yield p;
    },
  };
};
