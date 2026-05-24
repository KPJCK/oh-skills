// src/skills/search/commands/delete.ts
import { $ } from "bun";
import { resolve } from "../registry";
import { confirm } from "../prompts";
import { error, info, success } from "../../../shared/ui";

export async function run(args: string[]): Promise<void> {
  let yes = false;
  const positional: string[] = [];
  for (const a of args) {
    if (a === "--yes" || a === "-y") yes = true;
    else positional.push(a);
  }

  const target = positional[0];
  if (!target || !target.includes("/")) {
    error(
      "missing or malformed argument: <topic>/<name>",
      "example: /oh-search delete bun/sqlite-api",
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

  info(`target: ${k.rel} (${k.shape}) at ${k.absRoot}`);

  if (!yes) {
    if (!process.stdin.isTTY) {
      error(
        "delete confirmation requires a TTY (or pass --yes)",
        "pass --yes to skip the confirmation prompt: oh-search delete <topic>/<name> --yes",
      );
      process.exit(2);
    }
    const ok = await confirm({
      message: `Trash this knowledge?`,
      default: false,
    });
    if (!ok) {
      error("cancelled");
      return;
    }
  }

  await $`trash ${k.absRoot}`;
  success(`trashed ${k.rel}`);
}
