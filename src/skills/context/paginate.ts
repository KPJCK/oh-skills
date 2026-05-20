import os from "node:os";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { estimateTokens, formatTokens } from "./tokens.ts";
import { renderContext } from "./render.ts";
import { warn, hint, info } from "../../shared/ui.ts";
import { emit } from "../../shared/next-action.ts";
import type { Rule } from "./registry.ts";

export const STREAM_THRESHOLD_TOKENS = 15_000;
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

async function sumTokens(rules: readonly Rule[]): Promise<number> {
  let total = 0;
  for (const r of rules) {
    try {
      total += await estimateTokens(r.absPath);
    } catch {
      // skip — token cache errors shouldn't block delivery
    }
  }
  return total;
}

function buildPaginateInstructions(filePath: string, chunks: readonly Chunk[]): string {
  const reads = chunks
    .map((c) => `  Read('${filePath}', offset=${c.offset}, limit=${c.limit})`)
    .join("\n");
  return [
    `The full oh-context rule payload is at ${filePath} (too large to inline through stdout).`,
    "",
    "Read it in sequential chunks using the Read tool:",
    "",
    reads,
    "",
    "After reading every chunk, treat the combined markdown as authoritative session context — apply rules during this session and cite them by file path when relevant.",
  ].join("\n");
}

/**
 * Deliver the rendered rule payload to the caller. Small payloads stream
 * to stdout (existing behavior). Large payloads write to a known file
 * path and emit a next-action telling Claude to paginate-Read it — this
 * sidesteps the Bash tool's stdout cap that silently truncates anything
 * over ~tens of KB.
 */
export async function deliverPayload(rules: readonly Rule[]): Promise<void> {
  const totalTokens = await sumTokens(rules);
  const payload = renderContext(rules);

  if (totalTokens < STREAM_THRESHOLD_TOKENS) {
    info("Claude — treat the markdown below as authoritative session context.");
    process.stdout.write(payload + "\n");
    return;
  }

  const filePath = paginateFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, payload, "utf-8");

  const lineCount = payload.split("\n").length;
  const chunks = computeChunks(lineCount);
  const instructions = buildPaginateInstructions(filePath, chunks);

  warn(
    `payload ${formatTokens(totalTokens)} exceeds safe stdout (${formatTokens(STREAM_THRESHOLD_TOKENS)} threshold) — written to disk for paginated read`,
  );
  hint(`file: ${filePath} (${lineCount} lines, ${chunks.length} chunks)`);
  hint("Claude — see next-action manifest below for the exact Read calls");

  emit("context", [
    {
      type: "self_act",
      role: "research",
      prompt: instructions,
    },
  ]);
}
