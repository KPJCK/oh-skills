import { deleteTemplate, listTemplates, readTemplate } from "../templates";
import { estimateTokens, formatTokens } from "../tokens";
import { loadOhEnv } from "../../../env";
import { renderEmpty } from "../render";
import { error, info } from "../../../shared/ui";
import path from "node:path";

export async function run(args: string[]): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);
  switch (sub) {
    case "list":
      return runList();
    case "show":
      return runShow(rest);
    case "delete":
      return runDelete(rest);
    default:
      error(
        `unknown template subcommand: ${sub ?? "(missing)"}`,
        "expected one of: list, show <name>, delete <name>",
      );
      process.exit(2);
  }
}

async function runList(): Promise<void> {
  const list = await listTemplates();
  if (list.length === 0) {
    process.stdout.write(
      renderEmpty("no templates yet — create one with `oh-context add --template <name>`") + "\n",
    );
    return;
  }
  const lines = [
    "## Templates",
    "",
    "| name | rules | tokens | created |",
    "| --- | ---: | ---: | --- |",
  ];
  for (const t of list) {
    lines.push(
      `| ${t.name} | ${t.ruleCount} | ${formatTokens(t.totalTokens)} | ${t.createdAt.slice(0, 10)} |`,
    );
  }
  process.stdout.write(lines.join("\n") + "\n");
}

async function runShow(rest: string[]): Promise<void> {
  const name = rest[0];
  if (!name) {
    error("show needs <name>");
    process.exit(2);
  }
  const tpl = await readTemplate(name);
  const contextRoot = loadOhEnv().CONTEXT_DIR;
  const lines = [
    `## Template: ${tpl.templateName}`,
    `_Created: ${tpl.createdAt}_`,
    "",
    "| name | path | tokens |",
    "| --- | --- | ---: |",
  ];
  for (const c of tpl.context) {
    const abs = path.join(contextRoot, c.path);
    let tok: string;
    try {
      tok = formatTokens(await estimateTokens(abs));
    } catch {
      tok = "missing";
    }
    lines.push(`| ${c.name} | \`${c.path}\` | ${tok} |`);
  }
  process.stdout.write(lines.join("\n") + "\n");
}

async function runDelete(rest: string[]): Promise<void> {
  const name = rest[0];
  if (!name) {
    error("delete needs <name>");
    process.exit(2);
  }
  await deleteTemplate(name);
  info(`deleted template: ${name}`);
}
