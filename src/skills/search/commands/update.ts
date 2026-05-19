// src/skills/search/commands/update.ts
import { readFile } from "node:fs/promises";
import { resolve } from "../registry.ts";
import { todayISO } from "../../../shared/frontmatter.ts";
import { error, info, hint } from "../../../shared/ui.ts";

export async function run(args: string[]): Promise<void> {
  const target = args[0];
  if (!target || !target.includes("/")) {
    error(
      "missing or malformed argument: <topic>/<name>",
      "example: /oh-search update bun/sqlite-api",
    );
    process.exit(2);
  }

  const slashIdx = target.indexOf("/");
  const topic = target.slice(0, slashIdx);
  const name = target.slice(slashIdx + 1);

  let k;
  try {
    k = await resolve(topic, name);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  info(`editing ${k.rel} (${k.shape})`);
  hint(`path: ${k.absPath}`);

  const content = await readFile(k.absPath, "utf-8");
  const today_ = todayISO();

  const lines: string[] = [];
  lines.push(`## Knowledge update — \`${k.rel}\``);
  lines.push("");
  lines.push(`The user wants to update this knowledge. Current content:`);
  lines.push("");
  lines.push("```markdown");
  lines.push(content.trimEnd());
  lines.push("```");
  lines.push("");
  lines.push("## What to do");
  lines.push("");
  lines.push(
    `1. Ask the user what they want to change in natural language (e.g. "add a section about migrations", "refresh the bun sqlite API examples", "fix the source URL").`,
  );
  lines.push(
    `2. Use your **Edit tool** to apply the change directly at:`,
  );
  lines.push(`   \`${k.absPath}\``);
  lines.push(
    `3. **Update the \`updated:\` field** in frontmatter to today's date: \`${today_}\``,
  );
  lines.push(
    `4. Preserve the rest of the frontmatter shape (\`title\`, \`summary\`, \`topic\`, \`tags\`, \`query\`, \`sources\`, \`created\`).`,
  );
  if (k.shape === "folder") {
    lines.push(
      `5. This is a **folder-shaped knowledge** at \`${k.absRoot}\`. The user may also want to add/change attachments under \`images/\` or \`scripts/\`. Use Read/Write/Edit as appropriate; \`index.md\` is the entry point.`,
    );
  }
  lines.push("");
  lines.push(
    `After editing, briefly summarize what you changed. **Do not create a new knowledge file** — that path is \`/oh-search add\`.`,
  );

  process.stdout.write(lines.join("\n") + "\n");
}
