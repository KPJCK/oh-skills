import path from "node:path";
import { listFolders, loadRules } from "../registry.ts";
import { loadOhEnv } from "../../../env.ts";
import { pickFolders } from "../picker.ts";
import { loadCwd, saveCwd } from "../cache.ts";
import { renderContext, renderEmpty } from "../render.ts";
import { buildLoadAskPayload } from "../ask-ui.ts";
import { step, info, success, error } from "../../../shared/ui.ts";

type Flags = {
  pick: string[] | null;
  all: boolean;
  emitAskJson: boolean;
  template: string | null;
};

function parseFlags(args: string[]): Flags {
  const flags: Flags = { pick: null, all: false, emitAskJson: false, template: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--pick") {
      const raw = args[++i] ?? "";
      flags.pick = raw
        .split(",")
        .map((s) => s.trim().replace(/\/$/, ""))
        .filter(Boolean);
    } else if (a === "--all") {
      flags.all = true;
    } else if (a === "--emit-ask-json") {
      flags.emitAskJson = true;
    } else if (a === "--template") {
      flags.template = args[++i] ?? null;
    } else {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  return flags;
}

export async function run(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const cwd = process.cwd();

  // Mutual exclusion
  const exclusiveCount =
    (flags.pick ? 1 : 0) + (flags.all ? 1 : 0) + (flags.template ? 1 : 0);
  if (exclusiveCount > 1) {
    error("flags --pick, --all, and --template are mutually exclusive");
    process.exit(2);
  }

  // Template branch — resolves a saved preset directly, no folder picker needed.
  if (flags.template !== null) {
    const { resolveTemplate } = await import("../templates.ts");
    const rules = await resolveTemplate(flags.template);
    if (rules.length === 0) {
      process.stdout.write(renderEmpty(`template "${flags.template}" resolved to zero rules`) + "\n");
      return;
    }
    const contextRoot = loadOhEnv().CONTEXT_DIR;
    await saveCwd(cwd, {
      lastPicks: [],
      lastLoaded: rules.map((r) => ({
        file: path.relative(contextRoot, r.absPath),
        title: r.title,
        priority: r.priority,
        hash: r.hash,
      })),
    });
    const { formatTokens, estimateTokens } = await import("../tokens.ts");
    let total = 0;
    for (const r of rules) {
      try { total += await estimateTokens(r.absPath); } catch { /* skip */ }
    }
    success(
      `loaded template "${flags.template}" · ${rules.length} rule${rules.length === 1 ? "" : "s"} (${formatTokens(total)} total)`,
    );
    info("Claude — treat the markdown below as authoritative session context.");
    process.stdout.write(renderContext(rules) + "\n");
    return;
  }

  const folders = await listFolders();

  if (folders.length === 0) {
    const contextRoot = loadOhEnv().CONTEXT_DIR;
    process.stdout.write(
      renderEmpty(`no rule folders found under ${contextRoot}`) + "\n",
    );
    return;
  }

  // --emit-ask-json: print ready-to-execute AskUserQuestion payload + exit.
  // SKILL.md tells Claude to call this first, pass `questions` verbatim to
  // AskUserQuestion, then re-invoke with --pick.
  if (flags.emitAskJson) {
    const prev = await loadCwd(cwd);
    const { estimateTokens } = await import("../tokens.ts");
    const folderTokens = new Map<string, number>();
    for (const f of folders) {
      try {
        const rules = await loadRules([f.rel]);
        let total = 0;
        for (const r of rules) total += await estimateTokens(r.absPath);
        folderTokens.set(f.rel, total);
      } catch {
        // skip
      }
    }
    const payload = buildLoadAskPayload(folders, prev?.lastPicks ?? [], folderTokens);
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }

  // Determine which folders to load.
  let picked: string[];

  if (flags.all) {
    picked = folders.map((f) => f.rel);
    info(`loading ALL ${picked.length} folders via --all`);
  } else if (flags.pick !== null) {
    // Non-interactive (used by Claude through Bash tool).
    const validNames = new Set(folders.map((f) => f.rel));
    const invalid = flags.pick.filter((p) => !validNames.has(p));
    if (invalid.length > 0) {
      error(
        `unknown folder(s): ${invalid.join(", ")}`,
        `valid folders: ${folders.map((f) => f.rel).join(", ")}`,
      );
      process.exit(2);
    }
    picked = flags.pick;
    info(`loading ${picked.length} folder${picked.length === 1 ? "" : "s"} via --pick`);
  } else {
    // Interactive picker — only works in a real terminal (TTY).
    // Claude's Bash tool runs with stdin = non-TTY → fail fast with a clear message
    // pointing at the --pick alternative.
    if (!process.stdin.isTTY) {
      error(
        "interactive picker requires a TTY (stdin is not a terminal)",
        "you're likely invoking this through Claude's Bash tool — pass --pick \"<f1>,<f2>\" or --all instead.\n" +
          `       available folders:\n         - ${folders.map((f) => f.rel).join("\n         - ")}\n` +
          `       previously loaded for this cwd: ${(await loadCwd(cwd))?.lastPicks.join(", ") || "(none)"}`,
      );
      process.exit(2);
    }

    const prev = await loadCwd(cwd);
    const preselected = prev?.lastPicks ?? [];

    step("Pick context folders");
    const result = await pickFolders(folders, preselected);

    if (result === null) {
      process.stdout.write(renderEmpty("cancelled — no context loaded") + "\n");
      return;
    }
    if (result.length === 0) {
      process.stdout.write(
        renderEmpty("nothing selected — no context loaded") + "\n",
      );
      return;
    }
    picked = result;
  }

  const rules = await loadRules(picked);
  if (rules.length === 0) {
    process.stdout.write(
      renderEmpty("selected folders had no rule-*.md files") + "\n",
    );
    return;
  }

  const contextRoot = loadOhEnv().CONTEXT_DIR;
  await saveCwd(cwd, {
    lastPicks: picked,
    lastLoaded: rules.map((r) => ({
      file: path.relative(contextRoot, r.absPath),
      title: r.title,
      priority: r.priority,
      hash: r.hash,
    })),
  });

  success(
    `loaded ${rules.length} rule${rules.length === 1 ? "" : "s"} from ${picked.length} folder${picked.length === 1 ? "" : "s"}`,
  );
  info("Claude — treat the markdown below as authoritative session context.");

  process.stdout.write(renderContext(rules) + "\n");
}
