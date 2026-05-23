// src/skills/bug-tracing/prompts.ts
//
// Prompt builders for the two phases of `oh-bug-tracing fix`.
//
// fixPrompts.dispatched  → Mirai (coding sub-agent): fix the bug
// tracePrompts.selfAct   → main thread: forensic investigation, write trace.md

export const fixPrompts = {
  /**
   * Dispatched to the coding sub-agent (Mirai).
   * Instructs: minimal fix, clean diff, one-line file summary at the end.
   */
  dispatched(ctx: { bug: string; repoRoot: string; slug: string }): string {
    return [
      `Role: implementer · fresh sub-agent.`,
      ``,
      `Task: fix the bug described below. Minimal change only — no refactors, no extras.`,
      ``,
      `Workflow:`,
      `1. Read the relevant source files.`,
      `2. Identify the exact lines causing the bug.`,
      `3. Apply the smallest correct fix.`,
      `4. Run tests/typecheck/lint if available; confirm they pass.`,
      `5. Commit the fix with a clear message (e.g. "fix: <one-line description>").`,
      `6. At the end of your response, emit a one-line summary of which files:lines changed`,
      `   (so the trace phase can pick up the trail). Format:`,
      `   Changed: <file>:<line-range>[, <file>:<line-range>...]`,
      ``,
      `Bug description:`,
      ctx.bug,
      ``,
      `Repo root: ${ctx.repoRoot}`,
      `Trace slug (for reference): ${ctx.slug}`,
    ].join("\n");
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// trace.md section headers — kept in sync with the template enforced below
// ──────────────────────────────────────────────────────────────────────────────

export const TRACE_SECTIONS = [
  "## Symptom",
  "## Fix",
  "## Origin",
  "## Dev intent at the time",
  "## Why this slipped",
  "## Root cause class",
  "## Prevention",
  "## External research",
] as const;

export const ROOT_CAUSE_CLASSES = [
  "typo",
  "off-by-one",
  "wrong-abstraction",
  "missing-validation",
  "race",
  "API-misuse",
  "stale-cache",
  "type-coercion",
  "other",
] as const;

export const tracePrompts = {
  /**
   * Self-act prompt for the main thread: forensic investigation after Mirai's fix.
   * Writes a structured trace.md with all sections enforced.
   */
  selfAct(ctx: { bug: string; slug: string; tracePath: string; repoRoot: string }): string {
    return [
      `Act as a forensic detective. The bug described below has just been fixed by the coding agent.`,
      `Your job: investigate the root cause, reconstruct the original dev's intent, and write`,
      `a structured \`trace.md\` at the path below. Be charitable — assume the original dev had`,
      `a reasonable goal; the bug slipped through for an identifiable reason.`,
      ``,
      `Bug description: ${ctx.bug}`,
      `Trace slug: ${ctx.slug}`,
      `Write to: ${ctx.tracePath}`,
      `Repo root: ${ctx.repoRoot}`,
      ``,
      `## Investigation steps`,
      ``,
      `1. Read the just-applied diff (\`git diff HEAD~1\` — or \`git diff\` if Mirai left changes`,
      `   unstaged). Identify every touched file and line range.`,
      ``,
      `2. For each touched file/line: run \`git blame <file> -L <line-range>\` to find the`,
      `   introducing commit SHA.`,
      ``,
      `3. Run \`git log -p <sha> -1\` to read the full commit that introduced the bug.`,
      `   Pull out: author, date, commit message, and diff context.`,
      ``,
      `4. If the commit references a PR/issue (looks for "#NNN", "PR NNN", "issue NNN"), note it.`,
      `   Read \`git log --oneline\` for nearby context about what feature was being built.`,
      ``,
      `5. Read the surrounding code at that historical revision to infer what the developer`,
      `   was trying to accomplish (reconstruct intent, not blame).`,
      ``,
      `6. Classify root cause as exactly one of: ${ROOT_CAUSE_CLASSES.join(" · ")}.`,
      ``,
      `7. External research (conditional): if the pattern smells like a known framework`,
      `   gotcha or library anti-pattern (e.g. React hooks rules, off-by-one in a specific API,`,
      `   known Bun/Node quirk), fire ONE targeted WebSearch query. Otherwise skip.`,
      ``,
      `## Output format`,
      ``,
      `Write \`trace.md\` with EXACTLY these section headers (no extras, no reordering):`,
      ``,
      `\`\`\`markdown`,
      `# Trace: ${ctx.slug}`,
      ``,
      `${TRACE_SECTIONS[0]}`,
      `<what the user observed — 1–3 lines>`,
      ``,
      `${TRACE_SECTIONS[1]}`,
      `<what changed — file:line refs, 1–3 lines>`,
      ``,
      `${TRACE_SECTIONS[2]}`,
      `- Commit: <sha> (<date>, <author>)`,
      `- PR/issue: <link or "none found">`,
      `- Introduced in: <feature / refactor / hotfix / initial commit>`,
      ``,
      `${TRACE_SECTIONS[3]}`,
      `<reconstruct from commit message, PR body, surrounding code — 2–4 lines. Be charitable.>`,
      ``,
      `${TRACE_SECTIONS[4]}`,
      `<missing test? unclear contract? edge case not considered? — 1–3 lines>`,
      ``,
      `${TRACE_SECTIONS[5]}`,
      `<one of: ${ROOT_CAUSE_CLASSES.join(" · ")}>`,
      ``,
      `${TRACE_SECTIONS[6]}`,
      `- [ ] <concrete action: regression test / lint rule / type narrowing / docs note / process change>`,
      `- [ ] <second action if applicable>`,
      ``,
      `${TRACE_SECTIONS[7]}`,
      `<one-line summary of any web finding, or "skipped — local cause only">`,
      `\`\`\``,
      ``,
      `Style: terse, fragment-friendly, no padding. Outcome → artifact → next. No filler sentences.`,
      `After writing trace.md, emit a terse chat summary:`,
      `  <root-cause-class> bug · trace at ${ctx.tracePath} · next: [suggested follow-up]`,
    ].join("\n");
  },
};
