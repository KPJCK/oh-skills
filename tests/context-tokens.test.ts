import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, realpath, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { estimateTokens, formatTokens } from "../src/skills/context/tokens";

describe("tokens", () => {
  let tmpCwd: string;
  let contextDir: string;
  let savedCwd: string;

  beforeEach(async () => {
    // macOS realpath fix: /var is a symlink to /private/var; resolve to canonical path
    tmpCwd = await realpath(await mkdtemp(path.join(tmpdir(), "oh-context-tokens-test-")));
    contextDir = path.join(tmpCwd, "context");
    await mkdir(contextDir, { recursive: true });

    // Write .oh-env so loadOhEnv() can find CONTEXT_DIR without throwing
    await writeFile(path.join(tmpCwd, ".oh-env"), `CONTEXT_DIR=${contextDir}\n`);

    savedCwd = process.cwd();
    process.chdir(tmpCwd);
  });

  afterEach(async () => {
    process.chdir(savedCwd);
    await rm(tmpCwd, { recursive: true, force: true });
  });

  test("estimateTokens returns a positive integer for a real file", async () => {
    const file = path.join(contextDir, "rule-x.md");
    await writeFile(
      file,
      "---\ntitle: x\ndescription: y\npriority: low\n---\n\n# x\n\n## DO\n- write tests\n",
    );
    const n = await estimateTokens(file);
    expect(n).toBeGreaterThan(0);
    expect(Number.isInteger(n)).toBe(true);
  });

  test("formatTokens rounds to nearest 10 and prefixes with ~", () => {
    expect(formatTokens(0)).toBe("~0 tok");
    expect(formatTokens(7)).toBe("~10 tok");
    expect(formatTokens(14)).toBe("~10 tok");
    expect(formatTokens(15)).toBe("~20 tok");
    expect(formatTokens(123)).toBe("~120 tok");
  });

  test("estimateTokens excludes frontmatter from the count", async () => {
    const withFm = path.join(contextDir, "rule-fm.md");
    const sameBodyNoFm = path.join(contextDir, "rule-bare.md");
    const body = "# x\n\n## DO\n- a\n- b\n- c\n";
    await writeFile(withFm, `---\ntitle: x\ndescription: y\npriority: low\n---\n\n${body}`);
    await writeFile(sameBodyNoFm, body);
    const a = await estimateTokens(withFm);
    const b = await estimateTokens(sameBodyNoFm);
    expect(a).toBe(b);
  });
});
