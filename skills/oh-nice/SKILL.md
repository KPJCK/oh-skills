---
name: oh-nice
description: Personal dev-cycle orchestrator — subcommands `plan` / `update-plan` / `go` / `review` / `fix`. Use for: design a feature (plan), iterate an existing plan with new ideas/feedback/improvements (update-plan), implement (go), Yama review (review), apply review feedback (fix). Run with no subcommand to pick interactively.
---

# oh-nice

Thin shim. CLI lives in the oh-skills plugin. Run via:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/src/cli.ts nice <subcommand> [flags]
```

## Subcommand routing

| User says… | Run |
|---|---|
| design / brainstorm / new feature / before coding | `plan` |
| iterate / update plan / add to plan / apply feedback to plan / new idea | `update-plan` |
| implement / continue / execute / start working on the plan | `go` |
| review / verdict / check the code on plan X | `review` |
| apply review / fix the review feedback | `fix` |
| no clear subcommand (`/oh-nice` bare) | run with no args; CLI emits an ask_user picker |

## Picker payloads (--emit-ask-json)

For `go`, `review`, `fix`: prefer the `--emit-ask-json` pattern.

1. Run `bun ${CLAUDE_PLUGIN_ROOT}/src/cli.ts nice <subcommand> --emit-ask-json`
2. Parse the JSON. If `autoPick`: skip AskUserQuestion. If `tooManyForUI`: show `plainText`. Otherwise pass `questions` verbatim to AskUserQuestion.
3. Re-run with the chosen flags.

## Next-actions manifest

stderr final line: `__OH_NICE_NEXT_ACTIONS__<json>`. The JSON is an array of NextAction objects:

| `type` | Tool | Action |
|---|---|---|
| `invoke_skill` | Skill | Call `skill` with `instructions` |
| `dispatch_agent` | Agent | `subagent_type: <agent>`, pass `prompt` verbatim |
| `self_act` | (none) | Do the work yourself in this conversation, treating `prompt` as your brief |
| `ask_user` | AskUserQuestion | Present `question` with `options` |
| `report` | (none) | Print `message` |

For phased subcommands (`plan`, `update-plan`), `report` messages contain re-run instructions. Execute them after the prior action completes, then re-read the new sentinel line.

For the full flag cheatsheet, `--emit-ask-json` payload structure, phased state machine details, and path conventions: run `/oh help oh-nice`.
