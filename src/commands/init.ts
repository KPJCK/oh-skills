// src/commands/init.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { emit } from "../shared/next-action.ts";
import { ok } from "../shared/ui.ts";

function pluginRoot(): string {
  return process.env.CLAUDE_PLUGIN_ROOT ?? path.resolve(import.meta.dir, "../..");
}

export async function run(args: string[]): Promise<void> {
  let location: "project" | "home" | undefined;
  for (const arg of args) {
    if (arg === "--location=project") location = "project";
    else if (arg === "--location=home") location = "home";
  }

  const cwd = process.cwd();
  const home = process.env.HOME ?? os.homedir();
  const projectPath = path.join(cwd, ".oh-env");
  const homePath = path.join(home, ".claude", ".oh-env");

  // No location flag — ask user to pick
  if (!location) {
    const projectExists = existsSync(projectPath);
    const homeExists = existsSync(homePath);
    const opts = [
      `project — ${projectPath}${projectExists ? " (exists; will prompt to overwrite)" : ""}`,
      `home — ${homePath}${homeExists ? " (exists; will prompt to overwrite)" : ""}`,
    ];
    emit("init", [
      { type: "ask_user", question: "Where to write .oh-env?", options: opts },
      {
        type: "report",
        message: `After the user picks, run: bun \${CLAUDE_PLUGIN_ROOT}/src/cli.ts init --location=<project|home>`,
      },
    ]);
    return;
  }

  const targetPath = location === "project" ? projectPath : homePath;
  const exists = existsSync(targetPath);

  // File exists and no --overwrite — ask user
  if (exists && !args.includes("--overwrite")) {
    emit("init", [
      {
        type: "ask_user",
        question: `${targetPath} exists. Overwrite?`,
        options: ["Yes, overwrite", "No, cancel"],
      },
      {
        type: "report",
        message: `If user picks overwrite, re-run with --overwrite flag.`,
      },
    ]);
    return;
  }

  // Copy template to target
  const template = readFileSync(
    path.join(pluginRoot(), "templates", ".oh-env.example"),
    "utf-8",
  );
  const targetDir = path.dirname(targetPath);
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
  writeFileSync(targetPath, template, "utf-8");
  ok(`wrote ${targetPath}`);

  // Append .oh-env to .gitignore (idempotent) when writing to project
  if (location === "project") {
    const giPath = path.join(cwd, ".gitignore");
    let gi = "";
    if (existsSync(giPath)) gi = readFileSync(giPath, "utf-8");
    if (!gi.split("\n").includes(".oh-env")) {
      writeFileSync(
        giPath,
        (gi.endsWith("\n") || gi === "" ? gi : gi + "\n") + ".oh-env\n",
        "utf-8",
      );
      ok(`added .oh-env to .gitignore`);
    }
  }

  emit("init", [
    {
      type: "report",
      message: [
        `${targetPath} created.`,
        ``,
        `Edit it to set CODING_AGENT / REVIEW_AGENT / RESEARCH_AGENT if you have sub-agents`,
        `registered. Empty values mean the main conversation handles those roles.`,
      ].join("\n"),
    },
  ]);
}
