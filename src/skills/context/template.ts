import type { Priority } from "../../shared/frontmatter";

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function scaffoldRule(opts: {
  title: string;
  description: string;
  priority: Priority;
}): string {
  return `---
title: ${opts.title}
description: ${opts.description}
priority: ${opts.priority}
---

# ${opts.title}

## DO

- <fill me in>
- <fill me in>

## DO NOT

- <fill me in>
- <fill me in>

## Details

<optional free-form section — explain *why* the DOs / DO NOTs above exist,
 edge cases, examples. Delete this section if not needed.>
`;
}
