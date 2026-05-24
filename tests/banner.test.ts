// tests/banner.test.ts
import { describe, test, expect } from "bun:test";
import { renderBanner, gradientText, stripAnsi } from "../src/shared/banner.ts";

describe("gradientText", () => {
  test("returns plain string unchanged when length is 0", () => {
    expect(gradientText("", ["#ff0000", "#00ff00"])).toBe("");
  });

  test("emits one ANSI-colored segment per character", () => {
    const out = gradientText("ABC", ["#ff0000", "#00ff00"]);
    // 3 chars × (open + char + close) sequences
    const resets = (out.match(/\x1b\[0m/g) ?? []).length;
    expect(resets).toBe(3);
    expect(stripAnsi(out)).toBe("ABC");
  });

  test("first char uses start color, last char uses end color", () => {
    const out = gradientText("AB", ["#ff0000", "#00ff00"]);
    expect(out).toContain("\x1b[38;2;255;0;0m");
    expect(out).toContain("\x1b[38;2;0;255;0m");
  });

  test("single char uses start color", () => {
    const out = gradientText("X", ["#ff0000", "#00ff00"]);
    expect(stripAnsi(out)).toBe("X");
    expect(out).toContain("\x1b[38;2;255;0;0m");
  });

  test("middle char in 3-char string is interpolated midway", () => {
    const out = gradientText("ABC", ["#000000", "#ffffff"]);
    // middle char ~half-way: 127 or 128
    expect(out).toMatch(/\x1b\[38;2;(127|128);(127|128);(127|128)m/);
  });
});

describe("stripAnsi", () => {
  test("removes 24-bit foreground codes", () => {
    expect(stripAnsi("\x1b[38;2;255;0;0mX\x1b[0m")).toBe("X");
  });

  test("removes reset codes and dim codes", () => {
    expect(stripAnsi("\x1b[2mhello\x1b[0m")).toBe("hello");
  });

  test("returns plain text unchanged", () => {
    expect(stripAnsi("plain")).toBe("plain");
  });
});

describe("renderBanner", () => {
  test("title-only: returns one gradient line", () => {
    const out = renderBanner({
      title: "[X]",
      gradient: ["#ff0000", "#00ff00"],
    });
    const lines = out.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
    expect(stripAnsi(lines[0]!)).toBe("[X]");
    expect(lines[0]!).toContain("\x1b[38;2;255;0;0m");
  });

  test("title + subtitle: title gradient, subtitle dim", () => {
    const out = renderBanner({
      title: "[OH! >> NICE >> GO]",
      subtitle: "Repo: oh-skills",
      gradient: ["#ff5fd7", "#ff87af"],
    });
    const lines = out.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(2);
    expect(stripAnsi(lines[0]!)).toBe("[OH! >> NICE >> GO]");
    expect(stripAnsi(lines[1]!)).toBe("Repo: oh-skills");
    // subtitle uses dim ANSI \x1b[2m
    expect(lines[1]!).toContain("\x1b[2m");
  });

  test("subtitleHighlights: matched substring rendered in gradient, rest dim", () => {
    const out = renderBanner({
      title: "[OH! >> NICE >> GO]",
      subtitle: "Repo: oh-skills  •  [Mirai] will execute the plan",
      subtitleHighlights: ["[Mirai]"],
      gradient: ["#ff5fd7", "#ff87af"],
    });
    // After ANSI strip, subtitle text is preserved
    const stripped = stripAnsi(out);
    expect(stripped).toContain("[Mirai]");
    expect(stripped).toContain("Repo: oh-skills");
    // [Mirai] characters carry the gradient start color (#ff5fd7 → 255,95,215)
    expect(out).toContain("\x1b[38;2;255;95;215m");
    // surrounding subtitle dim
    expect(out).toContain("\x1b[2m");
  });

  test("subtitleHighlights with multiple matches: all rendered in gradient", () => {
    const out = renderBanner({
      title: "[X]",
      subtitle: "A [one] B [two] C",
      subtitleHighlights: ["[one]", "[two]"],
      gradient: ["#000000", "#ffffff"],
    });
    const stripped = stripAnsi(out);
    expect(stripped).toContain("[one]");
    expect(stripped).toContain("[two]");
  });

  test("multi-line subtitle: \\n splits to multiple dim lines", () => {
    const out = renderBanner({
      title: "[X]",
      subtitle: "line1\nline2",
      gradient: ["#000000", "#ffffff"],
    });
    const stripped = stripAnsi(out);
    expect(stripped).toContain("line1");
    expect(stripped).toContain("line2");
  });
});
