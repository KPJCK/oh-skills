/**
 * Generic AskUserQuestion payload builder for Claude Code tool pickers.
 *
 * Constraints (AskUserQuestion tool):
 *   - 1 to 4 questions per call
 *   - 2 to 4 options per question
 *   → max 16 options per single AskUserQuestion call
 *
 * Strategy:
 *   - 0 options     → empty payload (no questions)
 *   - 1 option      → autoPick, no question
 *   - 2–16 options  → chunked questions (rebalanced so no chunk has <2 options)
 *   - >16 options   → tooManyForUI = true, Claude pivots to a plain numbered list
 *
 * Divergence notes (consolidated from oh-context, oh-nice, oh-search ask-ui.ts):
 *   - All three sources used the same chunkBalanced algorithm (greedy-4 + tail rebalance).
 *     The plan spec proposed a different even-distribution algorithm in bucketOptions, but
 *     the existing 18 tests are written against the greedy-4+rebalance behavior — e.g.
 *     9 items → [4, 3, 2] not [3, 3, 3]. We preserve chunkBalanced here and export it
 *     as both `bucketOptions` (plan API) and `chunkBalanced` (legacy alias).
 *   - autoPick was string[] in all three source implementations (the plan spec said
 *     AskOption[], but the 18 existing tests assert string[], so we keep string[]).
 */

export type AskOption = {
  label: string;
  description?: string;
};

export type AskQuestion = {
  question: string;
  header: string;
  multiSelect: boolean;
  options: AskOption[];
};

export type AskPayload = {
  /** Questions to pass verbatim to the AskUserQuestion tool. Empty if autoPick or tooManyForUI. */
  questions: AskQuestion[];
  /** Shell command to run after user picks (Claude substitutes <result>). */
  next: string;
  /** Pre-selected labels when only 1 option exists, no question needed. */
  autoPick?: string[];
  /** True when option count exceeds what AskUserQuestion can carry; Claude must use plainText. */
  tooManyForUI?: boolean;
  /** Numbered list shown to user when tooManyForUI=true. */
  plainText?: string;
};

const MAX_OPTIONS_PER_QUESTION = 4;
const MIN_OPTIONS_PER_QUESTION = 2;
const MAX_QUESTIONS = 4;
const MAX_TOTAL = MAX_OPTIONS_PER_QUESTION * MAX_QUESTIONS; // 16

/**
 * Distribute options across question buckets using the greedy-4+tail-rebalance strategy.
 *
 * Split into groups of MAX_OPTIONS_PER_QUESTION, then rebalance so the trailing
 * group never has < MIN_OPTIONS_PER_QUESTION items.
 *
 * Examples:
 *   5  → [4, 1] → rebalance → [3, 2]
 *   9  → [4, 4, 1] → rebalance → [4, 3, 2]
 *   13 → [4, 4, 4, 1] → rebalance → [4, 4, 3, 2]
 *   16 → [4, 4, 4, 4] (no rebalance needed)
 */
export function bucketOptions<T>(items: T[]): T[][] {
  const n = items.length;
  if (n <= MAX_OPTIONS_PER_QUESTION) return [items];

  const chunks: T[][] = [];
  for (let i = 0; i < n; i += MAX_OPTIONS_PER_QUESTION) {
    chunks.push(items.slice(i, i + MAX_OPTIONS_PER_QUESTION));
  }

  // Rebalance: if last chunk has < MIN, donate from previous until it's ≥ MIN
  // (but never let donor drop below MIN either)
  while (chunks.length > 1) {
    const last = chunks[chunks.length - 1]!;
    if (last.length >= MIN_OPTIONS_PER_QUESTION) break;
    const donor = chunks[chunks.length - 2]!;
    if (donor.length <= MIN_OPTIONS_PER_QUESTION) break; // can't donate
    last.unshift(donor.pop()!);
  }

  return chunks;
}

/** Alias for callers that use the original oh-context name. */
export const chunkBalanced = bucketOptions;

/**
 * Build a ready-to-execute AskUserQuestion payload from a list of AskOptions.
 *
 * @param opts.options           - The options to present
 * @param opts.questionPrefix    - Question text for single-bucket case (e.g. "Which folder?")
 * @param opts.header            - Short header text for single-bucket case (e.g. "Context")
 * @param opts.multiSelect       - Whether the question allows multiple selections
 * @param opts.next              - Shell command to run after the user picks
 * @param opts.plainTextRenderer - Optional custom renderer for the tooManyForUI list
 */
export function buildAskPayload(opts: {
  options: AskOption[];
  questionPrefix: string;
  header: string;
  multiSelect: boolean;
  next: string;
  plainTextRenderer?: (options: AskOption[]) => string;
}): AskPayload {
  const { options, questionPrefix, header, multiSelect, next, plainTextRenderer } = opts;

  if (options.length === 0) {
    return { questions: [], next };
  }

  if (options.length === 1) {
    return { questions: [], next, autoPick: [options[0]!.label] };
  }

  if (options.length > MAX_TOTAL) {
    const text = plainTextRenderer
      ? plainTextRenderer(options)
      : options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
    return { questions: [], next, tooManyForUI: true, plainText: text };
  }

  const buckets = bucketOptions(options);
  const questions: AskQuestion[] = buckets.map((bucket, i) => ({
    question:
      buckets.length === 1
        ? questionPrefix
        : `${questionPrefix} (group ${i + 1} of ${buckets.length})`,
    header: buckets.length === 1 ? header : `${header} ${i + 1}/${buckets.length}`,
    multiSelect,
    options: bucket,
  }));

  return { questions, next };
}
