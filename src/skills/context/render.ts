import path from "node:path";
import { loadOhEnv } from "../../env.ts";
import { priorityRank } from "../../shared/frontmatter.ts";
import type { Rule } from "./registry.ts";
import type { LoadedRuleRef } from "./cache.ts";

/**
 * Full inject payload — printed to stdout, becomes part of the conversation.
 * Claude reads this and treats it as authoritative session context.
 */
export function renderContext(rules: readonly Rule[]): string {
  const contextRoot = loadOhEnv().CONTEXT_DIR;
  const sorted = [...rules].sort((a, b) => {
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr !== 0) return pr;
    return a.absPath.localeCompare(b.absPath);
  });

  const folderCount = new Set(sorted.map((r) => r.folder)).size;
  const lines: string[] = [];
  lines.push(
    `## Authoritative rules · ${sorted.length} rule${sorted.length === 1 ? "" : "s"} · ${folderCount} folder${folderCount === 1 ? "" : "s"}`,
  );
  lines.push("");

  for (const r of sorted) {
    const rel = path.relative(contextRoot, r.absPath);
    lines.push("---");
    lines.push("");
    lines.push(`### ${r.title}`);
    lines.push(`_Source: \`${rel}\` • priority: ${r.priority}_`);
    lines.push("");
    lines.push(r.body.trim());
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Lightweight sanity-check payload for `check`. Asks Claude to self-report
 * whether it can quote loaded rules verbatim. Roughly 1/10th the size of
 * a full re-load.
 */
export function renderCheckPayload(loaded: readonly LoadedRuleRef[]): string {
  const lines: string[] = [];
  lines.push("## Sanity check — verify loaded rules are still in your context");
  lines.push("");
  lines.push(
    `You were given ${loaded.length} rule${loaded.length === 1 ? "" : "s"} earlier this session. For each one below, quote at least one specific **DO** bullet and one **DO NOT** bullet **verbatim from the original loaded content**, citing the file path:`,
  );
  lines.push("");
  loaded.forEach((r, i) => {
    lines.push(`${i + 1}. **${r.title}** (\`${r.file}\`, priority: ${r.priority})`);
  });
  lines.push("");
  lines.push(
    "If you cannot quote a rule's specifics verbatim, do **not** paraphrase or invent. Instead, list the rule numbers you're unsure about — the user will run `/oh-context load` to reload them.",
  );
  lines.push("");
  lines.push(
    "Be honest. No performative agreement. Drift on long sessions is expected; flagging it is more useful than faking confidence.",
  );

  return lines.join("\n");
}

export function renderClearDirective(): string {
  return [
    "## Context cleared",
    "",
    "Disregard any context rules previously loaded in this session. Apply only your default behavior until the user runs `/oh-context load` to reload.",
  ].join("\n");
}

export function renderEmpty(reason: string): string {
  return `_(${reason})_`;
}
