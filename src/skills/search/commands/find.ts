// src/skills/search/commands/find.ts
import { listAll, ageDays, knowledgeRoot } from "../registry.ts";
import { rankAndFilter } from "../scoring.ts";
import { info, error } from "../../../shared/ui.ts";

export async function run(args: string[]): Promise<void> {
  const query = args.join(" ").trim();
  if (!query) {
    error(
      "missing query",
      "example: /oh-search find react server components",
    );
    process.exit(2);
  }

  const all = await listAll();
  if (all.length === 0) {
    process.stdout.write(
      `_(knowledge base is empty — nothing to search at ${knowledgeRoot()})_\n`,
    );
    return;
  }

  const matches = rankAndFilter(query, all, { threshold: 2, limit: 5 });

  info(`scanned ${all.length} knowledge file${all.length === 1 ? "" : "s"}`);

  if (matches.length === 0) {
    process.stdout.write(
      `## 🔎 No local match for \`${escapeMd(query)}\`\n\n` +
        `Nothing scored above the relevance threshold. Either the topic isn't covered, or the existing knowledge uses different terminology.\n\n` +
        `**Recommended:** run \`/oh-search research ${shellQuote(query)}\` to go online, then \`add\` the result.\n`,
    );
    return;
  }

  const lines: string[] = [];
  lines.push(`## 🔎 Local matches for \`${escapeMd(query)}\``);
  lines.push("");
  lines.push("| Score | Knowledge | Topic | Age | Path |");
  lines.push("|---:|:---|:---|---:|:---|");
  for (const m of matches) {
    const days = await ageDays(m.knowledge.meta.updated);
    const ageStr = days === 0 ? "today" : days === 1 ? "1d" : `${days}d`;
    lines.push(
      `| ${m.score.toFixed(1)} | **${escapeMd(m.knowledge.meta.title)}** | \`${m.knowledge.meta.topic}\` | ${ageStr} | \`${m.knowledge.rel}\` |`,
    );
  }
  lines.push("");
  lines.push(`**Top match summary:** ${escapeMd(matches[0]!.knowledge.meta.summary)}`);
  lines.push("");
  lines.push("## How to use these");
  lines.push("");
  lines.push(
    `1. **Pick the top match** if its title/summary cover what's being asked. \`Read\` the full file at the path above and use it directly.`,
  );
  lines.push(
    `2. **Check freshness** — if the \`Age\` column is large (>180 days) for a fast-moving topic, the content may be stale; consider \`/oh-search research ${shellQuote(query)}\` to refresh.`,
  );
  lines.push(
    `3. **No good match** — if none of the top results actually cover the user's intent, fall back to \`WebSearch\` / \`WebFetch\` and then save the new knowledge via \`add\` (with the user's YES confirmation).`,
  );

  process.stdout.write(lines.join("\n") + "\n");
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|");
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}
