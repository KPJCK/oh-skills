// src/skills/nice/prompts.ts
//
// Each builder produces TWO prompt variants:
//   - dispatched: assumes a fresh sub-agent context, no prior conversation
//   - selfAct:    assumes the main Claude conversation, may reference prior turns
//
// Selection happens at next-action emit time via buildAgentAction(...).

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
      `You are a focused implementer dispatched as a fresh sub-agent.`,
      ``,
      `**Plan:** ${ctx.planPath}`,
      `**Spec:** ${ctx.specPath}`,
      ``,
      `Workflow:`,
      `1. Read the plan and spec in full.`,
      `2. Execute the plan one task at a time, following TDD where it specifies tests.`,
      `3. After each task, mark its checkboxes as completed in plan.md and commit.`,
      `4. If a step fails or is ambiguous, STOP and report back — do not improvise.`,
      ``,
      `Implement only what the plan asks for. No scope creep.`,
    ].join("\n");
  },

  selfAct(ctx: PromptContext): string {
    return [
      `Switch hats: act as the implementer for the plan at:`,
      `  ${ctx.planPath}`,
      ``,
      `Spec: ${ctx.specPath}`,
      ``,
      `Execute the plan directly in this conversation. One task at a time, TDD where specified.`,
      `Update plan.md checkboxes as you go and commit per task. Stop and ask if a step is ambiguous.`,
    ].join("\n");
  },
};

export const reviewPrompts = {
  dispatched(ctx: PromptContext): string {
    const scopeLine =
      ctx.scope === "branch"
        ? `Scope: all changes on the current branch since main.`
        : ctx.scope === "uncommitted"
          ? `Scope: only uncommitted working-tree changes.`
          : ctx.scope === "last-n"
            ? `Scope: the last ${ctx.n ?? 1} commit(s).`
            : `Scope: full branch.`;
    return [
      `You are a strict code reviewer with NO prior context for this work.`,
      ``,
      `**Plan:** ${ctx.planPath}`,
      `**Spec:** ${ctx.specPath}`,
      `**Review file:** ${ctx.reviewPath}  (append as ## Round N — YYYY-MM-DD)`,
      ``,
      scopeLine,
      ``,
      `For each finding:`,
      `- Quote the offending code with file:line.`,
      `- State what's wrong and why (cite the plan/spec where it diverges).`,
      `- Format as a checkbox: \`- [ ] **finding** — Suggested fix: ...\``,
      ``,
      `Be specific. Be honest. Be terse. Append to review.md; do not modify code.`,
    ].join("\n");
  },

  selfAct(ctx: PromptContext): string {
    const scopeLine =
      ctx.scope === "branch"
        ? `Scope: all changes on the current branch since main.`
        : ctx.scope === "uncommitted"
          ? `Scope: only uncommitted working-tree changes.`
          : ctx.scope === "last-n"
            ? `Scope: the last ${ctx.n ?? 1} commit(s).`
            : `Scope: full branch.`;
    return [
      `Switch hats and act as the reviewer for code you (or a prior turn) wrote in this conversation.`,
      ``,
      `Plan: ${ctx.planPath}`,
      `Spec: ${ctx.specPath}`,
      `Append findings to: ${ctx.reviewPath}  (## Round N — YYYY-MM-DD)`,
      ``,
      scopeLine,
      ``,
      `Be honest about regressions even though you wrote the code. Format each finding as a checkbox`,
      `\`- [ ] **finding** — Suggested fix: ...\`. Do NOT modify code in this turn — only write review.md.`,
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
        `You are a focused implementer dispatched as a fresh sub-agent.`,
        ``,
        `**Task:** ${ctx.request}`,
        ``,
        `No plan file exists for this task. Workflow:`,
        `1. Read the cwd, understand the codebase structure, and infer scope from the request.`,
        `2. Make the changes needed to fulfil the request.`,
        `3. Commit per logical chunk with meaningful commit messages.`,
        `4. If scope is ambiguous, STOP and ask before proceeding. Do not improvise beyond the ask.`,
        ``,
        `Implement only what was asked. No scope creep.`,
      ].join("\n");
    },

    selfAct(ctx: DoImplementContext): string {
      return [
        `Switch hats: act as the implementer for this task:`,
        `  ${ctx.request}`,
        ``,
        `No plan file — read the cwd, infer scope from the request, make changes, commit per logical chunk.`,
        `Stop and ask if scope is ambiguous.`,
      ].join("\n");
    },
  },

  reviewQuick: {
    dispatched(ctx: DoReviewContext): string {
      return [
        `You are a strict code reviewer with NO prior context for this work.`,
        ``,
        `**Original ask:** ${ctx.request}`,
        `**Review output file:** ${ctx.reviewTmp}`,
        ``,
        `Scope: all changes on the current branch vs origin/main, plus any uncommitted changes.`,
        ``,
        `Instructions:`,
        `1. Run \`git diff origin/main..HEAD\` and check uncommitted changes.`,
        `2. Judge the changes strictly against the original ask above.`,
        `3. For each finding, write a line to ${ctx.reviewTmp}:`,
        `   \`- [ ] **finding** — Suggested fix: ...\``,
        `4. If there are no findings, write the literal line \`NO_FINDINGS\` to that file.`,
        `5. Do NOT modify any source code. Write only to ${ctx.reviewTmp}.`,
        ``,
        `Be specific. Be honest. Be terse.`,
      ].join("\n");
    },

    selfAct(ctx: DoReviewContext): string {
      return [
        `Switch hats and act as the reviewer for the changes just made.`,
        ``,
        `Original ask: ${ctx.request}`,
        `Write your findings to: ${ctx.reviewTmp}`,
        ``,
        `Scope: branch vs origin/main + uncommitted changes.`,
        ``,
        `For each finding: \`- [ ] **finding** — Suggested fix: ...\``,
        `If clean: write the literal line \`NO_FINDINGS\` to that file.`,
        `Do NOT modify source code in this step — only write to the review file.`,
      ].join("\n");
    },
  },

  fixQuick: {
    dispatched(ctx: DoFixContext): string {
      return [
        `You are a fix-implementer dispatched as a fresh sub-agent.`,
        ``,
        `**Original ask:** ${ctx.request}`,
        ``,
        `**Review findings (raw):**`,
        ctx.findings,
        ``,
        `For each unchecked \`- [ ]\` line above, apply the suggested fix.`,
        `Commit per fix or grouped logically.`,
        `This is a transient fix pass — no status tags needed.`,
      ].join("\n");
    },

    selfAct(ctx: DoFixContext): string {
      return [
        `Apply the review findings for the original ask: ${ctx.request}`,
        ``,
        `Findings:`,
        ctx.findings,
        ``,
        `For each unchecked \`- [ ]\` line, apply the suggested fix and commit.`,
      ].join("\n");
    },
  },
};

export const fixPrompts = {
  dispatched(ctx: PromptContext): string {
    return [
      `You are a fix-implementer dispatched as a fresh sub-agent.`,
      ``,
      `**Plan:** ${ctx.planPath}`,
      `**Review:** ${ctx.reviewPath}`,
      ``,
      `Open the latest \`## Round N\` section in review.md. For each unchecked finding:`,
      `1. Apply the fix (or decide not to and tag accordingly).`,
      `2. Flip the checkbox to \`- [x]\` and append a status tag at the end of the line:`,
      `   - \`fixed: <one-line summary>\``,
      `   - \`wont-fix: <reason>\``,
      `   - \`reviewer-wrong: <why>\``,
      `   - \`not-applicable: <why>\``,
      `   - \`deferred: <where it's tracked>\``,
      `3. Commit per finding (or grouped logically).`,
    ].join("\n");
  },

  selfAct(ctx: PromptContext): string {
    return [
      `Apply the latest review round's findings at:`,
      `  ${ctx.reviewPath}`,
      ``,
      `Plan: ${ctx.planPath}`,
      ``,
      `For each unchecked finding in the latest \`## Round N\` section, fix it (or tag it), flip the`,
      `checkbox to \`- [x]\`, and append a status tag (fixed / wont-fix / reviewer-wrong / not-applicable / deferred).`,
    ].join("\n");
  },
};
