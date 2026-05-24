// src/skills/search/commands/list.ts
import { listAll, ageDays, knowledgeRoot } from "../registry.ts";
import { info } from "../../../shared/ui.ts";

type Flags = {
  topic: string | null;
};

function parseFlags(args: string[]): Flags {
  const flags: Flags = { topic: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === "--topic") flags.topic = args[++i] ?? null;
  }
  return flags;
}

export async function run(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const all = await listAll();
  const filtered = flags.topic ? all.filter((k) => k.meta.topic === flags.topic) : all;

  const KNOWLEDGES_ROOT = knowledgeRoot();

  if (all.length === 0) {
    process.stdout.write(`_(knowledge base is empty at ${KNOWLEDGES_ROOT})_\n`);
    return;
  }
  if (flags.topic && filtered.length === 0) {
    process.stdout.write(`_(no knowledge under topic \`${flags.topic}\`)_\n`);
    return;
  }

  info(
    `${filtered.length} knowledge file${filtered.length === 1 ? "" : "s"}${flags.topic ? ` in topic \`${flags.topic}\`` : ""}`,
  );

  // Group by topic
  const byTopic = new Map<string, typeof filtered>();
  for (const k of filtered) {
    const arr = byTopic.get(k.meta.topic) ?? [];
    arr.push(k);
    byTopic.set(k.meta.topic, arr);
  }

  const lines: string[] = [];
  lines.push(`## Knowledge library`);
  lines.push("");
  lines.push(`Root: \`${KNOWLEDGES_ROOT}\``);
  lines.push("");
  lines.push("| Knowledge | Topic | Shape | Sources | Age | Path |");
  lines.push("|:---|:---|:---:|---:|---:|:---|");
  for (const [topic, items] of [...byTopic.entries()].toSorted()) {
    for (const k of items) {
      const days = await ageDays(k.meta.updated);
      const ageStr = days === 0 ? "today" : days === 1 ? "1d" : `${days}d`;
      const shape = k.shape === "folder" ? "folder" : "file";
      lines.push(
        `| **${escapeMd(k.meta.title)}** | \`${topic}\` | ${shape} | ${(k.meta.sources ?? []).length} | ${ageStr} | \`${k.rel}\` |`,
      );
    }
  }
  lines.push("");
  lines.push(
    `**Totals:** ${filtered.length} knowledge file${filtered.length === 1 ? "" : "s"} across ${byTopic.size} topic${byTopic.size === 1 ? "" : "s"}`,
  );

  process.stdout.write(lines.join("\n") + "\n");
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|");
}
