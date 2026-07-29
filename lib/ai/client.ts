import OpenAI from "openai";
import type { ModelMessage } from "@/types/chat";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const RETRY_DELAY_MS = 500;

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

function createOpenAiClient(): OpenAI {
  return new OpenAI({
    apiKey: getApiKey(),
    baseURL: getBaseUrl(),
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
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  let lastError: AiServiceError | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const client = createOpenAiClient();
      return await client.chat.completions.create({
        model: getModelName(),
        messages,
        stream: true,
        stream_options: { include_usage: true },
      });
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
