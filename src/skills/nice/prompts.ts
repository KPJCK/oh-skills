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
