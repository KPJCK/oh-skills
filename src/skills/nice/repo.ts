import { $ } from "bun";
import path from "node:path";

export type RepoInfo = {
  repo: string;
  source: "remote" | "cwd";
  cwd: string;
};

export async function detectRepo(): Promise<RepoInfo> {
  const cwd = process.cwd();
  try {
    const url = (await $`git remote get-url origin`.quiet().text()).trim();
    const repo = parseRepoFromUrl(url);
    if (repo) return { repo, source: "remote", cwd };
  } catch {
    // no remote, fall through
  }
  return { repo: path.basename(cwd), source: "cwd", cwd };
}

function parseRepoFromUrl(url: string): string | null {
  // strip trailing .git
  const cleaned = url.replace(/\.git$/, "");
  // git@github.com:foo/bar  →  bar
  // https://github.com/foo/bar →  bar
  // ssh://git@host/foo/bar →  bar
  const lastSegment = cleaned.split(/[:/]/).pop();
  return lastSegment && lastSegment.length > 0 ? lastSegment : null;
}
