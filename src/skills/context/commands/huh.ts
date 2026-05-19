import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadOhEnv } from "../../../env.ts";
import type { CacheShape } from "../cache.ts";

async function isLoadedForCwd(cwd: string): Promise<boolean> {
  const contextDir = loadOhEnv().CONTEXT_DIR;
  const cachePath = path.join(contextDir, ".cache", "picks.json");
  let cache: CacheShape;
  try {
    cache = JSON.parse(await readFile(cachePath, "utf-8")) as CacheShape;
  } catch {
    return false;
  }

  // Direct lookup first
  const direct = cache[cwd];
  if (direct && direct.lastLoaded.length > 0) return true;

  // Fallback: resolve symlinks on both sides (macOS /private/var vs /var normalization)
  let realCwd: string;
  try {
    realCwd = realpathSync(cwd);
  } catch {
    return false;
  }
  for (const [key, entry] of Object.entries(cache)) {
    if (!entry || entry.lastLoaded.length === 0) continue;
    try {
      if (realpathSync(key) === realCwd) return true;
    } catch {
      // skip keys that can't be resolved
    }
  }
  return false;
}

export async function run(_args: string[]): Promise<void> {
  const cwd = process.cwd();
  const loaded = await isLoadedForCwd(cwd);
  process.stdout.write(loaded ? "true\n" : "false\n");
  process.exit(loaded ? 0 : 1);
}
