// tests/host-detection.test.ts
import { describe, it, expect } from "bun:test";
import { detectHost } from "../src/env";

describe("detectHost", () => {
  it("claude when CLAUDE_PLUGIN_ROOT set", () => {
    expect(detectHost({ CLAUDE_PLUGIN_ROOT: "/x" })).toBe("claude");
  });
  it("claude when CLAUDECODE set", () => {
    expect(detectHost({ CLAUDECODE: "1" })).toBe("claude");
  });
  it("agy when ANTIGRAVITY_AGENT set", () => {
    expect(detectHost({ ANTIGRAVITY_AGENT: "1" })).toBe("agy");
  });
  it("agy when ANTIGRAVITY_CONVERSATION_ID set", () => {
    expect(detectHost({ ANTIGRAVITY_CONVERSATION_ID: "abc" })).toBe("agy");
  });
  it("unknown otherwise", () => {
    expect(detectHost({})).toBe("unknown");
  });
});
