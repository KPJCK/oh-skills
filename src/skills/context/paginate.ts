import os from "node:os";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { renderContext } from "./render.ts";
import { warn, hint, info } from "../../shared/ui.ts";
import { emit } from "../../shared/next-action.ts";
import { formatBytes } from "../../shared/format-bytes.ts";
import type { Rule } from "./registry.ts";

export const STREAM_THRESHOLD_BYTES = 20_000;
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

export function buildPaginateInstructions(filePath: string, chunks: readonly Chunk[]): string {
  const reads = chunks
    .map((c) => `  Read('${filePath}', offset=${c.offset}, limit=${c.limit})`)
    .join("\n");
  return [
    `The full oh-context rule payload is at ${filePath} (too large to inline through stdout).`,
    "",
    `Read it in ${chunks.length} parallel chunks — call ALL of the Read tools below in a SINGLE message (parallel tool calls), not one at a time. There are no dependencies`,
    "between chunks.",
    "",
    reads,
    "",
    "After every chunk has returned, concatenate them in order and treat the",
    "combined markdown as authoritative session context — apply rules during this",
    "session and cite them by file path when relevant.",
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
  const payload = renderContext(rules);
  const byteLen = Buffer.byteLength(payload, "utf-8");

  if (byteLen < STREAM_THRESHOLD_BYTES) {
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
    `payload ${formatBytes(byteLen)} exceeds safe stdout (${formatBytes(STREAM_THRESHOLD_BYTES)} threshold) — written to disk for paginated read`,
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
