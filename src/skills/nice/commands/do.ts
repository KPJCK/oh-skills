// src/skills/nice/commands/do.ts
//
// oh-nice do — JFDI mode: implement → review → fix without spec.md/plan.md/review.md artifacts.
//
// Three phases driven by --phase, mirroring the plan/update-plan state machine.
// No PLAN_DIR/<repo>/<slug>/ directory is created. Review findings are persisted
// to an OS tmp file between phases 2 and 3, then deleted.

import { unlink } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { detectRepo } from "../repo.ts";
import { step, success, info, hint, error, c } from "../ui.ts";
import { banner as sharedBanner } from "../../../shared/banner.ts";
import { GRADIENTS } from "../../../shared/banner-presets.ts";
import { emit, type NextAction, buildAgentAction } from "../../../shared/next-action.ts";
import { loadOhEnv } from "../../../env.ts";
import { doPrompts } from "../prompts.ts";

// silence unused
void c;

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type DoPhase = "init" | "post-implement" | "post-review";

export type DoArgs = {
  phase: DoPhase;
  request: string;
  noReview: boolean;
  noFix: boolean;
  reviewTmp: string | undefined;
};

// ──────────────────────────────────────────────────────────────────────────────
// Arg parser — exported for unit tests
// ──────────────────────────────────────────────────────────────────────────────

export function parseDoArgs(args: string[]): DoArgs {
  let phase: DoPhase = "init";
  let request: string | undefined;
  let noReview = false;
  let noFix = false;
  let reviewTmp: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--phase=")) {
      phase = a.slice("--phase=".length) as DoPhase;
    } else if (a === "--phase") {
      phase = (args[++i] ?? "") as DoPhase;
    } else if (a.startsWith("--request=")) {
      request = a.slice("--request=".length);
    } else if (a === "--request") {
      request = args[++i] ?? "";
    } else if (a.startsWith("--review-tmp=")) {
      reviewTmp = a.slice("--review-tmp=".length);
    } else if (a === "--review-tmp") {
      reviewTmp = args[++i] ?? "";
    } else if (a === "--no-review") {
      noReview = true;
      noFix = true; // --no-review implies --no-fix
    } else if (a === "--no-fix") {
      noFix = true;
    } else if (a.startsWith("-")) {
      throw new Error(`unknown flag: ${a}`);
    } else {
      positional.push(a);
    }
  }

  // For init phase, positional args are the request; for other phases --request is required.
  const resolvedRequest = request ?? positional.join(" ");

  // Validate post-review requires --review-tmp
  if (phase === "post-review" && !reviewTmp) {
    throw new Error(`--review-tmp is required for --phase=post-review`);
  }

  return { phase, request: resolvedRequest, noReview, noFix, reviewTmp };
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase: init
// ──────────────────────────────────────────────────────────────────────────────

async function runInit(args: DoArgs): Promise<void> {
  const { repo } = await detectRepo();
  const env = loadOhEnv();
  const agentName = env.CODING_AGENT?.trim() || "main Claude";
  const agentTag = `[${agentName}]`;

  sharedBanner({
    title: "[OH! >> NICE >> DO]",
    subtitle: `Repo: ${repo}  •  ${agentTag} will implement`,
    subtitleHighlights: [agentTag],
    gradient: GRADIENTS.nice,
  });

  step(1, args.noReview ? 1 : 2, "Dispatching implementer");
  if (args.request) {
    info(`request: ${args.request}`);
  } else {
    hint("no request provided — implementer will read context and ask");
  }

  const actions: NextAction[] = [
    buildAgentAction({
      role: "coding",
      env,
      dispatchedPrompt: doPrompts.implement.dispatched({ request: args.request }),
      selfActPrompt: doPrompts.implement.selfAct({ request: args.request }),
    }),
  ];

  if (args.noReview) {
    actions.push({
      type: "report",
      message: "Implementation dispatched. Review skipped (--no-review). done.",
    });
  } else {
    const escapedRequest = args.request.replace(/'/g, "'\\''");
    const noFixFlag = args.noFix ? " --no-fix" : "";
    actions.push({
      type: "report",
      message: `After the implementer returns, run:\n  bun \${CLAUDE_PLUGIN_ROOT}/src/cli.ts nice do --phase=post-implement --request '${escapedRequest}'${noFixFlag}`,
    });
  }

  success("implement dispatch emitted");
  emit("nice", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase: post-implement
// ──────────────────────────────────────────────────────────────────────────────

async function runPostImplement(args: DoArgs): Promise<void> {
  const { repo } = await detectRepo();
  const env = loadOhEnv();
  const agentName = env.REVIEW_AGENT?.trim() || "main Claude";
  const agentTag = `[${agentName}]`;

  sharedBanner({
    title: "[OH! >> NICE >> DO >> REVIEW]",
    subtitle: `Repo: ${repo}  •  ${agentTag} will review`,
    subtitleHighlights: [agentTag],
    gradient: GRADIENTS.nice,
  });

  step(1, args.noFix ? 1 : 2, "Dispatching reviewer");
  info(`request: ${args.request}`);

  // Generate a unique tmp path for the review findings
  const reviewId = crypto.randomUUID().slice(0, 8);
  const reviewTmp = `${os.tmpdir()}/oh-do-${reviewId}-review.md`;
  hint(`review findings will be written to: ${reviewTmp}`);

  const actions: NextAction[] = [
    buildAgentAction({
      role: "review",
      env,
      dispatchedPrompt: doPrompts.reviewQuick.dispatched({ request: args.request, reviewTmp }),
      selfActPrompt: doPrompts.reviewQuick.selfAct({ request: args.request, reviewTmp }),
    }),
  ];

  if (args.noFix) {
    actions.push({
      type: "report",
      message: `review-only mode — findings at ${reviewTmp} (--no-fix; no post-review run)`,
    });
  } else {
    const escapedRequest = args.request.replace(/'/g, "'\\''");
    actions.push({
      type: "report",
      message: `After the reviewer returns, run:\n  bun \${CLAUDE_PLUGIN_ROOT}/src/cli.ts nice do --phase=post-review --request '${escapedRequest}' --review-tmp ${reviewTmp}`,
    });
  }

  success("review dispatch emitted");
  emit("nice", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase: post-review
// ──────────────────────────────────────────────────────────────────────────────

async function runPostReview(args: DoArgs): Promise<void> {
  const reviewTmp = args.reviewTmp!; // validated non-null in parseDoArgs

  const { repo } = await detectRepo();
  const env = loadOhEnv();

  sharedBanner({
    title: "[OH! >> NICE >> DO >> FIX]",
    subtitle: `Repo: ${repo}  •  reading review findings`,
    gradient: GRADIENTS.nice,
  });

  step(1, 2, "Reading review findings");
  info(`review file: ${reviewTmp}`);

  // Read the review tmp file
  if (!existsSync(reviewTmp)) {
    error(`review tmp file not found: ${reviewTmp}`, "the reviewer may not have written findings yet");
    process.exit(1);
  }

  const findings = readFileSync(reviewTmp, "utf-8").trim();
  const hasUnchecked = /^\s*-\s+\[ \]/m.test(findings);
  const isNoFindings = findings === "NO_FINDINGS" || !hasUnchecked;

  if (isNoFindings) {
    step(2, 2, "No issues found — cleaning up");
    hint("review was clean — skipping fix dispatch");
    // Delete the tmp file
    await unlink(reviewTmp).catch(() => {});
    emit("nice", [
      {
        type: "report",
        message: "no issues found — do cycle complete. Clean review!",
      },
    ]);
    return;
  }

  step(2, 2, "Dispatching fix implementer");
  const agentName = env.CODING_AGENT?.trim() || "main Claude";
  const agentTag = `[${agentName}]`;
  info(`${agentTag} will apply ${(findings.match(/^\s*-\s+\[ \]/gm) ?? []).length} finding(s)`);

  // Delete the tmp file before dispatch (agent gets findings inlined in prompt)
  await unlink(reviewTmp).catch(() => {});
  success("review tmp file removed");

  const actions: NextAction[] = [
    buildAgentAction({
      role: "coding",
      env,
      dispatchedPrompt: doPrompts.fixQuick.dispatched({ request: args.request, findings }),
      selfActPrompt: doPrompts.fixQuick.selfAct({ request: args.request, findings }),
    }),
    {
      type: "report",
      message: "do cycle complete — implement → review → fix all done.",
    },
  ];
  emit("nice", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────────────────

export async function run(args: string[]): Promise<void> {
  let parsed: DoArgs;
  try {
    parsed = parseDoArgs(args);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  switch (parsed.phase) {
    case "init":
      await runInit(parsed);
      break;
    case "post-implement":
      await runPostImplement(parsed);
      break;
    case "post-review":
      await runPostReview(parsed);
      break;
    default: {
      error(`unknown phase: ${(parsed as { phase: string }).phase}`, `expected: init | post-implement | post-review`);
      process.exit(2);
    }
  }
}
