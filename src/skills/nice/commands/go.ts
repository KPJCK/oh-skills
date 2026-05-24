import { readFile } from "node:fs/promises";
import { detectRepo } from "../repo.ts";
import { planPaths, listPlans } from "../plans.ts";
import { pickPlan } from "../picker.ts";
import { asSlug } from "../prompts.ts";
import { buildPlanPickerAskPayload } from "../ask-ui.ts";
import { step, success, info, hint, error, box } from "../ui.ts";
import { banner as sharedBanner } from "../../../shared/banner.ts";
import { GRADIENTS } from "../../../shared/banner-presets.ts";
import {
  emit,
  type NextAction,
  buildAgentAction,
} from "../../../shared/next-action.ts";
import { loadOhEnv } from "../../../env.ts";
import { goPrompts, goParallelPrompts } from "../prompts.ts";
import {
  parsePlan,
  validateUniqueIds,
  validateMissingFields,
  validateDependsOnExist,
  validateNoCycle,
  validateNoCreateCollisions,
  validateModifyEdgesAreOrdered,
  validateReadySetFileSafety,
  nextReadySet,
  type Dag,
} from "../dag.ts";
import { loadState, saveState, clearState } from "../go-state.ts";

type Phase = "init" | "wave-done";

type Args = {
  slug: string | undefined;
  emitAskJson: boolean;
  phase: Phase;
  done: string[];
};

function parseArgs(args: string[]): Args {
  let slug: string | undefined;
  let emitAskJson = false;
  let phase: Phase = "init";
  let done: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--slug" || a === "--plan") {
      slug = args[++i];
    } else if (a.startsWith("--slug=")) {
      slug = a.slice("--slug=".length);
    } else if (a === "--emit-ask-json") {
      emitAskJson = true;
    } else if (a.startsWith("--phase=")) {
      const v = a.slice("--phase=".length);
      if (v !== "init" && v !== "wave-done") {
        throw new Error(`unknown phase: ${v}`);
      }
      phase = v;
    } else if (a === "--done") {
      done = (args[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith("--done=")) {
      done = a.slice("--done=".length).split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return { slug, emitAskJson, phase, done };
}

const MAX_PARALLEL_DEFAULT = 3;

function maxParallel(): number {
  const env = process.env.OH_NICE_MAX_PARALLEL;
  if (!env) return MAX_PARALLEL_DEFAULT;
  const n = Number.parseInt(env, 10);
  if (Number.isNaN(n) || n < 1) return MAX_PARALLEL_DEFAULT;
  return n;
}

export async function run(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  const { repo } = await detectRepo();

  if (parsed.emitAskJson) {
    const plans = await listPlans(repo);
    const executable = plans.filter((p) => p.hasPlan);
    const payload = buildPlanPickerAskPayload(executable, "go");
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }

  const env = loadOhEnv();
  const agentName = env.CODING_AGENT?.trim() || "main Claude";
  const agentTag = `[${agentName}]`;
  sharedBanner({
    title: "[OH! >> NICE >> GO]",
    subtitle: `${repo} · ${agentTag} → execute${parsed.phase === "wave-done" ? " (wave-done)" : ""}`,
    subtitleHighlights: [agentTag],
    gradient: GRADIENTS.nice,
  });

  const slug = await resolveSlug(repo, parsed.slug);
  if (!slug) return;
  success(`selected: ${slug}`);

  const paths = planPaths(repo, slug);
  const planContent = await readFile(paths.planMd, "utf-8");
  const dag = parsePlan(planContent);

  // Detect plan shape
  const shape = classifyPlan(planContent, dag);
  if (shape === "legacy") {
    hint(`plan has no DAG fields — using sequential single-agent mode`);
    await dispatchLegacy(paths, slug, repo, env);
    return;
  }
  if (shape === "partial") {
    const taskishHeadings = (planContent.match(/^#{2,3}\s+Task\s+/gm) ?? []).length;
    await reportPartial(dag, taskishHeadings);
    process.exit(2);
  }

  // parallel plan
  if (parsed.phase === "init") {
    await runInit(repo, slug, paths, dag, env);
  } else {
    await runWaveDone(repo, slug, paths, dag, env, parsed.done);
  }
}

// ──────────────────────────────────────────────────────────────────────────────

// Classify plan shape then report partial-DAG details. Accepts the already-
// computed dag and taskishHeadings to avoid re-parsing the plan content.
async function reportPartial(dag: Dag, taskishHeadings: number): Promise<void> {
  const missing = validateMissingFields(dag);
  const unparsedCount = taskishHeadings - dag.nodes.size;
  const reasons: string[] = [];
  if (unparsedCount > 0) {
    reasons.push(
      `${unparsedCount} task heading(s) do not match the required \`### Task <id>:\` shape`,
    );
  }
  for (const m of missing) reasons.push(m);
  box(reasons.map((r) => `• ${r}`).join("\n"), {
    title: "Partial DAG plan — cannot run in parallel mode",
    color: "red",
  });
  emit("nice", [
    {
      type: "report",
      message: [
        `partial DAG plan: some tasks have Files/Depends-on, some don't.`,
        `Fix the plan so ALL tasks have DAG fields, or remove DAG fields from all tasks for legacy sequential mode.`,
      ].join("\n"),
    },
  ]);
}

async function resolveSlug(repo: string, slugArg: string | undefined): Promise<string | null> {
  step(1, 2, "pick plan");
  if (slugArg) {
    const s = asSlug(slugArg);
    info(`using --slug ${s}`);
    return s;
  }
  const plans = await listPlans(repo);
  const executable = plans.filter((p) => p.hasPlan);
  if (executable.length === 0) {
    error(
      "no plans with plan.md found for this repo",
      "run /oh-nice plan first to create one",
    );
    emit("nice", [{ type: "report", message: "no executable plans — exiting" }]);
    return null;
  }
  if (!process.stdin.isTTY) {
    error(
      "interactive plan picker requires a TTY",
      `pass --slug <slug> (or --plan <slug>). Available executable plans for ${repo}:\n         - ${executable.map((p) => p.name).join("\n         - ")}`,
    );
    process.exit(2);
  }
  const picked = await pickPlan(repo, { filter: (p) => p.hasPlan });
  if (!picked) {
    error("cancelled");
    emit("nice", [{ type: "report", message: "cancelled — no plan selected" }]);
    return null;
  }
  return picked;
}

type PlanShape = "legacy" | "partial" | "parallel";

// Heuristic to classify:
// - parallel: every "### Task " heading is parsed by parsePlan AND every parsed task has Files declared
// - legacy:   zero "### Task <id>" headings (parsePlan returns empty DAG)
// - partial:  some "## Task" or "### Task" headings exist but parsePlan didn't capture all, OR some parsed tasks lack Files
function classifyPlan(content: string, dag: Dag): PlanShape {
  // Count heading-like task lines (### Task or ## Task — common in legacy plans)
  const taskishHeadings = (content.match(/^#{2,3}\s+Task\s+/gm) ?? []).length;
  if (taskishHeadings === 0) return "legacy";
  if (dag.nodes.size === 0) return "legacy"; // headings exist but none match our DAG shape
  if (dag.nodes.size < taskishHeadings) return "partial";
  // All headings parsed. Now check missing fields.
  const missing = validateMissingFields(dag);
  if (missing.length > 0) return "partial";
  return "parallel";
}

async function dispatchLegacy(
  paths: { planMd: string; specMd: string; reviewMd: string },
  slug: string,
  repo: string,
  env: ReturnType<typeof loadOhEnv>,
): Promise<void> {
  step(2, 2, "dispatch implementer (sequential)");
  const ctx = {
    planPath: paths.planMd,
    specPath: paths.specMd,
    reviewPath: paths.reviewMd,
    repo,
    slug,
  };
  const actions: NextAction[] = [
    buildAgentAction({
      role: "coding",
      env,
      dispatchedPrompt: goPrompts.dispatched(ctx),
      selfActPrompt: goPrompts.selfAct(ctx),
    }),
    { type: "report", message: `next: /oh-nice review` },
  ];
  emit("nice", actions);
}

async function runInit(
  repo: string,
  slug: string,
  paths: { planMd: string; dir: string },
  dag: Dag,
  env: ReturnType<typeof loadOhEnv>,
): Promise<void> {
  void repo;

  // Run all DAG validators upfront — fail fast if the plan is malformed.
  const validationErrs = [
    ...validateUniqueIds(dag),
    ...validateMissingFields(dag),
    ...validateDependsOnExist(dag),
    ...validateNoCycle(dag),
    ...validateNoCreateCollisions(dag),
    ...validateModifyEdgesAreOrdered(dag),
  ];
  if (validationErrs.length > 0) {
    box(validationErrs.map((e) => `• ${e}`).join("\n"), {
      title: "DAG validation FAILED — refusing to dispatch",
      color: "red",
    });
    emit("nice", [
      {
        type: "report",
        message: `DAG validation failed. Re-run /oh-nice plan --phase=post-plan to see suggestions, or fix the plan manually.`,
      },
    ]);
    process.exit(2);
  }

  await clearState(paths.dir); // fresh init wipes any prior state
  const startedAt = new Date().toISOString();
  await saveState(paths.dir, { done: [], startedAt });

  step(2, 2, "dispatch initial wave (parallel)");
  await dispatchWave(paths, slug, dag, env, new Set());
}

async function runWaveDone(
  repo: string,
  slug: string,
  paths: { planMd: string; dir: string },
  dag: Dag,
  env: ReturnType<typeof loadOhEnv>,
  doneArg: string[],
): Promise<void> {
  void repo;

  const state = (await loadState(paths.dir)) ?? {
    done: [],
    startedAt: new Date().toISOString(),
  };
  // merge: dedupe
  const merged = new Set<string>([...state.done, ...doneArg]);
  // sanity: every id must exist in the DAG
  const unknown = [...merged].filter((id) => !dag.nodes.has(id));
  if (unknown.length > 0) {
    error(`wave-done received unknown task IDs: ${unknown.join(", ")}`);
    process.exit(2);
  }
  await saveState(paths.dir, {
    done: [...merged],
    startedAt: state.startedAt,
  });

  if (merged.size >= dag.nodes.size) {
    box(
      [
        `All ${dag.nodes.size} tasks complete.`,
        `Started: ${state.startedAt}`,
        `Finished: ${new Date().toISOString()}`,
      ].join("\n"),
      { title: "Run complete", color: "green" },
    );
    await clearState(paths.dir);
    emit("nice", [
      { type: "report", message: `all tasks complete · next: /oh-nice review` },
    ]);
    return;
  }

  step(2, 2, "dispatch next wave (parallel)");
  await dispatchWave(paths, slug, dag, env, merged);
}

async function dispatchWave(
  paths: { planMd: string; dir: string },
  slug: string,
  dag: Dag,
  env: ReturnType<typeof loadOhEnv>,
  done: Set<string>,
): Promise<void> {
  const ready = nextReadySet(dag, done);
  if (ready.length === 0) {
    error(
      "no tasks ready but not all done — DAG inconsistency",
      `done: ${[...done].join(", ")} · total: ${dag.nodes.size}`,
    );
    process.exit(2);
  }

  const cap = maxParallel();
  const batch = ready.slice(0, cap);
  const deferred = ready.slice(cap);

  // Runtime safety check: confirm the chosen batch is parallel-safe.
  const safetyErrs = validateReadySetFileSafety(batch);
  if (safetyErrs.length > 0) {
    box(safetyErrs.map((e) => `• ${e}`).join("\n"), {
      title: "Ready-set file collision — planner bug",
      color: "red",
    });
    emit("nice", [
      {
        type: "report",
        message: `internal: ready-set file safety check failed despite passing static validators. Please report this.`,
      },
    ]);
    process.exit(2);
  }

  info(`ready: ${ready.length} task(s) · dispatching ${batch.length} (cap=${cap})`);
  if (deferred.length > 0) {
    hint(`deferred to next wave: ${deferred.map((n) => n.id).join(", ")}`);
  }

  const actions: NextAction[] = [];
  for (const node of batch) {
    const files = [
      ...node.creates.map((f) => `Create: ${f}`),
      ...node.modifies.map((f) => `Modify: ${f}`),
    ];
    const ctx = { planPath: paths.planMd, taskId: node.id, files };
    actions.push(
      buildAgentAction({
        role: "coding",
        env,
        dispatchedPrompt: goParallelPrompts.dispatched(ctx),
        selfActPrompt: goParallelPrompts.selfAct(ctx),
      }),
    );
  }

  const ids = batch.map((n) => n.id).join(",");
  actions.push({
    type: "report",
    message: [
      `Dispatch the ${batch.length} agent action(s) above in parallel (single message, multiple Agent tool calls).`,
      `When all complete, re-run with their IDs:`,
      `  bun \${CLAUDE_PLUGIN_ROOT}/src/cli.ts nice go --phase=wave-done --slug ${slug} --done ${ids}`,
      `(only the IDs just completed in this wave — historical state is loaded from the sidecar)`,
      `If any agent returned HALT, re-run with only the succeeded IDs (e.g. --done <succeeded>),`,
      `then handle the failed task separately (see plan / retry).`,
    ].join("\n"),
  });

  emit("nice", actions);
}
