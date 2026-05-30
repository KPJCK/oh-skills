// tests/plugin-root.test.ts
import { describe, it, expect } from "bun:test";
import { resolvePluginRoot, SHIM_ROOT_EXPR, AGY_ROOT_ENV } from "../src/shared/plugin-root";

describe("resolvePluginRoot", () => {
  it("prefers CLAUDE_PLUGIN_ROOT", () => {
    expect(resolvePluginRoot({ CLAUDE_PLUGIN_ROOT: "/c" }, "/home")).toBe("/c");
  });
  it("falls back to the agy env var", () => {
    expect(resolvePluginRoot({ [AGY_ROOT_ENV]: "/a" }, "/home")).toBe("/a");
  });
  it("falls back to the known agy install path", () => {
    expect(resolvePluginRoot({}, "/home")).toBe("/home/.gemini/antigravity-cli/plugins/oh-skills");
  });
  it("CLAUDE_PLUGIN_ROOT wins over the agy var", () => {
    expect(resolvePluginRoot({ CLAUDE_PLUGIN_ROOT: "/c", [AGY_ROOT_ENV]: "/a" }, "/home")).toBe(
      "/c",
    );
  });
  it("SHIM_ROOT_EXPR encodes the same probe order for bash", () => {
    expect(SHIM_ROOT_EXPR).toContain("CLAUDE_PLUGIN_ROOT");
    expect(SHIM_ROOT_EXPR).toContain(AGY_ROOT_ENV);
    expect(SHIM_ROOT_EXPR).toContain(".gemini/antigravity-cli/plugins/oh-skills");
  });
});
