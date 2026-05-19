import { clearCwd } from "../cache.ts";
import { renderClearDirective } from "../render.ts";
import { success } from "../../../shared/ui.ts";

export async function run(_args: string[]): Promise<void> {
  const cwd = process.cwd();
  await clearCwd(cwd);
  success("cleared cache for this cwd");
  process.stdout.write(renderClearDirective() + "\n");
}
