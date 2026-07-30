/**
 * Token 计数与上下文预算（Change 1.7）。
 *
 * 供 `lib/ai/context.ts` 在组装发往模型的 messages 前估算长度；
 * 超 `getMaxInputTokens()` 时从最早的历史消息开始裁剪。
 *
 * 编码选用 `cl100k_base`（GPT-4 系常用），作为 DeepSeek 等 OpenAI 兼容模型的近似；
 * 与模型真实分词可能略有偏差，部署时可调低 `CHAT_MAX_CONTEXT_TOKENS` 留余量。
 */
import { getEncoding, type Tiktoken } from "js-tiktoken";

import type { ModelMessage } from "@/types/chat";

/** 与 cl100k_base 对齐；DeepSeek 无官方 JS tokenizer 时的业界常用近似。 */
const ENCODING_NAME = "cl100k_base";
/** OpenAI Chat Completions 每条 message 的固定格式开销（role 标记、分隔符等）。 */
const PER_MESSAGE_OVERHEAD = 4;
/** 模型开始生成 assistant 回复时的固定前缀开销。 */
const REPLY_OVERHEAD = 3;

const DEFAULT_MAX_CONTEXT_TOKENS = 32_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4_096;
/** 即使 context − output 很小，也保证 history 至少能塞下 system + 一条短 user。 */
const MIN_INPUT_TOKENS = 1_024;

let encoding: Tiktoken | null = null;

/** 懒加载单例：tiktoken 表较大，避免冷启动时重复初始化。 */
function getTokenizer(): Tiktoken {
  if (!encoding) {
    encoding = getEncoding(ENCODING_NAME);
  }
  return encoding;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

/** 模型上下文窗口总上限（输入 + 输出），见 `CHAT_MAX_CONTEXT_TOKENS`。 */
export function getMaxContextTokens(): number {
  return parsePositiveInt(
    process.env.CHAT_MAX_CONTEXT_TOKENS,
    DEFAULT_MAX_CONTEXT_TOKENS,
  );
}

/** 预留给 assistant 生成的 Token，与 API `max_tokens` 概念对齐。 */
export function getMaxOutputTokens(): number {
  return parsePositiveInt(
    process.env.CHAT_MAX_OUTPUT_TOKENS,
    DEFAULT_MAX_OUTPUT_TOKENS,
  );
}

/**
 * 可用于 history + system 的输入预算。
 * 从总窗口减去输出预留；下限为 MIN_INPUT_TOKENS，避免配置错误导致预算为 0。
 */
export function getMaxInputTokens(): number {
  const maxInput = getMaxContextTokens() - getMaxOutputTokens();
  return Math.max(MIN_INPUT_TOKENS, maxInput);
}

export function countTextTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return getTokenizer().encode(text).length;
}

/**
 * 估算 OpenAI 格式 messages 数组的总 Token 数。
 * 算法与 OpenAI cookbook 一致：逐条累加 role/content + per-message overhead，再加 reply 前缀。
 */
export function countMessagesTokens(messages: ModelMessage[]): number {
  if (messages.length === 0) {
    return 0;
  }

  let total = REPLY_OVERHEAD;

  for (const message of messages) {
    total += PER_MESSAGE_OVERHEAD;
    total += countTextTokens(message.role);
    total += countTextTokens(message.content);
  }

  return total;
}
