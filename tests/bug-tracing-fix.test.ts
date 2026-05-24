// tests/bug-tracing-fix.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const CLI = path.resolve(import.meta.dir, "..", "src", "cli.ts");
const REPO_ROOT = path.resolve(import.meta.dir, "..");

const SENTINEL = "__OH_BUG_TRACING_NEXT_ACTIONS__";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function parseNextActions(stderr: string): unknown[] {
  const idx = stderr.lastIndexOf(SENTINEL);
  if (idx === -1) throw new Error(`Sentinel not found in stderr:\n${stderr}`);
  const json = stderr.slice(idx + SENTINEL.length).trim();
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

// ──────────────────────────────────────────────────────────────────────────────
// Setup: tmp dir for plan files
// ──────────────────────────────────────────────────────────────────────────────

let tmp: string;
let planDir: string;

beforeEach(async () => {
  const raw = await mkdtemp(path.join(os.tmpdir(), "oh-bug-tracing-test-"));
  tmp = await realpath(raw);
  planDir = path.join(tmp, "plan");
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase=fix — action shape
// ──────────────────────────────────────────────────────────────────────────────

describe("bug-tracing fix phase=fix", () => {
  test("emits sentinel on stderr", () => {
    const r = spawnCli(["bug-tracing", "fix", "off-by-one in array loop"], makeMinimalEnv(planDir));
    expect(r.stderr).toContain(SENTINEL);
  });

  test("emits a coding dispatch_agent (or self_act) as first action when CODING_AGENT is set", () => {
    const r = spawnCli(
      ["bug-tracing", "fix", "off-by-one in array loop"],
      makeMinimalEnv(planDir, { CODING_AGENT: "mirai" }),
    );
    expect(r.stderr).toContain(SENTINEL);
    const actions = parseNextActions(r.stderr);
    const agentAction = actions.find(
      (a) =>
        (a as { type: string }).type === "dispatch_agent" ||
        (a as { type: string }).type === "self_act",
    ) as { type: string; role: string; agent?: string } | undefined;
    expect(agentAction).toBeDefined();
    expect(agentAction!.type).toBe("dispatch_agent");
    expect(agentAction!.role).toBe("coding");
    expect(agentAction!.agent).toBe("mirai");
  });

  test("emits self_act when CODING_AGENT is not set", () => {
    const r = Bun.spawnSync(["bun", CLI, "bug-tracing", "fix", "off-by-one in array loop"], {
      cwd: REPO_ROOT,
      env: {
        PATH: process.env.PATH ?? "",
        BUN_INSTALL: process.env.BUN_INSTALL ?? "",
        ...makeMinimalEnv(planDir),
        // CODING_AGENT intentionally absent
      },
      stderr: "pipe",
      stdout: "pipe",
    });
    const stderr = r.stderr?.toString() ?? "";
    expect(stderr).toContain(SENTINEL);
    const actions = parseNextActions(stderr);
    const agentAction = actions.find(
      (a) =>
        (a as { type: string }).type === "dispatch_agent" ||
        (a as { type: string }).type === "self_act",
    ) as { type: string; role: string } | undefined;
    expect(agentAction).toBeDefined();
    expect(agentAction!.type).toBe("self_act");
    expect(agentAction!.role).toBe("coding");
  });

  test("emits a report action containing the phase=trace re-run command", () => {
    const r = spawnCli(["bug-tracing", "fix", "off-by-one in array loop"], makeMinimalEnv(planDir));
    const actions = parseNextActions(r.stderr);
    const report = actions.find((a) => (a as { type: string }).type === "report") as
      | { type: string; message: string }
      | undefined;
    expect(report).toBeDefined();
    expect(report!.message).toContain("--phase=trace");
    expect(report!.message).toContain("bug-tracing");
  });

  test("report contains the derived slug", () => {
    const r = spawnCli(["bug-tracing", "fix", "off-by-one in array loop"], makeMinimalEnv(planDir));
    const actions = parseNextActions(r.stderr);
    const report = actions.find((a) => (a as { type: string }).type === "report") as
      | { type: string; message: string }
      | undefined;
    expect(report).toBeDefined();
    // slug derived from "off-by-one in array loop" → "off-by-one-in-array-loop"
    expect(report!.message).toContain("off-by-one-in-array-loop");
  });

  test("--slug override is respected in the report re-run command", () => {
    const r = spawnCli(
      ["bug-tracing", "fix", "--slug=my-custom-slug", "some bug description here"],
      makeMinimalEnv(planDir),
    );
    const actions = parseNextActions(r.stderr);
    const report = actions.find((a) => (a as { type: string }).type === "report") as
      | { type: string; message: string }
      | undefined;
    expect(report).toBeDefined();
    expect(report!.message).toContain("my-custom-slug");
  });

  test("exits non-zero when no bug description provided", () => {
    const r = spawnCli(["bug-tracing", "fix"], makeMinimalEnv(planDir));
    expect(r.exitCode).not.toBe(0);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/bug description|required|usage/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase=trace — action shape
// ──────────────────────────────────────────────────────────────────────────────

describe("bug-tracing fix phase=trace", () => {
  test("emits sentinel on stderr", () => {
    const r = spawnCli(
      ["bug-tracing", "fix", "--phase=trace", "--slug=test-bug-slug", "off-by-one in array loop"],
      makeMinimalEnv(planDir),
    );
    expect(r.stderr).toContain(SENTINEL);
  });

  test("emits a self_act as the first action", () => {
    const r = spawnCli(
      ["bug-tracing", "fix", "--phase=trace", "--slug=test-bug-slug", "off-by-one in array loop"],
      makeMinimalEnv(planDir),
    );
    const actions = parseNextActions(r.stderr);
    const selfAct = actions.find((a) => (a as { type: string }).type === "self_act") as
      | { type: string; role: string; prompt: string }
      | undefined;
    expect(selfAct).toBeDefined();
    expect(selfAct!.type).toBe("self_act");
  });

  test("self_act prompt mentions trace.md", () => {
    const r = spawnCli(
      ["bug-tracing", "fix", "--phase=trace", "--slug=test-bug-slug", "off-by-one in array loop"],
      makeMinimalEnv(planDir),
    );
    const actions = parseNextActions(r.stderr);
    const selfAct = actions.find((a) => (a as { type: string }).type === "self_act") as
      | { type: string; prompt: string }
      | undefined;
    expect(selfAct).toBeDefined();
    expect(selfAct!.prompt).toContain("trace.md");
  });

  test("self_act prompt contains the slug", () => {
    const r = spawnCli(
      ["bug-tracing", "fix", "--phase=trace", "--slug=test-bug-slug", "off-by-one in array loop"],
      makeMinimalEnv(planDir),
    );
    const actions = parseNextActions(r.stderr);
    const selfAct = actions.find((a) => (a as { type: string }).type === "self_act") as
      | { type: string; prompt: string }
      | undefined;
    expect(selfAct).toBeDefined();
    expect(selfAct!.prompt).toContain("test-bug-slug");
  });

  test("self_act prompt contains structured section headers", () => {
    const r = spawnCli(
      ["bug-tracing", "fix", "--phase=trace", "--slug=test-bug-slug", "off-by-one in array loop"],
      makeMinimalEnv(planDir),
    );
    const actions = parseNextActions(r.stderr);
    const selfAct = actions.find((a) => (a as { type: string }).type === "self_act") as
      | { type: string; prompt: string }
      | undefined;
    expect(selfAct).toBeDefined();
    // All required section headers must appear in the prompt
    expect(selfAct!.prompt).toContain("## Symptom");
    expect(selfAct!.prompt).toContain("## Fix");
    expect(selfAct!.prompt).toContain("## Origin");
    expect(selfAct!.prompt).toContain("## Dev intent at the time");
    expect(selfAct!.prompt).toContain("## Why this slipped");
    expect(selfAct!.prompt).toContain("## Root cause class");
    expect(selfAct!.prompt).toContain("## Prevention");
    expect(selfAct!.prompt).toContain("## External research");
  });

  test("self_act prompt mentions root cause classes", () => {
    const r = spawnCli(
      ["bug-tracing", "fix", "--phase=trace", "--slug=test-bug-slug", "off-by-one in array loop"],
      makeMinimalEnv(planDir),
    );
    const actions = parseNextActions(r.stderr);
    const selfAct = actions.find((a) => (a as { type: string }).type === "self_act") as
      | { type: string; prompt: string }
      | undefined;
    expect(selfAct).toBeDefined();
    expect(selfAct!.prompt).toContain("off-by-one");
    expect(selfAct!.prompt).toContain("API-misuse");
    expect(selfAct!.prompt).toContain("type-coercion");
  });

  test("trace.md path resolves under PLAN_DIR/<repo>/<slug>/", () => {
    const r = spawnCli(
      ["bug-tracing", "fix", "--phase=trace", "--slug=test-bug-slug", "off-by-one in array loop"],
      makeMinimalEnv(planDir),
    );
    const actions = parseNextActions(r.stderr);
    const selfAct = actions.find((a) => (a as { type: string }).type === "self_act") as
      | { type: string; prompt: string }
      | undefined;
    expect(selfAct).toBeDefined();
    // Extract the "Write to: <path>" line from the prompt and assert it starts with planDir
    const match = selfAct!.prompt.match(/Write to: (.+)/);
    expect(match).not.toBeNull();
    const tracePath = match![1].trim();
    expect(tracePath).toStartWith(planDir);
    expect(tracePath).toContain("test-bug-slug");
    expect(tracePath).toEndWith("trace.md");
  });

  test("emits exactly two actions: self_act + report", () => {
    const r = spawnCli(
      ["bug-tracing", "fix", "--phase=trace", "--slug=test-bug-slug", "off-by-one in array loop"],
      makeMinimalEnv(planDir),
    );
    const actions = parseNextActions(r.stderr);
    expect(actions).toHaveLength(2);
    expect((actions[0] as { type: string }).type).toBe("self_act");
    expect((actions[1] as { type: string }).type).toBe("report");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// slugFromDescription — unit test
// ──────────────────────────────────────────────────────────────────────────────

describe("slugFromDescription", () => {
  test("derives slug from words, kebab-case, max 6 words", async () => {
    const { slugFromDescription } = await import("../src/skills/bug-tracing/paths.ts");
    // "off-by-one in array loop breaks pagination"
    // hyphens → spaces → words: off, by, one, in, array, loop, breaks, pagination
    // first 6: off, by, one, in, array, loop → "off-by-one-in-array-loop"
    expect(slugFromDescription("off-by-one in array loop breaks pagination")).toBe(
      "off-by-one-in-array-loop",
    );
  });

  test("strips non-alphanumeric characters", async () => {
    const { slugFromDescription } = await import("../src/skills/bug-tracing/paths.ts");
    const slug = slugFromDescription("TypeError: cannot read properties of undefined");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug).toContain("typeerror");
  });

  test("max 6 words", async () => {
    const { slugFromDescription } = await import("../src/skills/bug-tracing/paths.ts");
    const slug = slugFromDescription("one two three four five six seven eight");
    const wordCount = slug.split("-").length;
    expect(wordCount).toBeLessThanOrEqual(6);
  });

  test("fallback for empty or whitespace input", async () => {
    const { slugFromDescription } = await import("../src/skills/bug-tracing/paths.ts");
    expect(slugFromDescription("  ")).toBe("bug-fix");
    expect(slugFromDescription("")).toBe("bug-fix");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// unknown phase — error handling
// ──────────────────────────────────────────────────────────────────────────────

describe("bug-tracing fix error handling", () => {
  test("exits non-zero for unknown --phase value", () => {
    const r = spawnCli(
      ["bug-tracing", "fix", "--phase=bogus", "some bug"],
      makeMinimalEnv(planDir),
    );
    expect(r.exitCode).not.toBe(0);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/unknown phase|fix.*trace/i);
  });

  test("exits non-zero for unknown bug-tracing subcommand", () => {
    const r = spawnCli(["bug-tracing", "bogus-subcommand"], makeMinimalEnv(planDir));
    expect(r.exitCode).not.toBe(0);
    const combined = r.stdout + r.stderr;
    expect(combined).toMatch(/unknown bug-tracing subcommand|fix/i);
  });
});
