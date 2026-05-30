---
name: oh-help
description:
  Reference guide for the `oh-*` family of skills (oh-nice with
  plan/update-plan/go/review/fix, oh-context with
  load/list/check/huh/add/update/promote/template/clear, oh-search, oh-doctor,
  oh-help) plus the backup-now skill and the working sub-agents (mirai, yama,
  rudy). Use when the user asks "what do these oh-* tools do?", "/oh-help",
  "explain the setup", "remind me what's available", or any similar discovery
  question.
disable-model-invocation: true
---

# oh-help

Shim. Run:

```bash
bun ${CLAUDE_PLUGIN_ROOT:-${ANTIGRAVITY_PLUGIN_ROOT:-$HOME/.gemini/antigravity-cli/plugins/oh-skills}}/src/cli.ts help [section]
```

Without an arg: prints the full reference card (env values substituted into the
template). With an arg (e.g. `oh-context`): prints just that `## <name>`
section.

Show the output verbatim to the user.
