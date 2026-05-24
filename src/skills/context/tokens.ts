import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getEncoding } from "js-tiktoken";
import { loadOhEnv } from "../../env";

function cachePath(): string {
  return path.join(loadOhEnv().CONTEXT_DIR, ".cache", "tokens.json");
}

let encoder: ReturnType<typeof getEncoding> | null = null;

type TokenCache = Record<string, { tokens: number }>;

function getEncoder() {
  encoder ??= getEncoding("cl100k_base");
  return encoder;
}

function isTokenCache(v: unknown): v is TokenCache {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function readCache(): Promise<TokenCache> {
  try {
    const parsed: unknown = JSON.parse(await readFile(cachePath(), "utf-8"));
    if (!isTokenCache(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

async function writeCache(cache: TokenCache): Promise<void> {
  const p = cachePath();
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(cache, null, 2) + "\n", "utf-8");
}

function stripFrontmatter(md: string): string {
  const m = md.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return m ? (m[1] ?? "").trimStart() : md;
}

export async function estimateTokens(absPath: string): Promise<number> {
  const contextDir = loadOhEnv().CONTEXT_DIR;
  const st = await stat(absPath);
  const key = `${path.relative(contextDir, absPath)}:${st.mtimeMs}:${st.size}`;
  const cache = await readCache();
  const hit = cache[key];
  if (hit) return hit.tokens;

  const content = await readFile(absPath, "utf-8");
  const body = stripFrontmatter(content);
  const tokens = getEncoder().encode(body).length;

  cache[key] = { tokens };
  await writeCache(cache);
  return tokens;
}

export function formatTokens(n: number): string {
  return `~${Math.round(n / 10) * 10} tok`;
}
