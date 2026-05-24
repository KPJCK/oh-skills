// tests/nice-plan.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const CLI = path.resolve(import.meta.dir, "..", "src", "cli.ts");
const REPO_ROOT = path.resolve(import.meta.dir, "..");

// ──────────────────────────────────────────────────────────────────────────────
// Helper: spawn the CLI, capture stdout+stderr, return exit code + next actions
// ──────────────────────────────────────────────────────────────────────────────

function parseNextActions(stderr: string): unknown[] {
  const sentinel = "__OH_NICE_NEXT_ACTIONS__";
  const idx = stderr.lastIndexOf(sentinel);
  if (idx === -1) throw new Error(`Sentinel not found in stderr:\n${stderr}`);
  const json = stderr.slice(idx + sentinel.length).trim();
  return JSON.parse(json) as unknown[];
}

type SpawnResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function makeMinimalEnv(
  planDir: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    HOME: os.tmpdir(),
    PLAN_DIR: planDir,
    CONTEXT_DIR: path.join(os.tmpdir(), "context"),
    CONTEXT_TEMPLATE_DIR: path.join(os.tmpdir(), "context-templates"),
    KNOWLEDGE_DIR: path.join(os.tmpdir(), "knowledge"),
    ...extra,
  };
}

function spawnCli(args: string[], extraEnv: Record<string, string> = {}): SpawnResult {
  const result = Bun.spawnSync(["bun", CLI, ...args], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      HOME: os.tmpdir(), // isolate from real ~/.claude/.oh-env
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

// ──────────────────────────────────────────────────────────────────────────────
// Setup: tmp dir for plan files
// ──────────────────────────────────────────────────────────────────────────────

let tmp: string;
let planDir: string;
let specPath: string;

beforeEach(async () => {
  const raw = await mkdtemp(path.join(os.tmpdir(), "oh-plan-test-"));
  tmp = await realpath(raw);
  // scaffold a minimal plan dir: plan/<repo>/<slug>/spec.md
  planDir = path.join(tmp, "plan", "test-repo", "test-slug");
  await mkdir(planDir, { recursive: true });
  specPath = path.join(planDir, "spec.md");
  await writeFile(specPath, "# Test Spec\n\nSome content.\n");
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

// ──────────────────────────────────────────────────────────────────────────────
// research-go — source mode validation
// ──────────────────────────────────────────────────────────────────────────────

describe("plan research-go source validation", () => {
  test("exits non-zero with clear error when --source is missing", () => {
    const r = spawnCli(
      ["nice", "plan", "--phase=research-go", "test-repo", "test-slug"],
      makeMinimalEnv(path.join(tmp, "plan")),
    );
    expect(r.exitCode).not.toBe(0);
    // error message should mention --source or valid values
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/--source|knowledge.*online.*auto/i);
  });

  test("exits non-zero with clear error when --source=bogus", () => {
    const r = spawnCli(
      ["nice", "plan", "--phase=research-go", "test-repo", "test-slug", "--source=bogus"],
      makeMinimalEnv(path.join(tmp, "plan")),
    );
    expect(r.exitCode).not.toBe(0);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/knowledge.*online.*auto|valid values/i);
  });

  test("accepts --source=knowledge", () => {
    const r = spawnCli(
      ["nice", "plan", "--phase=research-go", "test-repo", "test-slug", "--source=knowledge"],
      makeMinimalEnv(path.join(tmp, "plan")),
    );
    // should emit the sentinel (exit 0 or produce output)
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
  });

  test("accepts --source=online", () => {
    const r = spawnCli(
      ["nice", "plan", "--phase=research-go", "test-repo", "test-slug", "--source=online"],
      makeMinimalEnv(path.join(tmp, "plan")),
    );
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
  });

  test("accepts --source=auto", () => {
    const r = spawnCli(
      ["nice", "plan", "--phase=research-go", "test-repo", "test-slug", "--source=auto"],
      makeMinimalEnv(path.join(tmp, "plan")),
    );
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// research-go — action type depends on RESEARCH_AGENT presence
// ──────────────────────────────────────────────────────────────────────────────

describe("plan research-go action shape", () => {
  test("emits dispatch_agent with role=research when RESEARCH_AGENT is set", () => {
    const r = spawnCli(
      ["nice", "plan", "--phase=research-go", "test-repo", "test-slug", "--source=auto"],
      makeMinimalEnv(path.join(tmp, "plan"), { RESEARCH_AGENT: "rudy" }),
    );
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(r.stderr);
    const agentAction = actions.find(
      (a) =>
        (a as { type: string }).type === "dispatch_agent" ||
        (a as { type: string }).type === "self_act",
    ) as { type: string; role: string; agent?: string } | undefined;
    expect(agentAction).toBeDefined();
    expect(agentAction!.type).toBe("dispatch_agent");
    expect(agentAction!.role).toBe("research");
    expect(agentAction!.agent).toBe("rudy");
  });

  test("emits self_act with role=research when RESEARCH_AGENT is not set", () => {
    // Use makeMinimalEnv but without RESEARCH_AGENT to ensure self_act path
    const minEnv = makeMinimalEnv(path.join(tmp, "plan"));
    // Spawn with a clean env that only has what's needed, no RESEARCH_AGENT
    const r = Bun.spawnSync(
      [
        "bun",
        CLI,
        "nice",
        "plan",
        "--phase=research-go",
        "test-repo",
        "test-slug",
        "--source=auto",
      ],
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
      (a) =>
        (a as { type: string }).type === "dispatch_agent" ||
        (a as { type: string }).type === "self_act",
    ) as { type: string; role: string } | undefined;
    expect(agentAction).toBeDefined();
    expect(agentAction!.type).toBe("self_act");
    expect(agentAction!.role).toBe("research");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// write-plan — emits invoke_skill + report with post-plan re-run
// ──────────────────────────────────────────────────────────────────────────────

describe("plan write-plan phase", () => {
  test("emits invoke_skill targeting superpowers:writing-plans", () => {
    const r = spawnCli(
      ["nice", "plan", "--phase=write-plan", "test-repo", "test-slug"],
      makeMinimalEnv(path.join(tmp, "plan")),
    );
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(r.stderr);
    const skillAction = actions.find((a) => (a as { type: string }).type === "invoke_skill") as
      | { type: string; skill: string; instructions: string }
      | undefined;
    expect(skillAction).toBeDefined();
    expect(skillAction!.skill).toBe("superpowers:writing-plans");
  });

  test("report includes --phase=post-plan re-run with repo and slug", () => {
    const r = spawnCli(
      ["nice", "plan", "--phase=write-plan", "test-repo", "test-slug"],
      makeMinimalEnv(path.join(tmp, "plan")),
    );
    const actions = parseNextActions(r.stderr);
    const report = actions.find((a) => (a as { type: string }).type === "report") as
      | { type: string; message: string }
      | undefined;
    expect(report).toBeDefined();
    expect(report!.message).toContain("--phase=post-plan");
    expect(report!.message).toContain("test-repo");
    expect(report!.message).toContain("test-slug");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// post-brainstorm — emits ask_user for research opt-in
// ──────────────────────────────────────────────────────────────────────────────

describe("plan post-brainstorm research opt-in", () => {
  test("emits ask_user with Run research / Skip research options", async () => {
    // Write a tmp spec file to pass as argument
    const tmpSpec = path.join(tmp, "tmp-spec.md");
    await writeFile(tmpSpec, "# Spec\n\nSome content.\n");

    // We need a real repo dir, scaffold a git repo so detectRepo works
    const repoDir = path.join(tmp, "fake-repo");
    await mkdir(repoDir, { recursive: true });
    // init git
    Bun.spawnSync(["git", "init"], { cwd: repoDir });
    Bun.spawnSync(["git", "commit", "--allow-empty", "-m", "init"], { cwd: repoDir });

    const r = Bun.spawnSync(
      [
        "bun",
        CLI,
        "nice",
        "plan",
        "--phase=post-brainstorm",
        tmpSpec,
        "test request",
        "--slug=test-slug",
      ],
      {
        cwd: repoDir,
        env: {
          ...process.env,
          ...makeMinimalEnv(path.join(tmp, "plan")),
        },
        stderr: "pipe",
        stdout: "pipe",
      },
    );
    const stderr = r.stderr?.toString() ?? "";
    expect(stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(stderr);
    const askAction = actions.find((a) => (a as { type: string }).type === "ask_user") as
      | { type: string; question: string; options?: string[] }
      | undefined;
    expect(askAction).toBeDefined();
    expect(askAction!.options).toContain("Run research");
    expect(askAction!.options).toContain("Skip research");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildResearchPrompt — unit test the exported helper
// ──────────────────────────────────────────────────────────────────────────────

describe("buildResearchPrompt", () => {
  test("knowledge mode: prompt mentions knowledge-only search", async () => {
    const { buildResearchPrompt } = await import("../src/skills/nice/commands/plan.ts");
    const prompt = buildResearchPrompt({
      specPath: "/tmp/spec.md",
      source: "knowledge",
      isUpdatePlan: false,
      dispatched: true,
    });
    expect(prompt).toContain("/tmp/spec.md");
    expect(prompt).toContain("knowledge");
    expect(prompt).toContain("ONLY");
  });

  test("online mode: prompt mentions WebSearch", async () => {
    const { buildResearchPrompt } = await import("../src/skills/nice/commands/plan.ts");
    const prompt = buildResearchPrompt({
      specPath: "/tmp/spec.md",
      source: "online",
      isUpdatePlan: false,
      dispatched: true,
    });
    expect(prompt).toContain("WebSearch");
  });

  test("auto mode: prompt mentions fallback to web", async () => {
    const { buildResearchPrompt } = await import("../src/skills/nice/commands/plan.ts");
    const prompt = buildResearchPrompt({
      specPath: "/tmp/spec.md",
      source: "auto",
      isUpdatePlan: false,
      dispatched: true,
    });
    expect(prompt).toContain("fall back");
  });

  test("isUpdatePlan=true: prompt does NOT create top-level Research heading when Update section exists", async () => {
    const { buildResearchPrompt } = await import("../src/skills/nice/commands/plan.ts");
    const prompt = buildResearchPrompt({
      specPath: "/tmp/spec.md",
      source: "auto",
      isUpdatePlan: true,
      dispatched: true,
    });
    // Must mention Update section placement
    expect(prompt).toMatch(/Update —/);
    // Must warn against creating a top-level heading
    expect(prompt).toMatch(/NOT create a new top-level/i);
  });
});
