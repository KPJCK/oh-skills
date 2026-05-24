// src/skills/search/prompts.ts
import { input, select, confirm } from "@inquirer/prompts";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(value: string): boolean {
  return SLUG_RE.test(value) && value.length >= 2 && value.length <= 64;
}

export function isValidTopic(value: string): boolean {
  // lowercase-kebab, no slashes (single-segment topic only)
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 32;
}

export async function promptSlug(opts?: { message?: string; default?: string }): Promise<string> {
  const raw = await input({
    message: opts?.message ?? "slug",
    ...(opts?.default !== undefined && { default: opts.default }),
    validate: (v) => isValidSlug(v.trim()) || "lowercase-kebab, 2-64 chars, [a-z0-9-]",
  });
  return raw.trim();
}

export async function promptTopic(opts?: { message?: string; default?: string }): Promise<string> {
  const raw = await input({
    message: opts?.message ?? "topic",
    ...(opts?.default !== undefined && { default: opts.default }),
    validate: (v) =>
      isValidTopic(v.trim()) || "lowercase-kebab, max 32 chars, single segment (no slashes)",
  });
  return raw.trim();
}

export { input, select, confirm };
