// tests/shim-consistency.test.ts
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SHIM_ROOT_EXPR } from "../src/shared/plugin-root";

const SKILLS = ["oh-nice", "oh-context", "oh-search", "oh-doctor", "oh-help", "oh-bug-tracing"];
const root = join(import.meta.dir, "..");

describe("SKILL.md shims are host-portable", () => {
  for (const s of SKILLS) {
    const md = readFileSync(join(root, "skills", s, "SKILL.md"), "utf-8");
    it(`${s}: no bare \${CLAUDE_PLUGIN_ROOT}/src/cli.ts invocation`, () => {
      expect(md).not.toMatch(/\$\{CLAUDE_PLUGIN_ROOT\}\/src\/cli\.ts/);
    });
    it(`${s}: every cli.ts call uses the portable root expr`, () => {
      const calls = md.match(/bun [^\n]*src\/cli\.ts/g) ?? [];
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) expect(c).toContain(SHIM_ROOT_EXPR);
    });
  }
});
