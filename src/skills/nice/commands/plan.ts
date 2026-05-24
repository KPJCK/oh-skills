import { rename, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { detectRepo } from "../repo";
import { createPlanDir, planPaths } from "../plans";
import { promptSlug, asSlug } from "../prompts";
import { step, success, info, hint, box } from "../ui";
import { banner as sharedBanner } from "../../../shared/banner";
import { GRADIENTS } from "../../../shared/banner-presets";
import { emit, buildAgentAction, type NextAction } from "../../../shared/next-action";
import { loadOhEnv } from "../../../env";
import {
  parsePlan,
  validateUniqueIds,
  validateMissingFields,
  validateDependsOnExist,
  validateNoCycle,
  validateNoCreateCollisions,
  validateModifyEdgesAreOrdered,
  nextReadySet,
  type Dag,
} from "../dag";

const CLI = "${CLAUDE_PLUGIN_ROOT}/src/cli.ts";

export type SourceMode = "knowledge" | "online" | "auto";
const VALID_SOURCES: SourceMode[] = ["knowledge", "online", "auto"];

export function isSourceMode(v: string): v is SourceMode {
  return v === "knowledge" || v === "online" || v === "auto";
}

type Phase = "init" | "post-brainstorm" | "research-go" | "write-plan" | "post-plan";

type Args = {
  phase: Phase;
  rest: string[];
};

function parseArgs(args: string[]): Args {
  let phase: Phase = "init";
  const rest: string[] = [];
  for (const a of args) {
    if (a.startsWith("--phase=")) {
      const v = a.slice("--phase=".length);
      if (
        v === "init" ||
        v === "post-brainstorm" ||
        v === "research-go" ||
        v === "write-plan" ||
        v === "post-plan"
      ) {
        phase = v as Phase;
      } else {
        throw new Error(`unknown phase: ${v}`);
      }
    } else {
      rest.push(a);
    }
  }
  return { phase, rest };
}

export async function run(args: string[]): Promise<void> {
  const { phase, rest } = parseArgs(args);
  switch (phase) {
    case "init":
      return phaseInit(rest);
    case "post-brainstorm":
      return phasePostBrainstorm(rest);
    case "research-go":
      return phaseResearchGo(rest);
    case "write-plan":
      return phaseWritePlan(rest);
    case "post-plan":
      return phasePostPlan(rest);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 1: init — kick off brainstorm via superpowers
// ──────────────────────────────────────────────────────────────────────────────

async function phaseInit(rest: string[]): Promise<void> {
  const request = rest.join(" ").trim() || "(no initial request given)";
  const { repo } = await detectRepo();

  sharedBanner({
    title: "[OH! >> NICE >> PLAN]",
    subtitle: `${repo} · ${request}`,
    gradient: GRADIENTS.nice,
  });

  step(1, 3, "brainstorm");
  hint("brainstorming skill → Socratic interview");

  const tmpSpec = path.join(
    os.tmpdir(),
    `oh-nice-spec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`,
  );

  const actions: NextAction[] = [
    {
      type: "invoke_skill",
      skill: "superpowers:brainstorming",
      instructions: [
        `Run the full brainstorming flow for the user's request: ${JSON.stringify(request)}.`,
        `Save the resulting design spec to: ${tmpSpec}`,
        `Do NOT use the default save path (docs/superpowers/specs/...) — use the path above so 'oh-nice plan' can move it into the plan dir.`,
        `Run the full Socratic interview — do not truncate.`,
        ``,
        `After the design is approved by the user, append a final \`## Parallelizable decomposition\` section to spec.md.`,
        `List the independent components ("tracks") that could be built by separate agents.`,
        `For each track: a one-line goal, the contract it exposes to other tracks (types, function signatures, file paths it owns), and any tracks it depends on.`,
        `The goal of this section is to make the boundaries explicit so the plan-writer can build a wide-fan-out DAG.`,
        `If the feature is genuinely sequential (no good cuts), say so and explain why — don't invent fake parallelism.`,
      ].join("\n"),
    },
    {
      type: "report",
      message: [
        "brainstorm done → ask user for slug (e.g. add-auth-flow), then re-run:",
        `  bun ${CLI} nice plan --phase=post-brainstorm ${shellQuote(tmpSpec)} ${shellQuote(request)} --slug <slug>`,
      ].join("\n"),
    },
  ];
  emit("nice", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 2: post-brainstorm — name the plan, create dir, offer research opt-in
// ──────────────────────────────────────────────────────────────────────────────

async function phasePostBrainstorm(rest: string[]): Promise<void> {
  // Extract --slug flag from rest, leaving positional args
  let slugFlag: string | null = null;
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] ?? "";
    if (a === "--slug") slugFlag = rest[++i] ?? null;
    else if (a.startsWith("--slug=")) slugFlag = a.slice("--slug=".length);
    else positional.push(a);
  }

  const [specPathArg, ...requestParts] = positional;
  const request = requestParts.join(" ").trim() || "(no initial request)";
  if (!specPathArg) {
    throw new Error("post-brainstorm needs the spec file path as the first argument");
  }
  const specPath = specPathArg;

  const { repo } = await detectRepo();

  sharedBanner({
    title: "[OH! >> NICE >> PLAN]",
    subtitle: `${repo} · name plan`,
    gradient: GRADIENTS.nice,
  });
  step(2, 3, "name plan");

  let slug: ReturnType<typeof asSlug>;
  if (slugFlag) {
    slug = asSlug(slugFlag);
    info(`using --slug ${slug}`);
  } else {
    if (!process.stdin.isTTY) {
      const { error } = await import("../ui.ts");
      error(
        "post-brainstorm needs a slug — interactive prompt requires a TTY",
        `pass --slug <slug>. Example:\n         bun ${CLI} nice plan --phase=post-brainstorm ${specPath} ${JSON.stringify(request)} --slug add-auth-flow`,
      );
      process.exit(2);
    }
    slug = await promptSlug({
      message: "slug for this plan",
    });
  }

  const paths = await createPlanDir(repo, slug);
  await rename(specPath, paths.specMd).catch(async (err) => {
    // if rename failed (cross-device), fall back to read+write+unlink
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      const data = await readFile(specPath);
      await Bun.write(paths.specMd, data);
      await Bun.file(specPath).delete?.();
    } else {
      throw err;
    }
  });
  success(`created ${shorten(paths.dir)}`);
  info(`spec saved at ${shorten(paths.specMd)}`);

  hint("research step optional before writing plan");

  const actions: NextAction[] = [
    {
      type: "ask_user",
      question: "Research before plan?",
      options: ["Run research", "Skip research"],
    },
    {
      type: "report",
      message: [
        `Run research → ask source (knowledge / online / auto), then:`,
        `  bun ${CLI} nice plan --phase=research-go ${shellQuote(repo)} ${shellQuote(slug)} --source=<chosen>`,
        `Skip research → re-run:`,
        `  bun ${CLI} nice plan --phase=write-plan ${shellQuote(repo)} ${shellQuote(slug)}`,
      ].join("\n"),
    },
  ];
  emit("nice", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 3 (new): research-go — dispatch research agent against spec.md
// ──────────────────────────────────────────────────────────────────────────────

async function phaseResearchGo(rest: string[]): Promise<void> {
  let sourceMode: string | null = null;
  const positional: string[] = [];
  for (const a of rest) {
    if (a.startsWith("--source=")) {
      sourceMode = a.slice("--source=".length);
    } else {
      positional.push(a);
    }
  }

  const [repoArg, slugArg] = positional;
  if (!repoArg || !slugArg) {
    const { error } = await import("../ui.ts");
    error("research-go needs <repo> <slug> args");
    process.exit(2);
  }

  if (!sourceMode) {
    const { error } = await import("../ui.ts");
    error("research-go needs --source=<mode>", `valid values: ${VALID_SOURCES.join(", ")}`);
    process.exit(2);
  }

  if (!isSourceMode(sourceMode)) {
    const { error } = await import("../ui.ts");
    error(`unknown source mode: ${sourceMode}`, `valid values: ${VALID_SOURCES.join(", ")}`);
    process.exit(2);
  }

  const source = sourceMode;
  const repo = repoArg;
  const slug = asSlug(slugArg);
  const paths = planPaths(repo, slug);

  sharedBanner({
    title: "[OH! >> NICE >> PLAN]",
    subtitle: `${repo} · research (${source})`,
    gradient: GRADIENTS.nice,
  });
  step(3, 4, `research · ${source}`);
  hint("research agent → enrich spec.md");

  const env = loadOhEnv();

  const dispatchedPrompt = buildResearchPrompt({
    specPath: paths.specMd,
    source,
    isUpdatePlan: false,
    dispatched: true,
  });
  const selfActPrompt = buildResearchPrompt({
    specPath: paths.specMd,
    source,
    isUpdatePlan: false,
    dispatched: false,
  });

  const agentAction = buildAgentAction({
    role: "research",
    env,
    dispatchedPrompt,
    selfActPrompt,
  });

  const saveNote =
    source === "knowledge"
      ? `source=knowledge → re-run directly.`
      : `web research → ask "Save to knowledge? YES/No" → invoke oh-search add per finding if YES.`;

  const actions: NextAction[] = [
    agentAction,
    {
      type: "report",
      message: [
        `research done · ${saveNote}`,
        `then: bun ${CLI} nice plan --phase=write-plan ${shellQuote(repo)} ${shellQuote(slug)}`,
      ].join("\n"),
    },
  ];
  emit("nice", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 4 (new): write-plan — invoke writing-plans against (possibly enriched) spec.md
// ──────────────────────────────────────────────────────────────────────────────

async function phaseWritePlan(rest: string[]): Promise<void> {
  const [repoArg, slugArg] = rest;
  if (!repoArg || !slugArg) {
    throw new Error("write-plan needs <repo> <slug> args");
  }
  const repo = repoArg;
  const slug = asSlug(slugArg);
  const paths = planPaths(repo, slug);

  sharedBanner({
    title: "[OH! >> NICE >> PLAN]",
    subtitle: `${repo} · write plan`,
    gradient: GRADIENTS.nice,
  });
  step(3, 4, "write plan");
  hint("writing-plans skill → spec → checklist");

  const actions: NextAction[] = [
    {
      type: "invoke_skill",
      skill: "superpowers:writing-plans",
      instructions: [
        `Reference the spec at: ${paths.specMd}`,
        `Save the plan to: ${paths.planMd}`,
        `Do NOT use the default save path (docs/superpowers/plans/...) — use the path above.`,
        `Use bite-sized task granularity per superpowers convention.`,
        ``,
        `Read the \`## Parallelizable decomposition\` section in spec.md.`,
        `Use the tracks as a guide for organizing tasks: tasks within a track are usually sequential to each other;`,
        `tasks across tracks should be parallel-safe unless they touch the same file.`,
        `Aim for maximum parallel width — if you find yourself writing many sequential tasks,`,
        `ask whether they could be reorganized into independent ones.`,
        ``,
        `Every task heading MUST be \`### Task <ID>: <name>\` where \`<ID>\` is a stable kebab-case slug (e.g. \`parser-tokenize\`, NOT a number).`,
        `Immediately after the heading and before the steps, every task MUST include:`,
        `- \`**Files:**\` — bullet list of \`Create: path\` and \`Modify: path\` lines. Every file the task will touch.`,
        `- \`**Depends-on:**\` — bullet list of task IDs that must complete first, or the literal \`none\`.`,
        ``,
        `Two tasks may share a \`Modify:\` file ONLY if one declares the other in its \`Depends-on:\` (i.e., they're forced sequential).`,
        `Two tasks may NOT share a \`Create:\` file — split the file or merge the tasks.`,
        ``,
        `When you reach the Self-Review step, additionally check:`,
        `- Does every task have \`**Files:**\` and \`**Depends-on:**\`?`,
        `- Do any two tasks \`Create:\` the same file?`,
        `- If two tasks \`Modify:\` the same file, does one transitively depend on the other?`,
        `- Are there any obvious parallel cuts you missed — sequential tasks that could become parallel by moving a file boundary?`,
      ].join("\n"),
    },
    {
      type: "report",
      message: `writing-plans done → bun ${CLI} nice plan --phase=post-plan ${shellQuote(repo)} ${shellQuote(slug)}`,
    },
  ];
  emit("nice", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 3: post-plan — summarize, ask implement-now-or-stop
// ──────────────────────────────────────────────────────────────────────────────

async function phasePostPlan(rest: string[]): Promise<void> {
  const [repoArg, slugArg] = rest;
  if (!repoArg || !slugArg) {
    throw new Error("post-plan needs <repo> <slug> args");
  }
  const repo = repoArg;
  const slug = asSlug(slugArg);
  const paths = planPaths(repo, slug);

  const planContent = await readFile(paths.planMd, "utf-8");
  const summary = summarizePlan(planContent);

  sharedBanner({
    title: "[OH! >> NICE >> PLAN]",
    subtitle: `${repo} · plan written`,
    gradient: GRADIENTS.nice,
  });

  // DAG validation + wave summary (skip if plan has no DAG-shaped tasks)
  const dag = parsePlan(planContent);
  const isDagPlan = dag.nodes.size > 0;

  if (isDagPlan) {
    const errs: string[] = [
      ...validateUniqueIds(dag),
      ...validateMissingFields(dag),
      ...validateDependsOnExist(dag),
      ...validateNoCycle(dag),
      ...validateNoCreateCollisions(dag),
      ...validateModifyEdgesAreOrdered(dag),
    ];
    if (errs.length > 0) {
      box(errs.map((e) => `• ${e}`).join("\n"), {
        title: "DAG validation FAILED",
        color: "red",
      });
      const actions: NextAction[] = [
        {
          type: "ask_user",
          question: "Plan failed DAG validation. What now?",
          options: [
            "Re-run writing-plans (regenerate plan.md)",
            "Fix manually then re-run /oh-nice plan --phase=post-plan",
            "Continue anyway (sequential fallback in /oh-nice go)",
          ],
        },
        {
          type: "report",
          message: [
            `Re-run write-plan: bun ${CLI} nice plan --phase=write-plan ${shellQuote(repo)} ${shellQuote(slug)}`,
            `Re-run post-plan after manual edits: bun ${CLI} nice plan --phase=post-plan ${shellQuote(repo)} ${shellQuote(slug)}`,
          ].join("\n"),
        },
      ];
      emit("nice", actions);
      return;
    }
    const waveSummary = renderWaveSummary(dag);
    box(waveSummary, { title: "Wave structure", color: "green" });
  }

  box(summary, { title: "Plan summary", color: "magenta" });

  const actions: NextAction[] = [
    {
      type: "ask_user",
      question: "What now?",
      options: ["Implement now (Mirai via /oh-nice go)", "Stop here"],
    },
    {
      type: "report",
      message: [
        `Implement now → bun ${CLI} nice go --slug ${shellQuote(slug)}`,
        `Stop here → confirm plan path, done.`,
      ].join("\n"),
    },
  ];
  emit("nice", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

export function buildResearchPrompt(opts: {
  specPath: string;
  source: SourceMode;
  isUpdatePlan: boolean;
  dispatched: boolean;
}): string {
  const { specPath, source, isUpdatePlan, dispatched } = opts;

  const sourceBehavior: Record<SourceMode, string> = {
    knowledge: [
      `- Source mode is "knowledge": ONLY call \`/oh-search find\` via Bash for each topic (do NOT use WebSearch or WebFetch).`,
      `  If no relevant local matches are found for a topic, leave spec.md unchanged for that topic and report 'no findings'.`,
    ].join("\n"),
    online: [
      `- Source mode is "online": skip local search entirely; use WebSearch and WebFetch directly (3-5 sources per topic).`,
    ].join("\n"),
    auto: [
      `- Source mode is "auto": for each topic, try \`/oh-search find\` first.`,
      `  For topics with no local match, fall back to WebSearch and WebFetch (3-5 sources per topic).`,
    ].join("\n"),
  };

  const appendInstruction = isUpdatePlan
    ? [
        `If spec.md contains one or more \`## Update — YYYY-MM-DD\` headings, append the research findings under the most-recent one`,
        `(i.e., insert it as a \`### Research\` subsection within the latest Update block).`,
        `Otherwise append a top-level \`## Research\` section at the end of spec.md.`,
        `Do NOT create a new top-level \`## Research\` heading if an Update section exists.`,
      ].join("\n")
    : [
        `Append a single \`## Research\` section to spec.md (one \`### <Topic>\` subsection per topic`,
        `with Overview / Key concepts / Links — and a \`Local knowledge:\` line listing matched filenames if any).`,
        `Do NOT modify any other section.`,
      ].join("\n");

  const searchInstruction = dispatched
    ? `Use Bash to run \`bun ${CLI} search find <topic>\` for local knowledge base searches.`
    : `Use Bash to run \`bun \${CLAUDE_PLUGIN_ROOT}/src/cli.ts search find <topic>\` for local knowledge base searches.`;

  const webResearchNote = [
    `If you performed web research (WebSearch or WebFetch), report 'web research performed' in your final message`,
    `so the parent can offer save-to-knowledge.`,
  ].join(" ");

  return [
    `You are a research sub-agent. Read the spec at: ${specPath}`,
    ``,
    `Identify research-worthy topics (libraries, frameworks, unfamiliar patterns, APIs).`,
    ``,
    `Source mode: ${source}`,
    sourceBehavior[source],
    ``,
    searchInstruction,
    ``,
    appendInstruction,
    ``,
    webResearchNote,
  ].join("\n");
}

function renderWaveSummary(dag: Dag): string {
  const done = new Set<string>();
  const lines: string[] = [];
  let waveNum = 0;
  let maxWidth = 0;
  while (done.size < dag.nodes.size) {
    const ready = nextReadySet(dag, done);
    if (ready.length === 0) break; // shouldn't happen post-validation
    waveNum++;
    if (ready.length > maxWidth) maxWidth = ready.length;
    const names = ready.map((n) => n.id).join(", ");
    lines.push(`Wave ${waveNum} (${ready.length} task${ready.length === 1 ? "" : "s"}): ${names}`);
    for (const n of ready) done.add(n.id);
  }
  lines.push(``);
  lines.push(`Total tasks: ${dag.nodes.size}`);
  lines.push(`Waves: ${waveNum}`);
  lines.push(`Max parallel width: ${maxWidth}`);
  const speedup = waveNum > 0 ? (dag.nodes.size / waveNum).toFixed(1) : "n/a";
  lines.push(`Naive speedup vs sequential (tasks/waves): ~${speedup}x`);
  return lines.join("\n");
}

function summarizePlan(content: string): string {
  // pull the first 5 H2/H3 headings or top-level checkbox tasks
  const lines = content.split("\n");
  const items: string[] = [];
  for (const line of lines) {
    if (items.length >= 5) break;
    const trimmed = line.trim();
    if (/^##+\s+/.test(trimmed) || /^[-*]\s+\[ \]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const cleaned = trimmed
        .replace(/^##+\s+/, "")
        .replace(/^[-*]\s+\[ \]\s+/, "")
        .replace(/^\d+\.\s+/, "");
      if (cleaned.length > 0 && !/^plan\b/i.test(cleaned)) {
        items.push(`• ${cleaned}`);
      }
    }
  }
  if (items.length === 0) {
    return "(plan written — open it to review)";
  }
  return items.join("\n");
}

function shorten(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}
