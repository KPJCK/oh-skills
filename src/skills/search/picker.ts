// src/skills/search/picker.ts
import { select } from "@inquirer/prompts";
import { listTopics } from "./registry.ts";
import { promptTopic } from "./prompts.ts";

const NEW_TOPIC_SENTINEL = "__new__";

export async function pickTopic(opts?: {
  message?: string;
}): Promise<string | null> {
  const topics = await listTopics();
  if (topics.length === 0) {
    // No existing topics — directly prompt for new one
    return await promptTopic({
      message: opts?.message ?? "new topic name",
    });
  }
  try {
    const choices = [
      ...topics.map((t) => ({ name: t, value: t })),
      { name: "+ new topic…", value: NEW_TOPIC_SENTINEL },
    ];
    const picked = await select({
      message: opts?.message ?? "Pick a topic",
      choices,
      pageSize: Math.min(choices.length + 1, 15),
    });
    if (picked === NEW_TOPIC_SENTINEL) {
      return await promptTopic({ message: "new topic name" });
    }
    return picked;
  } catch {
    return null;
  }
}
