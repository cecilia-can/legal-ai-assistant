function positiveInt(name: string, fallback: number, maximum: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 && value <= maximum
    ? value
    : fallback;
}

function fraction(name: string, fallback: number): number {
  const value = Number.parseFloat(process.env[name] ?? "");
  return Number.isFinite(value) && value > 0 && value < 1 ? value : fallback;
}

export function isConversationMemoryEnabled(): boolean {
  return process.env.CONVERSATION_MEMORY_ENABLED?.trim().toLowerCase() !== "false";
}

export function isConversationMemoryRecallEnabled(): boolean {
  return process.env.CONVERSATION_MEMORY_RECALL_ENABLED?.trim().toLowerCase() === "true";
}

/** Separate from the user-facing chat limit: reasoning models may spend output tokens before producing JSON. */
export function getConversationMemoryMaxOutputTokens(): number {
  return positiveInt("CONVERSATION_MEMORY_MAX_OUTPUT_TOKENS", 8_192, 32_768);
}

export function getConversationMemoryConfig() {
  return {
    compactionThreshold: fraction("CONVERSATION_MEMORY_COMPACTION_THRESHOLD", 0.65),
    recentMessages: positiveInt("CONVERSATION_MEMORY_RECENT_MESSAGES", 10, 50),
    maxTaskAttempts: positiveInt("CONVERSATION_MEMORY_MAX_TASK_ATTEMPTS", 3, 10),
    recallTopK: positiveInt("CONVERSATION_MEMORY_RECALL_TOP_K", 3, 10),
    recallMaxCharacters: positiveInt("CONVERSATION_MEMORY_RECALL_MAX_CHARACTERS", 6_000, 24_000),
  };
}
