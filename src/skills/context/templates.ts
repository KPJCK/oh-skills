import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { $ } from "bun";
import { loadOhEnv } from "../../env.ts";
import { loadRules, type Rule } from "./registry.ts";
import { parseRule } from "../../shared/frontmatter.ts";
import { estimateTokens } from "./tokens.ts";

function templateRoot(): string {
  return loadOhEnv().CONTEXT_TEMPLATE_DIR;
}

export type TemplateEntry = { name: string; path: string };

export type Template = {
  templateName: string;
  createdAt: string;
  context: TemplateEntry[];
};

export type TemplateMeta = {
  name: string;
  filePath: string;
  ruleCount: number;
  totalTokens: number;
  createdAt: string;
};

function templateFile(name: string): string {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
    throw new Error(
      `template name must be alphanumeric/dash/underscore (got ${JSON.stringify(name)})`,
    );
  }
  return path.join(templateRoot(), `${name}.json`);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function readTemplate(name: string): Promise<Template> {
  const fp = templateFile(name);
  if (!(await fileExists(fp))) {
    throw new Error(`template not found: ${name} (looked at ${fp})`);
  }
  const raw = await readFile(fp, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).templateName !== "string" ||
    !Array.isArray((parsed as Record<string, unknown>).context)
  ) {
    throw new Error(`malformed template at ${fp}`);
  }
  return parsed as Template;
}

export async function writeTemplate(
  name: string,
  rulePaths: readonly string[],
  opts: { overwrite?: boolean } = {},
): Promise<void> {
  const fp = templateFile(name);
  if (!opts.overwrite && (await fileExists(fp))) {
    throw new Error(`template exists: ${name} — pass overwrite to replace`);
  }
  const contextRoot = loadOhEnv().CONTEXT_DIR;
  // Resolve every path → ensure file exists + capture title from frontmatter
  const entries: TemplateEntry[] = [];
  for (const rel of rulePaths) {
    const abs = path.join(contextRoot, rel);
    if (!(await fileExists(abs))) {
      throw new Error(`rule path missing: ${rel}`);
    }
    const md = await readFile(abs, "utf-8");
    const parsed = parseRule(md);
    entries.push({ name: parsed.meta.title, path: rel });
  }
  const tpl: Template = {
    templateName: name,
    createdAt: new Date().toISOString(),
    context: entries,
  };
  await mkdir(templateRoot(), { recursive: true });
  await writeFile(fp, JSON.stringify(tpl, null, 2) + "\n", "utf-8");
}

export async function deleteTemplate(name: string): Promise<void> {
  const fp = templateFile(name);
  if (!(await fileExists(fp))) {
    throw new Error(`template not found: ${name}`);
  }
  // Prefer `trash` if available, else fall back to fs unlink.
  try {
    await $`trash ${fp}`.quiet();
  } catch {
    const { unlink } = await import("node:fs/promises");
    await unlink(fp);
  }
}

export async function listTemplates(): Promise<TemplateMeta[]> {
  let names: string[];
  try {
    names = (await readdir(templateRoot())).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const contextRoot = loadOhEnv().CONTEXT_DIR;
  const out: TemplateMeta[] = [];
  for (const fname of names) {
    const baseName = fname.slice(0, -".json".length);
    try {
      const tpl = await readTemplate(baseName);
      let totalTokens = 0;
      for (const c of tpl.context) {
        const abs = path.join(contextRoot, c.path);
        if (await fileExists(abs)) {
          totalTokens += await estimateTokens(abs);
        }
      }
      out.push({
        name: tpl.templateName,
        filePath: path.join(templateRoot(), fname),
        ruleCount: tpl.context.length,
        totalTokens,
        createdAt: tpl.createdAt,
      });
    } catch {
      // skip malformed entries
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function resolveTemplate(name: string): Promise<Rule[]> {
  const tpl = await readTemplate(name);
  // Group paths by folder to call loadRules folder-by-folder, then filter to wanted files.
  const wantedByFolder = new Map<string, Set<string>>();
  for (const c of tpl.context) {
    const folder = path.dirname(c.path);
    const file = path.basename(c.path);
    const set = wantedByFolder.get(folder) ?? new Set<string>();
    set.add(file);
    wantedByFolder.set(folder, set);
  }
  const allRules = await loadRules([...wantedByFolder.keys()]);
  const filtered = allRules.filter((r) => {
    const set = wantedByFolder.get(r.folder);
    return set?.has(r.file) ?? false;
  });
  // Sanity: every requested path must resolve.
  if (filtered.length !== tpl.context.length) {
    const got = new Set(filtered.map((r) => `${r.folder}/${r.file}`));
    const missing = tpl.context
      .map((c) => c.path)
      .filter((p) => !got.has(p));
    throw new Error(
      `template "${name}" references missing rule(s): ${missing.join(", ")}`,
    );
  }
  return filtered;
}
