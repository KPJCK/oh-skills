import os from "node:os";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { renderContext } from "./render.ts";
import { emit } from "../../shared/next-action.ts";
import type { Rule } from "./registry.ts";

export const CHUNK_LINES = 900;

export function paginateFilePath(): string {
  return path.join(os.tmpdir(), "oh-context-load-payload.md");
}

export type Chunk = { offset: number; limit: number };

export function computeChunks(totalLines: number, chunkSize = CHUNK_LINES): Chunk[] {
  const chunks: Chunk[] = [];
  let offset = 1;
  while (offset <= totalLines) {
    const remaining = totalLines - offset + 1;
    // Last chunk absorbs the tail when it would otherwise be tiny
    const limit = remaining <= chunkSize + 200 ? remaining : chunkSize;
    chunks.push({ offset, limit });
    offset += limit;
  }
  return chunks;
}

function buildPaginateInstructions(filePath: string, chunks: readonly Chunk[]): string {
  const reads = chunks
    .map((c) => `  Read('${filePath}', offset=${c.offset}, limit=${c.limit})`)
    .join("\n");
  return [
    `The full oh-context rule payload is at ${filePath}.`,
    "",
    "Read it in PARALLEL: invoke all of the following Read tool calls in a SINGLE assistant message (one turn, multiple tool_use blocks side-by-side). Do NOT call them sequentially across turns — the chunks are independent and must run concurrently.",
    "",
    reads,
    "",
    "After every Read returns, concatenate the chunks by ascending offset and treat the combined markdown as authoritative session context — apply rules during this session and cite them by file path when relevant.",
    "",
    "Response style: your reply to the user after all Reads complete must contain ONLY the banner echo — one `Context Loaded:` header line followed by one `[<folder>]: <N> rule(s)` line per loaded folder (`(new)` suffix preserved). Do NOT list individual rules, do NOT print a table, do NOT summarize key conventions or takeaways, do NOT echo any rule body. The rules apply silently — the user will see them in action from your next message onward.",
  ].join("\n");
}

/**
 * Write the rendered rule payload to a known disk path and emit a
 * `self_act` next-action with the exact Read calls Claude should run.
 * This keeps the terminal output limited to the banner (the user-facing
 * report) while delivering the full markdown to Claude out-of-band.
 */
export async function deliverPayload(rules: readonly Rule[]): Promise<void> {
  const payload = renderContext(rules);

  const filePath = paginateFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, payload, "utf-8");

  const lineCount = payload.split("\n").length;
  const chunks = computeChunks(lineCount);
  const instructions = buildPaginateInstructions(filePath, chunks);

  emit("context", [
    {
      type: "self_act",
      role: "research",
      prompt: instructions,
    },
  ]);
}
