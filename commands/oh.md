---
description: Run an oh-skills meta-command (init / doctor / help)
argument-hint: <init|doctor|help> [args...]
---

# /oh

Runs an oh-skills meta-command. The first argument is the subcommand; rest are forwarded.

| Subcommand | Effect |
|---|---|
| `init`   | Scaffold `.oh-env` (project or `~/.claude/.oh-env`) |
| `doctor` | Sanity-check the installation, paths, and configured agents |
| `help`   | Print the reference card (with your env values substituted) |

## How to invoke

```bash
bun ${CLAUDE_PLUGIN_ROOT}/src/cli.ts $1 ${@:2}
```

Read the stderr for the `__OH_<SKILL>_NEXT_ACTIONS__` sentinel + JSON, execute each action in order. For `help`, the rendered markdown goes to stdout — show it verbatim to the user.

> **Note:** `doctor` exits directly via `process.exit` (no sentinel emitted); `help` writes only to stdout (no sentinel emitted). Sentinel handling applies to `init` only (`__OH_INIT_NEXT_ACTIONS__`).
