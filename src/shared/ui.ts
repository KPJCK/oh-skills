// src/shared/ui.ts
import pc from "picocolors";

export const c = {
  primary: pc.cyan,
  success: pc.green,
  warn: pc.yellow,
  err: pc.red,
  hint: pc.gray,
  dim: pc.dim,
  bold: pc.bold,
};

export function info(msg: string): void {
  process.stderr.write(`  ${c.dim("·")} ${msg}\n`);
}

export function ok(msg: string): void {
  process.stderr.write(`  ${c.success("✓")} ${msg}\n`);
}

/** Alias for ok() — preferred in search/context commands. */
export function success(msg: string): void {
  process.stderr.write(`  ${c.success("✓")} ${msg}\n`);
}

export function hint(msg: string): void {
  process.stderr.write(`  ${c.hint(`→ ${msg}`)}\n`);
}

export function step(msg: string): void {
  process.stderr.write(`\n${c.primary("◇")} ${c.bold(msg)}\n`);
}

export function warn(msg: string): void {
  process.stderr.write(`  ${c.warn("⚠")} ${msg}\n`);
}

export function error(msg: string, hintMsg?: string): void {
  process.stderr.write(`  ${c.err("✗")} ${c.bold(msg)}\n`);
  if (hintMsg) process.stderr.write(`    ${c.hint(hintMsg)}\n`);
}

export function banner(label: string, sub: string): void {
  process.stdout.write(`\n${c.primary(c.bold(label))} ${c.dim(sub)}\n\n`);
}
