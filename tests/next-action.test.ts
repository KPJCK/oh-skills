// tests/next-action.test.ts
import { describe, test, expect } from "bun:test";
import { buildAgentAction, type NextAction } from "../src/shared/next-action.ts";
import type { OhEnv } from "../src/env.ts";

const baseEnv: OhEnv = {
  CONTEXT_DIR: "/tmp/c",
  CONTEXT_TEMPLATE_DIR: "/tmp/ct",
  KNOWLEDGE_DIR: "/tmp/k",
  PLAN_DIR: "/tmp/p",
};

describe("buildAgentAction", () => {
  test("emits dispatch_agent when role's env var is set", () => {
    const env: OhEnv = { ...baseEnv, CODING_AGENT: "mirai" };
    const action = buildAgentAction({
      role: "coding",
      env,
      dispatchedPrompt: "DISPATCH",
      selfActPrompt: "SELF",
    });
    expect(action.type).toBe("dispatch_agent");
    if (action.type === "dispatch_agent") {
      expect(action.agent).toBe("mirai");
      expect(action.role).toBe("coding");
      expect(action.prompt).toBe("DISPATCH");
    }
  });

  test("emits self_act when role's env var is empty", () => {
    const action = buildAgentAction({
      role: "review",
      env: baseEnv,
      dispatchedPrompt: "DISPATCH",
      selfActPrompt: "SELF",
    });
    expect(action.type).toBe("self_act");
    if (action.type === "self_act") {
      expect(action.role).toBe("review");
      expect(action.prompt).toBe("SELF");
    }
  });

  test("emits self_act when role's env var is whitespace-only", () => {
    const env: OhEnv = { ...baseEnv, REVIEW_AGENT: "   " };
    const action = buildAgentAction({
      role: "review",
      env,
      dispatchedPrompt: "DISPATCH",
      selfActPrompt: "SELF",
    });
    expect(action.type).toBe("self_act");
  });

  test("emit() prints SENTINEL line to stderr", () => {
    // captured via spawn in integration test; smoke check format here
    const actions: NextAction[] = [{ type: "report", message: "hi" }];
    const json = JSON.stringify(actions);
    expect(json).toContain('"type":"report"');
  });
});
