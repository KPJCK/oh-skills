import { clearCwd } from "../cache";
import { renderClearDirective } from "../render";
import { success } from "../../../shared/ui";

export async function run(_args: string[]): Promise<void> {
  const cwd = process.cwd();
  await clearCwd(cwd);
  success("cleared cache for this cwd");
  process.stdout.write(renderClearDirective() + "\n");
}
