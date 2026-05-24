// src/skills/search/commands/find.ts
import { listAll, ageDays, knowledgeRoot } from "../registry.ts";
import { rankAndFilter } from "../scoring.ts";
import { info, error } from "../../../shared/ui.ts";

export async function run(args: string[]): Promise<void> {
  const query = args.join(" ").trim();
  if (!query) {
    error("missing query", "example: /oh-search find react server components");
    process.exit(2);
  }

  const all = await listAll();
  if (all.length === 0) {
    process.stdout.write(`_(knowledge base is empty — nothing to search at ${knowledgeRoot()})_\n`);
    return;
  }

  const matches = rankAndFilter(query, all, { threshold: 2, limit: 5 });

  info(`scanned ${all.length} knowledge file${all.length === 1 ? "" : "s"}`);

  if (matches.length === 0) {
    process.stdout.write(
      `## No local match: \`${escapeMd(query)}\`\n\n` +
        `No results above relevance threshold.\n` +
        `Try: \`/oh-search research ${shellQuote(query)}\`\n`,
    );
    return;
  }

  const lines: string[] = [];
  lines.push(`## Local matches: \`${escapeMd(query)}\``);
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
  const topMatch = matches[0];
  if (topMatch) lines.push(`Top match: ${escapeMd(topMatch.knowledge.meta.summary)}`);

  process.stdout.write(lines.join("\n") + "\n");
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|");
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}
