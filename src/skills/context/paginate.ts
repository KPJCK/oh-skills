import path from "node:path";
import { loadOhEnv } from "../../env.ts";
import { priorityRank } from "../../shared/frontmatter.ts";
import { info } from "../../shared/ui.ts";
import { emit } from "../../shared/next-action.ts";
import type { Rule } from "./registry.ts";

/**
 * Build the parallel-Read manifest prompt for a list of rules.
 * Rules are expected to be pre-sorted (call deliverPayload which sorts, or
 * sort yourself before calling this).
 */
export function buildPerRuleInstructions(rules: readonly Rule[]): string {
  const n = rules.length;
  const reads = rules.map((r) => `  Read('${r.absPath}')`).join("\n");
  return [
    `Read the ${n} rule file${n === 1 ? "" : "s"} below in parallel — call ALL of the Read tools in a`,
    "SINGLE message (parallel tool calls), not one at a time. There are no",
    "dependencies between files.",
    "",
    reads,
    "",
    "After every Read has returned, treat the combined rule contents as",
    "authoritative session context for the rest of this session. Apply them in",
    "priority order (rules are listed high → med → low). Cite by file path.",
    "Each file begins with YAML frontmatter — read past it to the rule body.",
  ].join("\n");
}

/**
 * Deliver rule context to the caller via a parallel-Read next-action manifest.
 * Emits a short banner to stdout (index only) and a self_act next-action on
 * stderr with the actual Read instructions.
 */
export async function deliverPayload(rules: readonly Rule[]): Promise<void> {
  if (rules.length === 0) {
    process.stdout.write("no rules matched\n");
    return;
  }

  const contextRoot = loadOhEnv().CONTEXT_DIR;

  const sorted = [...rules].toSorted((a, b) => {
    const pr = priorityRank(a.priority) - priorityRank(b.priority);
    if (pr !== 0) return pr;
    return a.absPath.localeCompare(b.absPath);
  });

  const folderCount = new Set(sorted.map((r) => r.folder)).size;
  const n = sorted.length;

  // Banner on stdout — index only, not the rule bodies
  const bannerLines: string[] = [];
  bannerLines.push(
    `## Authoritative rules · ${n} rule${n === 1 ? "" : "s"} · ${folderCount} folder${folderCount === 1 ? "" : "s"}`,
  );
  bannerLines.push("");
  sorted.forEach((r, i) => {
    const rel = path.relative(contextRoot, r.absPath);
    bannerLines.push(`${i + 1}. (${r.priority}) ${rel}`);
  });
  bannerLines.push("");
  process.stdout.write(bannerLines.join("\n"));

  info("Claude — see next-action manifest below for parallel Read calls");

  const prompt = buildPerRuleInstructions(sorted);

  emit("context", [
    {
      type: "self_act",
      role: "research",
      prompt,
    },
  ]);
}
