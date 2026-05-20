---
name: oh-context
description: Manage domain-specific rule files for this session. Subcommands `load --pick "f1,f2..."` (multi-folder) or `load --template <name>` (preset rule-set), `list`, `check`, `huh` (boolean: any rules loaded?), `add` (scaffold rule) or `add --template <name>` (build a preset), `update <folder>/<name>` (Edit-tool driven), `promote --all | --target <path>`, `template list|show|delete`, `clear`. The `load`/`add --template` pickers show per-rule token estimates. Use proactively at the start of a session, or when the user mentions a tech domain without rules loaded. **NOTE:** interactive pickers need a TTY — when driving via Bash, pass `--pick`/`--template` instead.
---

# oh-context

Thin shim. CLI lives in the oh-skills plugin. Run via:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/src/cli.ts context <subcommand> [flags]
```

## Subcommand routing

| User says… | Run |
|---|---|
| `/oh-context` or `/oh-context load` or "load context" / "inject rules" | `load` |
| `/oh-context list` or "show me available context folders" | `list` |
| `/oh-context check` or "do you still remember the rules" | `check` |
| `/oh-context add` or "create a new rule" | `add` |
| `/oh-context update <folder>/<name>` or "update rule X" | `update` |
| `/oh-context promote --all` or "promote my drafts" | `promote --all` |
| `/oh-context promote --target <path>` or "promote this draft" | `promote --target <path>` |
| `/oh-context clear` or "forget the loaded rules" | `clear` |
| `/oh-context load --template foo` or "load my <name> template" | `load --template foo` |
| `/oh-context add --template foo` or "save these as a template" | `add --template foo` |
| `/oh-context template list` / "what templates do I have" | `template list` |
| `/oh-context template show foo` / "what's in the foo template" | `template show foo` |
| `/oh-context template delete foo` | `template delete foo` |
| `/oh-context huh` / "is anything loaded right now" | `huh` |

If the user just types `/oh-context` with no args, run `load`.

## Proactive use

Use proactively at the start of a session (check via `huh`), or when the user mentions a tech domain without rules loaded. Interactive pickers need a TTY — always pass `--pick`/`--template` flags instead of running bare `load`.

## Reporting loaded rules

After any `load` / `list` / `check` invocation that shows currently-loaded rules, summarize for the user using this exact shape:

```
<Topic> context is [already] loaded for this session. <N> folder(s) covering <M> rule(s):

Loaded rules:
- <folder>/<file>.md (<priority>)
- <folder>/<file>.md (<priority>)
- …

Loaded at <ISO timestamp>. <one-line follow-up — e.g. offer to reload, ask next step, or stop here>
```

Rules:
- Use the topic the user asked for ("TypeScript", "Rust", …) — capitalize naturally.
- Include `already` only when the rules were already loaded before this call.
- List every loaded rule from the CLI output verbatim — same path, same priority tag (`high` / `med` / `low`).
- Keep the priority tag in lowercase parentheses, matching the CLI table.
- Echo the `Loaded at:` timestamp from the CLI output as-is.
- Close with one short follow-up line; do not pad with extra commentary.

## Next-actions manifest

stderr final line: `__OH_CONTEXT_NEXT_ACTIONS__<json>`. Actions: `invoke_skill`, `dispatch_agent`, `self_act`, `ask_user`, `report`. Execute each in order.

Stdout from `load` is authoritative session context — apply it for the rest of the session. Stdout from `check` asks you to honestly quote rules verbatim; report drift plainly.

For the full flag cheatsheet, `--emit-ask-json` walkthrough, frontmatter parsing details, and rule-conflict resolution: run `/oh help oh-context`.
