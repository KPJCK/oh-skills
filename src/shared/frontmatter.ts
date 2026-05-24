// src/shared/frontmatter.ts
export type FrontmatterRaw = Record<string, string | number | boolean | string[]>;

export type ParsedFile = {
  meta: FrontmatterRaw;
  body: string;
};

const FENCE = "---";

export function parseFrontmatter(content: string): ParsedFile {
  if (!content.startsWith(`${FENCE}\n`) && !content.startsWith(`${FENCE}\r\n`)) {
    return { meta: {}, body: content };
  }
  const lines = content.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === FENCE) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("unterminated frontmatter (missing closing ---)");
  const yamlLines = lines.slice(1, end);
  const meta: FrontmatterRaw = {};

  for (let i = 0; i < yamlLines.length; i++) {
    const raw = yamlLines[i]!;

    // Block list item (  - value): handled when we encounter the parent key
    if (raw.startsWith("  - ")) continue;

    // Strip inline comments then trim
    const line = raw.replace(/#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;

    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    let val: string | string[] | number | boolean = line.slice(colon + 1).trim();

    // Empty value — check for block list that follows
    if (val === "") {
      const items: string[] = [];
      let j = i + 1;
      while (j < yamlLines.length && yamlLines[j]!.startsWith("  - ")) {
        items.push(unquote(yamlLines[j]!.slice(4).trim()));
        j++;
      }
      if (items.length > 0) {
        meta[key] = items;
        i = j - 1;
        continue;
      }
      // Empty string value (no block list)
      meta[key] = "";
      continue;
    }

    // Strip quotes
    if (
      typeof val === "string" &&
      ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'")))
    ) {
      val = val.slice(1, -1);
    }

    // Inline array [a, b, c]
    if (typeof val === "string" && val.startsWith("[") && val.endsWith("]")) {
      val = val
        .slice(1, -1)
        .split(",")
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
    }

    // Boolean
    if (val === "true") val = true;
    else if (val === "false") val = false;
    // Number
    else if (typeof val === "string" && /^-?\d+(\.\d+)?$/.test(val))
      val = Number(val);

    meta[key] = val;
  }

  const body = lines.slice(end + 1).join("\n");
  return { meta, body };
}

function unquote(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Rule variant
// ---------------------------------------------------------------------------

export type Priority = "low" | "medium" | "high";

export type RuleMeta = {
  title: string;
  description: string;
  priority: Priority;
};

export interface ParsedRule extends ParsedFile {
  meta: FrontmatterRaw & RuleMeta;
}

export function parseRule(content: string): ParsedRule {
  if (!content.startsWith(`${FENCE}\n`) && !content.startsWith(`${FENCE}\r\n`)) {
    throw new Error("missing frontmatter (--- ... ---)");
  }
  const parsed = parseFrontmatter(content);
  const title = parsed.meta["title"];
  const description = parsed.meta["description"];
  let priority = parsed.meta["priority"];

  if (typeof title !== "string" || !title)
    throw new Error("missing required field: title");
  if (typeof description !== "string" || !description)
    throw new Error("missing required field: description");

  // Default priority to medium when omitted
  if (priority === undefined || priority === "") {
    priority = "medium";
  }

  if (priority !== "low" && priority !== "medium" && priority !== "high") {
    throw new Error(
      `invalid priority: ${String(priority)} (expected low | medium | high)`,
    );
  }

  return {
    meta: { ...parsed.meta, title, description, priority } as FrontmatterRaw &
      RuleMeta,
    body: parsed.body,
  };
}

export function priorityRank(p: Priority): number {
  return p === "high" ? 0 : p === "medium" ? 1 : 2;
}

// ---------------------------------------------------------------------------
// Knowledge variant
// ---------------------------------------------------------------------------

export type KnowledgeMeta = {
  topic: string;
  title: string;
  summary: string;
  created: string;
  updated: string;
  query?: string;
  sources?: string[];
  tags?: string[];
};

export interface ParsedKnowledge extends ParsedFile {
  meta: FrontmatterRaw & KnowledgeMeta;
}

export function parseKnowledge(content: string): ParsedKnowledge {
  if (!content.startsWith(`${FENCE}\n`) && !content.startsWith(`${FENCE}\r\n`)) {
    throw new Error("missing frontmatter (--- ... ---)");
  }
  const parsed = parseFrontmatter(content);
  const required = ["topic", "title", "summary", "created", "updated"] as const;
  for (const k of required) {
    if (typeof parsed.meta[k] !== "string" || !parsed.meta[k]) {
      throw new Error(`missing/invalid ${k} in frontmatter`);
    }
  }
  // Apply defaults for optional fields that consumers expect to always be present
  const tags = (parsed.meta["tags"] as string[] | undefined) ?? [];
  const sources = (parsed.meta["sources"] as string[] | undefined) ?? [];
  const query = (parsed.meta["query"] as string | undefined) ?? "";
  return {
    body: parsed.body,
    meta: {
      ...parsed.meta,
      topic: parsed.meta["topic"] as string,
      title: parsed.meta["title"] as string,
      summary: parsed.meta["summary"] as string,
      created: parsed.meta["created"] as string,
      updated: parsed.meta["updated"] as string,
      query,
      sources,
      tags,
    },
  };
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
