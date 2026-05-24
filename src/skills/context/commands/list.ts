import { listFolders } from "../registry";
import { loadOhEnv } from "../../../env";
import { loadCwd } from "../cache";
import type { Priority } from "../../../shared/frontmatter";

export async function run(_args: string[]): Promise<void> {
  const folders = await listFolders();
  const cwd = process.cwd();
  const contextRoot = loadOhEnv().CONTEXT_DIR;

  if (folders.length === 0) {
    process.stdout.write(`_(no rule folders found under ${contextRoot})_\n`);
    return;
  }

  const prev = await loadCwd(cwd);
  const loadedFolders = new Set(prev?.lastPicks ?? []);

  const lines: string[] = [];
  lines.push("## Context library");
  lines.push("");
  lines.push(`Root: \`${contextRoot}\` • cwd: \`${shortHome(cwd)}\``);
  lines.push("");

  // Folder table — primary view
  lines.push("| Folder | Rules | Loaded |");
  lines.push("|:---|---:|:---:|");
  for (const f of folders) {
    const loaded = loadedFolders.has(f.rel) ? "yes" : "";
    lines.push(`| \`${f.rel}\` | ${f.ruleCount} | ${loaded} |`);
  }

  const totalRules = folders.reduce((sum, f) => sum + f.ruleCount, 0);
  const loadedCount = folders.filter((f) => loadedFolders.has(f.rel)).length;
  lines.push("");
  lines.push(
    `**Totals:** ${folders.length} folder${folders.length === 1 ? "" : "s"} · ${totalRules} rule${totalRules === 1 ? "" : "s"} · ${loadedCount} loaded folder${loadedCount === 1 ? "" : "s"}`,
  );

  // Loaded rules detail — secondary view
  if (prev && prev.lastLoaded.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(`### Currently loaded for \`${shortHome(cwd)}\``);
    lines.push("");
    lines.push("| Rule | File | Priority |");
    lines.push("|:---|:---|:---:|");
    for (const r of prev.lastLoaded) {
      lines.push(`| **${escapeMd(r.title)}** | \`${r.file}\` | ${priorityBadge(r.priority)} |`);
    }
    lines.push("");
    lines.push(`_Loaded at: \`${prev.lastLoadedAt}\`_`);
  } else {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(
      `_No rules loaded yet for \`${shortHome(cwd)}\` — run \`/oh-context load\` to pick._`,
    );
  }

  process.stdout.write(lines.join("\n") + "\n");
}

function priorityBadge(p: Priority): string {
  switch (p) {
    case "high":
      return "high";
    case "medium":
      return "med";
    case "low":
      return "low";
  }
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|");
}

function shortHome(p: string): string {
  const home = process.env.HOME ?? "";
  return home && p.startsWith(home) ? "~" + p.slice(home.length) : p;
}
