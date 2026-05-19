// tests/banner.test.ts
import { describe, test, expect } from "bun:test";
import { gradientLine, shadeChar, stripAnsi, measureWidth } from "../src/shared/banner.ts";

describe("gradientLine", () => {
  test("emits exactly N copies of the char", () => {
    const out = gradientLine("─", 10, ["#ff0000", "#00ff00"]);
    // strip ANSI to count visible chars
    expect(stripAnsi(out)).toBe("──────────");
  });

  test("emits N=0 as empty string (no ANSI)", () => {
    expect(gradientLine("─", 0, ["#ff0000", "#00ff00"])).toBe("");
  });

  test("emits N=1 with start color", () => {
    const out = gradientLine("X", 1, ["#ff0000", "#00ff00"]);
    expect(stripAnsi(out)).toBe("X");
    // first char uses start color (255,0,0)
    expect(out).toContain("\x1b[38;2;255;0;0m");
  });

  test("emits N=2 with start and end colors", () => {
    const out = gradientLine("X", 2, ["#ff0000", "#00ff00"]);
    expect(stripAnsi(out)).toBe("XX");
    expect(out).toContain("\x1b[38;2;255;0;0m");   // start
    expect(out).toContain("\x1b[38;2;0;255;0m");   // end
  });

  test("interpolates middle color linearly", () => {
    const out = gradientLine("X", 3, ["#000000", "#ffffff"]);
    // middle char is ~half-way: 127 or 128
    expect(out).toMatch(/\x1b\[38;2;(127|128);(127|128);(127|128)m/);
  });

  test("each char closes its own color sequence", () => {
    const out = gradientLine("─", 3, ["#ff0000", "#00ff00"]);
    // each colored char ends with \x1b[0m
    const resets = (out.match(/\x1b\[0m/g) ?? []).length;
    expect(resets).toBe(3);
  });
});

describe("shadeChar", () => {
  test("replaces full block with dark shade", () => {
    expect(shadeChar("█")).toBe("▓");
  });

  test("replaces lower half block with medium shade", () => {
    expect(shadeChar("▄")).toBe("▒");
  });

  test("replaces upper half block with medium shade", () => {
    expect(shadeChar("▀")).toBe("▒");
  });

  test("leaves other characters untouched", () => {
    expect(shadeChar("a")).toBe("a");
    expect(shadeChar(" ")).toBe(" ");
    expect(shadeChar("─")).toBe("─");
    expect(shadeChar("\x1b")).toBe("\x1b");
  });
});

describe("stripAnsi", () => {
  test("removes 24-bit foreground codes", () => {
    expect(stripAnsi("\x1b[38;2;255;0;0mX\x1b[0m")).toBe("X");
  });

  test("removes reset codes", () => {
    expect(stripAnsi("X\x1b[0mY")).toBe("XY");
  });

  test("returns plain text unchanged", () => {
    expect(stripAnsi("plain text")).toBe("plain text");
  });

  test("handles multiline", () => {
    expect(stripAnsi("\x1b[38;2;1;2;3mA\x1b[0m\n\x1b[38;2;4;5;6mB\x1b[0m")).toBe("A\nB");
  });
});

describe("measureWidth", () => {
  test("returns longest visible-line length after stripping ANSI", () => {
    const input = "\x1b[38;2;1;2;3mhi\x1b[0m\n\x1b[38;2;4;5;6mhello\x1b[0m";
    expect(measureWidth(input)).toBe(5);
  });

  test("returns 0 for empty string", () => {
    expect(measureWidth("")).toBe(0);
  });

  test("ignores trailing newline", () => {
    expect(measureWidth("abc\n")).toBe(3);
  });
});
