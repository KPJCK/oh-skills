import path from "node:path";
import { writeFile } from "node:fs/promises";
import { listFolders, ensureFolderExists, fileExists } from "../registry.ts";
import { loadOhEnv } from "../../../env.ts";
import { pickFolderForAdd } from "../picker.ts";
import { input, select, confirm } from "@inquirer/prompts";
import { scaffoldRule, slugify } from "../template.ts";
import { openInEditor } from "../editor.ts";
import { buildAddFolderAskPayload } from "../ask-ui.ts";
import { step, success, info, hint, error } from "../../../shared/ui.ts";
import type { Priority } from "../../../shared/frontmatter.ts";

type Flags = {
  folder: string | null;
  title: string | null;
  description: string | null;
  priority: Priority | null;
  bodyStdin: boolean;
  bodyFile: string | null;
  overwrite: boolean;
  emitAskJson: boolean;
  templateName: string | null;
  pick: string[] | null;
};

function parseFlags(args: string[]): Flags {
  const flags: Flags = {
    folder: null,
    title: null,
    description: null,
    priority: null,
    bodyStdin: false,
    bodyFile: null,
    overwrite: false,
    emitAskJson: false,
    templateName: null,
    pick: null,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) break;
    switch (a) {
      case "--folder":
        flags.folder = args[++i] ?? null;
        break;
      case "--title":
        flags.title = args[++i] ?? null;
        break;
      case "--description":
        flags.description = args[++i] ?? null;
        break;
      case "--priority": {
        const v = args[++i];
        if (v !== "low" && v !== "medium" && v !== "high") {
          throw new Error(`--priority must be low|medium|high (got ${JSON.stringify(v)})`);
        }
        flags.priority = v;
        break;
      }
      case "--body-stdin":
        flags.bodyStdin = true;
        break;
      case "--body-file":
        flags.bodyFile = args[++i] ?? null;
        break;
      case "--overwrite":
        flags.overwrite = true;
        break;
      case "--emit-ask-json":
        flags.emitAskJson = true;
        break;
      case "--template":
        flags.templateName = args[++i] ?? null;
        break;
      case "--pick": {
        const raw = args[++i] ?? "";
        flags.pick = raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      }
      default:
        throw new Error(`unknown flag: ${a}`);
    }
  }
  return flags;
}

function isProgrammatic(f: Flags): boolean {
  return (
    f.folder !== null &&
    f.title !== null &&
    f.description !== null &&
    f.priority !== null &&
    (f.bodyStdin || f.bodyFile !== null)
  );
}

export async function run(args: string[]): Promise<void> {
  const flags = parseFlags(args);

  if (flags.templateName !== null) {
    if (flags.emitAskJson) return runAddTemplateAskJson(flags.templateName);
    if (flags.pick === null) {
      error(
        'add --template needs --pick "path1,path2,…" in non-TTY mode (or --emit-ask-json first)',
      );
      process.exit(2);
    }
    return runAddTemplate(flags.templateName, flags.pick, flags.overwrite);
  }

  if (flags.emitAskJson) {
    const folders = await listFolders();
    const payload = buildAddFolderAskPayload(folders);
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }
  return isProgrammatic(flags) ? runProgrammatic(flags) : runInteractive(flags);
}

// ──────────────────────────────────────────────────────────────────────────────
// Programmatic (used by promote)
// ──────────────────────────────────────────────────────────────────────────────

async function runProgrammatic(flags: Flags): Promise<void> {
  if (!flags.folder || !flags.title || !flags.description || !flags.priority) {
    throw new Error("runProgrammatic called without required flags");
  }
  const folder = flags.folder;
  const title = flags.title.trim();
  const description = flags.description.trim();
  const priority = flags.priority;

  if (title.length < 3) throw new Error("--title must be at least 3 characters");
  if (description.length < 5) throw new Error("--description must be at least 5 characters");

  await ensureFolderExists(folder);
  const slug = slugify(title);
  if (!slug) throw new Error("title produced an empty slug");
  const filename = `rule-${slug}.md`;
  const contextRoot = loadOhEnv().CONTEXT_DIR;
  const absPath = path.join(contextRoot, folder, filename);

  if ((await fileExists(absPath)) && !flags.overwrite) {
    throw new Error(`${path.relative(contextRoot, absPath)} exists — pass --overwrite to replace`);
  }

  let body: string;
  if (flags.bodyStdin) {
    body = await readStdin();
  } else {
    if (!flags.bodyFile) throw new Error("--body-file is required when --body-stdin is not set");
    const { readFile } = await import("node:fs/promises");
    body = await readFile(flags.bodyFile, "utf-8");
  }

  // Build full file content. If body starts with `# `, use it as-is after frontmatter.
  // Otherwise, prepend the title heading.
  const trimmedBody = body.trim();
  const hasTitleHeading =
    trimmedBody.startsWith(`# ${title}`) || /^# .+/m.test(trimmedBody.split("\n")[0] ?? "");
  const bodyForFile = hasTitleHeading ? trimmedBody : `# ${title}\n\n${trimmedBody}`;
  const content = `---\ntitle: ${title}\ndescription: ${description}\npriority: ${priority}\n---\n\n${bodyForFile}\n`;

  await writeFile(absPath, content, "utf-8");
  success(`created ${path.relative(contextRoot, absPath)}`);

  // Print machine-readable line for the caller (promote) to parse.
  process.stdout.write(
    JSON.stringify({
      created: path.relative(contextRoot, absPath),
      folder,
      slug,
      title,
    }) + "\n",
  );
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// ──────────────────────────────────────────────────────────────────────────────
// Interactive (used directly by user via /oh-context add)
// ──────────────────────────────────────────────────────────────────────────────

async function runInteractive(_flags: Flags): Promise<void> {
  if (!process.stdin.isTTY) {
    error(
      "interactive add requires a TTY",
      "pass all flags for programmatic mode:\n         --folder <folder> --title <title> --description <desc> --priority <low|medium|high> --body-stdin (or --body-file <path>) [--overwrite]",
    );
    process.exit(2);
  }
  step("Pick a target folder");
  const folders = await listFolders();
  const folder = await pickFolderForAdd(folders);
  if (folder === null) {
    error("cancelled");
    return;
  }
  await ensureFolderExists(folder);
  info(`folder: ${folder}/`);

  step("Rule metadata");
  const title = await input({
    message: "Title (e.g. 'React hooks conventions')",
    validate: (v) => v.trim().length >= 3 || "title must be at least 3 characters",
  });
  const description = await input({
    message: "One-line description",
    validate: (v) => v.trim().length >= 5 || "description must be at least 5 characters",
  });
  const priority = (await select({
    message: "Priority",
    default: "medium",
    choices: [
      { name: "high", value: "high" },
      { name: "medium", value: "medium" },
      { name: "low", value: "low" },
    ],
  })) as Priority;

  const slug = slugify(title.trim());
  if (!slug) {
    error("title produced an empty slug — pick something with letters/numbers");
    return;
  }

  const filename = `rule-${slug}.md`;
  const contextRoot = loadOhEnv().CONTEXT_DIR;
  const absPath = path.join(contextRoot, folder, filename);
  if (await fileExists(absPath)) {
    const overwrite = await confirm({
      message: `${path.relative(contextRoot, absPath)} exists — overwrite?`,
      default: false,
    });
    if (!overwrite) {
      error("cancelled (file exists)");
      return;
    }
  }

  step("Writing template");
  const content = scaffoldRule({
    title: title.trim(),
    description: description.trim(),
    priority,
  });
  await writeFile(absPath, content, "utf-8");
  success(`created ${path.relative(contextRoot, absPath)}`);

  step("Opening in editor");
  hint(`$EDITOR = ${process.env.EDITOR ?? "code -w"}`);
  try {
    await openInEditor(absPath);
  } catch (err) {
    error(
      `editor failed: ${err instanceof Error ? err.message : String(err)}`,
      "you can edit the file by hand at the path above",
    );
  }

  process.stdout.write(
    `\n## New rule scaffolded\n\n` +
      `Created at \`${path.relative(contextRoot, absPath)}\`.\n\n` +
      `Run \`/oh-context load\` and pick \`${folder}/\` to inject this rule into the current session.\n`,
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Template helpers
// ──────────────────────────────────────────────────────────────────────────────

async function runAddTemplateAskJson(name: string): Promise<void> {
  const { listAllRuleMeta } = await import("../registry.ts");
  const { estimateTokens } = await import("../tokens.ts");
  const { buildAddTemplateAskPayload } = await import("../ask-ui.ts");
  const rules = await listAllRuleMeta();
  const tokens = new Map<string, number>();
  for (const r of rules) tokens.set(r.rel, await estimateTokens(r.absPath));
  const payload = buildAddTemplateAskPayload(rules, tokens, name);
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}

async function runAddTemplate(name: string, pick: string[], overwrite: boolean): Promise<void> {
  const { writeTemplate, listTemplates } = await import("../templates.ts");
  const { estimateTokens } = await import("../tokens.ts");
  const { formatTokens } = await import("../tokens.ts");
  if (pick.length === 0) {
    error("--pick must include at least one rule path");
    process.exit(2);
  }
  await writeTemplate(name, pick, { overwrite });
  // Compute total tokens for the success line
  const contextRoot = loadOhEnv().CONTEXT_DIR;
  let total = 0;
  for (const rel of pick) {
    try {
      total += await estimateTokens(path.join(contextRoot, rel));
    } catch {
      // ignore per-file errors at this point
    }
  }
  success(`template "${name}" created · ${pick.length} rules (${formatTokens(total)} total)`);
  // Confirm listing once
  await listTemplates();
}
