// src/skills/nice/prompts.ts
//
// Each builder produces TWO prompt variants:
//   - dispatched: assumes a fresh sub-agent context, no prior conversation
//   - selfAct:    assumes the main Claude conversation, may reference prior turns
//
// Structure: role → workflow → format → paths (variable content last for prefix cache)

import { input, select, confirm } from "@inquirer/prompts";

declare const __slugBrand: unique symbol;
export type Slug = string & { readonly [__slugBrand]: true };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(value: string): value is Slug {
  return SLUG_RE.test(value) && value.length >= 2 && value.length <= 64;
}

export function asSlug(value: string): Slug {
  if (!isValidSlug(value)) {
    throw new Error(
      `invalid slug: ${JSON.stringify(value)} — must be lowercase-kebab, 2-64 chars, [a-z0-9-]`,
    );
  }
  return value;
}

export async function promptSlug(opts?: {
  message?: string;
  default?: string;
}): Promise<Slug> {
  const raw = await input({
    message: opts?.message ?? "slug",
    ...(opts?.default !== undefined && { default: opts.default }),
    validate: (v) =>
      isValidSlug(v.trim()) ||
      "lowercase-kebab, 2-64 chars, [a-z0-9-] (e.g. add-auth-flow)",
  });
  return asSlug(raw.trim());
}

export { input, select, confirm };

export interface PromptContext {
  planPath: string;       // absolute path to plan.md
  specPath: string;       // absolute path to spec.md
  reviewPath: string;     // absolute path to review.md (may not exist yet for `go`)
  repo: string;
  slug: string;
  scope?: "branch" | "uncommitted" | "last-n";
  n?: number;
}

export const goPrompts = {
  dispatched(ctx: PromptContext): string {
    return [
      `Role: implementer · fresh sub-agent.`,
      ``,
      `Workflow: read plan+spec → execute one task at a time (TDD where specified)`,
      `→ mark checkboxes + commit after each task → STOP if ambiguous.`,
      `Scope: plan only. No scope creep.`,
      ``,
      `Plan: ${ctx.planPath}`,
      `Spec: ${ctx.specPath}`,
    ].join("\n");
  },

  selfAct(ctx: PromptContext): string {
    return [
      `Act as implementer. One task at a time, TDD where specified.`,
      `Mark plan.md checkboxes + commit per task. Ask if ambiguous.`,
      ``,
      `Plan: ${ctx.planPath}`,
      `Spec: ${ctx.specPath}`,
    ].join("\n");
  },
};

export const reviewPrompts = {
  dispatched(ctx: PromptContext): string {
    const scopeLine =
      ctx.scope === "branch"
        ? `scope: branch vs origin/main`
        : ctx.scope === "uncommitted"
          ? `scope: uncommitted working-tree`
          : ctx.scope === "last-n"
            ? `scope: last ${ctx.n ?? 1} commit(s)`
            : `scope: full branch`;
    return [
      `Role: strict code reviewer · fresh sub-agent.`,
      ``,
      `Workflow: read plan+spec → review code → for each finding quote file:line,`,
      `state what's wrong (cite plan/spec), format as \`- [ ] **finding** — Suggested fix: ...\``,
      `→ append to review.md as \`## Round N — YYYY-MM-DD\`. Do not modify code.`,
      ``,
      `${scopeLine}`,
      ``,
      `Plan: ${ctx.planPath}`,
      `Spec: ${ctx.specPath}`,
      `Review: ${ctx.reviewPath}`,
    ].join("\n");
  },

  selfAct(ctx: PromptContext): string {
    const scopeLine =
      ctx.scope === "branch"
        ? `scope: branch vs origin/main`
        : ctx.scope === "uncommitted"
          ? `scope: uncommitted working-tree`
          : ctx.scope === "last-n"
            ? `scope: last ${ctx.n ?? 1} commit(s)`
            : `scope: full branch`;
    return [
      `Switch hats: act as reviewer. Each finding: \`- [ ] **finding** — Suggested fix: ...\``,
      `Append as \`## Round N — YYYY-MM-DD\`. Do NOT modify code.`,
      ``,
      `${scopeLine}`,
      ``,
      `Plan: ${ctx.planPath}`,
      `Spec: ${ctx.specPath}`,
      `Review: ${ctx.reviewPath}`,
    ].join("\n");
  },
};

export type DoImplementContext = {
  request: string;
};

export type DoReviewContext = {
  request: string;
  reviewTmp: string;
};

export type DoFixContext = {
  request: string;
  findings: string;
};

export const doPrompts = {
  implement: {
    dispatched(ctx: DoImplementContext): string {
      return [
        `Role: implementer · fresh sub-agent · no plan file.`,
        ``,
        `Workflow: read cwd → infer scope → make changes → commit per logical chunk.`,
        `Ambiguous scope: STOP and ask. No scope creep.`,
        ``,
        `Task: ${ctx.request}`,
      ].join("\n");
    },

    selfAct(ctx: DoImplementContext): string {
      return [
        `Act as implementer (no plan file). Infer scope, make changes, commit per chunk.`,
        `Stop if ambiguous.`,
        ``,
        `Task: ${ctx.request}`,
      ].join("\n");
    },
  },

  reviewQuick: {
    dispatched(ctx: DoReviewContext): string {
      return [
        `Role: strict code reviewer · fresh sub-agent.`,
        ``,
        `Workflow: \`git diff origin/main..HEAD\` + uncommitted → judge vs original ask`,
        `→ each finding: \`- [ ] **finding** — Suggested fix: ...\` → write to review file.`,
        `No findings: write literal \`NO_FINDINGS\`. Do NOT modify source code.`,
        ``,
        `scope: branch vs origin/main + uncommitted`,
        ``,
        `Ask: ${ctx.request}`,
        `Review file: ${ctx.reviewTmp}`,
      ].join("\n");
    },

    selfAct(ctx: DoReviewContext): string {
      return [
        `Switch hats: reviewer for changes just made.`,
        `Each finding: \`- [ ] **finding** — Suggested fix: ...\``,
        `No findings: write \`NO_FINDINGS\`. Do NOT modify source code.`,
        ``,
        `scope: branch vs origin/main + uncommitted`,
        ``,
        `Ask: ${ctx.request}`,
        `Write findings to: ${ctx.reviewTmp}`,
      ].join("\n");
    },
  },

  fixQuick: {
    dispatched(ctx: DoFixContext): string {
      return [
        `Role: fix-implementer · fresh sub-agent · transient pass.`,
        ``,
        `For each unchecked \`- [ ]\` finding: apply suggested fix, commit per fix or grouped.`,
        `No status tags needed.`,
        ``,
        `Ask: ${ctx.request}`,
        ``,
        `Findings:`,
        ctx.findings,
      ].join("\n");
    },

    selfAct(ctx: DoFixContext): string {
      return [
        `Apply review findings for: ${ctx.request}`,
        `Each unchecked \`- [ ]\`: apply fix and commit.`,
        ``,
        `Findings:`,
        ctx.findings,
      ].join("\n");
    },
  },
};

export type GoParallelContext = {
  planPath: string;
  taskId: string;
  files: string[]; // verbatim list, already "Create: ..." / "Modify: ..." formatted
};

export const goParallelPrompts = {
  dispatched(ctx: GoParallelContext): string {
    return [
      `Role: implementer (one task of a parallel batch) · fresh sub-agent.`,
      ``,
      `You are implementing ONE task from a plan that is being executed by parallel`,
      `agents. Other agents are running siblings of your task concurrently.`,
      ``,
      `Plan: ${ctx.planPath}`,
      `Your task ID: ${ctx.taskId}`,
      ``,
      `Read the plan; find your task block; implement only its steps.`,
      ``,
      `HARD CONSTRAINTS:`,
      `- You may ONLY create/modify these files:`,
      ...ctx.files.map((f) => `    ${f}`),
      `- You may NOT touch any other file. If you discover you need to, halt and`,
      `  report rather than expanding scope silently.`,
      `- Commit your work when done.`,
      ``,
      `Return: "DONE ${ctx.taskId} @ <commit-sha>" on success, or`,
      `"HALT ${ctx.taskId}: <reason>" if you cannot proceed.`,
    ].join("\n");
  },

  selfAct(ctx: GoParallelContext): string {
    return [
      `Act as implementer for ONE task (parallel batch context).`,
      `Plan: ${ctx.planPath}`,
      `Task: ${ctx.taskId}`,
      ``,
      `Allowed files (do NOT touch others):`,
      ...ctx.files.map((f) => `  ${f}`),
      ``,
      `Implement the task's steps; commit; report "DONE ${ctx.taskId} @ <sha>" or "HALT ${ctx.taskId}: <reason>".`,
    ].join("\n");
  },
};

export const fixPrompts = {
  dispatched(ctx: PromptContext): string {
    return [
      `Role: fix-implementer · fresh sub-agent.`,
      ``,
      `Workflow: open latest \`## Round N\` in review.md → for each unchecked finding:`,
      `apply fix (or tag) → flip to \`- [x]\` → append status tag`,
      `(\`fixed:\` / \`wont-fix:\` / \`reviewer-wrong:\` / \`not-applicable:\` / \`deferred:\`)`,
      `→ commit per finding (or grouped).`,
      ``,
      `Plan: ${ctx.planPath}`,
      `Review: ${ctx.reviewPath}`,
    ].join("\n");
  },

  selfAct(ctx: PromptContext): string {
    return [
      `Apply latest review round. Each unchecked finding: fix (or tag), flip to \`- [x]\`,`,
      `append status tag (fixed / wont-fix / reviewer-wrong / not-applicable / deferred).`,
      ``,
      `Plan: ${ctx.planPath}`,
      `Review: ${ctx.reviewPath}`,
    ].join("\n");
  },
};
