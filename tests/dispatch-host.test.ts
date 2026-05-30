// tests/dispatch-host.test.ts
import { describe, it, expect } from "bun:test";
import { resolveAgent } from "../src/env";
import { buildAgentAction } from "../src/shared/next-action";
import type { OhEnv } from "../src/env";

const env: OhEnv = {
  CONTEXT_DIR: "",
  CONTEXT_TEMPLATE_DIR: "",
  KNOWLEDGE_DIR: "",
  PLAN_DIR: "",
  CODING_AGENT: "mirai",
  REVIEW_AGENT: "yama",
  RESEARCH_AGENT: "rudy",
};

describe("host-aware resolveAgent", () => {
  it("returns the named agent on claude", () => {
    expect(resolveAgent("coding", env, "claude")).toBe("mirai");
  });
  it("returns null on agy (dynamic subagents)", () => {
    expect(resolveAgent("coding", env, "agy")).toBeNull();
  });
  it("returns null on codex (no named subagents)", () => {
    expect(resolveAgent("coding", env, "codex")).toBeNull();
  });
  it("returns null on unknown host", () => {
    expect(resolveAgent("coding", env, "unknown")).toBeNull();
  });
});

describe("buildAgentAction respects host", () => {
  it("dispatch_agent on claude", () => {
    const a = buildAgentAction({
      role: "review",
      env,
      host: "claude",
      dispatchedPrompt: "d",
      selfActPrompt: "s",
    });
    expect(a.type).toBe("dispatch_agent");
  });
  it("self_act on agy", () => {
    const a = buildAgentAction({
      role: "review",
      env,
      host: "agy",
      dispatchedPrompt: "d",
      selfActPrompt: "s",
    });
    expect(a.type).toBe("self_act");
  });
  it("self_act on codex", () => {
    const a = buildAgentAction({
      role: "review",
      env,
      host: "codex",
      dispatchedPrompt: "d",
      selfActPrompt: "s",
    });
    expect(a.type).toBe("self_act");
  });
});
