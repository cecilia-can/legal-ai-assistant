/**
 * 从 stdin 读取 CHAT_USAGE_LOG JSON 行并按 conversationId 聚合。
 *
 * Usage:
 *   CHAT_USAGE_LOG=true npm run dev 2>&1 | npx tsx scripts/summarize-chat-usage-log.ts
 *   type usage.log | npx tsx scripts/summarize-chat-usage-log.ts
 */
import readline from "node:readline";
import type { ChatUsageLogEvent } from "../lib/ai/chatUsageLog";

type ConversationAggregate = {
  conversationId: string | null;
  chat_completions: number;
  jailbreak_blocked: number;
  prompt_tokens: number;
  completion_tokens: number;
  saved_by_truncation_est: number;
  saved_input_tokens_est: number;
};

function isUsageLogEvent(value: unknown): value is ChatUsageLogEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.event === "chat_completion" || record.event === "jailbreak_blocked"
  );
}

function getAggregateKey(conversationId: string | null): string {
  return conversationId ?? "__no_conversation__";
}

function ensureAggregate(
  map: Map<string, ConversationAggregate>,
  conversationId: string | null,
): ConversationAggregate {
  const key = getAggregateKey(conversationId);
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const created: ConversationAggregate = {
    conversationId,
    chat_completions: 0,
    jailbreak_blocked: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    saved_by_truncation_est: 0,
    saved_input_tokens_est: 0,
  };
  map.set(key, created);
  return created;
}

function applyEvent(
  map: Map<string, ConversationAggregate>,
  event: ChatUsageLogEvent,
): void {
  const aggregate = ensureAggregate(map, event.conversationId);

  if (event.event === "chat_completion") {
    aggregate.chat_completions += 1;
    aggregate.prompt_tokens += event.usage.prompt_tokens;
    aggregate.completion_tokens += event.usage.completion_tokens;
    aggregate.saved_by_truncation_est += event.saved_by_truncation_est;
    return;
  }

  aggregate.jailbreak_blocked += 1;
  aggregate.saved_input_tokens_est += event.saved_input_tokens_est;
}

async function readLines(): Promise<string[]> {
  const lines: string[] = [];
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lines.push(line);
  }

  return lines;
}

async function run(): Promise<void> {
  const lines = await readLines();
  const aggregates = new Map<string, ConversationAggregate>();
  let parsedEvents = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }

    try {
      const value: unknown = JSON.parse(trimmed);
      if (!isUsageLogEvent(value)) {
        continue;
      }

      applyEvent(aggregates, value);
      parsedEvents += 1;
    } catch {
      // ignore non-JSON lines (Next.js dev output, etc.)
    }
  }

  const rows = [...aggregates.values()].sort((left, right) => {
    const leftKey = getAggregateKey(left.conversationId);
    const rightKey = getAggregateKey(right.conversationId);
    return leftKey.localeCompare(rightKey);
  });

  console.log("summarize-chat-usage-log");
  console.log(`  parsed events: ${parsedEvents}`);
  console.log(`  conversations: ${rows.length}`);
  console.log("");

  for (const row of rows) {
    console.log(
      JSON.stringify({
        conversationId: row.conversationId,
        chat_completions: row.chat_completions,
        jailbreak_blocked: row.jailbreak_blocked,
        prompt_tokens: row.prompt_tokens,
        completion_tokens: row.completion_tokens,
        saved_by_truncation_est: row.saved_by_truncation_est,
        saved_input_tokens_est: row.saved_input_tokens_est,
      }),
    );
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
