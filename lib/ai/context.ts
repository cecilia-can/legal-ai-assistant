import { getLegalAssistantSystemPrompt } from "@/lib/ai/prompts";
import { countMessagesTokens, getMaxInputTokens } from "@/lib/ai/tokenizer";
import { getConversationMemoryConfig } from "@/lib/memory/config";
import type { ConversationMemoryRecord } from "@/lib/memory/service";
import type { ChatApiMessage, ModelMessage } from "@/types/chat";

export type { ModelMessage } from "@/types/chat";

export type ConversationRecallContext = {
  content: string;
  sourceCount: number;
};

export type ConversationContextInput = {
  history: ChatApiMessage[];
  ragContext?: string;
  memory?: ConversationMemoryRecord | null;
  recall?: ConversationRecallContext | null;
  recentMessages?: number;
};

export type ConversationContextTokenStats = InputTokenStats & {
  memory_tokens: number;
  recent_history_tokens: number;
  recall_tokens: number;
  rag_tokens: number;
  omitted_recall: boolean;
  omitted_history_messages: number;
};

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

export function buildModelMessages(input: ChatApiMessage[], ragContext?: string): ModelMessage[] {
  const systemMessage: ModelMessage = {
    role: "system",
    content: ragContext
      ? `${getLegalAssistantSystemPrompt()}\n\n## 已授权知识库资料\n${ragContext}`
      : getLegalAssistantSystemPrompt(),
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
  ragContext?: string,
): InputTokenStats {
  const systemMessage: ModelMessage = {
    role: "system",
    content: ragContext
      ? `${getLegalAssistantSystemPrompt()}\n\n## 已授权知识库资料\n${ragContext}`
      : getLegalAssistantSystemPrompt(),
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

function buildMemorySection(memory?: ConversationMemoryRecord | null): string | null {
  if (!memory) return null;
  return `## 会话记忆（内部背景，非法律资料）\n以下内容从该会话较早消息中提取，可能包含用户陈述或待核实事项；不得将其作为法律资料引用，也不得把不确定信息陈述为既定事实。\n${JSON.stringify(memory.content)}`;
}

function buildLayeredSystemMessage(input: {
  ragContext?: string;
  memory?: ConversationMemoryRecord | null;
  recall?: ConversationRecallContext | null;
  includeRecall: boolean;
}): ModelMessage {
  const sections = [getLegalAssistantSystemPrompt()];
  if (input.ragContext) sections.push(`## 已授权知识库资料\n${input.ragContext}`);
  const memory = buildMemorySection(input.memory);
  if (memory) sections.push(memory);
  if (input.includeRecall && input.recall) {
    sections.push(`## 会话历史原文片段（内部背景，非法律资料）\n${input.recall.content}`);
  }
  return { role: "system", content: sections.join("\n\n") };
}

function trimLayeredHistory(
  history: ModelMessage[],
  systemMessage: ModelMessage,
  maxInputTokens: number,
): ModelMessage[] {
  if (!history.length) return [];

  // The most recent user instruction is required for a useful answer. It may be
  // followed by assistant/tool messages when constructing context outside the
  // normal request path, so retain that suffix as an indivisible unit.
  const requiredStart = findLatestUserIndex(history);
  if (requiredStart < 0) return history.slice(-1);

  let start = 0;
  while (start <= requiredStart) {
    const candidate = history.slice(start);
    if (countMessagesTokens([systemMessage, ...candidate]) <= maxInputTokens) {
      return candidate;
    }
    start += 1;
  }
  return history.slice(requiredStart);
}

/**
 * Builds the production context from persistent memory plus a small verbatim tail.
 * Recall is deliberately lower priority than memory and recent messages.
 */
export function buildConversationContext(input: ConversationContextInput): {
  messages: ModelMessage[];
  tokenStats: ConversationContextTokenStats;
} {
  const history = toHistoryMessages(input.history);
  const recentLimit = input.recentMessages ?? getConversationMemoryConfig().recentMessages;
  // Before the first valid summary exists, older messages have no other
  // representation. Keep as much original history as the input budget allows.
  const recent = input.memory ? history.slice(-Math.max(1, recentLimit)) : history;
  const maxInputTokens = getMaxInputTokens();

  let includeRecall = Boolean(input.recall);
  let systemMessage = buildLayeredSystemMessage({ ...input, includeRecall });
  let selected = trimLayeredHistory(recent, systemMessage, maxInputTokens);
  let omittedRecall = false;

  if (includeRecall && countMessagesTokens([systemMessage, ...selected]) > maxInputTokens) {
    includeRecall = false;
    omittedRecall = true;
    systemMessage = buildLayeredSystemMessage({ ...input, includeRecall });
    selected = trimLayeredHistory(recent, systemMessage, maxInputTokens);
  }

  const baseSystem: ModelMessage = { role: "system", content: getLegalAssistantSystemPrompt() };
  const fullSystem = buildLayeredSystemMessage({ ...input, includeRecall: Boolean(input.recall) });
  const memorySystem = buildLayeredSystemMessage({ memory: input.memory, includeRecall: false });
  const ragSystem = buildLayeredSystemMessage({ ragContext: input.ragContext, includeRecall: false });
  const recallSystem = buildLayeredSystemMessage({ recall: input.recall, includeRecall: Boolean(input.recall) });
  const local_full_input = countMessagesTokens([fullSystem, ...history]);
  const local_trimmed_input = countMessagesTokens([systemMessage, ...selected]);

  return {
    messages: [systemMessage, ...selected],
    tokenStats: {
      local_full_input,
      local_trimmed_input,
      saved_by_truncation_est: Math.max(0, local_full_input - local_trimmed_input),
      memory_tokens: input.memory ? countMessagesTokens([memorySystem]) - countMessagesTokens([baseSystem]) : 0,
      recent_history_tokens: countMessagesTokens(selected),
      recall_tokens:
        input.recall && includeRecall
          ? countMessagesTokens([recallSystem]) - countMessagesTokens([baseSystem])
          : 0,
      rag_tokens: input.ragContext ? countMessagesTokens([ragSystem]) - countMessagesTokens([baseSystem]) : 0,
      omitted_recall: omittedRecall,
      omitted_history_messages: Math.max(0, history.length - selected.length),
    },
  };
}

export function shouldScheduleMemoryCompaction(input: Omit<ConversationContextInput, "recall">): boolean {
  const fullHistoryContext = buildConversationContext({
    ...input,
    recentMessages: Number.MAX_SAFE_INTEGER,
  });
  return (
    fullHistoryContext.tokenStats.local_full_input >=
    getMaxInputTokens() * getConversationMemoryConfig().compactionThreshold
  );
}
