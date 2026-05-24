// src/skills/search/ask-ui.ts
//
// Topic picker for `add`. Single-select with "(+ new topic)" sentinel.
// Same constraints as elsewhere: 1-4 questions × 2-4 options = 16 max.

import { bucketOptions } from "../../shared/ask-ui.ts";
import type { AskQuestion, AskPayload } from "../../shared/ask-ui.ts";

const MAX_OPTIONS_PER_QUESTION = 4;
const MIN_OPTIONS_PER_QUESTION = 2;
const MAX_QUESTIONS_PER_CALL = 4;
const MAX_TOTAL_OPTIONS = MAX_OPTIONS_PER_QUESTION * MAX_QUESTIONS_PER_CALL; // 16

const NEW_TOPIC_SENTINEL = "(+ new topic)";

export function buildAddTopicAskPayload(topics: readonly string[]): AskPayload {
  const next = `bun \${CLAUDE_PLUGIN_ROOT}/src/cli.ts search add <name> --topic <topic> --title <t> --summary <s> --body-stdin --confirmed [--query Q] [--sources URLs] [--tags T1,T2] [--folder]`;

  if (topics.length === 0) {
    return {
      questions: [
        {
          question: "No existing topics. What topic for this knowledge?",
          header: "Topic",
          multiSelect: false,
          options: [
            { label: NEW_TOPIC_SENTINEL, description: "Type a new topic name (lowercase-kebab)" },
            { label: "(cancel)", description: "Don't save" },
          ],
        },
      ],
      next,
    };
  }

  const totalSlots = topics.length + 1; // +1 for "+ new topic"

  if (totalSlots > MAX_TOTAL_OPTIONS) {
    const numbered = [...topics].map((t, i) => `${i + 1}. ${t}`).join("\n");
    return {
      questions: [],
      next,
      tooManyForUI: true,
      plainText: numbered + `\n\nOR type a new topic name (lowercase-kebab).`,
    };
  }

  const chunks = bucketOptions([...topics]);
  // Append sentinel to last chunk (or new chunk if last is full)
  const lastChunk = chunks[chunks.length - 1]!;
  if (lastChunk.length < MAX_OPTIONS_PER_QUESTION) {
    lastChunk.push(NEW_TOPIC_SENTINEL);
  } else {
    const borrowed = lastChunk.pop()!;
    chunks.push([borrowed, NEW_TOPIC_SENTINEL]);
  }

  // Ensure last chunk satisfies MIN_OPTIONS_PER_QUESTION after sentinel append
  while (chunks.length > 1) {
    const last = chunks[chunks.length - 1]!;
    if (last.length >= MIN_OPTIONS_PER_QUESTION) break;
    const donor = chunks[chunks.length - 2]!;
    if (donor.length <= MIN_OPTIONS_PER_QUESTION) break;
    last.unshift(donor.pop()!);
  }

  const questions: AskQuestion[] = chunks.map((chunk, idx) => ({
    question:
      chunks.length === 1
        ? "Which topic for this knowledge? (or pick `+ new topic`)"
        : `Pick topic (group ${idx + 1} of ${chunks.length})`,
    header: chunks.length === 1 ? "Topic" : `Topic ${idx + 1}/${chunks.length}`,
    multiSelect: false,
    options: chunk.map((t) => ({
      label: t,
      description:
        t === NEW_TOPIC_SENTINEL ? "Type a new topic name (lowercase-kebab)" : `existing topic`,
    })),
  }));

  return { questions, next };
}
