/**
 * Build ready-to-execute AskUserQuestion payloads for the oh-nice pickers.
 * Same constraints as oh-context: 1-4 questions × 2-4 options = 16 max.
 *
 * Builders:
 *   - buildPlanPickerAskPayload  (single-select plan picker for go/review/fix)
 *   - buildScopePickerAskPayload (fixed 3-option scope picker for review)
 */

import type { PlanInfo } from "./plans.ts";

export type AskOption = {
  label: string;
  description: string;
};

export type AskQuestion = {
  question: string;
  header: string;
  multiSelect: boolean;
  options: AskOption[];
};

export type AskPayload = {
  questions: AskQuestion[];
  next: string;
  autoPick?: string[];
  tooManyForUI?: boolean;
  plainText?: string;
};

const MAX_OPTIONS_PER_QUESTION = 4;
const MIN_OPTIONS_PER_QUESTION = 2;
const MAX_QUESTIONS_PER_CALL = 4;
const MAX_TOTAL_OPTIONS = MAX_OPTIONS_PER_QUESTION * MAX_QUESTIONS_PER_CALL; // 16

export type Subcommand = "go" | "review" | "fix" | "update-plan";

const SUBCOMMAND_FLAG: Record<Subcommand, string> = {
  go: "--slug",
  review: "--plan",
  fix: "--plan",
  "update-plan": "--slug",
};

export function buildPlanPickerAskPayload(
  plans: readonly PlanInfo[],
  subcommand: Subcommand,
): AskPayload {
  const flag = SUBCOMMAND_FLAG[subcommand];
  const nextTemplate = `bun src/cli.ts nice ${subcommand} ${flag} "<plan name>"`;

  if (plans.length === 0) {
    return {
      questions: [],
      next: `(no plans available — run /oh-nice plan first)`,
    };
  }

  if (plans.length === 1) {
    const only = plans[0]!;
    return {
      questions: [],
      next: `bun src/cli.ts nice ${subcommand} ${flag} "${only.name}"`,
      autoPick: [only.name],
    };
  }

  if (plans.length > MAX_TOTAL_OPTIONS) {
    const numbered = plans
      .map((p, i) => {
        const flags = [
          p.hasPlan ? "plan" : "",
          p.hasReview ? "review" : "",
          p.hasSpec ? "spec" : "",
        ]
          .filter(Boolean)
          .join("+");
        return `${i + 1}. ${p.name}  (${flags})  ${p.mtime.toISOString().slice(0, 10)}`;
      })
      .join("\n");
    return {
      questions: [],
      next: nextTemplate,
      tooManyForUI: true,
      plainText: numbered,
    };
  }

  // 2-16 plans: chunk into balanced groups
  const chunks = chunkBalanced([...plans]);

  const questions: AskQuestion[] = chunks.map((chunk, idx) => ({
    question:
      chunks.length === 1
        ? `Which plan should I ${subcommand}?`
        : `Which plan? (group ${idx + 1} of ${chunks.length})`,
    header: chunks.length === 1 ? "Plan" : `Plan ${idx + 1}/${chunks.length}`,
    multiSelect: false,
    options: chunk.map((p) => ({
      label: p.name,
      description: describePlan(p),
    })),
  }));

  return { questions, next: nextTemplate };
}

function describePlan(p: PlanInfo): string {
  const parts: string[] = [];
  const flags = [
    p.hasPlan ? "plan" : "",
    p.hasReview ? "review" : "",
    p.hasSpec ? "spec" : "",
  ]
    .filter(Boolean)
    .join("+");
  if (flags) parts.push(flags);
  parts.push(p.mtime.toISOString().slice(0, 10));
  return parts.join(" · ");
}

export function buildScopePickerAskPayload(): AskPayload {
  return {
    questions: [
      {
        question: "Review scope?",
        header: "Scope",
        multiSelect: false,
        options: [
          { label: "branch", description: "Whole branch vs origin/main (default)" },
          { label: "uncommitted", description: "Working tree + staged changes" },
          { label: "last-n", description: "Last N commits (Claude will ask N separately)" },
        ],
      },
    ],
    next: `bun src/cli.ts nice review --plan <slug> --scope <branch|uncommitted|last-n> [--n <N>]`,
  };
}

export function chunkBalanced<T>(items: T[]): T[][] {
  const n = items.length;
  if (n <= MAX_OPTIONS_PER_QUESTION) return [items];

  const chunks: T[][] = [];
  for (let i = 0; i < n; i += MAX_OPTIONS_PER_QUESTION) {
    chunks.push(items.slice(i, i + MAX_OPTIONS_PER_QUESTION));
  }

  while (chunks.length > 1) {
    const last = chunks[chunks.length - 1]!;
    if (last.length >= MIN_OPTIONS_PER_QUESTION) break;
    const donor = chunks[chunks.length - 2]!;
    if (donor.length <= MIN_OPTIONS_PER_QUESTION) break;
    last.unshift(donor.pop()!);
  }

  return chunks;
}
