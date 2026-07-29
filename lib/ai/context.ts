import { getLegalAssistantSystemPrompt } from "@/lib/ai/prompts";
import { countMessagesTokens, getMaxInputTokens } from "@/lib/ai/tokenizer";
import type { ChatApiMessage, ModelMessage } from "@/types/chat";

export type { ModelMessage } from "@/types/chat";

function toHistoryMessages(input: ChatApiMessage[]): ModelMessage[] {
  return input.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function findLatestUserIndex(messages: ModelMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return index;
    }
  }
  return -1;
}

function trimHistoryToBudget(
  history: ModelMessage[],
  systemMessage: ModelMessage,
  maxInputTokens: number,
): ModelMessage[] {
  if (history.length === 0) {
    return [];
  }

  const latestUserIndex = findLatestUserIndex(history);
  if (latestUserIndex < 0) {
    let start = 0;
    while (start < history.length) {
      const trimmed = history.slice(start);
      if (countMessagesTokens([systemMessage, ...trimmed]) <= maxInputTokens) {
        return trimmed;
      }
      start += 1;
    }
    return history.slice(-1);
  }

  let start = 0;
  while (start <= latestUserIndex) {
    const trimmed = history.slice(start);
    if (countMessagesTokens([systemMessage, ...trimmed]) <= maxInputTokens) {
      return trimmed;
    }
    start += 1;
  }

  return history.slice(latestUserIndex);
}

export function buildModelMessages(input: ChatApiMessage[]): ModelMessage[] {
  const systemMessage: ModelMessage = {
    role: "system",
    content: getLegalAssistantSystemPrompt(),
  };

  const history = toHistoryMessages(input);
  const trimmedHistory = trimHistoryToBudget(
    history,
    systemMessage,
    getMaxInputTokens(),
  );

  return [systemMessage, ...trimmedHistory];
}

export function buildModelMessagesWithBudget(
  input: ChatApiMessage[],
  maxInputTokens: number,
): ModelMessage[] {
  const systemMessage: ModelMessage = {
    role: "system",
    content: getLegalAssistantSystemPrompt(),
  };

  const history = toHistoryMessages(input);
  const trimmedHistory = trimHistoryToBudget(
    history,
    systemMessage,
    maxInputTokens,
  );

  return [systemMessage, ...trimmedHistory];
}

export type InputTokenStats = {
  local_full_input: number;
  local_trimmed_input: number;
  saved_by_truncation_est: number;
};

export function computeInputTokenStats(
  input: ChatApiMessage[],
): InputTokenStats {
  const systemMessage: ModelMessage = {
    role: "system",
    content: getLegalAssistantSystemPrompt(),
  };

  const history = toHistoryMessages(input);
  const maxInputTokens = getMaxInputTokens();
  const trimmedHistory = trimHistoryToBudget(
    history,
    systemMessage,
    maxInputTokens,
  );

  const local_full_input = countMessagesTokens([systemMessage, ...history]);
  const local_trimmed_input = countMessagesTokens([
    systemMessage,
    ...trimmedHistory,
  ]);

  return {
    local_full_input,
    local_trimmed_input,
    saved_by_truncation_est: local_full_input - local_trimmed_input,
  };
}
