// src/skills/search/registry.ts
import { readdir, readFile, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { parseKnowledge } from "../../shared/frontmatter.ts";
import { loadOhEnv } from "../../env.ts";

export function knowledgeRoot(): string {
  return loadOhEnv().KNOWLEDGE_DIR;
}

export type Shape = "simple" | "folder";

export type Knowledge = {
  meta: ReturnType<typeof parseKnowledge>["meta"];
  topic: string;
  name: string; // slug (without `search-` prefix, without `.md` suffix)
  shape: Shape;
  /** absolute path to the body file (search-X.md OR search-X/index.md) */
  absPath: string;
  /** path relative to KNOWLEDGE_DIR */
  rel: string;
  /** absolute path to the knowledge root (the .md file or the folder) */
  absRoot: string;
  body: string;
};

const SKIP_DIRS = new Set([".cache", "node_modules", ".git"]);

export async function listAll(root?: string): Promise<Knowledge[]> {
  const KNOWLEDGES_ROOT = root ?? knowledgeRoot();
  const out: Knowledge[] = [];
  let topics;
  try {
    topics = await readdir(KNOWLEDGES_ROOT, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  for (const t of topics) {
    if (!t.isDirectory() || SKIP_DIRS.has(t.name)) continue;
    const topicDir = path.join(KNOWLEDGES_ROOT, t.name);
    const entries = await readdir(topicDir, { withFileTypes: true });
    for (const e of entries) {
      // Simple: search-<name>.md
      if (e.isFile() && /^search-.+\.md$/.test(e.name)) {
        const absPath = path.join(topicDir, e.name);
        const k = await loadOne(absPath, t.name, "simple", absPath, KNOWLEDGES_ROOT);
        if (k) out.push(k);
        continue;
      }
      // Folder: search-<name>/index.md
      if (e.isDirectory() && /^search-.+$/.test(e.name)) {
        const folderRoot = path.join(topicDir, e.name);
        const indexPath = path.join(folderRoot, "index.md");
        if (await fileExists(indexPath)) {
          const k = await loadOne(indexPath, t.name, "folder", folderRoot, KNOWLEDGES_ROOT);
          if (k) out.push(k);
        }
      }
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

async function loadOne(
  absPath: string,
  topic: string,
  shape: Shape,
  absRoot: string,
  KNOWLEDGES_ROOT: string,
): Promise<Knowledge | null> {
  let content;
  try {
    content = await readFile(absPath, "utf-8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = parseKnowledge(content);
  } catch {
    return null; // skip malformed; surfaces in CLI logs separately if needed
  }
  const baseName =
    shape === "simple"
      ? path
          .basename(absPath)
          .replace(/^search-/, "")
          .replace(/\.md$/, "")
      : path.basename(absRoot).replace(/^search-/, "");
  return {
    meta: parsed.meta,
    topic,
    name: baseName,
    shape,
    absPath,
    absRoot,
    rel: path.relative(KNOWLEDGES_ROOT, absRoot),
    body: parsed.body,
  };
}

export async function resolve(topic: string, name: string, root?: string): Promise<Knowledge> {
  const KNOWLEDGES_ROOT = root ?? knowledgeRoot();
  const topicDir = path.join(KNOWLEDGES_ROOT, topic);
  const simpleAbs = path.join(topicDir, `search-${name}.md`);
  const folderAbs = path.join(topicDir, `search-${name}`);
  const folderIndex = path.join(folderAbs, "index.md");

  if (await fileExists(simpleAbs)) {
    const k = await loadOne(simpleAbs, topic, "simple", simpleAbs, KNOWLEDGES_ROOT);
    if (k) return k;
  }
  if (await fileExists(folderIndex)) {
    const k = await loadOne(folderIndex, topic, "folder", folderAbs, KNOWLEDGES_ROOT);
    if (k) return k;
  }
  throw new Error(
    `no such knowledge: ${topic}/${name} (looked for search-${name}.md and search-${name}/index.md)`,
  );
}

export async function listTopics(root?: string): Promise<string[]> {
  const KNOWLEDGES_ROOT = root ?? knowledgeRoot();
  try {
    const entries = await readdir(KNOWLEDGES_ROOT, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export async function ensureTopicDir(topic: string, root?: string): Promise<string> {
  const KNOWLEDGES_ROOT = root ?? knowledgeRoot();
  const abs = path.join(KNOWLEDGES_ROOT, topic);
  await mkdir(abs, { recursive: true });
  return abs;
}

export async function fileExists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

export async function ageDays(iso: string): Promise<number> {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}
