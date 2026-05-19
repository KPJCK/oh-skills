// scripts/check-version.ts
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8"));
const manifest = JSON.parse(readFileSync(path.join(root, ".claude-plugin", "plugin.json"), "utf-8"));

if (pkg.version !== manifest.version) {
  console.error(`Version mismatch: package.json=${pkg.version}, plugin.json=${manifest.version}`);
  process.exit(1);
}
console.log(`OK: version ${pkg.version} matches in both manifests.`);
