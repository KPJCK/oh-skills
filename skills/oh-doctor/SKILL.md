---
name: oh-doctor
description:
  Sanity-check the oh-skills installation. Verifies Bun, plugin node_modules,
  .oh-env loadability, configured paths exist, and configured agents resolve to
  known subagent_types.
disable-model-invocation: true
---

# oh-doctor

One-shot diagnostic. Run:

```bash
bun ${CLAUDE_PLUGIN_ROOT:-${ANTIGRAVITY_PLUGIN_ROOT:-$HOME/.gemini/antigravity-cli/plugins/oh-skills}}/src/cli.ts doctor
```

stdout is a markdown report grouped by section (env / dirs / settings / agents /
shadow detection). Each row has ✅ / ⚠️ / ❌. Exit 0 if no failures, 1 if any
check failed.

After running, surface the summary line (`X ✅ · Y ⚠️ · Z ❌`) and walk through
any ❌ rows with their `↳ fix:` hints. For ⚠️ rows, mention them but don't
insist — they're often expected (e.g. unset agents).
