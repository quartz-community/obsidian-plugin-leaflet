import path from "node:path";
import { statSync } from "node:fs";
import type { BuildCtx, FilePath, FullSlug } from "@quartz-community/types";
import { slugifyFilePath, transformLink } from "@quartz-community/utils";
import type { MarkerLink, ResolvedImage } from "./types";

const URL_RE = /^[a-z][a-z0-9+.-]*:/i;

function isFile(abs: string): boolean {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/** Path of the note below the content directory (`notes/page.md`). */
export function noteRelativePath(ctx: BuildCtx, data: Record<string, unknown>): string {
  if (typeof data.relativePath === "string") return data.relativePath;
  if (typeof data.filePath === "string") {
    const contentDir = path.resolve(ctx.argv.directory);
    return path.relative(contentDir, path.resolve(data.filePath)).split(path.sep).join("/");
  }
  return "";
}

/**
 * Find an image of a map the way Obsidian resolves a link: relative to the note, from the vault
 * root, then the shortest match by file name anywhere in the vault.
 */
export function resolveImage(
  ctx: BuildCtx,
  target: string,
  noteRelPath: string,
): ResolvedImage | undefined {
  const contentDir = path.resolve(ctx.argv.directory);
  const wanted = safeDecode(target.split("#")[0]!.trim()).replace(/^\/+/, "");
  if (!wanted) return undefined;

  const candidates = [
    path.resolve(contentDir, path.dirname(noteRelPath), wanted),
    path.resolve(contentDir, wanted),
  ];
  const lower = wanted.toLowerCase();
  const byName = (ctx.allFiles ?? [])
    .map((f) => String(f).split(path.sep).join("/"))
    .filter((f) => {
      const l = f.toLowerCase();
      return l === lower || l.endsWith("/" + lower);
    })
    .sort((a, b) => a.length - b.length);
  candidates.push(...byName.map((f) => path.resolve(contentDir, f)));

  for (const abs of candidates) {
    const rel = path.relative(contentDir, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
    if (isFile(abs)) {
      // Quartz's slug of the file (`maps/World Map.png` → `maps/world-map.png`): where its own
      // asset emitter puts it too
      const destRel = slugifyFilePath(rel.split(path.sep).join("/") as FilePath);
      return { sourcePath: abs, destRel };
    }
  }
  return undefined;
}

export function isUrl(target: string): boolean {
  return URL_RE.test(target);
}

/** Encode a path below the site root for use in a URL (each segment on its own). */
export function encodePath(rel: string): string {
  return rel.split("/").map(encodeURIComponent).join("/");
}

/**
 * Resolve a marker link. Internal links become the target page's path below the site root
 * (resolved like Obsidian, by shortest path), which the browser turns into a URL under the
 * site's base path.
 */
export function resolveMarkerLink(
  ctx: BuildCtx,
  target: string,
  text: string | undefined,
): MarkerLink {
  if (isUrl(target)) return { href: target, text: text ?? target, external: true };
  const shown = text ?? target.replace(/#\^?/, " > ");
  const rel = transformLink("index" as FullSlug, target.replace(/\.md(?=#|$)/, ""), {
    strategy: "shortest",
    allSlugs: ctx.allSlugs ?? [],
  });
  const href = String(rel).replace(/^\.\//, "");
  return { href, text: shown, external: false };
}
