import { loadCwd } from "../cache.ts";
import { renderCheckPayload, renderEmpty } from "../render.ts";
import { info } from "../../../shared/ui.ts";

export async function run(_args: string[]): Promise<void> {
  const cwd = process.cwd();
  const prev = await loadCwd(cwd);

  if (!prev || prev.lastLoaded.length === 0) {
    process.stdout.write(renderEmpty(`no rules loaded this session for ${shortHome(cwd)}`) + "\n");
    return;
  }

  info(
    `checking ${prev.lastLoaded.length} previously-loaded rule${prev.lastLoaded.length === 1 ? "" : "s"}`,
  );

  process.stdout.write(renderCheckPayload(prev.lastLoaded) + "\n");
}

function shortHome(p: string): string {
  const home = process.env.HOME ?? "";
  return home && p.startsWith(home) ? "~" + p.slice(home.length) : p;
}
