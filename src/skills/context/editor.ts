import { spawn } from "node:child_process";

/**
 * Open `path` in the user's editor and wait for it to close.
 * Uses $EDITOR if set; falls back to `code -w` (waits) which matches the
 * user's settings.json default.
 */
export async function openInEditor(filePath: string): Promise<void> {
  const editor = process.env.EDITOR ?? "code -w";
  const [cmd, ...args] = editor.split(/\s+/);
  if (!cmd) throw new Error("EDITOR is empty");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, [...args, filePath], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`editor exited with code ${code}`));
    });
  });
}
