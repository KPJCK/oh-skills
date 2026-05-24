#!/usr/bin/env bun
// src/cli.ts
import { error } from "./shared/ui.ts";

type SkillRunner = {
  run: (args: string[]) => Promise<void>;
};

const skills: Record<string, () => Promise<SkillRunner>> = {
  nice: () => import("./skills/nice/index.ts"),
  "bug-tracing": () => import("./skills/bug-tracing/index.ts"),
  context: () => import("./skills/context/index.ts"),
  search: () => import("./skills/search/index.ts"),
  doctor: () => import("./skills/doctor/index.ts"),
  help: () => import("./skills/help/index.ts"),
  init: () => import("./commands/init.ts"),
};

async function main(): Promise<void> {
  const skill = process.argv[2];
  const args = process.argv.slice(3);

  if (!skill || skill === "--help" || skill === "-h") {
    printUsage();
    return;
  }

  const loader = skills[skill];
  if (!loader) {
    error(`unknown skill: ${skill}`, `expected one of: ${Object.keys(skills).join(", ")}`);
    process.exit(2);
  }

  const mod = await loader();
  await mod.run(args);
}

function printUsage(): void {
  process.stdout.write(`
oh-skills — personal dev-cycle skills for Claude Code

Usage:
  bun src/cli.ts <skill> <subcommand> [flags]

Skills:
  nice          plan / update-plan / go / review / fix / do
  bug-tracing   fix — fix a bug + forensic trace.md
  context       load / list / check / add / update / promote / template / clear / huh
  search        find / research / add / update / delete / list
  doctor        sanity-check the installation
  help          print the reference card
  init          scaffold .oh-env in this project (or ~/.claude/.oh-env)

`);
}

main().catch((err) => {
  error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
