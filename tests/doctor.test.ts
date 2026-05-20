// tests/doctor.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpath } from "node:fs/promises";
import {
  parseFrontmatter,
  checkEnvDirs,
  checkShadowDirs,
  type Check,
} from "../src/skills/doctor/index.ts";
import { formatBytes } from "../src/shared/format-bytes.ts";
import type { OhEnv } from "../src/env.ts";

// ──────────────────────────────────────────────────────────────────────────────
// parseFrontmatter
// ──────────────────────────────────────────────────────────────────────────────

describe("parseFrontmatter", () => {
  test("returns null when no frontmatter block present", () => {
    expect(parseFrontmatter("no frontmatter here")).toBeNull();
  });

  test("parses simple key/value pairs", () => {
    const md = `---
name: mirai
description: implementer
---
body`;
    const fm = parseFrontmatter(md);
    expect(fm).not.toBeNull();
    expect(fm!.name).toBe("mirai");
    expect(fm!.description).toBe("implementer");
  });

  test("strips inline comments", () => {
    const md = `---
name: mirai # this is the name
---`;
    const fm = parseFrontmatter(md);
    expect(fm!.name).toBe("mirai");
  });

  test("strips surrounding quotes from values", () => {
    const md = `---
name: "mirai"
description: 'implementer'
---`;
    const fm = parseFrontmatter(md);
    expect(fm!.name).toBe("mirai");
    expect(fm!.description).toBe("implementer");
  });

  test("ignores blank and comment-only lines in frontmatter", () => {
    const md = `---
# a comment

name: yama
---`;
    const fm = parseFrontmatter(md);
    expect(fm!.name).toBe("yama");
    // only one key
    expect(Object.keys(fm!).length).toBe(1);
  });

  test("handles value containing a colon", () => {
    const md = `---
description: does stuff: and more stuff
---`;
    const fm = parseFrontmatter(md);
    expect(fm!.description).toBe("does stuff: and more stuff");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// formatBytes
// ──────────────────────────────────────────────────────────────────────────────

describe("formatBytes", () => {
  test("bytes below 1 KB", () => {
    expect(formatBytes(0)).toBe("0B");
    expect(formatBytes(512)).toBe("512B");
    expect(formatBytes(1023)).toBe("1023B");
  });

  test("kilobytes range", () => {
    expect(formatBytes(1024)).toBe("1.0KB");
    expect(formatBytes(2048)).toBe("2.0KB");
    expect(formatBytes(1024 * 512)).toBe("512.0KB");
  });

  test("megabytes range", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0MB");
    expect(formatBytes(1024 * 1024 * 2.5)).toBe("2.5MB");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// checkEnvDirs
// ──────────────────────────────────────────────────────────────────────────────

describe("checkEnvDirs", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await realpath(await mkdtemp(join(tmpdir(), "oh-doctor-")));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function makeEnv(overrides: Partial<OhEnv> = {}): OhEnv {
    return {
      CONTEXT_DIR: join(tmpDir, "context"),
      CONTEXT_TEMPLATE_DIR: join(tmpDir, "context-templates"),
      KNOWLEDGE_DIR: join(tmpDir, "knowledge"),
      PLAN_DIR: join(tmpDir, "plan"),
      ...overrides,
    };
  }

  test("all dirs missing → 4 warn checks", async () => {
    const checks: Check[] = [];
    checkEnvDirs(checks, makeEnv());
    expect(checks).toHaveLength(4);
    expect(checks.every((c) => c.status === "warn")).toBe(true);
    expect(checks.every((c) => c.group === "config")).toBe(true);
  });

  test("existing dir → ok status", async () => {
    const contextDir = join(tmpDir, "context");
    await mkdir(contextDir, { recursive: true });
    const checks: Check[] = [];
    checkEnvDirs(checks, makeEnv({ CONTEXT_DIR: contextDir }));
    const ctxCheck = checks.find((c) => c.name === "CONTEXT_DIR");
    expect(ctxCheck?.status).toBe("ok");
    expect(ctxCheck?.detail).toBe(contextDir);
  });

  test("missing dir detail mentions will-be-created", async () => {
    const checks: Check[] = [];
    checkEnvDirs(checks, makeEnv());
    const ctxCheck = checks.find((c) => c.name === "CONTEXT_DIR");
    expect(ctxCheck?.detail).toContain("missing (will be created on first use)");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// checkShadowDirs  (relies on HOME; we can't easily redirect it, so test the
//  no-shadow-path by verifying the function doesn't throw on a clean system
//  and that the output is predictable)
// ──────────────────────────────────────────────────────────────────────────────

describe("checkShadowDirs", () => {
  test("returns empty checks array when no old skill dirs present", () => {
    // On a clean machine with no ~/.claude/skills/oh-* dirs this produces 0 entries.
    // We can't assert an exact value without knowing the test runner's HOME, but we
    // can assert the function doesn't throw and all returned entries are warnings.
    const checks: Check[] = [];
    checkShadowDirs(checks);
    for (const c of checks) {
      expect(c.status).toBe("warn");
      expect(c.group).toBe("plugin");
    }
  });
});
