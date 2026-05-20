import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { loadOhEnv } from "../../env.ts";
import type { Priority } from "../../shared/frontmatter.ts";

function cachePath(): string {
  return path.join(loadOhEnv().CONTEXT_DIR, ".cache", "picks.json");
}

export type LoadedRuleRef = {
  file: string; // relative under CONTEXT_DIR, e.g. "typescript/frontend/rule-react-hooks.md"
  title: string;
  priority: Priority;
  hash: string;
};

export type CwdEntry = {
  lastPicks: string[];
  lastLoaded: LoadedRuleRef[];
  lastLoadedAt: string; // ISO
  sessionBaselinePicks?: string[]; // folders from first load since this entry was created
};

export type CacheShape = {
  [absCwd: string]: CwdEntry;
};

async function readCache(): Promise<CacheShape> {
  try {
    const content = await readFile(cachePath(), "utf-8");
    return JSON.parse(content) as CacheShape;
  } catch {
    return {};
  }
}

async function writeCache(cache: CacheShape): Promise<void> {
  const p = cachePath();
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(cache, null, 2) + "\n", "utf-8");
}

export async function loadCwd(cwd: string): Promise<CwdEntry | null> {
  const cache = await readCache();
  return cache[cwd] ?? null;
}

export async function saveCwd(
  cwd: string,
  entry: Omit<CwdEntry, "lastLoadedAt"> & { lastLoadedAt?: string },
): Promise<void> {
  const cache = await readCache();
  cache[cwd] = {
    ...entry,
    lastLoadedAt: entry.lastLoadedAt ?? new Date().toISOString(),
  };
  await writeCache(cache);
}

export async function clearCwd(cwd: string): Promise<void> {
  const cache = await readCache();
  if (cwd in cache) {
    delete cache[cwd];
    await writeCache(cache);
  }
}
