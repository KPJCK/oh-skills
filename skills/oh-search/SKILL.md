---
name: oh-search
description: Local research knowledge base — your offline reference library. Subcommands `find` (check local before any web research), `research` (emit a directive to go online), `add` (persist new knowledge — REQUIRES explicit user YES confirmation), `update` (Edit-tool driven), `delete`, `list`. **Use proactively before any WebSearch or WebFetch for stable reference topics** (official docs, API conventions, framework patterns, library usage) — run `find` first; only WebSearch if no good local match or local is stale. **Skip the local check for time-sensitive queries** (news, latest releases, recent incidents, who-did-what). After successful research, ALWAYS ask the user "save as knowledge? reply YES" before calling `add`.
---

# oh-search

Thin shim. CLI lives in the oh-skills plugin. Run via:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/src/cli.ts search <subcommand> [args]
```

## Subcommand routing

| User says… | Run |
|---|---|
| "what's known about X" / before WebSearch on a reference-y topic | `find "<query>"` |
| "look up X online" / "search the web for Y" | `research "<query>"` then WebSearch/WebFetch |
| `/oh-search list` or "what knowledge do I have" | `list [--topic <topic>]` |
| `/oh-search update X` or "fix this knowledge" | `update <topic>/<name>` |
| `/oh-search delete X` | `delete <topic>/<name>` |

## Proactive `find`-before-WebSearch rule

Run `find` first when the user's question is about official docs, API conventions, framework patterns, library usage, or stable how-to topics. Skip `find` and go straight to WebSearch for news, latest releases, recent incidents, or any time-sensitive data.

## YES-confirmation gate (mandatory)

The `add` command REFUSES to write without `--confirmed`. Before passing that flag:
1. Show the user a preview (proposed path, title, topic, summary, first ~20 lines of body).
2. Ask explicitly via AskUserQuestion: "Save this as knowledge?" with options "YES, save it" / "No, discard" / "Edit first".
3. Only if the user picks "YES, save it" (or types YES), call `add` with `--confirmed`.

Never assume consent. Never auto-confirm.

## Interpreting find / list output

**find** output: score table + top-match summary line.
- Top match covers intent → `Read` the full file at the listed path.
- Age >180d on a fast-moving topic → consider `/oh-search research <query>` to refresh.
- No good match → fall back to WebSearch/WebFetch, then `add` with YES confirm.

**list** output: knowledge table grouped by topic.
- Use `--topic <name>` to filter.

## Next-actions manifest

stderr final line: `__OH_SEARCH_NEXT_ACTIONS__<json>`. Actions: `invoke_skill`, `dispatch_agent`, `self_act`, `ask_user`, `report`. Execute each in order.

For the full flag cheatsheet, `add` call shape, and source citation rules: run `/oh help oh-search`.
