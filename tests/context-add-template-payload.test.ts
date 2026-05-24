// tests/context-add-template-payload.test.ts
// NOTE: loadOhEnv() is called lazily in our implementation, so we drive
// CONTEXT_DIR by writing a .oh-env file and process.chdir'ing to a temp dir.
// We use realpath() to resolve macOS /var vs /private/var symlinks.
import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, readdir, unlink, realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("add --template ask-json payload", () => {
  let tmpCwd: string;
  let tmpCtx: string;
  let tsFolder: string;
  let savedCwd: string;

  beforeAll(async () => {
    savedCwd = process.cwd();
    tmpCtx = await realpath(await mkdtemp(path.join(os.tmpdir(), "add-tpl-ctx-")));
    tmpCwd = await realpath(await mkdtemp(path.join(os.tmpdir(), "add-tpl-cwd-")));

    await writeFile(path.join(tmpCwd, ".oh-env"), `CONTEXT_DIR=${tmpCtx}\n`);
    process.chdir(tmpCwd);

    tsFolder = path.join(tmpCtx, "ts");
    await mkdir(tsFolder, { recursive: true });
  });

  afterAll(async () => {
    process.chdir(savedCwd);
    await rm(tmpCtx, { recursive: true, force: true });
    await rm(tmpCwd, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Reset the ts/ folder between tests.
    const files = await readdir(tsFolder).catch(() => [] as string[]);
    for (const f of files) await unlink(path.join(tsFolder, f)).catch(() => {});
  });

  test("buildAddTemplateAskPayload returns options for each rule with token estimate in description", async () => {
    await writeFile(
      path.join(tsFolder, "rule-x.md"),
      "---\ntitle: X\ndescription: x rule\npriority: medium\n---\n\n# X\n",
    );
    await writeFile(
      path.join(tsFolder, "rule-y.md"),
      "---\ntitle: Y\ndescription: y rule\npriority: medium\n---\n\n# Y\n",
    );
    const { buildAddTemplateAskPayload } = await import("../src/skills/context/ask-ui.ts");
    const { listAllRuleMeta } = await import("../src/skills/context/registry.ts");
    const { estimateTokens } = await import("../src/skills/context/tokens.ts");
    const rules = await listAllRuleMeta();
    const tokens = new Map<string, number>();
    for (const r of rules) tokens.set(r.rel, await estimateTokens(r.absPath));
    const payload = buildAddTemplateAskPayload(rules, tokens, "feat1");
    expect(payload.questions.length).toBeGreaterThan(0);
    const allOptions = payload.questions.flatMap((q) => q.options);
    const labels = allOptions.map((o) => o.label).sort();
    expect(labels).toEqual(["ts/rule-x.md", "ts/rule-y.md"]);
    for (const o of allOptions) {
      expect(o.description).toMatch(/~\d+ tok/);
    }
    expect(payload.next).toContain("--template");
    expect(payload.next).toContain("feat1");
  });

  test("autoPick if only one rule exists", async () => {
    await writeFile(
      path.join(tsFolder, "rule-only.md"),
      "---\ntitle: Only\ndescription: x rule\npriority: medium\n---\n\n# Only\n",
    );
    const { buildAddTemplateAskPayload } = await import("../src/skills/context/ask-ui.ts");
    const { listAllRuleMeta } = await import("../src/skills/context/registry.ts");
    const { estimateTokens } = await import("../src/skills/context/tokens.ts");
    const rules = await listAllRuleMeta();
    const tokens = new Map<string, number>();
    for (const r of rules) tokens.set(r.rel, await estimateTokens(r.absPath));
    const payload = buildAddTemplateAskPayload(rules, tokens, "feat1");
    expect(payload.autoPick).toEqual(["ts/rule-only.md"]);
    expect(payload.questions).toEqual([]);
  });
});
