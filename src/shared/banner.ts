// src/shared/banner.ts

export interface BannerOptions {
  title: string;
  subtitle?: string;
  subtitleHighlights?: readonly string[];
  gradient: readonly [string, string];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

/** Apply 24-bit ANSI gradient char-by-char across `text`. */
export function gradientText(text: string, gradient: readonly [string, string]): string {
  if (text.length === 0) return "";
  const [r1, g1, b1] = hexToRgb(gradient[0]);
  const [r2, g2, b2] = hexToRgb(gradient[1]);
  let out = "";
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const r = lerp(r1, r2, t);
    const g = lerp(g1, g2, t);
    const b = lerp(b1, b2, t);
    out += `\x1b[38;2;${r};${g};${b}m${text[i]}\x1b[0m`;
  }
  return out;
}

/**
 * Render a subtitle line: dim by default, but any substring listed in
 * `highlights` is rendered in the title's gradient instead.
 */
function renderSubtitleLine(
  line: string,
  highlights: readonly string[],
  gradient: readonly [string, string],
): string {
  if (highlights.length === 0) return `\x1b[2m${line}\x1b[22m`;

  // Find all highlight match positions, sorted by start index, non-overlapping.
  type Match = { start: number; end: number; text: string };
  const matches: Match[] = [];
  for (const needle of highlights) {
    if (needle.length === 0) continue;
    let from = 0;
    while (true) {
      const idx = line.indexOf(needle, from);
      if (idx < 0) break;
      // skip if overlaps an already-matched range
      const overlaps = matches.some(
        (m) => idx < m.end && idx + needle.length > m.start,
      );
      if (!overlaps) {
        matches.push({ start: idx, end: idx + needle.length, text: needle });
      }
      from = idx + needle.length;
    }
  }
  matches.sort((a, b) => a.start - b.start);

  if (matches.length === 0) return `\x1b[2m${line}\x1b[22m`;

  let cursor = 0;
  let out = "";
  for (const m of matches) {
    if (m.start > cursor) out += `\x1b[2m${line.slice(cursor, m.start)}\x1b[22m`;
    out += gradientText(m.text, gradient);
    cursor = m.end;
  }
  if (cursor < line.length) out += `\x1b[2m${line.slice(cursor)}\x1b[22m`;
  return out;
}

export function renderBanner(opts: BannerOptions): string {
  const titleLine = gradientText(opts.title, opts.gradient);
  if (opts.subtitle === undefined) return titleLine;

  const highlights = opts.subtitleHighlights ?? [];
  const subtitleLines = opts.subtitle
    .split("\n")
    .map((line) => renderSubtitleLine(line, highlights, opts.gradient));
  return `${titleLine}\n${subtitleLines.join("\n")}`;
}

export function banner(opts: BannerOptions): void {
  process.stdout.write(renderBanner(opts) + "\n");
}
