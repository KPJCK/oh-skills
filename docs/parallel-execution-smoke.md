# Manual smoke test: parallel `oh-nice go`

The DAG and phase machinery are unit-tested, but the real risk of the
shared-tree + trust-files-touched model is that a dispatched Mirai might
silently edit a file outside its declared `Files:` list. This recipe verifies
that doesn't happen in practice before merging.

## Setup

1. From a clean working tree on `main`, create a temporary throwaway branch:
   ```bash
   git checkout -b smoke-parallel-go
   ```
2. Create a tiny plan dir with the diamond fixture:
   ```bash
   PLAN_DIR=$(bun -e 'import("./src/env.ts").then(m => process.stdout.write(m.loadOhEnv().PLAN_DIR))')
   mkdir -p "$PLAN_DIR/oh-skills/smoke-parallel"
   cp tests/fixtures/plans/valid-parallel.md "$PLAN_DIR/oh-skills/smoke-parallel/plan.md"
   echo "stub" > "$PLAN_DIR/oh-skills/smoke-parallel/spec.md"
   ```

## Run

3. From the Claude Code conversation, invoke:
   ```
   /oh-nice go
   ```
   pick `smoke-parallel`. Watch:
   - Wave 1 dispatches ONE Mirai (for `types-define`).
   - When it returns, manually invoke
     `/oh-nice go --phase=wave-done --slug smoke-parallel --done types-define`.
   - Wave 2 dispatches TWO Mirais in parallel (for `parser-tokenize` and
     `renderer-init`).
   - Verify both Mirais return DONE.
   - Final wave dispatches ONE Mirai (`index-wire`).

## Verify

4. Check that each commit touches ONLY the files declared in its task's
   `**Files:**` block:

   ```bash
   git log --stat --reverse main..HEAD
   ```

   For each commit:
   - `types-define` commit should only touch `src/types.ts`.
   - `parser-tokenize` commit should only touch `src/parser/tokenize.ts` and
     `tests/parser/tokenize.test.ts`.
   - `renderer-init` commit should only touch `src/renderer.ts`.
   - `index-wire` commit should only touch `src/index.ts`.

5. If any commit touched a file outside its task's declared list, that's a
   prompt-discipline failure. File an issue with the offending diff and the
   Mirai prompt that was dispatched.

## Cleanup

```bash
git checkout main
git branch -D smoke-parallel-go
rm -rf "$PLAN_DIR/oh-skills/smoke-parallel"
```
