// src/commands/version.ts
//
// `oh version` — print the current oh-skills release version + commit hash.
// Format: `release <version> - <short-sha>`
//
// Version comes from package.json; commit hash from `git rev-parse --short HEAD`
// run inside the oh-skills repo (NOT the user's cwd), so the reported hash
// always identifies the installed plugin version.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

export async function run(_args: string[]): Promise<void> {
  const pkgPath = path.resolve(import.meta.dir, "..", "..", "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as { version?: string };
  const version = pkg.version ?? "unknown";

  const repoDir = path.dirname(pkgPath);
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoDir,
    encoding: "utf-8",
  });
  const hash = result.status === 0 ? result.stdout.trim() : "unknown";

  process.stdout.write(`release ${version} - ${hash}\n`);
}
