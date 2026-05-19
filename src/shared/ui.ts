// src/shared/ui.ts
import pc from "picocolors";

export const c = {
  primary: pc.cyan,
  success: pc.green,
  warn: pc.yellow,
  err: pc.red,
  dim: pc.dim,
  bold: pc.bold,
};

export function info(msg: string): void {
  process.stderr.write(`${c.dim("·")} ${msg}\n`);
}

export function ok(msg: string): void {
  process.stderr.write(`${c.success("✓")} ${msg}\n`);
}

export function error(msg: string, hint?: string): void {
  process.stderr.write(`${c.err("✗")} ${c.bold(msg)}\n`);
  if (hint) process.stderr.write(`  ${c.dim(hint)}\n`);
}

export function banner(label: string, sub: string): void {
  process.stdout.write(`\n${c.primary(c.bold(label))} ${c.dim(sub)}\n\n`);
}
