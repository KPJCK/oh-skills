// tests/context-huh.test.ts
import { test, expect, describe } from "bun:test";
import { $ } from "bun";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";

const CLI = path.join(os.homedir(), "workspaces/oh-skills/src/cli.ts");

describe("huh", () => {
  test("prints `false` and exits 1 when nothing is loaded for this cwd", async () => {
    const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), "huh-empty-")));
    try {
      await writeFile(path.join(tmp, ".oh-env"), `CONTEXT_DIR=${tmp}\n`);
      const { exitCode, stdout } = await $`bun ${CLI} context huh`.cwd(tmp).quiet().nothrow();
      expect(stdout.toString().trim()).toBe("false");
      expect(exitCode).toBe(1);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("prints `true` and exits 0 when cache has lastLoaded entries for cwd", async () => {
    const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), "huh-loaded-")));
    try {
      await writeFile(path.join(tmp, ".oh-env"), `CONTEXT_DIR=${tmp}\n`);
      // Seed cache directly
      const cacheDir = path.join(tmp, ".cache");
      await mkdir(cacheDir, { recursive: true });
      const payload = {
        [tmp]: {
          lastPicks: ["ts"],
          lastLoaded: [
            {
              file: "ts/rule-x.md",
              title: "X",
              priority: "medium",
              hash: "abc12345",
            },
          ],
          lastLoadedAt: new Date().toISOString(),
        },
      };
      await writeFile(path.join(cacheDir, "picks.json"), JSON.stringify(payload, null, 2));

      const { exitCode, stdout } = await $`bun ${CLI} context huh`.cwd(tmp).quiet().nothrow();
      expect(stdout.toString().trim()).toBe("true");
      expect(exitCode).toBe(0);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
