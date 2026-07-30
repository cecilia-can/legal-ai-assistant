import OpenAI from "openai";
import { jsonError } from "@/lib/api/api-response";
import {
  createFixedTextSseResponse,
  encodeSseEvent,
  getSseResponseHeaders,
} from "@/lib/api/sse";
import { buildModelMessages, computeInputTokenStats } from "@/lib/ai/context";
import {
  logChatCompletion,
  logJailbreakBlocked,
} from "@/lib/ai/chatUsageLog";
import {
  getJailbreakRejectionMessage,
  isLatestUserJailbreak,
} from "@/lib/ai/jailbreak";
import {
  AiConfigError,
  AiServiceError,
  createChatCompletionStream,
  extractDeltaText,
  extractUsageFromChunk,
} from "@/lib/ai/client";
import type { ChatApiMessage } from "@/types/chat";

export const dynamic = "force-dynamic";

function containsSystemRole(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.some(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      (item as { role?: unknown }).role === "system",
  );
}

function isValidMessages(value: unknown): value is ChatApiMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  return value.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string" &&
      item.content.trim().length > 0,
  );
}

function parseConversationId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("请求体必须是 JSON。", 400);
  }

  const messages = (body as { messages?: unknown }).messages;
  const conversationId = parseConversationId(
    (body as { conversationId?: unknown }).conversationId,
  );

  if (containsSystemRole(messages)) {
    return jsonError("不允许客户端传入 system 角色的消息。", 400);
  }

  if (!isValidMessages(messages)) {
    return jsonError("messages 必须是非空数组，且每项含 role 与 content。", 400);
  }

  if (isLatestUserJailbreak(messages)) {
    const tokenStats = computeInputTokenStats(messages);
    logJailbreakBlocked({
      conversationId,
      saved_input_tokens_est: tokenStats.local_trimmed_input,
    });
    return createFixedTextSseResponse(getJailbreakRejectionMessage());
  }

  const tokenStats = computeInputTokenStats(messages);
  const modelMessages = buildModelMessages(messages);

  let upstream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

  try {
    upstream = await createChatCompletionStream(modelMessages);
  } catch (error) {
    if (error instanceof AiConfigError) {
      return jsonError(error.message, 500);
    }

    if (error instanceof AiServiceError) {
      const status =
        error.status && error.status >= 400 && error.status < 600
          ? error.status
          : 502;
      return jsonError(error.message || "AI 服务不可用，请稍后重试。", status);
    }

    console.error("POST /api/chat failed before stream:", error);
    return jsonError("AI 服务不可用，请稍后重试。", 502);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastUsage: { prompt_tokens: number; completion_tokens: number } | null =
        null;

      try {
        for await (const chunk of upstream) {
          const usage = extractUsageFromChunk(chunk);
          if (usage) {
            lastUsage = usage;
          }

          const text = extractDeltaText(chunk);
          if (text) {
            controller.enqueue(
              encoder.encode(encodeSseEvent({ type: "token", text })),
            );
          }
        }

        if (lastUsage) {
          logChatCompletion({
            conversationId,
            usage: lastUsage,
            local_full_input: tokenStats.local_full_input,
            local_trimmed_input: tokenStats.local_trimmed_input,
            saved_by_truncation_est: tokenStats.saved_by_truncation_est,
          });
        }

        controller.enqueue(encoder.encode(encodeSseEvent({ type: "done" })));
        controller.close();
      } catch (error) {
        console.error("POST /api/chat stream error:", error);
        const message =
          error instanceof Error ? error.message : "流式响应中断，请稍后重试。";

        controller.enqueue(
          encoder.encode(
            encodeSseEvent({ type: "error", message }),
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: getSseResponseHeaders(),
  });
}
