import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, copyFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { realpath } from "node:fs/promises";
import { spawn } from "node:child_process";

const CLI = path.resolve(import.meta.dir, "..", "src", "cli.ts");
const FIXTURES = path.join(import.meta.dir, "fixtures", "plans");

let tmp: string;

beforeEach(async () => {
  const raw = await mkdtemp(path.join(os.tmpdir(), "oh-go-phases-"));
  tmp = await realpath(raw);
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

type Run = { stdout: string; stderr: string; code: number };

async function runCli(args: string[], extraEnv: Record<string, string> = {}): Promise<Run> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PLAN_DIR: tmp,
      CONTEXT_DIR: path.join(tmp, "ctx"),
      CONTEXT_TEMPLATE_DIR: path.join(tmp, "ctx-templates"),
      KNOWLEDGE_DIR: path.join(tmp, "knowledge"),
      ...extraEnv,
    };
    const proc = spawn("bun", [CLI, ...args], { env });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    proc.on("error", reject);
  });
}

function parseSentinel(stderr: string): unknown[] {
  const line = stderr
    .split("\n")
    .reverse()
    .find((l) => l.startsWith("__OH_NICE_NEXT_ACTIONS__"));
  if (!line) throw new Error(`no sentinel in stderr: ${stderr}`);
  const json = line.slice("__OH_NICE_NEXT_ACTIONS__".length);
  return JSON.parse(json);
}

async function placePlan(repo: string, slug: string, fixture: string): Promise<string> {
  const dir = path.join(tmp, repo, slug);
  await mkdir(dir, { recursive: true });
  await copyFile(path.join(FIXTURES, fixture), path.join(dir, "plan.md"));
  await writeFile(path.join(dir, "spec.md"), "stub spec\n", "utf-8");
  return dir;
}

describe("go --phase=init: legacy plan (back-compat)", () => {
  test("dispatches exactly one agent action", async () => {
    await placePlan("oh-skills", "legacy", "legacy-sequential.md");
    const run = await runCli(["nice", "go", "--phase=init", "--slug", "legacy"]);
    expect(run.code).toBe(0);
    const actions = parseSentinel(run.stderr);
    const agentActions = actions.filter(
      (a) =>
        typeof a === "object" &&
        a !== null &&
        ((a as { type?: string }).type === "dispatch_agent" ||
          (a as { type?: string }).type === "self_act"),
    );
    expect(agentActions.length).toBe(1);
  });
});

describe("go --phase=init: partial plan (error)", () => {
  test("exits non-zero with a report action describing the offending tasks", async () => {
    await placePlan("oh-skills", "partial", "partial-dag.md");
    const run = await runCli(["nice", "go", "--phase=init", "--slug", "partial"]);
    expect(run.code).toBe(2);
    const actions = parseSentinel(run.stderr);
    const reports = actions.filter(
      (a) => typeof a === "object" && a !== null && (a as { type?: string }).type === "report",
    );
    expect(reports.length).toBeGreaterThan(0);
    const msg = (reports[0] as { message: string }).message;
    expect(msg.toLowerCase()).toContain("partial");
  });
});

describe("go --phase=init: valid parallel plan", () => {
  test("dispatches one agent per ready-set task (3 in wave 1 is just root: types-define)", async () => {
    await placePlan("oh-skills", "parallel", "valid-parallel.md");
    const run = await runCli(["nice", "go", "--phase=init", "--slug", "parallel"]);
    expect(run.code).toBe(0);
    const actions = parseSentinel(run.stderr);
    const agentActions = actions.filter(
      (a) =>
        typeof a === "object" &&
        a !== null &&
        ((a as { type?: string }).type === "dispatch_agent" ||
          (a as { type?: string }).type === "self_act"),
    );
    // The valid fixture's wave 1 is just one task: types-define.
    expect(agentActions.length).toBe(1);
    const prompt = (agentActions[0] as { prompt: string }).prompt;
    expect(prompt).toContain("types-define");
    expect(prompt).toContain("src/types.ts");
  });
});

describe("go --phase=wave-done", () => {
  test("marking root done dispatches the next wave (2 parallel tasks)", async () => {
    await placePlan("oh-skills", "wd1", "valid-parallel.md");
    // First init to create state
    const init = await runCli(["nice", "go", "--phase=init", "--slug", "wd1"]);
    expect(init.code).toBe(0);
    // Now wave-done with the root task complete
    const wd = await runCli([
      "nice", "go", "--phase=wave-done", "--slug", "wd1", "--done", "types-define",
    ]);
    expect(wd.code).toBe(0);
    const actions = parseSentinel(wd.stderr);
    const agentActions = actions.filter(
      (a) =>
        typeof a === "object" &&
        a !== null &&
        ((a as { type?: string }).type === "dispatch_agent" ||
          (a as { type?: string }).type === "self_act"),
    );
    expect(agentActions.length).toBe(2);
    const idSet = new Set(
      agentActions.map((a) => {
        const p = (a as { prompt: string }).prompt;
        if (p.includes("parser-tokenize")) return "parser-tokenize";
        if (p.includes("renderer-init")) return "renderer-init";
        return "?";
      }),
    );
    expect(idSet.has("parser-tokenize")).toBe(true);
    expect(idSet.has("renderer-init")).toBe(true);
  });

  test("marking all but last as done dispatches the last task alone", async () => {
    await placePlan("oh-skills", "wd2", "valid-parallel.md");
    const init = await runCli(["nice", "go", "--phase=init", "--slug", "wd2"]);
    expect(init.code).toBe(0);
    const wd1 = await runCli([
      "nice", "go", "--phase=wave-done", "--slug", "wd2",
      "--done", "types-define",
    ]);
    expect(wd1.code).toBe(0);
    const wd2 = await runCli([
      "nice", "go", "--phase=wave-done", "--slug", "wd2",
      "--done", "parser-tokenize,renderer-init",
    ]);
    expect(wd2.code).toBe(0);
    const actions = parseSentinel(wd2.stderr);
    const agentActions = actions.filter(
      (a) =>
        typeof a === "object" &&
        a !== null &&
        ((a as { type?: string }).type === "dispatch_agent" ||
          (a as { type?: string }).type === "self_act"),
    );
    expect(agentActions.length).toBe(1);
    expect((agentActions[0] as { prompt: string }).prompt).toContain("index-wire");
  });

  test("marking the final task done reports 'all complete' with no dispatches", async () => {
    await placePlan("oh-skills", "wd3", "valid-parallel.md");
    await runCli(["nice", "go", "--phase=init", "--slug", "wd3"]);
    await runCli(["nice", "go", "--phase=wave-done", "--slug", "wd3", "--done", "types-define"]);
    await runCli([
      "nice", "go", "--phase=wave-done", "--slug", "wd3",
      "--done", "parser-tokenize,renderer-init",
    ]);
    const wdFinal = await runCli([
      "nice", "go", "--phase=wave-done", "--slug", "wd3",
      "--done", "index-wire",
    ]);
    expect(wdFinal.code).toBe(0);
    const actions = parseSentinel(wdFinal.stderr);
    const agentActions = actions.filter(
      (a) =>
        typeof a === "object" &&
        a !== null &&
        ((a as { type?: string }).type === "dispatch_agent" ||
          (a as { type?: string }).type === "self_act"),
    );
    expect(agentActions.length).toBe(0);
    const reports = actions.filter(
      (a) => typeof a === "object" && a !== null && (a as { type?: string }).type === "report",
    );
    expect(reports.length).toBeGreaterThan(0);
    expect((reports[0] as { message: string }).message.toLowerCase()).toContain("complete");
  });

  test("wave-done rejects unknown task IDs", async () => {
    await placePlan("oh-skills", "wd4", "valid-parallel.md");
    await runCli(["nice", "go", "--phase=init", "--slug", "wd4"]);
    const wd = await runCli([
      "nice", "go", "--phase=wave-done", "--slug", "wd4",
      "--done", "ghost-task",
    ]);
    expect(wd.code).toBe(2);
  });
});

describe("go MAX_PARALLEL cap", () => {
  test("default cap of 3 with 5 ready tasks → 3 dispatches", async () => {
    await placePlan("oh-skills", "cap1", "many-roots.md");
    const run = await runCli(
      ["nice", "go", "--phase=init", "--slug", "cap1"],
      { OH_NICE_MAX_PARALLEL: "" }, // empty = default
    );
    expect(run.code).toBe(0);
    const actions = parseSentinel(run.stderr);
    const agentActions = actions.filter(
      (a) =>
        typeof a === "object" &&
        a !== null &&
        ((a as { type?: string }).type === "dispatch_agent" ||
          (a as { type?: string }).type === "self_act"),
    );
    expect(agentActions.length).toBe(3);
  });

  test("OH_NICE_MAX_PARALLEL=2 with 5 ready tasks → 2 dispatches", async () => {
    await placePlan("oh-skills", "cap2", "many-roots.md");
    const run = await runCli(
      ["nice", "go", "--phase=init", "--slug", "cap2"],
      { OH_NICE_MAX_PARALLEL: "2" },
    );
    expect(run.code).toBe(0);
    const actions = parseSentinel(run.stderr);
    const agentActions = actions.filter(
      (a) =>
        typeof a === "object" &&
        a !== null &&
        ((a as { type?: string }).type === "dispatch_agent" ||
          (a as { type?: string }).type === "self_act"),
    );
    expect(agentActions.length).toBe(2);
  });

  test("OH_NICE_MAX_PARALLEL=10 with 5 ready tasks → 5 dispatches", async () => {
    await placePlan("oh-skills", "cap3", "many-roots.md");
    const run = await runCli(
      ["nice", "go", "--phase=init", "--slug", "cap3"],
      { OH_NICE_MAX_PARALLEL: "10" },
    );
    expect(run.code).toBe(0);
    const actions = parseSentinel(run.stderr);
    const agentActions = actions.filter(
      (a) =>
        typeof a === "object" &&
        a !== null &&
        ((a as { type?: string }).type === "dispatch_agent" ||
          (a as { type?: string }).type === "self_act"),
    );
    expect(agentActions.length).toBe(5);
  });
});
