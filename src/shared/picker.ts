// src/shared/picker.ts
//
// Consolidated interactive-picker helpers, extracted from:
//   oh-context/_lib/picker.ts   – checkbox + select-with-new-sentinel
//   oh-search/_lib/picker.ts    – select-with-new-sentinel (topic variant)
//   oh-nice/_lib/picker.ts      – fzf-first single-select for plan objects
//
// All functions return `null` on cancel / empty selection.

import { checkbox, select, input } from "@inquirer/prompts";
import { $ } from "bun";
import { c } from "./ui.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChoiceItem<T = string> {
  /** Display label */
  name: string;
  /** Value returned when this choice is picked */
  value: T;
  /** Pre-check this item in a checkbox picker */
  checked?: boolean;
}

// ---------------------------------------------------------------------------
// Multi-select (checkbox)
// ---------------------------------------------------------------------------

/**
 * Show a checkbox prompt for multi-select.
 *
 * Returns the selected values, or `null` if the user cancels (Ctrl-C).
 * Returns `[]` when `choices` is empty without prompting.
 */
export async function checkboxPick<T = string>(
  message: string,
  choices: ChoiceItem<T>[],
  opts: { pageSize?: number } = {},
): Promise<T[] | null> {
  if (choices.length === 0) return [];
  const pageSize = opts.pageSize ?? Math.min(choices.length + 2, 15);
  try {
    const selected = await checkbox({ message, choices, pageSize });
    return [...selected] as T[];
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Single-select (with optional "create new" sentinel)
// ---------------------------------------------------------------------------

const NEW_SENTINEL = "__new__";

/**
 * Show a `select` prompt.
 *
 * If `createNew` is provided, a "+ …" option is appended. When chosen, the
 * `createNew.prompt` function is called and its return value is returned
 * (or `null` if the sub-prompt is cancelled).
 *
 * Returns the picked value, or `null` on cancel.
 */
export async function selectWithNew<T = string>(
  message: string,
  items: ChoiceItem<T>[],
  opts: {
    pageSize?: number;
    createNew?: {
      /** Label shown in the list, e.g. "+ new folder…" */
      label?: string;
      /** Called when the sentinel is selected; must return the new value or null */
      prompt: () => Promise<T | null>;
    };
  } = {},
): Promise<T | null> {
  const sentinel = NEW_SENTINEL as unknown as T;
  const choices: ChoiceItem<T>[] = opts.createNew
    ? [
        ...items,
        { name: opts.createNew.label ?? c.dim("+ new…"), value: sentinel },
      ]
    : [...items];

  const pageSize = opts.pageSize ?? Math.min(choices.length + 1, 15);

  try {
    const picked = await select({ message, choices, pageSize });
    if (opts.createNew && picked === sentinel) {
      return await opts.createNew.prompt();
    }
    return picked;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Single-select with text input for new value (common sub-pattern)
// ---------------------------------------------------------------------------

/**
 * Variant of `selectWithNew` where the "create new" action is a plain text
 * `input` prompt with an optional validator.
 *
 * Returns the picked/entered value, or `null` on cancel.
 */
export async function selectWithNewInput(
  message: string,
  items: ChoiceItem<string>[],
  opts: {
    pageSize?: number;
    createNew?: {
      label?: string;
      inputMessage?: string;
      validate?: (v: string) => boolean | string;
    };
  } = {},
): Promise<string | null> {
  const newOpts = opts.createNew
    ? {
        label: opts.createNew.label ?? c.dim("+ new…"),
        prompt: async (): Promise<string | null> => {
          try {
            const val = await input({
              message: opts.createNew!.inputMessage ?? "Enter a name",
              validate: opts.createNew!.validate,
            });
            return val.trim() || null;
          } catch {
            return null;
          }
        },
      }
    : undefined;

  return selectWithNew(message, items, { pageSize: opts.pageSize, createNew: newOpts });
}

// ---------------------------------------------------------------------------
// fzf-first single-select (for richer TUI when fzf is available)
// ---------------------------------------------------------------------------

/**
 * Returns true if `fzf` is available on PATH.
 */
export async function hasFzf(): Promise<boolean> {
  try {
    await $`which fzf`.quiet();
    return true;
  } catch {
    return false;
  }
}

/**
 * Pick a single item from `items` using fzf for the interactive UI.
 *
 * `formatLine` converts each item to the display string piped into fzf.
 * `extractValue` parses the raw fzf output line back to the item's value;
 * defaults to returning the raw trimmed line as-is.
 *
 * Returns the extracted value, or `null` on cancel / empty selection.
 */
export async function fzfSelect<T = string>(
  items: T[],
  opts: {
    prompt?: string;
    formatLine: (item: T) => string;
    extractValue?: (rawLine: string, items: T[]) => T | null;
  },
): Promise<T | null> {
  const lines = items.map((item) => opts.formatLine(item)).join("\n");
  try {
    const result =
      await $`echo ${lines} | fzf --ansi --prompt=${opts.prompt ?? "> "} --height=40% --reverse --no-mouse`.text();
    const picked = result.trim();
    if (!picked) return null;
    if (opts.extractValue) {
      return opts.extractValue(picked, items);
    }
    return picked as unknown as T;
  } catch {
    return null;
  }
}

/**
 * Convenience: try fzf first, fall back to Inquirer `select`.
 *
 * - `formatLine` is used by fzf for display.
 * - `formatChoice` is used by Inquirer (defaults to `formatLine`).
 * - `getValue` extracts the typed value from a chosen item.
 * - `extractFzfValue` parses raw fzf output back to T.
 */
export async function fzfOrSelect<T>(
  items: T[],
  opts: {
    message?: string;
    fzfPrompt?: string;
    formatLine: (item: T, plain?: boolean) => string;
    getValue: (item: T) => string;
    extractFzfValue?: (rawLine: string, items: T[]) => T | null;
  },
): Promise<T | null> {
  if (items.length === 0) return null;

  if (await hasFzf()) {
    return fzfSelect(items, {
      prompt: opts.fzfPrompt,
      formatLine: (item) => opts.formatLine(item, false),
      extractValue: opts.extractFzfValue,
    });
  }

  const choices = items.map((item) => ({
    name: opts.formatLine(item, true),
    value: opts.getValue(item),
  }));
  try {
    const picked = await select({
      message: opts.message ?? "Select",
      choices,
      pageSize: Math.min(choices.length + 1, 15),
    });
    return items.find((item) => opts.getValue(item) === picked) ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Utility: ANSI dim (for inline labels that don't go through picocolors)
// ---------------------------------------------------------------------------

/** Wrap text in ANSI dim escape codes (used for inline list labels). */
export function dim(s: string): string {
  return `\x1b[2m${s}\x1b[22m`;
}
