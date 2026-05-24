import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { listDrafts, listAllRuleMeta, type DraftInfo, type RuleMetaInfo } from "../registry.ts";
import { loadOhEnv } from "../../../env.ts";
import { info, error, success } from "../../../shared/ui.ts";

type Flags = {
  all: boolean;
  target: string | null;
};

function parseFlags(args: string[]): Flags {
  const flags: Flags = { all: false, target: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) break;
    if (a === "--all") flags.all = true;
    else if (a === "--target") flags.target = args[++i] ?? null;
    else throw new Error(`unknown flag: ${a}`);
  }
  return flags;
}

export async function run(args: string[]): Promise<void> {
  const flags = parseFlags(args);

  if (!flags.all && !flags.target) {
    error(
      "promote requires --all or --target <path>",
      "examples:\n      /oh-context promote --all\n      /oh-context promote --target typescript/my-notes.md",
    );
    process.exit(2);
  }
  if (flags.all && flags.target) {
    error("--all and --target are mutually exclusive");
    process.exit(2);
  }

  const candidates = flags.target ? [await resolveTarget(flags.target)] : await listDrafts();

  if (candidates.length === 0) {
    const contextRoot = loadOhEnv().CONTEXT_DIR;
    process.stdout.write(
      `_(no promotion candidates — every .md under ${contextRoot} is already a rule-*.md file)_\n`,
    );
    return;
  }

  info(`${candidates.length} promotion candidate${candidates.length === 1 ? "" : "s"}`);

  // Read all candidate contents in advance so the manifest is self-contained.
  const candidatesWithContent: Array<DraftInfo & { content: string }> = [];
  for (const d of candidates) {
    const content = await readFile(d.absPath, "utf-8");
    candidatesWithContent.push({ ...d, content });
  }

  const existingRules = await listAllRuleMeta();

  process.stdout.write(renderManifest(candidatesWithContent, existingRules, flags.all));
  success("manifest emitted — Claude will now interview the user");
}

async function resolveTarget(arg: string): Promise<DraftInfo> {
  const contextRoot = loadOhEnv().CONTEXT_DIR;
  // accept absolute or relative-to-context
  const abs = path.isAbsolute(arg) ? arg : path.join(contextRoot, arg);
  let st;
  try {
    st = await stat(abs);
  } catch {
    throw new Error(`no such file: ${arg}`);
  }
  if (!st.isFile()) throw new Error(`not a file: ${arg}`);
  const rel = path.relative(contextRoot, abs);
  if (rel.startsWith("..")) {
    throw new Error(`target must be under ${contextRoot}`);
  }
  const basename = path.basename(abs);
  if (/^rule-.*\.md$/.test(basename)) {
    throw new Error(`${rel} is already an official rule file — use /oh-context update instead`);
  }
  if (!basename.endsWith(".md")) {
    throw new Error(`${rel} is not a .md file`);
  }
  return { absPath: abs, rel, mtime: st.mtime };
}

function renderManifest(
  candidates: Array<DraftInfo & { content: string }>,
  existing: readonly RuleMetaInfo[],
  isBatch: boolean,
): string {
  const lines: string[] = [];
  lines.push(
    `## Promotion manifest — ${candidates.length} draft${candidates.length === 1 ? "" : "s"}`,
  );
  lines.push("");
  lines.push(
    `The following \`.md\` file${candidates.length === 1 ? " is" : "s are"} not official rule${candidates.length === 1 ? "" : "s"} yet. ${isBatch ? "Process them **one at a time**, in the order listed below." : "Process this draft."}`,
  );
  lines.push("");

  // Existing rules roster — Claude can propose extending these instead of always creating new
  lines.push("### Existing rules (you may propose extending these)");
  lines.push("");
  if (existing.length === 0) {
    lines.push("_(no existing rules yet)_");
  } else {
    for (const r of existing) {
      lines.push(`- \`${r.rel}\` — **${r.title}** (priority: ${r.priority}) — ${r.description}`);
    }
  }
  lines.push("");

  candidates.forEach((c, i) => {
    lines.push("---");
    lines.push("");
    lines.push(`### Draft ${i + 1}/${candidates.length} — \`${c.rel}\``);
    lines.push(`_Modified: ${c.mtime.toISOString()}_`);
    lines.push("");
    lines.push("```markdown");
    lines.push(c.content.trimEnd());
    lines.push("```");
    lines.push("");
  });

  lines.push("---");
  lines.push("");
  lines.push("## Interview & promotion flow (per draft)");
  lines.push("");
  lines.push(
    "For **each** draft above, walk the user through these steps. Don't batch — finish one draft fully before starting the next.",
  );
  lines.push("");
  lines.push("1. **Summarize the draft** in 2-3 sentences so the user sees you've read it.");
  lines.push("");
  lines.push(
    "2. **Allocate the draft's content**: a single draft can be a mix of three things. Walk the content section-by-section (or topic-by-topic) and for each chunk propose one of:",
  );
  lines.push("");
  lines.push(
    "   - **(A) Create a new rule** — content covers a topic not already captured by any existing rule (see roster above). This is the typical case for greenfield drafts.",
  );
  lines.push(
    "   - **(B) Extend an existing rule** — content sharpens, expands, or adds DO/DO NOT bullets to a rule that already exists. Identify the target rule from the roster (e.g. `typescript/frontend/rule-react-hooks.md`).",
  );
  lines.push(
    "   - **(C) Discard** — content is duplicate of an existing rule, scratch notes, or out of scope. Skip.",
  );
  lines.push("");
  lines.push(
    "   Show the user your proposed allocation as a labeled list (\"Section 1 → (A) new rule 'X' in `typescript/frontend/`. Section 2 → (B) extend `git/rule-commit-style.md`. Section 3 → (C) discard.\") and ask for adjustments before proceeding.",
  );
  lines.push("");
  lines.push("3. **For each (A) — create new rule** — gather:");
  lines.push("   - **Target folder** (existing or new — suggest based on content topic)");
  lines.push("   - **Title** (suggest one)");
  lines.push("   - **One-line description** (suggest one)");
  lines.push("   - **Priority** (low / medium / high — based on how foundational)");
  lines.push("   - **Body** — draft this canonical structure:");
  lines.push("     ```markdown");
  lines.push("     # <title>");
  lines.push("");
  lines.push("     ## DO");
  lines.push("");
  lines.push("     - <bullet>");
  lines.push("");
  lines.push("     ## DO NOT");
  lines.push("");
  lines.push("     - <bullet>");
  lines.push("");
  lines.push("     ## Details");
  lines.push("");
  lines.push("     <optional nuance — delete if not needed>");
  lines.push("     ```");
  lines.push("   - Show the user the drafted body, ask for adjustments.");
  lines.push("   - When confirmed, **create the rule** by piping the body into `add`:");
  lines.push("     ```bash");
  lines.push("     cat <<'BODY' | bun ${CLAUDE_PLUGIN_ROOT}/src/cli.ts context add \\");
  lines.push(
    "         --folder <folder> --title <title> --description <desc> --priority <p> --body-stdin",
  );
  lines.push("     <body markdown here>");
  lines.push("     BODY");
  lines.push("     ```");
  lines.push("");
  lines.push("4. **For each (B) — extend existing rule**:");
  lines.push(
    "   - **Read** the target rule file (use your Read tool) to see its current content and DO / DO NOT / Details structure.",
  );
  lines.push(
    "   - **Draft the merge**: which new DO bullets / DO NOT bullets / Details additions does the draft content contribute? Show the user the proposed additions in context.",
  );
  lines.push(
    "   - When confirmed, **use your Edit tool** to add the new bullets to the target file. Preserve frontmatter; preserve existing bullets; append new bullets to the relevant section (DO / DO NOT / Details).",
  );
  lines.push(
    "   - If the merge changes priority or description, also update frontmatter via Edit.",
  );
  lines.push("");
  lines.push("5. **For each (C) — discard**: no action needed beyond noting it for the user.");
  lines.push("");
  lines.push(
    "6. **Trash the source draft** once the user confirms all (A) creates and (B) extends are good:",
  );
  lines.push("   ```bash");
  lines.push("   trash '<absolute-source-path>'");
  lines.push("   ```");
  lines.push("");
  lines.push("7. **Move to the next draft** (if any) and repeat from step 1.");
  lines.push("");
  lines.push(
    "**After all drafts are processed:** summarize what was created/extended/discarded and remind the user to run `/oh-context load` to inject the new and updated rules into the current session.",
  );
  lines.push("");
  lines.push("**Hard rules:**");
  lines.push(
    "- Never write `rule-*.md` files directly via Write — always go through `bun ${CLAUDE_PLUGIN_ROOT}/src/cli.ts context add` for new rules.",
  );
  lines.push(
    "- For (B) extends, the Edit tool is appropriate — it preserves the file structure and only modifies what you specify.",
  );
  lines.push("- Never trash a draft before its rules are successfully created/extended.");
  lines.push(
    "- If the user wants to skip a draft entirely, leave it where it is and move on (don't trash).",
  );

  return lines.join("\n") + "\n";
}
