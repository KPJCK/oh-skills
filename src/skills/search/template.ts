// src/skills/search/template.ts
import { todayISO } from "../../shared/frontmatter";

export type ScaffoldOpts = {
  title: string;
  summary: string;
  topic: string;
  query?: string;
  sources?: string[];
  tags?: string[];
  body: string; // markdown body, no frontmatter, may or may not start with `# Title`
  created?: string;
  updated?: string;
};

export function scaffoldKnowledge(opts: ScaffoldOpts): string {
  const created = opts.created ?? todayISO();
  const updated = opts.updated ?? created;
  const tagsLine = renderListInline(opts.tags ?? []);
  const sourcesBlock = renderListBlock(opts.sources ?? []);

  const trimmedBody = opts.body.trim();
  const firstLine = trimmedBody.split("\n", 1)[0] ?? "";
  const hasH1 = firstLine.startsWith("# ");
  const bodyForFile = hasH1 ? trimmedBody : `# ${opts.title}\n\n${trimmedBody}`;

  const fmLines: string[] = [];
  fmLines.push("---");
  fmLines.push(`title: ${opts.title}`);
  fmLines.push(`summary: ${opts.summary}`);
  fmLines.push(`topic: ${opts.topic}`);
  if (opts.tags && opts.tags.length > 0) {
    fmLines.push(`tags: ${tagsLine}`);
  } else {
    fmLines.push(`tags: []`);
  }
  if (opts.query) fmLines.push(`query: ${quoteIfNeeded(opts.query)}`);
  if (opts.sources && opts.sources.length > 0) {
    fmLines.push(`sources:`);
    for (const line of sourcesBlock) fmLines.push(line);
  } else {
    fmLines.push(`sources: []`);
  }
  fmLines.push(`created: ${created}`);
  fmLines.push(`updated: ${updated}`);
  fmLines.push("---");

  return `${fmLines.join("\n")}\n\n${bodyForFile}\n`;
}

function renderListInline(items: readonly string[]): string {
  if (items.length === 0) return "[]";
  return `[${items.map(quoteIfNeeded).join(", ")}]`;
}

function renderListBlock(items: readonly string[]): string[] {
  return items.map((s) => `  - ${quoteIfNeeded(s)}`);
}

function quoteIfNeeded(s: string): string {
  // YAML-safe: quote if it contains : # [ ] { } , & * ! | > ' " % @ ` or starts with -
  return /[:#[\]{},&*!|>'"%@`]|^-/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
