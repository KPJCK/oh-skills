// src/skills/search/scoring.ts
import type { Knowledge } from "./registry.ts";

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "in",
  "of",
  "for",
  "to",
  "and",
  "or",
  "is",
  "are",
  "with",
  "on",
  "at",
  "by",
  "from",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function hayContains(hay: string, needle: string): boolean {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

export function score(query: string, k: Knowledge): number {
  const qTerms = tokens(query);
  if (qTerms.length === 0) return 0;

  let s = 0;

  // Filename-as-whole match (catches direct name lookups like `find oh-series`).
  // Normalize spaces → hyphens so "oh series" also matches name "oh-series".
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, "-");
  if (k.name === normalizedQuery) s += 5;
  else if (k.name.includes(normalizedQuery) || normalizedQuery.includes(k.name)) s += 2;

  const titleTokens = tokens(k.meta.title);
  const summaryTokens = tokens(k.meta.summary);
  const tagSet = new Set((k.meta.tags ?? []).map((t) => t.toLowerCase()));
  const topicTokens = tokens(k.meta.topic);
  const queryTokens = tokens(k.meta.query ?? "");
  const fileTokens = tokens(k.name);

  for (const q of qTerms) {
    if (titleTokens.includes(q)) s += 5;
    if (summaryTokens.includes(q)) s += 3;
    if (tagSet.has(q)) s += 3;
    if (topicTokens.includes(q)) s += 2;
    if (queryTokens.includes(q)) s += 1;
    if (fileTokens.includes(q)) s += 0.5;
  }

  // Bonus: exact phrase match in title or summary
  if (hayContains(k.meta.title, query)) s += 3;
  if (hayContains(k.meta.summary, query)) s += 2;

  return s;
}

export function rankAndFilter(
  query: string,
  knowledges: readonly Knowledge[],
  opts: { threshold?: number; limit?: number } = {},
): Array<{ knowledge: Knowledge; score: number }> {
  const threshold = opts.threshold ?? 2;
  const limit = opts.limit ?? 5;
  return knowledges
    .map((k) => ({ knowledge: k, score: score(query, k) }))
    .filter((r) => r.score >= threshold)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit);
}
