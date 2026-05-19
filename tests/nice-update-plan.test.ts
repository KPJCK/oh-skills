// tests/nice-update-plan.test.ts
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("update-plan helpers", () => {
  let tmp: string;

  beforeEach(async () => {
    const raw = await mkdtemp(path.join(os.tmpdir(), "oh-nice-up-"));
    tmp = await realpath(raw);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("appendDatedSection adds a fresh dated H2 when none exists today", async () => {
    const { appendDatedSection } = await import("../src/skills/nice/commands/update-plan.ts");
    const file = path.join(tmp, "spec.md");
    await writeFile(file, "# Spec\n\nOriginal body.\n");
    await appendDatedSection(file, "2026-05-18", "Some delta.\n");
    const got = await readFile(file, "utf-8");
    expect(got).toContain("# Spec");
    expect(got).toContain("Original body.");
    expect(got).toContain("## Update — 2026-05-18");
    expect(got).toContain("Some delta.");
  });

  test("appendDatedSection adds a (2) suffix on same-day re-update", async () => {
    const { appendDatedSection } = await import("../src/skills/nice/commands/update-plan.ts");
    const file = path.join(tmp, "spec.md");
    await writeFile(file, "# Spec\n\nOriginal.\n");
    await appendDatedSection(file, "2026-05-18", "First update.\n");
    await appendDatedSection(file, "2026-05-18", "Second update.\n");
    const got = await readFile(file, "utf-8");
    expect(got).toContain("## Update — 2026-05-18\n");
    expect(got).toContain("## Update — 2026-05-18 (2)");
    expect(got).toContain("First update.");
    expect(got).toContain("Second update.");
  });

  test("appendDatedSection creates the file if missing", async () => {
    const { appendDatedSection } = await import("../src/skills/nice/commands/update-plan.ts");
    const file = path.join(tmp, "spec.md");
    await appendDatedSection(file, "2026-05-18", "Brand new content.\n");
    const got = await readFile(file, "utf-8");
    expect(got).toContain("## Update — 2026-05-18");
    expect(got).toContain("Brand new content.");
  });
});
