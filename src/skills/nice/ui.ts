import pc from "picocolors";
import boxen, { type Options as BoxenOptions } from "boxen";
import figures from "figures";
import oraImport, { type Ora } from "ora";

const PINK = (s: string) => `\x1b[38;5;213m${s}\x1b[0m`;

export const c = {
  primary: PINK,
  reviewer: pc.red,
  info: pc.cyan,
  success: pc.green,
  warn: pc.yellow,
  error: pc.red,
  hint: pc.gray,
  bold: pc.bold,
  dim: pc.dim,
} as const;

export function header(title: string, subtitle?: string): void {
  const lines = [c.bold(c.primary(title))];
  if (subtitle) lines.push(c.dim(subtitle));
  process.stdout.write(
    boxen(lines.join("\n"), {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderColor: "magenta",
      borderStyle: "round",
      margin: { top: 0, bottom: 1, left: 0, right: 0 },
    }) + "\n",
  );
}

const STEP_GLYPH = "◇"; // ◇ — not in `figures`, use literal

export function step(n: number, total: number, msg: string): void {
  process.stdout.write(
    `\n${c.primary(STEP_GLYPH)} ${c.bold(`Step ${n}/${total}`)} ${c.hint("—")} ${msg}\n`,
  );
}

export function success(msg: string): void {
  process.stdout.write(`  ${c.success(figures.tick)} ${msg}\n`);
}

export function info(msg: string): void {
  process.stdout.write(`  ${c.info(figures.bullet)} ${msg}\n`);
}

export function warn(msg: string): void {
  process.stdout.write(`  ${c.warn(figures.warning)} ${msg}\n`);
}

export function error(msg: string, hintMsg?: string): void {
  process.stderr.write(`  ${c.error(figures.cross)} ${c.error(msg)}\n`);
  if (hintMsg) process.stderr.write(`    ${c.hint(hintMsg)}\n`);
}

export function hint(msg: string): void {
  process.stdout.write(`  ${c.hint(`${figures.arrowRight} ${msg}`)}\n`);
}

export function box(
  content: string,
  opts?: { title?: string; color?: BoxenOptions["borderColor"] },
): void {
  const boxOpts: BoxenOptions = {
    padding: 1,
    borderColor: opts?.color ?? "magenta",
    borderStyle: "round",
    margin: { top: 1, bottom: 1, left: 0, right: 0 },
    ...(opts?.title !== undefined && { title: opts.title }),
  };
  process.stdout.write(boxen(content, boxOpts) + "\n");
}

export function spinner(text: string): Ora {
  return oraImport({ text, color: "magenta" }).start();
}

export { figures };
