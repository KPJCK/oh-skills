import { readFile } from "node:fs/promises";
import { resolveRulePath } from "../registry.ts";
import { error, info, hint } from "../../../shared/ui.ts";

export async function run(args: string[]): Promise<void> {
  const target = args[0];
  if (!target) {
    error(
      "missing argument: <folder>/<name>",
      "example: /oh-context update typescript/frontend/react-hooks",
    );
    process.exit(2);
  }

  let resolved;
  try {
    resolved = await resolveRulePath(target);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  info(`editing ${resolved.rel}`);
  hint(`path: ${resolved.absPath}`);

  const current = await readFile(resolved.absPath, "utf-8");

  // Stdout: full current content + directive for Claude.
  const lines: string[] = [];
  lines.push(`## Rule update — \`${resolved.rel}\``);
  lines.push("");
  lines.push(`The user wants to update this rule. Here is the **current content**:`);
  lines.push("");
  lines.push("```markdown");
  lines.push(current.trimEnd());
  lines.push("```");
  lines.push("");
  lines.push("## What to do");
  lines.push("");
  lines.push(
    `1. Ask the user what they want to change (in natural language — they'll say "change priority to high", "add a DO about hooks rules", "remove the third DO NOT bullet", etc.).`,
  );
  lines.push(`2. Use your **Edit tool** to apply the change directly to the file at:`);
  lines.push(`   \`${resolved.absPath}\``);
  lines.push(
    `3. Preserve the file structure: frontmatter (\`title\`, \`description\`, \`priority\`) at the top, then \`# <title>\`, then \`## DO\`, \`## DO NOT\`, optional \`## Details\`.`,
  );
  lines.push(
    `4. After the edit, briefly summarize what you changed and remind the user that they should run \`/oh-context load\` to re-inject the updated rule (the previously loaded version is now stale).`,
  );
  lines.push("");
  lines.push(
    `**Do NOT** create a new rule file. **Do NOT** use \`/oh-context add\`. Just edit the existing file directly with the Edit tool.`,
  );

  process.stdout.write(lines.join("\n") + "\n");
}
