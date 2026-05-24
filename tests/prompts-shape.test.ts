// tests/prompts-shape.test.ts
//
// Locks the cache-friendly prompt shape: stable role+workflow content FIRST,
// variable paths/requests LAST. This fires before T1's slim so it acts as the
// regression guard during refactor.

import { describe, test, expect } from "bun:test";
import { goPrompts, reviewPrompts, fixPrompts, doPrompts } from "../src/skills/nice/prompts.ts";

const GO_CTX = {
  planPath: "/plans/test/plan.md",
  specPath: "/plans/test/spec.md",
  reviewPath: "/plans/test/review.md",
  repo: "my-repo",
  slug: "my-slug",
};

const DO_IMPL_CTX = { request: "add a feature" };
const DO_REVIEW_CTX = { request: "add a feature", reviewTmp: "/tmp/review.md" };
const DO_FIX_CTX = { request: "add a feature", findings: "- [ ] **bug** — Suggested fix: fix it" };

describe("prompt shape — cache-friendly (stable first, variable last)", () => {
  test("goPrompts.dispatched — role+workflow in first 200 chars, paths in last 200", () => {
    const p = goPrompts.dispatched(GO_CTX);
    const head = p.slice(0, 200);
    const tail = p.slice(-200);
    // stable: implementer role keyword
    expect(head).toContain("implement");
    // stable: TDD line
    expect(p).toContain("TDD");
    // variable: plan path in tail
    expect(tail).toContain(GO_CTX.planPath);
  });

  test("goPrompts.selfAct — paths in last 200 chars", () => {
    const p = goPrompts.selfAct(GO_CTX);
    const tail = p.slice(-200);
    expect(tail).toContain(GO_CTX.planPath);
  });

  test("reviewPrompts.dispatched — role in first 200, review path in last 200", () => {
    const p = reviewPrompts.dispatched(GO_CTX);
    const head = p.slice(0, 200);
    const tail = p.slice(-200);
    expect(head).toContain("review");
    expect(tail).toContain(GO_CTX.reviewPath);
  });

  test("fixPrompts.dispatched — role in first 200, plan+review paths in last 200", () => {
    const p = fixPrompts.dispatched(GO_CTX);
    const head = p.slice(0, 200);
    const tail = p.slice(-200);
    expect(head).toContain("fix");
    expect(tail).toContain(GO_CTX.planPath);
  });

  test("doPrompts.implement.dispatched — role in first 200, request in last 200", () => {
    const p = doPrompts.implement.dispatched(DO_IMPL_CTX);
    const head = p.slice(0, 200);
    const tail = p.slice(-200);
    expect(head).toContain("implement");
    expect(tail).toContain(DO_IMPL_CTX.request);
  });

  test("doPrompts.reviewQuick.dispatched — role in first 200, request+reviewTmp in last 200", () => {
    const p = doPrompts.reviewQuick.dispatched(DO_REVIEW_CTX);
    const head = p.slice(0, 200);
    const tail = p.slice(-200);
    expect(head).toContain("review");
    expect(tail).toContain(DO_REVIEW_CTX.reviewTmp);
  });

  test("doPrompts.fixQuick.dispatched — role in first 200, request+findings in last 200", () => {
    const p = doPrompts.fixQuick.dispatched(DO_FIX_CTX);
    const head = p.slice(0, 200);
    const tail = p.slice(-200);
    expect(head).toContain("fix");
    expect(tail).toContain(DO_FIX_CTX.request);
    expect(tail).toContain(DO_FIX_CTX.findings);
  });
});
