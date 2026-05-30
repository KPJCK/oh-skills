// tests/plugin-root.test.ts
import { describe, it, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolvePluginRoot, SHIM_ROOT_EXPR, AGY_ROOT_ENV } from "../src/shared/plugin-root";

describe("resolvePluginRoot", () => {
  it("prefers CLAUDE_PLUGIN_ROOT", () => {
    expect(resolvePluginRoot({ CLAUDE_PLUGIN_ROOT: "/c" }, "/home")).toBe("/c");
  });
  it("falls back to the agy env var", () => {
    expect(resolvePluginRoot({ [AGY_ROOT_ENV]: "/a" }, "/home")).toBe("/a");
  });
  it("falls back to PLUGIN_ROOT when agy var is absent", () => {
    expect(resolvePluginRoot({ PLUGIN_ROOT: "/p" }, "/home")).toBe("/p");
  });
  it("falls back to default .oh-skills when env is empty", () => {
    expect(resolvePluginRoot({}, "/home")).toBe("/home/.oh-skills");
  });
  it("CLAUDE_PLUGIN_ROOT wins over the agy var", () => {
    expect(resolvePluginRoot({ CLAUDE_PLUGIN_ROOT: "/c", [AGY_ROOT_ENV]: "/a" }, "/home")).toBe(
      "/c",
    );
  });
  it("first-existing dir with src/cli.ts is chosen", () => {
    const tmp = mkdtempSync(join(tmpdir(), "oh-skills-test-"));
    const cliDir = join(tmp, "src");
    mkdirSync(cliDir, { recursive: true });
    writeFileSync(join(cliDir, "cli.ts"), "// stub");
    // Provide a fake home whose .oh-skills doesn't exist but tmp does
    // We fake this by pointing to a home where the KNOWN_INSTALL_DIRS don't exist except our tmp
    // We can't override the candidates directly, but we can test that when the candidate has cli.ts it wins.
    // Use PLUGIN_ROOT unset, agy unset, CLAUDE_PLUGIN_ROOT unset, and a home that resolves to tmp as .oh-skills
    // The simplest: make the .oh-skills subdir inside tmp and put src/cli.ts there
    const fakeHome = mkdtempSync(join(tmpdir(), "oh-skills-fakehome-"));
    const ohSkillsDir = join(fakeHome, ".oh-skills");
    mkdirSync(join(ohSkillsDir, "src"), { recursive: true });
    writeFileSync(join(ohSkillsDir, "src", "cli.ts"), "// stub");
    expect(resolvePluginRoot({}, fakeHome)).toBe(ohSkillsDir);
  });
  it("SHIM_ROOT_EXPR encodes the same env-var probe order for bash", () => {
    expect(SHIM_ROOT_EXPR).toContain("CLAUDE_PLUGIN_ROOT");
    expect(SHIM_ROOT_EXPR).toContain(AGY_ROOT_ENV);
    // the bare PLUGIN_ROOT probe (step c) must be present so bash mirrors resolvePluginRoot()
    expect(SHIM_ROOT_EXPR).toContain("${PLUGIN_ROOT:-");
    expect(SHIM_ROOT_EXPR).toContain(".oh-skills");
  });
});
