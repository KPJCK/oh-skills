// tests/cli-routing.test.ts
import { describe, test, expect } from "bun:test";
import { $ } from "bun";
import path from "node:path";

const CLI = path.resolve(import.meta.dir, "..", "src", "cli.ts");

describe("CLI routing", () => {
  test("unknown skill exits non-zero with helpful error", async () => {
    const r = await $`bun ${CLI} nonsense 2>&1`.nothrow().quiet();
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout.toString() + r.stderr.toString()).toMatch(/unknown skill|expected one of/i);
  });

  test("known skill 'help' dispatches", async () => {
    const r = await $`bun ${CLI} help 2>&1`.nothrow().quiet();
    // help may exit 0 even without args; just verify it didn't 2-out on routing
    expect(r.exitCode).not.toBe(2);
  });

  test("no args prints usage", async () => {
    const r = await $`bun ${CLI} 2>&1`.nothrow().quiet();
    const out = r.stdout.toString() + r.stderr.toString();
    expect(out).toMatch(/Usage|oh-skills/i);
  });
});
