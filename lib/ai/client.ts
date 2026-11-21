import OpenAI from "openai";
import { getMaxOutputTokens } from "@/lib/ai/tokenizer";
import { getConversationMemoryMaxOutputTokens } from "@/lib/memory/config";
import type { ModelMessage } from "@/types/chat";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const RETRY_DELAY_MS = 500;
const DEFAULT_TIMEOUT_MS = 90_000;

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

export class AiServiceError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AiServiceError";
    this.status = status;
  }
}

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AiConfigError("未配置 OPENAI_API_KEY，请在 .env 中设置。");
  }

  return apiKey;
}

function getBaseUrl(): string {
  return process.env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

export function getModelName(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

function getTimeoutMs(): number {
  const configured = Number(process.env.CHAT_MODEL_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_TIMEOUT_MS;
}

function createOpenAiClient(): OpenAI {
  return new OpenAI({
    apiKey: getApiKey(),
    baseURL: getBaseUrl(),
    timeout: getTimeoutMs(),
    maxRetries: 1,
  });
}

function isRetryableStatus(status: number | undefined): boolean {
  return status === 429 || (status !== undefined && status >= 500);
}

function getErrorStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }

  return undefined;
}

function toAiServiceError(error: unknown): AiServiceError {
  if (error instanceof AiServiceError) {
    return error;
  }

  const status = getErrorStatus(error);
  const message =
    error instanceof Error ? error.message : "AI 服务调用失败，请稍后重试。";

  return new AiServiceError(message, status);
}

export async function createChatCompletionStream(
  messages: ModelMessage[],
  options?: { signal?: AbortSignal },
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  let lastError: AiServiceError | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const client = createOpenAiClient();
      return await client.chat.completions.create(
        {
          model: getModelName(),
          messages,
          max_tokens: getMaxOutputTokens(),
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: options?.signal },
      );
    } catch (error) {
      if (error instanceof AiConfigError) {
        throw error;
      }

      const serviceError = toAiServiceError(error);
      lastError = serviceError;

      if (attempt === 0 && isRetryableStatus(serviceError.status)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }

      throw serviceError;
    }
  }

  throw lastError ?? new AiServiceError("AI 服务调用失败，请稍后重试。");
}

type MemoryCompletionMessage = {
  content?: unknown;
  refusal?: unknown;
  reasoning_content?: unknown;
  tool_calls?: unknown;
};

/**
 * Logs only response metadata: never the conversation, generated content, or
 * credentials. It makes provider-specific JSON-mode incompatibilities diagnosable.
 */
function logEmptyMemoryCompletionResponse(
  response: OpenAI.Chat.Completions.ChatCompletion,
  usedJsonMode: boolean,
) {
  const choice = response.choices[0];
  const message = choice?.message as MemoryCompletionMessage | undefined;
  const lengthOf = (value: unknown) => typeof value === "string" ? value.length : 0;

  console.warn(JSON.stringify({
    event: "conversation_memory_empty_model_response",
    model: getModelName(),
    responseId: response.id ?? null,
    usedJsonMode,
    choiceCount: response.choices.length,
    finishReason: choice?.finish_reason ?? null,
    contentLength: lengthOf(message?.content),
    reasoningContentLength: lengthOf(message?.reasoning_content),
    hasRefusal: Boolean(message?.refusal),
    toolCallCount: Array.isArray(message?.tool_calls) ? message.tool_calls.length : 0,
  }));
}

/** Internal-only completion used for validated conversation-memory compaction. */
export async function createStructuredMemoryCompletion(
  messages: ModelMessage[],
): Promise<string> {
  let lastError: AiServiceError | null = null;

  // Some OpenAI-compatible providers accept JSON mode but return an empty
  // content field. The prompt itself still requires JSON, so safely retry once
  // without the provider-specific response_format option.
  for (const usedJsonMode of [true, false]) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const client = createOpenAiClient();
        const response = await client.chat.completions.create({
          model: getModelName(),
          messages,
          max_tokens: getConversationMemoryMaxOutputTokens(),
          temperature: 0,
          ...(usedJsonMode ? { response_format: { type: "json_object" as const } } : {}),
        });
        const content = response.choices[0]?.message.content;
        if (content?.trim()) return content;

        logEmptyMemoryCompletionResponse(response, usedJsonMode);
        lastError = new AiServiceError("摘要模型未返回内容。");
        break;
      } catch (error) {
        if (error instanceof AiConfigError) throw error;
        const serviceError = toAiServiceError(error);
        lastError = serviceError;

        if (attempt === 0 && isRetryableStatus(serviceError.status)) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }

        // A request-format rejection is a known compatibility case. Fall back
        // to the same strict prompt without response_format.
        if (usedJsonMode && (serviceError.status === 400 || serviceError.status === 422)) {
          console.warn(JSON.stringify({
            event: "conversation_memory_json_mode_rejected",
            model: getModelName(),
            status: serviceError.status,
          }));
          break;
        }

        throw serviceError;
      }
    }
  }

  throw lastError ?? new AiServiceError("摘要模型调用失败。");
}

export function extractDeltaText(
  chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
): string {
  return chunk.choices[0]?.delta?.content ?? "";
}

export type ChatCompletionUsage = {
  prompt_tokens: number;
  completion_tokens: number;
};

export function extractUsageFromChunk(
  chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
): ChatCompletionUsage | null {
  const usage = chunk.usage;
  if (
    !usage ||
    typeof usage.prompt_tokens !== "number" ||
    typeof usage.completion_tokens !== "number"
  ) {
    return null;
  }

  return {
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
  };
}
