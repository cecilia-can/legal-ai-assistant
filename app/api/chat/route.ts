import OpenAI from "openai";
import { jsonError } from "@/lib/api/api-response";
import { encodeSseEvent } from "@/lib/api/sse";
import {
  AiConfigError,
  AiServiceError,
  createChatCompletionStream,
  extractDeltaText,
} from "@/lib/ai/client";
import type { ChatApiMessage } from "@/types/chat";

export const dynamic = "force-dynamic";

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

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("请求体必须是 JSON。", 400);
  }

  const messages = (body as { messages?: unknown }).messages;

  if (!isValidMessages(messages)) {
    return jsonError("messages 必须是非空数组，且每项含 role 与 content。", 400);
  }

  let upstream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

  try {
    upstream = await createChatCompletionStream(messages);
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

      try {
        for await (const chunk of upstream) {
          const text = extractDeltaText(chunk);
          if (text) {
            controller.enqueue(
              encoder.encode(encodeSseEvent({ type: "token", text })),
            );
          }
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
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
