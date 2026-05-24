// tests/init.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = new URL("../src/cli.ts", import.meta.url).pathname;
// Resolve project root so we can set CLAUDE_PLUGIN_ROOT in spawned processes
const PLUGIN_ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

async function makeTmpDir(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), "oh-init-")));
}

// Helper: spawn CLI with a controlled cwd and HOME
async function runInit(
  args: string[],
  opts: { cwd: string; home: string },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const r = await $`bun ${CLI} init ${args}`
    .cwd(opts.cwd)
    .env({ ...process.env, HOME: opts.home, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT })
    .nothrow()
    .quiet();
  return {
    stdout: r.stdout.toString(),
    stderr: r.stderr.toString(),
    exitCode: r.exitCode,
  };
}

describe("/oh init", () => {
  let tmpCwd: string;
  let tmpHome: string;

  beforeEach(async () => {
    tmpCwd = await makeTmpDir();
    tmpHome = await makeTmpDir();
    // Create ~/.claude/ inside our fake home so home location works
    await mkdir(join(tmpHome, ".claude"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpCwd, { recursive: true, force: true });
    await rm(tmpHome, { recursive: true, force: true });
  });

  // ── sentinel tests ──────────────────────────────────────────────────────────

  test("no --location emits __OH_INIT_NEXT_ACTIONS__ sentinel to stderr", async () => {
    const { stderr } = await runInit([], { cwd: tmpCwd, home: tmpHome });
    expect(stderr).toContain("__OH_INIT_NEXT_ACTIONS__");
  });

  test("no --location sentinel contains ask_user action", async () => {
    const { stderr } = await runInit([], { cwd: tmpCwd, home: tmpHome });
    const match = stderr.match(/__OH_INIT_NEXT_ACTIONS__(\[.+\])/);
    expect(match).not.toBeNull();
    const actions = JSON.parse(match![1]!);
    const askUser = actions.find((a: { type: string }) => a.type === "ask_user");
    expect(askUser).toBeDefined();
    expect(askUser.question).toMatch(/where to write/i);
  });

  test("file exists without --overwrite emits ask_user sentinel", async () => {
    // Pre-create the project .oh-env
    await writeFile(join(tmpCwd, ".oh-env"), "existing content\n");
    const { stderr } = await runInit(["--location=project"], {
      cwd: tmpCwd,
      home: tmpHome,
    });
    expect(stderr).toContain("__OH_INIT_NEXT_ACTIONS__");
    const match = stderr.match(/__OH_INIT_NEXT_ACTIONS__(\[.+\])/);
    const actions = JSON.parse(match![1]!);
    const askUser = actions.find((a: { type: string }) => a.type === "ask_user");
    expect(askUser?.question).toContain("exists. Overwrite?");
  });

  // ── project location ────────────────────────────────────────────────────────

  test("--location=project writes .oh-env in cwd", async () => {
    await runInit(["--location=project"], { cwd: tmpCwd, home: tmpHome });
    const target = join(tmpCwd, ".oh-env");
    expect(existsSync(target)).toBe(true);
    const content = await readFile(target, "utf-8");
    expect(content).toContain("CONTEXT_DIR");
  });

  test("--location=project appends .oh-env to .gitignore", async () => {
    await runInit(["--location=project"], { cwd: tmpCwd, home: tmpHome });
    const gi = await readFile(join(tmpCwd, ".gitignore"), "utf-8");
    expect(gi.split("\n")).toContain(".oh-env");
  });

  test("--location=project .gitignore append is idempotent", async () => {
    // First run
    await runInit(["--location=project"], { cwd: tmpCwd, home: tmpHome });
    // Second run with --overwrite
    await runInit(["--location=project", "--overwrite"], {
      cwd: tmpCwd,
      home: tmpHome,
    });
    const gi = await readFile(join(tmpCwd, ".gitignore"), "utf-8");
    const count = gi.split("\n").filter((l) => l === ".oh-env").length;
    expect(count).toBe(1);
  });

  test("--location=project with existing .gitignore preserves existing content", async () => {
    await writeFile(join(tmpCwd, ".gitignore"), "node_modules/\ndist/\n");
    await runInit(["--location=project"], { cwd: tmpCwd, home: tmpHome });
    const gi = await readFile(join(tmpCwd, ".gitignore"), "utf-8");
    expect(gi).toContain("node_modules/");
    expect(gi).toContain("dist/");
    expect(gi).toContain(".oh-env");
  });

  // ── home location ───────────────────────────────────────────────────────────

  test("--location=home writes ~/.claude/.oh-env", async () => {
    await runInit(["--location=home"], { cwd: tmpCwd, home: tmpHome });
    const target = join(tmpHome, ".claude", ".oh-env");
    expect(existsSync(target)).toBe(true);
    const content = await readFile(target, "utf-8");
    expect(content).toContain("CONTEXT_DIR");
  });

  test("--location=home does NOT append to .gitignore", async () => {
    await runInit(["--location=home"], { cwd: tmpCwd, home: tmpHome });
    expect(existsSync(join(tmpCwd, ".gitignore"))).toBe(false);
  });

  // ── overwrite guard ─────────────────────────────────────────────────────────

  test("--overwrite replaces existing file", async () => {
    await writeFile(join(tmpCwd, ".oh-env"), "old content\n");
    await runInit(["--location=project", "--overwrite"], {
      cwd: tmpCwd,
      home: tmpHome,
    });
    const content = await readFile(join(tmpCwd, ".oh-env"), "utf-8");
    expect(content).not.toContain("old content");
    expect(content).toContain("CONTEXT_DIR");
  });

  // ── success sentinel ────────────────────────────────────────────────────────

  test("successful write emits __OH_INIT_NEXT_ACTIONS__ with report action", async () => {
    const { stderr } = await runInit(["--location=project"], {
      cwd: tmpCwd,
      home: tmpHome,
    });
    expect(stderr).toContain("__OH_INIT_NEXT_ACTIONS__");
    const match = stderr.match(/__OH_INIT_NEXT_ACTIONS__(\[.+\])/);
    const actions = JSON.parse(match![1]!);
    const report = actions.find((a: { type: string }) => a.type === "report");
    expect(report?.message).toContain("created");
  });
});
