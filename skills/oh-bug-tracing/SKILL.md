---
name: oh-bug-tracing
description:
  Fix an ad-hoc bug and write a forensic trace.md — git archaeology, root-cause
  classification, prevention checklist. Single subcommand `fix`. Run with no
  args to pick interactively.
disable-model-invocation: true
---

# oh-bug-tracing

Thin shim. CLI lives in the oh-skills plugin. Run via:

```bash
bun ${CLAUDE_PLUGIN_ROOT:-${ANTIGRAVITY_PLUGIN_ROOT:-$HOME/.gemini/antigravity-cli/plugins/oh-skills}}/src/cli.ts bug-tracing fix "<bug description>" [--slug=<name>]
```

## Subcommand routing

| User says…                                   | Run                                            |
| -------------------------------------------- | ---------------------------------------------- |
| fix a bug / squash / investigate             | `fix`                                          |
| no clear subcommand (`/oh-bug-tracing` bare) | run with no args; CLI emits an ask_user picker |

## Two-phase flow

### Phase 1 — fix (default)

```bash
bun ${CLAUDE_PLUGIN_ROOT:-${ANTIGRAVITY_PLUGIN_ROOT:-$HOME/.gemini/antigravity-cli/plugins/oh-skills}}/src/cli.ts bug-tracing fix "<bug>" [--slug=<name>]
```

Emits two next-actions:

1. `dispatch_agent` (role: coding) → {{CODING_AGENT}} fixes the bug minimally
   and commits.
2. `report` → re-run command for phase 2.

### Phase 2 — trace

```bash
bun ${CLAUDE_PLUGIN_ROOT:-${ANTIGRAVITY_PLUGIN_ROOT:-$HOME/.gemini/antigravity-cli/plugins/oh-skills}}/src/cli.ts bug-tracing fix --phase=trace --slug=<slug> "<bug>"
```

Emits two next-actions:

1. `self_act` (role: coding) → main thread runs forensic investigation: git
   diff, git blame, git log, root-cause classification, optional WebSearch,
   writes `trace.md`.
2. `report` → terse chat summary: root-cause class · artifact path · next
   action.

## Next-actions manifest

stderr final line: `__OH_BUG_TRACING_NEXT_ACTIONS__<json>`. Same NextAction
shape as oh-nice.

| `type`           | Tool   | Action                                                            |
| ---------------- | ------ | ----------------------------------------------------------------- |
| `dispatch_agent` | Agent  | `subagent_type: <agent>`, pass `prompt` verbatim                  |
| `self_act`       | (none) | Do the work in this conversation, treating `prompt` as your brief |
| `report`         | (none) | Print `message`                                                   |

## Slug derivation

Auto-derived: first 5–6 words of the bug description, lowercased, kebab-case,
non-alphanumeric stripped. Override: `--slug=<name>` (must be lowercase-kebab).

## Artifact

`{{PLAN_DIR}}/<repo>/<slug>/trace.md`

Sections (enforced by the detective prompt): `Symptom` · `Fix` · `Origin` ·
`Dev intent at the time` · `Why this slipped` · `Root cause class` ·
`Prevention` · `External research`

Root cause classes: `typo` · `off-by-one` · `wrong-abstraction` ·
`missing-validation` · `race` · `API-misuse` · `stale-cache` · `type-coercion` ·
`other`

## Out of scope

- No standalone `trace`-only subcommand.
- No new sub-agent (main thread does the trace inline).
- No integration with `/oh-nice review` checkbox findings.
- No auto-applied lint rules or regression tests (listed as TODOs in Prevention
  section).
