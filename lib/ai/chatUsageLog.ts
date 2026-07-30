export type ChatUsageLogEvent =
  | {
      event: "jailbreak_blocked";
      ts: string;
      conversationId: string | null;
      saved_input_tokens_est: number;
    }
  | {
      event: "chat_completion";
      ts: string;
      conversationId: string | null;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
      };
      local_full_input: number;
      local_trimmed_input: number;
      saved_by_truncation_est: number;
    };

export function isChatUsageLogEnabled(): boolean {
  const value = process.env.CHAT_USAGE_LOG?.trim().toLowerCase();
  return value === "true" || value === "1";
}

function emitLog(payload: ChatUsageLogEvent): void {
  console.info(JSON.stringify(payload));
}

export function logJailbreakBlocked(params: {
  conversationId?: string;
  saved_input_tokens_est: number;
}): void {
  if (!isChatUsageLogEnabled()) {
    return;
  }

  emitLog({
    event: "jailbreak_blocked",
    ts: new Date().toISOString(),
    conversationId: params.conversationId ?? null,
    saved_input_tokens_est: params.saved_input_tokens_est,
  });
}

export function logChatCompletion(params: {
  conversationId?: string;
  usage: { prompt_tokens: number; completion_tokens: number };
  local_full_input: number;
  local_trimmed_input: number;
  saved_by_truncation_est: number;
}): void {
  if (!isChatUsageLogEnabled()) {
    return;
  }

  emitLog({
    event: "chat_completion",
    ts: new Date().toISOString(),
    conversationId: params.conversationId ?? null,
    usage: params.usage,
    local_full_input: params.local_full_input,
    local_trimmed_input: params.local_trimmed_input,
    saved_by_truncation_est: params.saved_by_truncation_est,
  });
}
