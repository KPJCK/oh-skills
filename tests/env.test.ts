// tests/env.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadOhEnv } from "../src/env.ts";

describe("loadOhEnv", () => {
  let tmpHome: string;
  let tmpCwd: string;
  let savedHome: string | undefined;
  let savedCwd: string;

  beforeEach(async () => {
    tmpHome = await realpath(await mkdtemp(path.join(tmpdir(), "oh-skills-home-")));
    tmpCwd = await realpath(await mkdtemp(path.join(tmpdir(), "oh-skills-cwd-")));
    savedHome = process.env.HOME;
    savedCwd = process.cwd();
    process.env.HOME = tmpHome;
    process.chdir(tmpCwd);
  });

  afterEach(async () => {
    process.env.HOME = savedHome;
    process.chdir(savedCwd);
    await rm(tmpHome, { recursive: true, force: true });
    await rm(tmpCwd, { recursive: true, force: true });
    // wipe process.env overrides set during tests
    for (const k of [
      "CONTEXT_DIR",
      "PLAN_DIR",
      "KNOWLEDGE_DIR",
      "CONTEXT_TEMPLATE_DIR",
      "CODING_AGENT",
      "REVIEW_AGENT",
      "RESEARCH_AGENT",
    ]) {
      delete process.env[k];
    }
  });

  test("throws when no .oh-env files exist", async () => {
    expect(() => loadOhEnv()).toThrow(/No \.oh-env found/);
  });

  test("loads from project .oh-env when present", async () => {
    await writeFile(path.join(tmpCwd, ".oh-env"), "CONTEXT_DIR=/tmp/proj-context\n");
    const env = loadOhEnv();
    expect(env.CONTEXT_DIR).toBe("/tmp/proj-context");
  });

  test("loads from ~/.claude/.oh-env when project file missing", async () => {
    await import("node:fs/promises").then((m) =>
      m.mkdir(path.join(tmpHome, ".claude"), { recursive: true }),
    );
    await writeFile(path.join(tmpHome, ".claude", ".oh-env"), "CONTEXT_DIR=/tmp/home-context\n");
    const env = loadOhEnv();
    expect(env.CONTEXT_DIR).toBe("/tmp/home-context");
  });

  test("project file overrides home file per-key (merge, not replace)", async () => {
    await import("node:fs/promises").then((m) =>
      m.mkdir(path.join(tmpHome, ".claude"), { recursive: true }),
    );
    await writeFile(
      path.join(tmpHome, ".claude", ".oh-env"),
      "CONTEXT_DIR=/tmp/home-context\nPLAN_DIR=/tmp/home-plan\n",
    );
    await writeFile(path.join(tmpCwd, ".oh-env"), "PLAN_DIR=/tmp/proj-plan\n");
    const env = loadOhEnv();
    expect(env.CONTEXT_DIR).toBe("/tmp/home-context"); // from home
    expect(env.PLAN_DIR).toBe("/tmp/proj-plan"); // overridden by project
  });

  test("expands ~ to home directory", async () => {
    await writeFile(path.join(tmpCwd, ".oh-env"), "CONTEXT_DIR=~/my-context\n");
    const env = loadOhEnv();
    expect(env.CONTEXT_DIR).toBe(path.join(tmpHome, "my-context"));
  });

  test("resolves relative paths against cwd", async () => {
    await writeFile(path.join(tmpCwd, ".oh-env"), "CONTEXT_DIR=./.oh/context\n");
    const env = loadOhEnv();
    expect(env.CONTEXT_DIR).toBe(path.join(tmpCwd, ".oh", "context"));
  });

  test("process.env overrides file values", async () => {
    await writeFile(path.join(tmpCwd, ".oh-env"), "CONTEXT_DIR=/tmp/file-context\n");
    process.env.CONTEXT_DIR = "/tmp/override-context";
    const env = loadOhEnv();
    expect(env.CONTEXT_DIR).toBe("/tmp/override-context");
  });

  test("agent keys: empty string treated as unset", async () => {
    await writeFile(
      path.join(tmpCwd, ".oh-env"),
      "CONTEXT_DIR=/tmp/c\nCODING_AGENT=\nREVIEW_AGENT=  \n",
    );
    const env = loadOhEnv();
    expect(env.CODING_AGENT).toBeUndefined();
    expect(env.REVIEW_AGENT).toBeUndefined();
  });

  test("agent keys: non-empty value preserved", async () => {
    await writeFile(path.join(tmpCwd, ".oh-env"), "CONTEXT_DIR=/tmp/c\nCODING_AGENT=mirai\n");
    const env = loadOhEnv();
    expect(env.CODING_AGENT).toBe("mirai");
  });

  test("ignores comment lines and blank lines", async () => {
    await writeFile(
      path.join(tmpCwd, ".oh-env"),
      "# this is a comment\n\nCONTEXT_DIR=/tmp/c\n  # indented comment\n",
    );
    const env = loadOhEnv();
    expect(env.CONTEXT_DIR).toBe("/tmp/c");
  });

  test("built-in defaults used when key missing from all sources", async () => {
    await writeFile(path.join(tmpCwd, ".oh-env"), "CONTEXT_DIR=/tmp/c\n");
    const env = loadOhEnv();
    expect(env.PLAN_DIR).toBe(path.join(tmpCwd, ".oh", "plan")); // default
    expect(env.KNOWLEDGE_DIR).toBe(path.join(tmpCwd, ".oh", "knowledge")); // default
    expect(env.CONTEXT_TEMPLATE_DIR).toBe(path.join(tmpCwd, ".oh", "context-templates"));
  });

  test("resolveAgent helper returns null for unset, string for set", async () => {
    await writeFile(path.join(tmpCwd, ".oh-env"), "CONTEXT_DIR=/tmp/c\nCODING_AGENT=mirai\n");
    const env = loadOhEnv();
    const { resolveAgent } = await import("../src/env.ts");
    expect(resolveAgent("coding", env)).toBe("mirai");
    expect(resolveAgent("review", env)).toBeNull();
  });
});
