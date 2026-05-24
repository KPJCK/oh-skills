// src/skills/search/commands/add.ts
import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { ensureTopicDir, fileExists, knowledgeRoot, listTopics } from "../registry";
import { pickTopic } from "../picker";
import { buildAddTopicAskPayload } from "../ask-ui";
import { input, select, confirm, promptSlug, isValidSlug, isValidTopic } from "../prompts";
import { scaffoldKnowledge, slugify } from "../template";
import { step, success, info, hint, error } from "../../../shared/ui";

type Flags = {
  name: string | null;
  topic: string | null;
  title: string | null;
  summary: string | null;
  query: string | null;
  sources: string[] | null;
  tags: string[] | null;
  bodyStdin: boolean;
  bodyFile: string | null;
  folder: boolean;
  overwrite: boolean;
  confirmed: boolean;
  emitAskJson: boolean;
};

function parseFlags(args: string[]): Flags {
  const flags: Flags = {
    name: null,
    topic: null,
    title: null,
    summary: null,
    query: null,
    sources: null,
    tags: null,
    bodyStdin: false,
    bodyFile: null,
    folder: false,
    overwrite: false,
    confirmed: false,
    emitAskJson: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (!a.startsWith("--") && flags.name === null) {
      flags.name = a;
      continue;
    }
    switch (a) {
      case "--topic":
        flags.topic = args[++i] ?? null;
        break;
      case "--title":
        flags.title = args[++i] ?? null;
        break;
      case "--summary":
        flags.summary = args[++i] ?? null;
        break;
      case "--query":
        flags.query = args[++i] ?? null;
        break;
      case "--sources":
        flags.sources = (args[++i] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "--tags":
        flags.tags = (args[++i] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "--body-stdin":
        flags.bodyStdin = true;
        break;
      case "--body-file":
        flags.bodyFile = args[++i] ?? null;
        break;
      case "--folder":
        flags.folder = true;
        break;
      case "--overwrite":
        flags.overwrite = true;
        break;
      case "--confirmed":
        flags.confirmed = true;
        break;
      case "--emit-ask-json":
        flags.emitAskJson = true;
        break;
      default:
        throw new Error(`unknown flag: ${a}`);
    }
  }
  return flags;
}

function isProgrammatic(f: Flags): boolean {
  return (
    f.name !== null &&
    f.topic !== null &&
    f.title !== null &&
    f.summary !== null &&
    (f.bodyStdin || f.bodyFile !== null)
  );
}

export async function run(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  if (flags.emitAskJson) {
    const topics = await listTopics();
    const payload = buildAddTopicAskPayload(topics);
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }
  return isProgrammatic(flags) ? runProgrammatic(flags) : runInteractive(flags);
}

// ──────────────────────────────────────────────────────────────────────────────
// Programmatic (called by Claude after research)
// ──────────────────────────────────────────────────────────────────────────────

async function runProgrammatic(flags: Flags): Promise<void> {
  // HARD GATE: --confirmed required
  if (!flags.confirmed) {
    error(
      "refusing to write knowledge — explicit user confirmation required",
      "ask the user 'save this as knowledge? reply YES' and only pass --confirmed if they reply YES",
    );
    process.exit(3);
  }

  if (!flags.name || !flags.topic || !flags.title || !flags.summary) {
    throw new Error("runProgrammatic called without required flags (name/topic/title/summary)");
  }
  const name = flags.name;
  const topic = flags.topic;
  const title = flags.title;
  const summary = flags.summary;;

  if (!isValidSlug(name)) throw new Error(`invalid name: ${name}`);
  if (!isValidTopic(topic)) throw new Error(`invalid topic: ${topic}`);
  if (title.length < 3) throw new Error("--title must be at least 3 chars");
  if (summary.length < 5) throw new Error("--summary must be at least 5 chars");

  await ensureTopicDir(topic);

  let body: string;
  if (flags.bodyStdin) {
    body = await readStdin();
  } else {
    const { readFile } = await import("node:fs/promises");
    if (!flags.bodyFile) throw new Error("--body-file required when --body-stdin not set");
    body = await readFile(flags.bodyFile, "utf-8");
  }

  const { absPath, rel } = await writeKnowledge({
    name,
    topic,
    title,
    summary,
    query: flags.query,
    sources: flags.sources,
    tags: flags.tags,
    body,
    folder: flags.folder,
    overwrite: flags.overwrite,
  });

  success(`created ${rel}`);
  process.stdout.write(
    JSON.stringify({
      created: rel,
      absPath,
      topic,
      name,
      shape: flags.folder ? "folder" : "simple",
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
// Interactive (user invokes directly)
// ──────────────────────────────────────────────────────────────────────────────

async function runInteractive(flags: Flags): Promise<void> {
  if (!process.stdin.isTTY) {
    error(
      "interactive add requires a TTY",
      "pass all flags for programmatic mode:\n         <name> --topic <topic> --title <title> --summary <summary> --body-stdin (or --body-file <path>) --confirmed [--query Q] [--sources URLs] [--tags T1,T2] [--folder] [--overwrite]",
    );
    process.exit(2);
  }
  step("Pick a topic");
  const topic = flags.topic ?? (await pickTopic({ message: "Topic" }));
  if (!topic) {
    error("cancelled");
    return;
  }
  await ensureTopicDir(topic);
  info(`topic: ${topic}/`);

  step("Knowledge metadata");
  const title =
    flags.title ??
    (await input({
      message: "Title (e.g. 'Bun SQLite API — current usage')",
      validate: (v) => v.trim().length >= 3 || "min 3 chars",
    }));
  const summary =
    flags.summary ??
    (await input({
      message: "One-line summary",
      validate: (v) => v.trim().length >= 5 || "min 5 chars",
    }));
  const query =
    flags.query ??
    (await input({
      message: "Original query (optional, blank to skip)",
    }));

  const name =
    flags.name ??
    (await promptSlug({
      message: "Slug",
      default: slugify(title.trim()),
    }));

  const shape = flags.folder
    ? "folder"
    : ((await select({
        message: "Shape",
        default: "simple",
        choices: [
          { name: "simple — single .md file", value: "simple" },
          {
            name: "folder — search-<name>/index.md + optional attachments",
            value: "folder",
          },
        ],
      })) as "simple" | "folder");

  const tagsRaw = await input({
    message: "Tags (comma-separated, optional)",
    default: flags.tags?.join(",") ?? "",
  });
  const tags = tagsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const sourcesRaw = await input({
    message: "Source URLs (comma-separated, optional)",
    default: flags.sources?.join(",") ?? "",
  });
  const sources = sourcesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  step("Body");
  hint("for non-trivial bodies, pre-write the markdown to a file and use --body-file in flag mode");
  const body = await input({
    message: "Body (one-line OK, or '@/path/to/file.md' to load from file)",
  });
  let bodyContent = body;
  if (body.startsWith("@")) {
    const { readFile } = await import("node:fs/promises");
    bodyContent = await readFile(body.slice(1), "utf-8");
  }

  step("Confirmation gate — YES required");
  const previewLines = bodyContent.split("\n").slice(0, 10).join("\n");
  const KNOWLEDGES_ROOT = knowledgeRoot();
  process.stdout.write(
    `\n--- Preview ---\nPath: ${KNOWLEDGES_ROOT}/${topic}/search-${name}${shape === "folder" ? "/index.md" : ".md"}\nTitle: ${title}\nTopic: ${topic}\nSummary: ${summary}\nTags: ${tags.join(", ") || "(none)"}\nSources: ${sources.length} URL(s)\n\n--- Body preview ---\n${previewLines}\n${bodyContent.split("\n").length > 10 ? `... (${bodyContent.split("\n").length - 10} more lines)` : ""}\n--- end preview ---\n\n`,
  );
  const reply = await input({
    message: 'Type "YES" to save, anything else to cancel',
  });
  if (reply.trim().toUpperCase() !== "YES") {
    error("not saved (confirmation required: literal YES)");
    return;
  }

  const overwriteCheck = await maybeConfirmOverwrite(name, topic, shape, flags);
  if (!overwriteCheck) return;

  const { rel } = await writeKnowledge({
    name,
    topic,
    title,
    summary,
    query: query || null,
    sources,
    tags,
    body: bodyContent,
    folder: shape === "folder",
    overwrite: flags.overwrite,
  });

  success(`created ${rel}`);
}

async function maybeConfirmOverwrite(
  name: string,
  topic: string,
  shape: "simple" | "folder",
  flags: Flags,
): Promise<boolean> {
  if (flags.overwrite) return true;
  const KNOWLEDGES_ROOT = knowledgeRoot();
  const target =
    shape === "simple"
      ? path.join(KNOWLEDGES_ROOT, topic, `search-${name}.md`)
      : path.join(KNOWLEDGES_ROOT, topic, `search-${name}`, "index.md");
  if (await fileExists(target)) {
    const ok = await confirm({
      message: `${path.relative(KNOWLEDGES_ROOT, target)} exists — overwrite?`,
      default: false,
    });
    if (!ok) {
      error("cancelled (file exists)");
      return false;
    }
  }
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared writer
// ──────────────────────────────────────────────────────────────────────────────

async function writeKnowledge(opts: {
  name: string;
  topic: string;
  title: string;
  summary: string;
  query: string | null;
  sources: string[] | null;
  tags: string[] | null;
  body: string;
  folder: boolean;
  overwrite: boolean;
}): Promise<{ absPath: string; rel: string }> {
  const KNOWLEDGES_ROOT = knowledgeRoot();
  const topicDir = path.join(KNOWLEDGES_ROOT, opts.topic);
  let absPath: string;
  if (opts.folder) {
    const folderDir = path.join(topicDir, `search-${opts.name}`);
    await mkdir(folderDir, { recursive: true });
    await mkdir(path.join(folderDir, "images"), { recursive: true });
    await mkdir(path.join(folderDir, "scripts"), { recursive: true });
    absPath = path.join(folderDir, "index.md");
  } else {
    absPath = path.join(topicDir, `search-${opts.name}.md`);
  }

  if ((await fileExists(absPath)) && !opts.overwrite) {
    throw new Error(
      `${path.relative(KNOWLEDGES_ROOT, absPath)} exists — pass --overwrite to replace`,
    );
  }

  const content = scaffoldKnowledge({
    title: opts.title,
    summary: opts.summary,
    topic: opts.topic,
    body: opts.body,
    ...(opts.query !== null ? { query: opts.query } : {}),
    ...(opts.sources !== null ? { sources: opts.sources } : {}),
    ...(opts.tags !== null ? { tags: opts.tags } : {}),
  });

  await writeFile(absPath, content, "utf-8");
  return {
    absPath,
    rel: path.relative(KNOWLEDGES_ROOT, absPath),
  };
}
