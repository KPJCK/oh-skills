import { describe, test, expect } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  parsePlan,
  validateUniqueIds,
  validateMissingFields,
  validateDependsOnExist,
  validateNoCycle,
  validateNoCreateCollisions,
  validateModifyEdgesAreOrdered,
  nextReadySet,
  validateReadySetFileSafety,
} from "../src/skills/nice/dag.ts";

const FIXTURES = path.join(import.meta.dir, "fixtures", "plans");

describe("parsePlan", () => {
  test("parses a valid 4-task parallel plan", async () => {
    const content = await readFile(
      path.join(FIXTURES, "valid-parallel.md"),
      "utf-8",
    );
    const dag = parsePlan(content);
    expect(dag.order).toEqual([
      "types-define",
      "parser-tokenize",
      "renderer-init",
      "index-wire",
    ]);
    expect(dag.nodes.size).toBe(4);

    const types = dag.nodes.get("types-define")!;
    expect(types.title).toBe("define shared types");
    expect(types.creates).toEqual(["src/types.ts"]);
    expect(types.modifies).toEqual([]);
    expect(types.dependsOn).toEqual([]);

    const tokenize = dag.nodes.get("parser-tokenize")!;
    expect(tokenize.creates).toEqual([
      "src/parser/tokenize.ts",
      "tests/parser/tokenize.test.ts",
    ]);
    expect(tokenize.dependsOn).toEqual(["types-define"]);

    const wire = dag.nodes.get("index-wire")!;
    expect(wire.creates).toEqual([]);
    expect(wire.modifies).toEqual(["src/index.ts"]);
    expect(wire.dependsOn).toEqual(["parser-tokenize", "renderer-init"]);
  });

  test("task missing Files block → empty creates/modifies", () => {
    const md = [
      "### Task only-deps: no files declared",
      "",
      "**Depends-on:**",
      "- none",
      "",
    ].join("\n");
    const dag = parsePlan(md);
    const n = dag.nodes.get("only-deps")!;
    expect(n.creates).toEqual([]);
    expect(n.modifies).toEqual([]);
    expect(n.dependsOn).toEqual([]);
  });

  test("task missing Depends-on block → empty dependsOn", () => {
    const md = [
      "### Task only-files: no deps declared",
      "",
      "**Files:**",
      "- Create: src/foo.ts",
      "",
    ].join("\n");
    const dag = parsePlan(md);
    const n = dag.nodes.get("only-files")!;
    expect(n.dependsOn).toEqual([]);
    expect(n.creates).toEqual(["src/foo.ts"]);
  });

  test("literal 'none' in Depends-on yields empty array", () => {
    const md = [
      "### Task root: no deps",
      "",
      "**Files:**",
      "- Create: src/root.ts",
      "",
      "**Depends-on:**",
      "- none",
      "",
    ].join("\n");
    const dag = parsePlan(md);
    expect(dag.nodes.get("root")!.dependsOn).toEqual([]);
  });

  test("mixed Create and Modify in same Files block split correctly", () => {
    const md = [
      "### Task mix: both kinds",
      "",
      "**Files:**",
      "- Create: src/new.ts",
      "- Modify: src/existing.ts",
      "- Create: src/other.ts",
      "",
      "**Depends-on:**",
      "- none",
      "",
    ].join("\n");
    const dag = parsePlan(md);
    const n = dag.nodes.get("mix")!;
    expect(n.creates).toEqual(["src/new.ts", "src/other.ts"]);
    expect(n.modifies).toEqual(["src/existing.ts"]);
  });

  test("legacy plan with no Task headings yields empty DAG", () => {
    const md = "# Plan\n\nSome prose.\n\n- [ ] do thing\n";
    const dag = parsePlan(md);
    expect(dag.nodes.size).toBe(0);
    expect(dag.order).toEqual([]);
  });
});

describe("validateUniqueIds", () => {
  test("pass: unique IDs", () => {
    const dag = parsePlan(
      [
        "### Task a: alpha",
        "**Files:**",
        "- Create: a.ts",
        "**Depends-on:**",
        "- none",
        "### Task b: beta",
        "**Files:**",
        "- Create: b.ts",
        "**Depends-on:**",
        "- none",
      ].join("\n"),
    );
    expect(validateUniqueIds(dag)).toEqual([]);
  });

  test("fail: duplicate ID in source order is reported", () => {
    // parsePlan's Map overwrites duplicates, but we still see them via the
    // `order` array. The validator must compare order vs Map size.
    const dag = parsePlan(
      [
        "### Task dup: first",
        "**Files:**",
        "- Create: a.ts",
        "**Depends-on:**",
        "- none",
        "### Task dup: second",
        "**Files:**",
        "- Create: b.ts",
        "**Depends-on:**",
        "- none",
      ].join("\n"),
    );
    const errs = validateUniqueIds(dag);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]).toContain("dup");
  });
});

describe("validateMissingFields", () => {
  test("pass: all tasks have both fields", () => {
    const dag = parsePlan(
      [
        "### Task a: alpha",
        "**Files:**",
        "- Create: a.ts",
        "**Depends-on:**",
        "- none",
      ].join("\n"),
    );
    expect(validateMissingFields(dag)).toEqual([]);
  });

  test("fail: task missing Files is flagged", () => {
    const dag = parsePlan(
      [
        "### Task a: alpha",
        "**Depends-on:**",
        "- none",
      ].join("\n"),
    );
    const errs = validateMissingFields(dag);
    expect(errs.length).toBe(1);
    expect(errs[0]).toContain("a");
    expect(errs[0]!.toLowerCase()).toContain("files");
  });
});

describe("validateDependsOnExist", () => {
  test("pass: all dependsOn reference existing IDs", () => {
    const dag = parsePlan(
      [
        "### Task a: alpha",
        "**Files:**",
        "- Create: a.ts",
        "**Depends-on:**",
        "- none",
        "### Task b: beta",
        "**Files:**",
        "- Create: b.ts",
        "**Depends-on:**",
        "- a",
      ].join("\n"),
    );
    expect(validateDependsOnExist(dag)).toEqual([]);
  });

  test("fail: dependsOn references unknown ID", () => {
    const dag = parsePlan(
      [
        "### Task a: alpha",
        "**Files:**",
        "- Create: a.ts",
        "**Depends-on:**",
        "- ghost",
      ].join("\n"),
    );
    const errs = validateDependsOnExist(dag);
    expect(errs.length).toBe(1);
    expect(errs[0]).toContain("a");
    expect(errs[0]).toContain("ghost");
  });
});

describe("validateNoCycle", () => {
  test("pass: linear chain a → b → c", () => {
    const dag = parsePlan(
      [
        "### Task a: alpha",
        "**Files:**",
        "- Create: a.ts",
        "**Depends-on:**",
        "- none",
        "### Task b: beta",
        "**Files:**",
        "- Create: b.ts",
        "**Depends-on:**",
        "- a",
        "### Task c: gamma",
        "**Files:**",
        "- Create: c.ts",
        "**Depends-on:**",
        "- b",
      ].join("\n"),
    );
    expect(validateNoCycle(dag)).toEqual([]);
  });

  test("pass: diamond a → {b,c} → d", () => {
    const dag = parsePlan(
      [
        "### Task a: alpha",
        "**Files:**",
        "- Create: a.ts",
        "**Depends-on:**",
        "- none",
        "### Task b: beta",
        "**Files:**",
        "- Create: b.ts",
        "**Depends-on:**",
        "- a",
        "### Task c: gamma",
        "**Files:**",
        "- Create: c.ts",
        "**Depends-on:**",
        "- a",
        "### Task d: delta",
        "**Files:**",
        "- Create: d.ts",
        "**Depends-on:**",
        "- b",
        "- c",
      ].join("\n"),
    );
    expect(validateNoCycle(dag)).toEqual([]);
  });

  test("fail: cycle a → b → c → a is reported", () => {
    const dag = parsePlan(
      [
        "### Task a: alpha",
        "**Files:**",
        "- Create: a.ts",
        "**Depends-on:**",
        "- c",
        "### Task b: beta",
        "**Files:**",
        "- Create: b.ts",
        "**Depends-on:**",
        "- a",
        "### Task c: gamma",
        "**Files:**",
        "- Create: c.ts",
        "**Depends-on:**",
        "- b",
      ].join("\n"),
    );
    const errs = validateNoCycle(dag);
    expect(errs.length).toBe(1);
    expect(errs[0]!.toLowerCase()).toContain("cycle");
    // The reported message should mention all three nodes.
    expect(errs[0]).toContain("a");
    expect(errs[0]).toContain("b");
    expect(errs[0]).toContain("c");
  });
});

describe("validateNoCreateCollisions", () => {
  test("pass: every Create path is unique", () => {
    const dag = parsePlan(
      [
        "### Task a: alpha",
        "**Files:**",
        "- Create: src/a.ts",
        "**Depends-on:**",
        "- none",
        "### Task b: beta",
        "**Files:**",
        "- Create: src/b.ts",
        "**Depends-on:**",
        "- none",
      ].join("\n"),
    );
    expect(validateNoCreateCollisions(dag)).toEqual([]);
  });

  test("fail: two tasks both Create the same file", () => {
    const dag = parsePlan(
      [
        "### Task a: alpha",
        "**Files:**",
        "- Create: src/shared.ts",
        "**Depends-on:**",
        "- none",
        "### Task b: beta",
        "**Files:**",
        "- Create: src/shared.ts",
        "**Depends-on:**",
        "- none",
      ].join("\n"),
    );
    const errs = validateNoCreateCollisions(dag);
    expect(errs.length).toBe(1);
    expect(errs[0]).toContain("src/shared.ts");
    expect(errs[0]).toContain("a");
    expect(errs[0]).toContain("b");
  });
});

describe("validateModifyEdgesAreOrdered", () => {
  test("pass: only one task modifies a given file", () => {
    const dag = parsePlan(
      [
        "### Task a: alpha",
        "**Files:**",
        "- Modify: src/index.ts",
        "**Depends-on:**",
        "- none",
        "### Task b: beta",
        "**Files:**",
        "- Modify: src/other.ts",
        "**Depends-on:**",
        "- none",
      ].join("\n"),
    );
    expect(validateModifyEdgesAreOrdered(dag)).toEqual([]);
  });

  test("pass: two tasks modify same file but one transitively depends on the other", () => {
    const dag = parsePlan(
      [
        "### Task a: alpha",
        "**Files:**",
        "- Modify: src/index.ts",
        "**Depends-on:**",
        "- none",
        "### Task b: beta",
        "**Files:**",
        "- Modify: src/index.ts",
        "**Depends-on:**",
        "- a",
      ].join("\n"),
    );
    expect(validateModifyEdgesAreOrdered(dag)).toEqual([]);
  });

  test("fail: two tasks modify same file with no ordering", () => {
    const dag = parsePlan(
      [
        "### Task a: alpha",
        "**Files:**",
        "- Modify: src/index.ts",
        "**Depends-on:**",
        "- none",
        "### Task b: beta",
        "**Files:**",
        "- Modify: src/index.ts",
        "**Depends-on:**",
        "- none",
      ].join("\n"),
    );
    const errs = validateModifyEdgesAreOrdered(dag);
    expect(errs.length).toBe(1);
    expect(errs[0]).toContain("src/index.ts");
    expect(errs[0]).toContain("a");
    expect(errs[0]).toContain("b");
  });
});

describe("nextReadySet", () => {
  function buildDag(spec: string): ReturnType<typeof parsePlan> {
    return parsePlan(spec);
  }

  const diamond = [
    "### Task a: alpha",
    "**Files:**",
    "- Create: a.ts",
    "**Depends-on:**",
    "- none",
    "### Task b: beta",
    "**Files:**",
    "- Create: b.ts",
    "**Depends-on:**",
    "- a",
    "### Task c: gamma",
    "**Files:**",
    "- Create: c.ts",
    "**Depends-on:**",
    "- a",
    "### Task d: delta",
    "**Files:**",
    "- Create: d.ts",
    "**Depends-on:**",
    "- b",
    "- c",
  ].join("\n");

  test("empty done: returns root nodes only", () => {
    const dag = buildDag(diamond);
    const ready = nextReadySet(dag, new Set());
    expect(ready.map((n) => n.id)).toEqual(["a"]);
  });

  test("done={a}: returns {b, c} in source order", () => {
    const dag = buildDag(diamond);
    const ready = nextReadySet(dag, new Set(["a"]));
    expect(ready.map((n) => n.id)).toEqual(["b", "c"]);
  });

  test("done={a,b,c}: returns {d}", () => {
    const dag = buildDag(diamond);
    const ready = nextReadySet(dag, new Set(["a", "b", "c"]));
    expect(ready.map((n) => n.id)).toEqual(["d"]);
  });

  test("done={a,b,c,d}: returns empty", () => {
    const dag = buildDag(diamond);
    const ready = nextReadySet(dag, new Set(["a", "b", "c", "d"]));
    expect(ready).toEqual([]);
  });

  test("parallel roots: all three are ready when done is empty", () => {
    const dag = buildDag(
      [
        "### Task a: alpha",
        "**Files:**",
        "- Create: a.ts",
        "**Depends-on:**",
        "- none",
        "### Task b: beta",
        "**Files:**",
        "- Create: b.ts",
        "**Depends-on:**",
        "- none",
        "### Task c: gamma",
        "**Files:**",
        "- Create: c.ts",
        "**Depends-on:**",
        "- none",
      ].join("\n"),
    );
    const ready = nextReadySet(dag, new Set());
    expect(ready.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});

describe("validateReadySetFileSafety", () => {
  function node(id: string, creates: string[], modifies: string[] = []) {
    return {
      id,
      title: id,
      creates,
      modifies,
      dependsOn: [],
      bodyStart: 0,
    };
  }

  test("pass: disjoint file sets", () => {
    expect(
      validateReadySetFileSafety([
        node("a", ["src/a.ts"]),
        node("b", ["src/b.ts"]),
      ]),
    ).toEqual([]);
  });

  test("fail: Create collision within set", () => {
    const errs = validateReadySetFileSafety([
      node("a", ["src/shared.ts"]),
      node("b", ["src/shared.ts"]),
    ]);
    expect(errs.length).toBe(1);
    expect(errs[0]).toContain("src/shared.ts");
  });

  test("fail: Modify collision within set", () => {
    const errs = validateReadySetFileSafety([
      node("a", [], ["src/index.ts"]),
      node("b", [], ["src/index.ts"]),
    ]);
    expect(errs.length).toBe(1);
    expect(errs[0]).toContain("src/index.ts");
  });

  test("fail: Create-vs-Modify collision within set", () => {
    const errs = validateReadySetFileSafety([
      node("a", ["src/x.ts"]),
      node("b", [], ["src/x.ts"]),
    ]);
    expect(errs.length).toBe(1);
    expect(errs[0]).toContain("src/x.ts");
  });
});
