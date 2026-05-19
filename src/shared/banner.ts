// src/shared/banner.ts
import pc from "picocolors";
import { render as cfontsRender } from "cfonts";

/** Replace one character: block → shade, leave others. */
export function shadeChar(c: string): string {
  if (c === "█") return "▓";
  if (c === "▄" || c === "▀") return "▒";
  return c;
}

/** Strip ANSI escape sequences. */
export function stripAnsi(s: string): string {
  // matches CSI sequences (ESC [ ... letter)
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Longest visible line after ANSI strip. */
export function measureWidth(s: string): number {
  const clean = stripAnsi(s);
  let max = 0;
  for (const line of clean.split("\n")) {
    if (line.length > max) max = line.length;
  }
  return max;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Return `n` copies of `char`, each colored via 24-bit ANSI interpolated start→end. */
export function gradientLine(char: string, n: number, gradient: readonly [string, string]): string {
  if (n <= 0) return "";
  const [start, end] = gradient;
  const [r1, g1, b1] = hexToRgb(start);
  const [r2, g2, b2] = hexToRgb(end);
  let out = "";
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const r = lerp(r1, r2, t);
    const g = lerp(g1, g2, t);
    const b = lerp(b1, b2, t);
    out += `\x1b[38;2;${r};${g};${b}m${char}\x1b[0m`;
  }
  return out;
}

export interface BannerOptions {
  title: string;
  subtitle?: string;
  gradient: readonly [string, string];
  leftPadding?: number;   // default 4
  rightPadding?: number;  // default 4
}

/** Render the banner to a string (no IO). Pure — used by tests. */
export function renderBanner(opts: BannerOptions): string {
  const leftPad = opts.leftPadding ?? 4;
  const rightPad = opts.rightPadding ?? 4;

  // 1. Render text via cfonts tiny with the gradient
  const result = cfontsRender(opts.title, {
    font: "tiny",
    align: "left",
    colors: ["candy"],
    background: "transparent",
    letterSpacing: 1,
    lineHeight: 1,
    space: false,
    gradient: [opts.gradient[0], opts.gradient[1]],
    transitionGradient: true,
    env: "node",
  });
  const cfontsString = result === false ? opts.title : result.string;

  // 2. Post-process: swap blocks for shades
  const shaded = cfontsString
    .split("")
    .map(shadeChar)
    .join("");

  // 3. Measure visible width (longest line after ANSI strip)
  const textWidth = measureWidth(shaded);

  // 4. Build borders to enclose: leftPad + textWidth + rightPad
  const borderWidth = leftPad + textWidth + rightPad;
  const topBorder = gradientLine("─", borderWidth, opts.gradient);
  const bottomBorder = topBorder;

  // 5. Indent each visible text line by leftPad spaces (right pad not needed if border encloses by total width)
  const pad = " ".repeat(leftPad);
  const textLines = shaded.split("\n").filter((l) => l.length > 0);
  const indentedText = textLines.map((line) => pad + line).join("\n");

  // 6. Subtitle (dim, below bottom border)
  const subtitleBlock = opts.subtitle
    ? "\n" + opts.subtitle.split("\n").map((line) => "   " + pc.dim(line)).join("\n")
    : "";

  return `${topBorder}\n${indentedText}\n${bottomBorder}${subtitleBlock}`;
}

/** Print the banner to stdout with a trailing newline. */
export function banner(opts: BannerOptions): void {
  process.stdout.write(renderBanner(opts) + "\n");
}
