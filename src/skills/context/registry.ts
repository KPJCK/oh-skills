import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadOhEnv } from "../../env.ts";
import { parseRule, type ParsedRule, type Priority } from "../../shared/frontmatter.ts";

function contextRoot(): string {
  return loadOhEnv().CONTEXT_DIR;
}

export type FolderInfo = {
  /** relative folder path under contextRoot(), e.g. "typescript/frontend" */
  rel: string;
  /** number of rule-*.md files directly in this folder (not recursive) */
  ruleCount: number;
};

export type Rule = ParsedRule & {
  folder: string; // rel folder
  file: string; // basename
  absPath: string;
  hash: string; // 8-char content hash
  priority: Priority;
  title: string;
};

const SKIP_DIRS = new Set([".cache", "node_modules", ".git"]);

export async function listFolders(): Promise<FolderInfo[]> {
  const out: FolderInfo[] = [];
  await walk(contextRoot(), "", out);
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

async function walk(
  absDir: string,
  rel: string,
  out: FolderInfo[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  let ruleCount = 0;
  const subDirs: { abs: string; rel: string }[] = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      subDirs.push({
        abs: path.join(absDir, e.name),
        rel: rel ? `${rel}/${e.name}` : e.name,
      });
    } else if (e.isFile() && /^rule-.*\.md$/.test(e.name)) {
      ruleCount++;
    }
  }

  if (rel && ruleCount > 0) out.push({ rel, ruleCount });

  for (const sub of subDirs) await walk(sub.abs, sub.rel, out);
}

export async function loadRules(folders: readonly string[]): Promise<Rule[]> {
  const rules: Rule[] = [];
  for (const folder of folders) {
    const absDir = path.join(contextRoot(), folder);
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile() || !/^rule-.*\.md$/.test(e.name)) continue;
      const absPath = path.join(absDir, e.name);
      const content = await readFile(absPath, "utf-8");
      let parsed;
      try {
        parsed = parseRule(content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`${folder}/${e.name}: ${msg}`);
      }
      const hash = createHash("sha1")
        .update(content)
        .digest("hex")
        .slice(0, 8);
      rules.push({
        ...parsed,
        folder,
        file: e.name,
        absPath,
        hash,
        priority: parsed.meta.priority,
        title: parsed.meta.title,
      });
    }
  }
  return rules;
}

export async function ensureFolderExists(rel: string): Promise<string> {
  const absDir = path.join(contextRoot(), rel);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(absDir, { recursive: true });
  return absDir;
}

export async function fileExists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

export type RuleMetaInfo = {
  /** path relative to contextRoot(), e.g. "typescript/frontend/rule-react-hooks.md" */
  rel: string;
  absPath: string;
  folder: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
};

/**
 * Lightweight: walks the tree, parses frontmatter only (skips body parse cost).
 * Used by `promote` to show Claude a roster of existing rules so it can propose
 * "extend existing rule X" instead of always creating new ones.
 */
export async function listAllRuleMeta(): Promise<RuleMetaInfo[]> {
  const out: RuleMetaInfo[] = [];
  await walkRuleMeta(contextRoot(), "", out);
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

async function walkRuleMeta(
  absDir: string,
  rel: string,
  out: RuleMetaInfo[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await walkRuleMeta(
        path.join(absDir, e.name),
        rel ? `${rel}/${e.name}` : e.name,
        out,
      );
    } else if (e.isFile() && /^rule-.*\.md$/.test(e.name)) {
      const absPath = path.join(absDir, e.name);
      const content = await readFile(absPath, "utf-8");
      try {
        const parsed = parseRule(content);
        out.push({
          rel: rel ? `${rel}/${e.name}` : e.name,
          absPath,
          folder: rel,
          title: parsed.meta.title,
          description: parsed.meta.description,
          priority: parsed.meta.priority,
        });
      } catch {
        // skip malformed files in the summary
      }
    }
  }
}

export type DraftInfo = {
  /** absolute path */
  absPath: string;
  /** path relative to contextRoot() */
  rel: string;
  /** mtime for sorting */
  mtime: Date;
};

/**
 * Find all .md files under contextRoot() that are NOT official rule files
 * (i.e. don't match `rule-*.md`). These are promotion candidates — drafts
 * the user dropped in manually.
 */
export async function listDrafts(): Promise<DraftInfo[]> {
  const out: DraftInfo[] = [];
  await walkDrafts(contextRoot(), "", out);
  out.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return out;
}

async function walkDrafts(
  absDir: string,
  rel: string,
  out: DraftInfo[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await walkDrafts(
        path.join(absDir, e.name),
        rel ? `${rel}/${e.name}` : e.name,
        out,
      );
    } else if (
      e.isFile() &&
      e.name.endsWith(".md") &&
      !/^rule-.*\.md$/.test(e.name)
    ) {
      const absPath = path.join(absDir, e.name);
      const st = await stat(absPath);
      out.push({
        absPath,
        rel: rel ? `${rel}/${e.name}` : e.name,
        mtime: st.mtime,
      });
    }
  }
}

/**
 * Resolve "<folder>/<name>" (no `rule-` prefix, no `.md` suffix) to an
 * absolute rule file path. Throws if folder/name is malformed or file missing.
 */
export async function resolveRulePath(folderAndName: string): Promise<{
  folder: string;
  name: string;
  absPath: string;
  rel: string;
}> {
  const lastSlash = folderAndName.lastIndexOf("/");
  if (lastSlash < 1 || lastSlash === folderAndName.length - 1) {
    throw new Error(
      `expected <folder>/<name>, got ${JSON.stringify(folderAndName)}`,
    );
  }
  const folder = folderAndName.slice(0, lastSlash);
  const name = folderAndName.slice(lastSlash + 1);
  const file = `rule-${name}.md`;
  const root = contextRoot();
  const absPath = path.join(root, folder, file);
  if (!(await fileExists(absPath))) {
    throw new Error(`no such rule: ${folder}/${file}`);
  }
  const rel = path.relative(root, absPath);
  return { folder, name, absPath, rel };
}
