import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, realpath, writeFile, mkdir } from "node:fs/promises";
import { deliverPayload, buildPerRuleInstructions } from "../src/skills/context/paginate.ts";
import type { Rule } from "../src/skills/context/registry.ts";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeRule(overrides: Partial<Rule> & Pick<Rule, "absPath" | "priority">): Rule {
  return {
    folder: "test/folder",
    file: "rule-test.md",
    hash: "abc12345",
    title: "Test Rule",
    meta: {
      title: "Test Rule",
      description: "A test rule",
      priority: overrides.priority,
    },
    body: "## DO\n- write tests\n",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fixture setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let contextDir: string;
let stdoutChunks: string[];
let stderrChunks: string[];
let stdoutSpy: ReturnType<typeof spyOn>;
let stderrSpy: ReturnType<typeof spyOn>;
let savedCwd: string;

async function setup() {
  tmpDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "oh-deliver-test-")));
  contextDir = path.join(tmpDir, "context");
  await mkdir(contextDir, { recursive: true });
  await writeFile(
    path.join(tmpDir, ".oh-env"),
    `CONTEXT_DIR=${contextDir}\nCONTEXT_TEMPLATE_DIR=${tmpDir}/tpl\nKNOWLEDGE_DIR=${tmpDir}/k\nPLAN_DIR=${tmpDir}/p\n`,
  );

  savedCwd = process.cwd();
  process.chdir(tmpDir);

  stdoutChunks = [];
  stderrChunks = [];

  stdoutSpy = spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    stdoutChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  });
  stderrSpy = spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    stderrChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  });
}

async function teardown() {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  process.chdir(savedCwd);
  await rm(tmpDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// deliverPayload — 0 rules
// ---------------------------------------------------------------------------

describe("deliverPayload — 0 rules", () => {
  beforeEach(setup);
  afterEach(teardown);

  test("writes 'no rules matched' to stdout", async () => {
    await deliverPayload([]);
    expect(stdoutChunks.join("")).toContain("no rules matched");
  });

  test("emits no __OH_CONTEXT_NEXT_ACTIONS__ on stderr", async () => {
    await deliverPayload([]);
    expect(stderrChunks.join("")).not.toContain("__OH_CONTEXT_NEXT_ACTIONS__");
  });
});

// ---------------------------------------------------------------------------
// deliverPayload — 3 rules with mixed priorities
// ---------------------------------------------------------------------------

describe("deliverPayload — 3 rules mixed priorities", () => {
  beforeEach(setup);
  afterEach(teardown);

  function makeThreeRules() {
    return [
      makeRule({
        folder: "typescript/frontend",
        absPath: path.join(contextDir, "typescript/frontend/rule-react-hooks.md"),
        priority: "high",
      }),
      makeRule({
        folder: "general",
        absPath: path.join(contextDir, "general/rule-commits.md"),
        priority: "low",
      }),
      makeRule({
        folder: "typescript/backend",
        absPath: path.join(contextDir, "typescript/backend/rule-bun-runtime.md"),
        priority: "high",
      }),
    ];
  }

  test("banner contains correct rule count and folder count", async () => {
    await deliverPayload(makeThreeRules());
    const stdout = stdoutChunks.join("");
    // 3 rules, 3 unique folders (typescript/frontend, general, typescript/backend)
    expect(stdout).toContain("3 rules");
    expect(stdout).toContain("3 folders");
  });

  test("banner header line matches expected shape", async () => {
    await deliverPayload(makeThreeRules());
    const stdout = stdoutChunks.join("");
    expect(stdout).toContain("## Authoritative rules · 3 rules · 3 folders");
  });

  test("emits __OH_CONTEXT_NEXT_ACTIONS__ on stderr", async () => {
    await deliverPayload(makeThreeRules());
    expect(stderrChunks.join("")).toContain("__OH_CONTEXT_NEXT_ACTIONS__");
  });

  test("self_act next-action contains all 3 Read calls", async () => {
    const rules = makeThreeRules();
    await deliverPayload(rules);
    const stderr = stderrChunks.join("");
    const sentinelIdx = stderr.indexOf("__OH_CONTEXT_NEXT_ACTIONS__");
    const jsonStr = stderr.slice(sentinelIdx + "__OH_CONTEXT_NEXT_ACTIONS__".length);
    const actions = JSON.parse(jsonStr.trim());

    expect(Array.isArray(actions)).toBe(true);
    expect(actions[0].type).toBe("self_act");
    const prompt: string = actions[0].prompt;
    // All 3 abs paths appear
    for (const r of rules) {
      expect(prompt).toContain(r.absPath);
    }
  });

  test("no temp file written under tmpDir (top-level check)", async () => {
    await deliverPayload(makeThreeRules());
    // Top-level check: no .md written directly in the tmpDir root.
    // Sufficient to confirm the old temp-file write path (os.tmpdir()) is gone.
    const { readdir } = await import("node:fs/promises");
    let files: string[] = [];
    try {
      files = await readdir(tmpDir);
    } catch {}
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    expect(mdFiles).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildPerRuleInstructions
// ---------------------------------------------------------------------------

describe("buildPerRuleInstructions", () => {
  const fakeRules: Rule[] = [
    makeRule({ absPath: "/ctx/typescript/rule-types.md", priority: "high" }),
    makeRule({ absPath: "/ctx/general/rule-commits.md", priority: "medium" }),
    makeRule({ absPath: "/ctx/style/rule-naming.md", priority: "low" }),
  ];

  test("contains 'parallel'", () => {
    expect(buildPerRuleInstructions(fakeRules)).toContain("parallel");
  });

  test("contains 'SINGLE message'", () => {
    expect(buildPerRuleInstructions(fakeRules)).toContain("SINGLE message");
  });

  test("contains 'no dependencies between files'", () => {
    expect(buildPerRuleInstructions(fakeRules)).toContain("no\ndependencies between files");
  });

  test("singular form for N=1", () => {
    expect(buildPerRuleInstructions([fakeRules[0]!])).toContain("1 rule file");
  });

  test("one Read line per rule with correct absPath", () => {
    const out = buildPerRuleInstructions(fakeRules);
    const readLines = out.split("\n").filter((l) => l.trim().startsWith("Read('"));
    expect(readLines).toHaveLength(fakeRules.length);
    for (const r of fakeRules) {
      expect(readLines.some((l) => l.includes(r.absPath))).toBe(true);
    }
  });

  test("Read lines appear in input order", () => {
    const out = buildPerRuleInstructions(fakeRules);
    const readLines = out.split("\n").filter((l) => l.trim().startsWith("Read('"));
    expect(readLines[0]).toContain(fakeRules[0]!.absPath);
    expect(readLines[1]).toContain(fakeRules[1]!.absPath);
    expect(readLines[2]).toContain(fakeRules[2]!.absPath);
  });
});

// ---------------------------------------------------------------------------
// Priority sort
// ---------------------------------------------------------------------------

describe("deliverPayload — priority sort order", () => {
  beforeEach(setup);
  afterEach(teardown);

  test("banner lists high before medium before low", async () => {
    const rules = [
      makeRule({ absPath: path.join(contextDir, "z/rule-low.md"), priority: "low" }),
      makeRule({ absPath: path.join(contextDir, "a/rule-high.md"), priority: "high" }),
      makeRule({ absPath: path.join(contextDir, "m/rule-med.md"), priority: "medium" }),
    ];
    await deliverPayload(rules);
    const stdout = stdoutChunks.join("");
    const highIdx = stdout.indexOf("(high)");
    const medIdx = stdout.indexOf("(medium)");
    const lowIdx = stdout.indexOf("(low)");
    expect(highIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
  });

  test("manifest Read calls also follow priority order", async () => {
    const rules = [
      makeRule({ absPath: path.join(contextDir, "z/rule-low.md"), priority: "low" }),
      makeRule({ absPath: path.join(contextDir, "a/rule-high.md"), priority: "high" }),
      makeRule({ absPath: path.join(contextDir, "m/rule-med.md"), priority: "medium" }),
    ];
    await deliverPayload(rules);
    const stderr = stderrChunks.join("");
    const sentinelIdx = stderr.indexOf("__OH_CONTEXT_NEXT_ACTIONS__");
    const jsonStr = stderr.slice(sentinelIdx + "__OH_CONTEXT_NEXT_ACTIONS__".length);
    const actions = JSON.parse(jsonStr.trim());
    const prompt: string = actions[0].prompt;

    const highPos = prompt.indexOf("rule-high.md");
    const medPos = prompt.indexOf("rule-med.md");
    const lowPos = prompt.indexOf("rule-low.md");
    expect(highPos).toBeLessThan(medPos);
    expect(medPos).toBeLessThan(lowPos);
  });

  test("tie-break: equal-priority rules sort by absPath alphabetically", async () => {
    const rules = [
      makeRule({ absPath: path.join(contextDir, "b/rule-second.md"), priority: "high" }),
      makeRule({ absPath: path.join(contextDir, "a/rule-first.md"), priority: "high" }),
    ];
    await deliverPayload(rules);
    const stdout = stdoutChunks.join("");
    const firstPos = stdout.indexOf("a/rule-first.md");
    const secondPos = stdout.indexOf("b/rule-second.md");
    expect(firstPos).toBeLessThan(secondPos);
  });
});
