// tests/context-templates.test.ts
// NOTE: loadOhEnv() is called lazily at function-call time in our implementation,
// so we can drive CONTEXT_DIR and CONTEXT_TEMPLATE_DIR by writing a .oh-env file
// and process.chdir'ing to the temp directory in beforeAll.
// We use realpath() to resolve macOS /var vs /private/var symlinks.
import { test, expect, describe, beforeAll, afterAll, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, readdir, unlink, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("templates", () => {
  let tmpCwd: string;
  let tmpContextRoot: string;
  let tmpTemplateRoot: string;
  let savedCwd: string;

  beforeAll(async () => {
    savedCwd = process.cwd();
    tmpContextRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "oh-tpl-ctx-")));
    tmpTemplateRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "oh-tpl-store-")));
    tmpCwd = await realpath(await mkdtemp(path.join(os.tmpdir(), "oh-tpl-cwd-")));

    // Write .oh-env so loadOhEnv() picks up our temp dirs
    await writeFile(
      path.join(tmpCwd, ".oh-env"),
      `CONTEXT_DIR=${tmpContextRoot}\nCONTEXT_TEMPLATE_DIR=${tmpTemplateRoot}\n`,
    );
    process.chdir(tmpCwd);

    // Seed one rule file
    const folder = path.join(tmpContextRoot, "ts");
    await mkdir(folder, { recursive: true });
    await writeFile(
      path.join(folder, "rule-x.md"),
      "---\ntitle: X\ndescription: x rule\npriority: medium\n---\n\n# X\n",
    );
  });

  afterAll(async () => {
    process.chdir(savedCwd);
    await rm(tmpContextRoot, { recursive: true, force: true });
    await rm(tmpTemplateRoot, { recursive: true, force: true });
    await rm(tmpCwd, { recursive: true, force: true });
  });

  afterEach(async () => {
    // Clear template JSON files between tests so each starts fresh.
    const files = await readdir(tmpTemplateRoot).catch(() => [] as string[]);
    for (const f of files) {
      if (f.endsWith(".json")) {
        await unlink(path.join(tmpTemplateRoot, f)).catch(() => {});
      }
    }
  });

  test("writeTemplate then readTemplate round-trips", async () => {
    const { writeTemplate, readTemplate } = await import("../src/skills/context/templates.ts");
    await writeTemplate("alpha", ["ts/rule-x.md"]);
    const got = await readTemplate("alpha");
    expect(got.templateName).toBe("alpha");
    expect(got.context).toHaveLength(1);
    expect(got.context[0]!.path).toBe("ts/rule-x.md");
    expect(got.context[0]!.name).toBe("X");
    expect(typeof got.createdAt).toBe("string");
  });

  test("writeTemplate refuses duplicate name without overwrite", async () => {
    const { writeTemplate } = await import("../src/skills/context/templates.ts");
    await writeTemplate("alpha", ["ts/rule-x.md"]);
    await expect(
      writeTemplate("alpha", ["ts/rule-x.md"]),
    ).rejects.toThrow(/exists/);
  });

  test("writeTemplate with overwrite=true replaces", async () => {
    const { writeTemplate, readTemplate } = await import("../src/skills/context/templates.ts");
    await writeTemplate("alpha", ["ts/rule-x.md"]);
    await writeTemplate("alpha", ["ts/rule-x.md"], { overwrite: true });
    const got = await readTemplate("alpha");
    expect(got.context).toHaveLength(1);
  });

  test("writeTemplate errors if a path does not resolve to a rule", async () => {
    const { writeTemplate } = await import("../src/skills/context/templates.ts");
    await expect(
      writeTemplate("bad", ["ts/rule-missing.md"]),
    ).rejects.toThrow(/missing|not.*found|no such/i);
  });

  test("listTemplates returns metadata for each file", async () => {
    const { writeTemplate, listTemplates } = await import("../src/skills/context/templates.ts");
    await writeTemplate("alpha", ["ts/rule-x.md"]);
    const list = await listTemplates();
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("alpha");
    expect(list[0]!.ruleCount).toBe(1);
    expect(typeof list[0]!.totalTokens).toBe("number");
  });

  test("resolveTemplate returns full Rule objects", async () => {
    const { writeTemplate, resolveTemplate } = await import("../src/skills/context/templates.ts");
    await writeTemplate("alpha", ["ts/rule-x.md"]);
    const rules = await resolveTemplate("alpha");
    expect(rules).toHaveLength(1);
    expect(rules[0]!.title).toBe("X");
    expect(rules[0]!.priority).toBe("medium");
  });

  test("deleteTemplate removes the file", async () => {
    const { writeTemplate, deleteTemplate, listTemplates } = await import(
      "../src/skills/context/templates.ts"
    );
    await writeTemplate("alpha", ["ts/rule-x.md"]);
    await deleteTemplate("alpha");
    const list = await listTemplates();
    expect(list).toHaveLength(0);
  });
});
