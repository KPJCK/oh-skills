// tests/nice-update-plan.test.ts
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const CLI = path.resolve(import.meta.dir, "..", "src", "cli.ts");
const REPO_ROOT = path.resolve(import.meta.dir, "..");

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function parseNextActions(stderr: string): unknown[] {
  const sentinel = "__OH_NICE_NEXT_ACTIONS__";
  const idx = stderr.lastIndexOf(sentinel);
  if (idx === -1) throw new Error(`Sentinel not found in stderr:\n${stderr}`);
  const json = stderr.slice(idx + sentinel.length).trim();
  return JSON.parse(json) as unknown[];
}

function makeMinimalEnv(planDir: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    HOME: os.tmpdir(),
    PLAN_DIR: planDir,
    CONTEXT_DIR: path.join(os.tmpdir(), "context"),
    CONTEXT_TEMPLATE_DIR: path.join(os.tmpdir(), "context-templates"),
    KNOWLEDGE_DIR: path.join(os.tmpdir(), "knowledge"),
    ...extra,
  };
}

function spawnCli(args: string[], extraEnv: Record<string, string> = {}, cwd?: string): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync(["bun", CLI, ...args], {
    cwd: cwd ?? REPO_ROOT,
    env: {
      ...process.env,
      HOME: os.tmpdir(),
      ...extraEnv,
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}

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

// ──────────────────────────────────────────────────────────────────────────────
// update-plan research-go — source validation
// ──────────────────────────────────────────────────────────────────────────────

describe("update-plan research-go source validation", () => {
  let tmp2: string;
  let planDir: string;

  beforeEach(async () => {
    const raw = await mkdtemp(path.join(os.tmpdir(), "oh-up-research-"));
    tmp2 = await realpath(raw);
    planDir = path.join(tmp2, "plan", "test-repo", "test-slug");
    await mkdir(planDir, { recursive: true });
    await writeFile(path.join(planDir, "spec.md"), "# Spec\n\nContent.\n");
  });

  afterEach(async () => {
    await rm(tmp2, { recursive: true, force: true });
  });

  test("exits non-zero with clear error when --source is missing", () => {
    const r = spawnCli(
      ["nice", "update-plan", "--phase=research-go", "test-repo", "test-slug"],
      makeMinimalEnv(path.join(tmp2, "plan")),
    );
    expect(r.exitCode).not.toBe(0);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/--source|knowledge.*online.*auto/i);
  });

  test("exits non-zero with clear error when --source=bogus", () => {
    const r = spawnCli(
      ["nice", "update-plan", "--phase=research-go", "test-repo", "test-slug", "--source=bogus"],
      makeMinimalEnv(path.join(tmp2, "plan")),
    );
    expect(r.exitCode).not.toBe(0);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/knowledge.*online.*auto|valid values/i);
  });

  test("accepts all valid source modes", () => {
    for (const mode of ["knowledge", "online", "auto"]) {
      const r = spawnCli(
        ["nice", "update-plan", "--phase=research-go", "test-repo", "test-slug", `--source=${mode}`],
        makeMinimalEnv(path.join(tmp2, "plan")),
      );
      expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// update-plan research-go — action shape + prompt mentions Update section
// ──────────────────────────────────────────────────────────────────────────────

describe("update-plan research-go action shape", () => {
  let tmp3: string;
  let planDir: string;

  beforeEach(async () => {
    const raw = await mkdtemp(path.join(os.tmpdir(), "oh-up-shape-"));
    tmp3 = await realpath(raw);
    planDir = path.join(tmp3, "plan", "test-repo", "test-slug");
    await mkdir(planDir, { recursive: true });
    await writeFile(path.join(planDir, "spec.md"), "# Spec\n\n## Update — 2026-05-20\n\nDelta.\n");
  });

  afterEach(async () => {
    await rm(tmp3, { recursive: true, force: true });
  });

  test("emits dispatch_agent with role=research when RESEARCH_AGENT is set", () => {
    const r = spawnCli(
      ["nice", "update-plan", "--phase=research-go", "test-repo", "test-slug", "--source=auto"],
      makeMinimalEnv(path.join(tmp3, "plan"), { RESEARCH_AGENT: "rudy" }),
    );
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(r.stderr);
    const agentAction = actions.find(
      (a) => (a as { type: string }).type === "dispatch_agent" || (a as { type: string }).type === "self_act",
    ) as { type: string; role: string; agent?: string; prompt?: string } | undefined;
    expect(agentAction).toBeDefined();
    expect(agentAction!.type).toBe("dispatch_agent");
    expect(agentAction!.role).toBe("research");
    expect(agentAction!.agent).toBe("rudy");
    // Prompt must reference Update section
    expect(agentAction!.prompt).toMatch(/Update —/);
  });

  test("emits self_act with role=research when RESEARCH_AGENT is not set", () => {
    const minEnv = makeMinimalEnv(path.join(tmp3, "plan"));
    const r = Bun.spawnSync(
      ["bun", CLI, "nice", "update-plan", "--phase=research-go", "test-repo", "test-slug", "--source=online"],
      {
        cwd: REPO_ROOT,
        env: {
          PATH: process.env.PATH ?? "",
          BUN_INSTALL: process.env.BUN_INSTALL ?? "",
          ...minEnv,
          // RESEARCH_AGENT intentionally absent
        },
        stderr: "pipe",
        stdout: "pipe",
      },
    );
    const stderr = r.stderr?.toString() ?? "";
    expect(stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(stderr);
    const agentAction = actions.find(
      (a) => (a as { type: string }).type === "self_act",
    ) as { type: string; role: string; prompt?: string } | undefined;
    expect(agentAction).toBeDefined();
    expect(agentAction!.role).toBe("research");
    // Self-act prompt should also mention Update section
    expect(agentAction!.prompt).toMatch(/Update —/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// update-plan write-plan — carries tmpSpec into post-plan re-run
// ──────────────────────────────────────────────────────────────────────────────

describe("update-plan write-plan phase", () => {
  let tmp4: string;

  beforeEach(async () => {
    const raw = await mkdtemp(path.join(os.tmpdir(), "oh-up-write-"));
    tmp4 = await realpath(raw);
    const planDir = path.join(tmp4, "plan", "test-repo", "test-slug");
    await mkdir(planDir, { recursive: true });
    await writeFile(path.join(planDir, "spec.md"), "# Spec\n\nContent.\n");
    await writeFile(path.join(planDir, "plan.md"), "# Plan\n\n- [ ] task\n");
  });

  afterEach(async () => {
    await rm(tmp4, { recursive: true, force: true });
  });

  test("emits invoke_skill targeting superpowers:writing-plans", () => {
    const r = spawnCli(
      ["nice", "update-plan", "--phase=write-plan", "test-repo", "test-slug"],
      makeMinimalEnv(path.join(tmp4, "plan")),
    );
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(r.stderr);
    const skillAction = actions.find(
      (a) => (a as { type: string }).type === "invoke_skill",
    ) as { type: string; skill: string } | undefined;
    expect(skillAction).toBeDefined();
    expect(skillAction!.skill).toBe("superpowers:writing-plans");
  });

  test("report includes --phase=post-plan with repo and slug", () => {
    const r = spawnCli(
      ["nice", "update-plan", "--phase=write-plan", "test-repo", "test-slug"],
      makeMinimalEnv(path.join(tmp4, "plan")),
    );
    const actions = parseNextActions(r.stderr);
    const report = actions.find(
      (a) => (a as { type: string }).type === "report",
    ) as { type: string; message: string } | undefined;
    expect(report).toBeDefined();
    expect(report!.message).toContain("--phase=post-plan");
    expect(report!.message).toContain("test-repo");
    expect(report!.message).toContain("test-slug");
  });

  test("report carries tmpSpec through to post-plan re-run when provided", async () => {
    const tmpSpec = path.join(tmp4, "tmp-spec.md");
    await writeFile(tmpSpec, "# Delta\n");

    const r = spawnCli(
      ["nice", "update-plan", "--phase=write-plan", "test-repo", "test-slug", tmpSpec],
      makeMinimalEnv(path.join(tmp4, "plan")),
    );
    const actions = parseNextActions(r.stderr);
    const report = actions.find(
      (a) => (a as { type: string }).type === "report",
    ) as { type: string; message: string } | undefined;
    expect(report).toBeDefined();
    // tmpSpec path should appear in the post-plan re-run command
    expect(report!.message).toContain(tmpSpec);
  });
});
