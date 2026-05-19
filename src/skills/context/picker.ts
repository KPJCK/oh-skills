import { checkbox, select, input } from "@inquirer/prompts";
import type { FolderInfo } from "./registry.ts";

export async function pickFolders(
  folders: readonly FolderInfo[],
  preselected: readonly string[],
): Promise<string[] | null> {
  if (folders.length === 0) return [];
  try {
    const selected = await checkbox({
      message: "Pick context folders to load (Space to toggle, Enter to confirm)",
      choices: folders.map((f) => ({
        name: `${f.rel.padEnd(32)} ${dim(`${f.ruleCount} rule${f.ruleCount === 1 ? "" : "s"}`)}`,
        value: f.rel,
        checked: preselected.includes(f.rel),
      })),
      pageSize: Math.min(folders.length + 2, 15),
    });
    return [...selected];
  } catch {
    return null;
  }
}

const NEW_FOLDER_SENTINEL = "__new__";

export async function pickFolderForAdd(
  folders: readonly FolderInfo[],
): Promise<string | null> {
  try {
    const choices = [
      ...folders.map((f) => ({
        name: `${f.rel.padEnd(32)} ${dim(`${f.ruleCount} rule${f.ruleCount === 1 ? "" : "s"}`)}`,
        value: f.rel,
      })),
      { name: dim("+ new folder…"), value: NEW_FOLDER_SENTINEL },
    ];
    const picked = await select({
      message: "Where should the new rule live?",
      choices,
      pageSize: Math.min(choices.length + 1, 15),
    });
    if (picked === NEW_FOLDER_SENTINEL) {
      const name = await input({
        message:
          "New folder path (e.g. `python` or `typescript/testing`)",
        validate: (v) =>
          /^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(v.trim()) ||
          "lowercase letters, digits, hyphens, slashes only",
      });
      return name.trim();
    }
    return picked;
  } catch {
    return null;
  }
}

function dim(s: string): string {
  return `\x1b[2m${s}\x1b[22m`;
}
