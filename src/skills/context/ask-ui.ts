/**
 * Context-specific AskUserQuestion payload builders.
 *
 * The `next` fields use the literal string `bun ${CLAUDE_PLUGIN_ROOT}/src/cli.ts context <sub>`
 * — these are shell commands for Claude to execute, where CLAUDE_PLUGIN_ROOT is an env var
 * that the Claude Code harness provides at runtime. They are intentionally NOT template
 * literals expanded at build time.
 */

import type { FolderInfo, RuleMetaInfo } from "./registry.ts";
import { chunkBalanced } from "../../shared/ask-ui.ts";
import type { AskQuestion, AskPayload } from "../../shared/ask-ui.ts";
import { formatTokens } from "./tokens.ts";

const MAX_OPTIONS_PER_QUESTION = 4;
const MAX_QUESTIONS_PER_CALL = 4;
const MAX_TOTAL_OPTIONS = MAX_OPTIONS_PER_QUESTION * MAX_QUESTIONS_PER_CALL; // 16

const NEW_FOLDER_SENTINEL = "(+ new folder)";

export function buildLoadAskPayload(
  folders: readonly FolderInfo[],
  lastPicks: readonly string[] = [],
  folderTokens: ReadonlyMap<string, number> = new Map(),
): AskPayload {
  const next = `bun \${CLAUDE_PLUGIN_ROOT}/src/cli.ts context load --pick "<comma-separated labels>"`;

  if (folders.length === 0) {
    return {
      questions: [],
      next: "(no folders available — nothing to load)",
    };
  }

  if (folders.length === 1) {
    const only = folders[0]!;
    return {
      questions: [],
      next: `bun \${CLAUDE_PLUGIN_ROOT}/src/cli.ts context load --pick "${only.rel}"`,
      autoPick: [only.rel],
    };
  }

  if (folders.length > MAX_TOTAL_OPTIONS) {
    const numbered = folders
      .map(
        (f, i) =>
          `${i + 1}. ${f.rel}  (${f.ruleCount} rule${f.ruleCount === 1 ? "" : "s"})${lastPicks.includes(f.rel) ? "  ← last loaded" : ""}`,
      )
      .join("\n");
    return {
      questions: [],
      next,
      tooManyForUI: true,
      plainText: numbered,
    };
  }

  // 2-16 folders: chunk into balanced groups of 2-4 each
  const chunks = chunkBalanced([...folders]);

  const questions: AskQuestion[] = chunks.map((chunk, idx) => ({
    question:
      chunks.length === 1
        ? "Which context folders should I load?"
        : `Which folders to load? (group ${idx + 1} of ${chunks.length})`,
    header: chunks.length === 1 ? "Context" : `Context ${idx + 1}/${chunks.length}`,
    multiSelect: true,
    options: chunk.map((f) => ({
      label: f.rel,
      description: describeFolder(f, lastPicks, folderTokens),
    })),
  }));

  return { questions, next };
}

function describeFolder(
  f: FolderInfo,
  lastPicks: readonly string[],
  folderTokens: ReadonlyMap<string, number>,
): string {
  const ruleBit = `${f.ruleCount} rule${f.ruleCount === 1 ? "" : "s"}`;
  const tokBit = folderTokens.has(f.rel) ? ` · ${formatTokens(folderTokens.get(f.rel)!)}` : "";
  const lastBit = lastPicks.includes(f.rel) ? " · last loaded" : "";
  return `${ruleBit}${tokBit}${lastBit}`;
}

/**
 * Folder picker for `add` — single-select with "(+ new folder)" sentinel.
 * Reserves 1 slot in the last chunk for the sentinel.
 */
export function buildAddFolderAskPayload(folders: readonly FolderInfo[]): AskPayload {
  const next = `bun \${CLAUDE_PLUGIN_ROOT}/src/cli.ts context add --folder "<folder>" --title <t> --description <d> --priority <low|medium|high> --body-stdin --confirmed`;

  if (folders.length === 0) {
    // No existing folders — Claude should just prompt user via free-text input
    return {
      questions: [
        {
          question: "No existing folders. What folder name for the new rule?",
          header: "Folder",
          multiSelect: false,
          options: [
            { label: NEW_FOLDER_SENTINEL, description: "Type a new folder name (lowercase-kebab)" },
            { label: "(cancel)", description: "Don't create a folder" },
          ],
        },
      ],
      next,
    };
  }

  // Treat sentinel as a virtual extra option that needs a slot
  const totalSlots = folders.length + 1; // +1 for "+ new folder"

  if (totalSlots > MAX_TOTAL_OPTIONS) {
    const numbered = folders
      .map((f, i) => `${i + 1}. ${f.rel}  (${f.ruleCount} rule${f.ruleCount === 1 ? "" : "s"})`)
      .join("\n");
    return {
      questions: [],
      next,
      tooManyForUI: true,
      plainText: numbered + `\n\nOR type a new folder name (lowercase-kebab) for the rule.`,
    };
  }

  // Chunk folders, reserve last slot of last chunk for sentinel
  const chunks = chunkBalanced([...folders]);
  // Append sentinel to last chunk (if room) or as its own chunk
  const lastChunk = chunks[chunks.length - 1]!;
  const sentinelFolder: FolderInfo = { rel: NEW_FOLDER_SENTINEL, ruleCount: 0 };
  if (lastChunk.length < MAX_OPTIONS_PER_QUESTION) {
    lastChunk.push(sentinelFolder);
  } else {
    // Add new chunk with sentinel + 1 borrowed from prev (to satisfy min 2)
    const borrowed = lastChunk.pop()!;
    chunks.push([borrowed, sentinelFolder]);
  }

  const questions: AskQuestion[] = chunks.map((chunk, idx) => ({
    question:
      chunks.length === 1
        ? "Which folder for the new rule? (or pick `+ new folder`)"
        : `Pick folder (group ${idx + 1} of ${chunks.length})`,
    header: chunks.length === 1 ? "Folder" : `Folder ${idx + 1}/${chunks.length}`,
    multiSelect: false,
    options: chunk.map((f) => ({
      label: f.rel,
      description:
        f.rel === NEW_FOLDER_SENTINEL
          ? "Type a new folder name (lowercase-kebab)"
          : `${f.ruleCount} rule${f.ruleCount === 1 ? "" : "s"}`,
    })),
  }));

  return { questions, next };
}

/**
 * Rule-file picker for `add --template <name>`.
 * Multi-select. Each option label is the rule's rel path (under CONTEXT_DIR);
 * description is `<title> · <folder> · ~N tok`.
 */
export function buildAddTemplateAskPayload(
  rules: readonly RuleMetaInfo[],
  tokens: ReadonlyMap<string, number>,
  templateName: string,
): AskPayload {
  const next = `bun \${CLAUDE_PLUGIN_ROOT}/src/cli.ts context add --template "${templateName}" --pick "<comma-separated rule paths>"`;

  if (rules.length === 0) {
    return { questions: [], next: "(no rule files found — nothing to template)" };
  }
  if (rules.length === 1) {
    const only = rules[0]!;
    return {
      questions: [],
      next: `bun \${CLAUDE_PLUGIN_ROOT}/src/cli.ts context add --template "${templateName}" --pick "${only.rel}"`,
      autoPick: [only.rel],
    };
  }
  if (rules.length > MAX_TOTAL_OPTIONS) {
    const numbered = rules
      .map((r, i) => `${i + 1}. ${r.rel}  (${r.title}, ${formatTokens(tokens.get(r.rel) ?? 0)})`)
      .join("\n");
    return { questions: [], next, tooManyForUI: true, plainText: numbered };
  }

  const chunks = chunkBalanced([...rules]);
  const questions: AskQuestion[] = chunks.map((chunk, idx) => ({
    question:
      chunks.length === 1
        ? `Which rules go into template "${templateName}"?`
        : `Pick rules for "${templateName}" (group ${idx + 1} of ${chunks.length})`,
    header: chunks.length === 1 ? "Rules" : `Rules ${idx + 1}/${chunks.length}`,
    multiSelect: true,
    options: chunk.map((r) => ({
      label: r.rel,
      description: `${r.title} · ${r.folder} · ${formatTokens(tokens.get(r.rel) ?? 0)}`,
    })),
  }));
  return { questions, next };
}
