// tests/nice-do.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm, stat } from "node:fs/promises";
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

type SpawnResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function makeMinimalEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    HOME: os.tmpdir(),
    PLAN_DIR: path.join(os.tmpdir(), "oh-do-plans"),
    CONTEXT_DIR: path.join(os.tmpdir(), "oh-do-context"),
    CONTEXT_TEMPLATE_DIR: path.join(os.tmpdir(), "oh-do-context-templates"),
    KNOWLEDGE_DIR: path.join(os.tmpdir(), "oh-do-knowledge"),
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
// parseArgs unit tests (via module import)
// ──────────────────────────────────────────────────────────────────────────────

describe("parseDoArgs", () => {
  test("defaults: phase=init, no request, no flags", async () => {
    const { parseDoArgs } = await import("../src/skills/nice/commands/do.ts");
    const args = parseDoArgs([]);
    expect(args.phase).toBe("init");
    expect(args.request).toBe("");
    expect(args.noReview).toBe(false);
    expect(args.noFix).toBe(false);
    expect(args.reviewTmp).toBeUndefined();
  });

  test("positional args are joined as request", async () => {
    const { parseDoArgs } = await import("../src/skills/nice/commands/do.ts");
    const args = parseDoArgs(["add", "a", "comment"]);
    expect(args.phase).toBe("init");
    expect(args.request).toBe("add a comment");
  });

  test("--phase=post-implement sets phase correctly", async () => {
    const { parseDoArgs } = await import("../src/skills/nice/commands/do.ts");
    const args = parseDoArgs(["--phase=post-implement", "--request", "do the thing"]);
    expect(args.phase).toBe("post-implement");
    expect(args.request).toBe("do the thing");
  });

  test("--phase=post-review requires --review-tmp", async () => {
    const { parseDoArgs } = await import("../src/skills/nice/commands/do.ts");
    expect(() => parseDoArgs(["--phase=post-review", "--request", "x"])).toThrow(/--review-tmp/);
  });

  test("--phase=post-review with --review-tmp parses correctly", async () => {
    const { parseDoArgs } = await import("../src/skills/nice/commands/do.ts");
    const args = parseDoArgs(["--phase=post-review", "--request", "x", "--review-tmp", "/tmp/test.md"]);
    expect(args.phase).toBe("post-review");
    expect(args.reviewTmp).toBe("/tmp/test.md");
  });

  test("--no-review sets noReview=true and noFix=true (implied)", async () => {
    const { parseDoArgs } = await import("../src/skills/nice/commands/do.ts");
    const args = parseDoArgs(["add a thing", "--no-review"]);
    expect(args.noReview).toBe(true);
    expect(args.noFix).toBe(true);
  });

  test("--no-fix sets noFix=true but not noReview", async () => {
    const { parseDoArgs } = await import("../src/skills/nice/commands/do.ts");
    const args = parseDoArgs(["--phase=post-implement", "--request", "x", "--no-fix"]);
    expect(args.noFix).toBe(true);
    expect(args.noReview).toBe(false);
  });

  test("--request flag value overrides positional args for non-init phases", async () => {
    const { parseDoArgs } = await import("../src/skills/nice/commands/do.ts");
    const args = parseDoArgs(["--phase=post-implement", "--request=the request"]);
    expect(args.request).toBe("the request");
  });

  test("throws on unknown flag", async () => {
    const { parseDoArgs } = await import("../src/skills/nice/commands/do.ts");
    expect(() => parseDoArgs(["--bogus-flag"])).toThrow(/unknown flag/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CLI integration: init phase
// ──────────────────────────────────────────────────────────────────────────────

let tmp: string;

beforeEach(async () => {
  const raw = await mkdtemp(path.join(os.tmpdir(), "oh-do-test-"));
  tmp = await realpath(raw);
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("nice do — init phase", () => {
  test("emits sentinel with dispatch_agent(coding) + report(post-implement)", () => {
    const r = spawnCli(
      ["nice", "do", "add a comment to README"],
      makeMinimalEnv({ CODING_AGENT: "mirai" }),
    );
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(r.stderr);
    const agentAction = actions.find(
      (a) => (a as { type: string }).type === "dispatch_agent" || (a as { type: string }).type === "self_act",
    ) as { type: string; role: string; agent?: string } | undefined;
    expect(agentAction).toBeDefined();
    expect(agentAction!.role).toBe("coding");
    const report = actions.find(
      (a) => (a as { type: string }).type === "report",
    ) as { type: string; message: string } | undefined;
    expect(report).toBeDefined();
    expect(report!.message).toContain("--phase=post-implement");
  });

  test("dispatch_agent when CODING_AGENT is set", () => {
    const r = spawnCli(
      ["nice", "do", "add a comment"],
      makeMinimalEnv({ CODING_AGENT: "mirai" }),
    );
    const actions = parseNextActions(r.stderr);
    const agentAction = actions.find(
      (a) => (a as { type: string }).type === "dispatch_agent",
    ) as { type: string; role: string; agent?: string } | undefined;
    expect(agentAction).toBeDefined();
    expect(agentAction!.agent).toBe("mirai");
  });

  test("self_act when CODING_AGENT is not set", () => {
    const r = Bun.spawnSync(["bun", CLI, "nice", "do", "add a comment"], {
      cwd: REPO_ROOT,
      env: {
        PATH: process.env.PATH ?? "",
        BUN_INSTALL: process.env.BUN_INSTALL ?? "",
        HOME: os.tmpdir(),
        PLAN_DIR: path.join(os.tmpdir(), "p"),
        CONTEXT_DIR: path.join(os.tmpdir(), "c"),
        CONTEXT_TEMPLATE_DIR: path.join(os.tmpdir(), "ct"),
        KNOWLEDGE_DIR: path.join(os.tmpdir(), "k"),
        // CODING_AGENT intentionally absent
      },
      stderr: "pipe",
      stdout: "pipe",
    });
    const stderr = r.stderr?.toString() ?? "";
    expect(stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(stderr);
    const selfAct = actions.find(
      (a) => (a as { type: string }).type === "self_act",
    ) as { type: string; role: string } | undefined;
    expect(selfAct).toBeDefined();
    expect(selfAct!.role).toBe("coding");
  });

  test("--no-fix: init phase report includes --no-fix in re-run command", () => {
    const r = spawnCli(
      ["nice", "do", "add a comment", "--no-fix"],
      makeMinimalEnv({ CODING_AGENT: "mirai" }),
    );
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(r.stderr);
    const report = actions.find(
      (a) => (a as { type: string }).type === "report",
    ) as { type: string; message: string } | undefined;
    expect(report).toBeDefined();
    expect(report!.message).toContain("--phase=post-implement");
    expect(report!.message).toContain("--no-fix");
  });

  test("no --no-fix: init phase report does NOT include --no-fix", () => {
    const r = spawnCli(
      ["nice", "do", "add a comment"],
      makeMinimalEnv({ CODING_AGENT: "mirai" }),
    );
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(r.stderr);
    const report = actions.find(
      (a) => (a as { type: string }).type === "report",
    ) as { type: string; message: string } | undefined;
    expect(report).toBeDefined();
    expect(report!.message).toContain("--phase=post-implement");
    expect(report!.message).not.toContain("--no-fix");
  });

  test("--no-review: emits coding dispatch + done report, no post-implement re-run", () => {
    const r = spawnCli(
      ["nice", "do", "do the thing", "--no-review"],
      makeMinimalEnv({ CODING_AGENT: "mirai" }),
    );
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(r.stderr);
    const agentAction = actions.find(
      (a) => (a as { type: string }).type === "dispatch_agent" || (a as { type: string }).type === "self_act",
    ) as { type: string } | undefined;
    expect(agentAction).toBeDefined();
    const report = actions.find(
      (a) => (a as { type: string }).type === "report",
    ) as { type: string; message: string } | undefined;
    expect(report).toBeDefined();
    expect(report!.message).toMatch(/review skipped|done/i);
    // Must NOT contain post-implement phase
    expect(report!.message).not.toContain("--phase=post-implement");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CLI integration: post-implement phase
// ──────────────────────────────────────────────────────────────────────────────

describe("nice do — post-implement phase", () => {
  test("emits dispatch_agent(review) + report with --phase=post-review and tmp path", () => {
    const r = spawnCli(
      ["nice", "do", "--phase=post-implement", "--request", "add a comment to README"],
      makeMinimalEnv({ REVIEW_AGENT: "yama" }),
    );
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(r.stderr);
    const agentAction = actions.find(
      (a) => (a as { type: string }).type === "dispatch_agent" || (a as { type: string }).type === "self_act",
    ) as { type: string; role: string } | undefined;
    expect(agentAction).toBeDefined();
    expect(agentAction!.role).toBe("review");
    const report = actions.find(
      (a) => (a as { type: string }).type === "report",
    ) as { type: string; message: string } | undefined;
    expect(report).toBeDefined();
    expect(report!.message).toContain("--phase=post-review");
    expect(report!.message).toContain("--review-tmp");
    // tmp path should be os.tmpdir()-based
    expect(report!.message).toContain("oh-do-");
  });

  test("review prompt contains the request text", () => {
    const r = spawnCli(
      ["nice", "do", "--phase=post-implement", "--request", "rename foo to bar"],
      makeMinimalEnv({ REVIEW_AGENT: "yama" }),
    );
    const actions = parseNextActions(r.stderr);
    const agentAction = actions.find(
      (a) => (a as { type: string }).type === "dispatch_agent" || (a as { type: string }).type === "self_act",
    ) as { type: string; prompt: string } | undefined;
    expect(agentAction).toBeDefined();
    expect(agentAction!.prompt).toContain("rename foo to bar");
  });

  test("--no-fix: emits review dispatch + review-only report, no post-review re-run", () => {
    const r = spawnCli(
      ["nice", "do", "--phase=post-implement", "--request", "x", "--no-fix"],
      makeMinimalEnv({ REVIEW_AGENT: "yama" }),
    );
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(r.stderr);
    const agentAction = actions.find(
      (a) => (a as { type: string }).type === "dispatch_agent" || (a as { type: string }).type === "self_act",
    ) as { type: string } | undefined;
    expect(agentAction).toBeDefined();
    const report = actions.find(
      (a) => (a as { type: string }).type === "report",
    ) as { type: string; message: string } | undefined;
    expect(report).toBeDefined();
    expect(report!.message).toMatch(/review.only|findings/i);
    expect(report!.message).not.toContain("--phase=post-review");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CLI integration: post-review phase
// ──────────────────────────────────────────────────────────────────────────────

describe("nice do — post-review phase", () => {
  test("NO_FINDINGS: emits report 'no issues' and deletes tmp file", async () => {
    const reviewTmp = path.join(tmp, "oh-do-test-noissues.md");
    await writeFile(reviewTmp, "NO_FINDINGS\n");

    const r = spawnCli(
      ["nice", "do", "--phase=post-review", "--request", "x", "--review-tmp", reviewTmp],
      makeMinimalEnv(),
    );
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(r.stderr);
    const report = actions.find(
      (a) => (a as { type: string }).type === "report",
    ) as { type: string; message: string } | undefined;
    expect(report).toBeDefined();
    expect(report!.message).toMatch(/no issues|clean/i);

    // tmp file should be deleted
    const exists = await stat(reviewTmp).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  test("zero unchecked findings: emits report 'no issues' and deletes tmp file", async () => {
    const reviewTmp = path.join(tmp, "oh-do-test-checked.md");
    await writeFile(reviewTmp, "- [x] **foo** — fixed: bar\n");

    const r = spawnCli(
      ["nice", "do", "--phase=post-review", "--request", "x", "--review-tmp", reviewTmp],
      makeMinimalEnv(),
    );
    const actions = parseNextActions(r.stderr);
    const report = actions.find(
      (a) => (a as { type: string }).type === "report",
    ) as { type: string; message: string } | undefined;
    expect(report).toBeDefined();
    expect(report!.message).toMatch(/no issues|clean/i);

    const exists = await stat(reviewTmp).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  test("with unchecked findings: emits dispatch_agent(coding) with findings + final report, deletes tmp", async () => {
    const reviewTmp = path.join(tmp, "oh-do-test-findings.md");
    await writeFile(reviewTmp, "- [ ] **foo** — Suggested fix: bar\n- [ ] **baz** — Suggested fix: qux\n");

    const r = spawnCli(
      ["nice", "do", "--phase=post-review", "--request", "rename foo to bar", "--review-tmp", reviewTmp],
      makeMinimalEnv({ CODING_AGENT: "mirai" }),
    );
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(r.stderr);
    const agentAction = actions.find(
      (a) => (a as { type: string }).type === "dispatch_agent" || (a as { type: string }).type === "self_act",
    ) as { type: string; role: string; prompt: string } | undefined;
    expect(agentAction).toBeDefined();
    expect(agentAction!.role).toBe("coding");
    // prompt must contain the findings
    expect(agentAction!.prompt).toContain("foo");
    expect(agentAction!.prompt).toContain("bar");
    // prompt must contain the original request
    expect(agentAction!.prompt).toContain("rename foo to bar");

    const report = actions.find(
      (a) => (a as { type: string }).type === "report",
    ) as { type: string; message: string } | undefined;
    expect(report).toBeDefined();
    expect(report!.message).toMatch(/complete|done/i);

    // tmp file should be deleted
    const exists = await stat(reviewTmp).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  test("findings preceded by a header are still detected as unchecked (multiline regex)", async () => {
    const reviewTmp = path.join(tmp, "oh-do-test-header-findings.md");
    // Header before the first finding — previously the single-line regex missed this
    await writeFile(reviewTmp, "## Review\n\n- [ ] **foo** — Suggested fix: bar\n");

    const r = spawnCli(
      ["nice", "do", "--phase=post-review", "--request", "x", "--review-tmp", reviewTmp],
      makeMinimalEnv({ CODING_AGENT: "mirai" }),
    );
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    const actions = parseNextActions(r.stderr);
    // Must dispatch a coding agent (not emit "no issues")
    const agentAction = actions.find(
      (a) => (a as { type: string }).type === "dispatch_agent" || (a as { type: string }).type === "self_act",
    ) as { type: string; role: string } | undefined;
    expect(agentAction).toBeDefined();
    expect(agentAction!.role).toBe("coding");
    const report = actions.find(
      (a) => (a as { type: string }).type === "report",
    ) as { type: string; message: string } | undefined;
    expect(report).toBeDefined();
    // Should say complete/done, NOT "no issues"
    expect(report!.message).not.toMatch(/no issues|clean/i);
  });

  test("missing --review-tmp exits non-zero", () => {
    expect(() => spawnCli(["nice", "do", "--phase=post-review", "--request", "x"], makeMinimalEnv())).not.toThrow();
    // The spawnSync doesn't throw but the process itself should exit non-zero due to parseDoArgs throwing
    const r = spawnCli(["nice", "do", "--phase=post-review", "--request", "x"], makeMinimalEnv());
    expect(r.exitCode).not.toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// No plan directory created (regression guard)
// ──────────────────────────────────────────────────────────────────────────────

describe("nice do — no plan artifacts", () => {
  test("init phase does not create any file under PLAN_DIR", async () => {
    const planDir = path.join(tmp, "plan");
    const r = spawnCli(
      ["nice", "do", "add a comment"],
      makeMinimalEnv({ CODING_AGENT: "mirai", PLAN_DIR: planDir }),
    );
    // Should emit sentinel
    expect(r.stderr).toContain("__OH_NICE_NEXT_ACTIONS__");
    // planDir should not exist at all
    const exists = await stat(planDir).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Smoke: CLI doesn't crash on unknown subcommand (sanity)
// ──────────────────────────────────────────────────────────────────────────────

describe("nice do — CLI registration", () => {
  test("'nice do' is a recognized subcommand (no 'unknown subcommand' error)", () => {
    const r = spawnCli(
      ["nice", "do", "test"],
      makeMinimalEnv(),
    );
    // Should NOT print "unknown nice subcommand"
    expect(r.stderr).not.toContain("unknown nice subcommand");
    expect(r.stderr).not.toContain("unknown flag");
  });
});
