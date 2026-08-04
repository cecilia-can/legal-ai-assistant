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
  checkChatRateLimit,
  recordChatTokenUsage,
} from "@/lib/ai/rateLimit";
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
import { requireApiSession } from "@/lib/auth/require-api-session";
import {
  MessageServiceError,
  listConversationMessagesForChat,
} from "@/lib/services/messageService";
import type { ChatApiMessage } from "@/types/chat";

export const dynamic = "force-dynamic";

function parseConversationId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseContent(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toChatApiMessages(
  records: Awaited<ReturnType<typeof listConversationMessagesForChat>>,
): ChatApiMessage[] {
  return records
    .filter((record) => record.role === "user" || record.role === "assistant")
    .map((record) => ({
      role: record.role as "user" | "assistant",
      content: record.content,
    }));
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session.error) {
    return session.error;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("请求体必须是 JSON。", 400);
  }

  const conversationId = parseConversationId(
    (body as { conversationId?: unknown }).conversationId,
  );
  const content = parseContent((body as { content?: unknown }).content);

  if (!conversationId) {
    return jsonError("conversationId 不能为空。", 400);
  }

  const rateLimit = checkChatRateLimit(session.userId);
  if (!rateLimit.allowed) {
    const message =
      rateLimit.reason === "requests"
        ? "请求过于频繁，请稍后再试。"
        : "已达到今日使用上限，请明天再试。";
    return jsonError(message, 429);
  }

  let apiMessages: ChatApiMessage[];

  try {
    const records = await listConversationMessagesForChat(
      conversationId,
      session.userId,
    );
    apiMessages = toChatApiMessages(records);

    if (content) {
      apiMessages = [
        ...apiMessages,
        {
          role: "user",
          content,
        },
      ];
    }
  } catch (error) {
    if (error instanceof MessageServiceError) {
      return jsonError(error.message, 404);
    }

    console.error("POST /api/chat failed loading history:", error);
    return jsonError("无法加载会话历史，请稍后重试。", 500);
  }

  if (apiMessages.length === 0) {
    return jsonError("会话中没有可用于生成的消息。", 400);
  }

  const latestUser = [...apiMessages]
    .reverse()
    .find((message) => message.role === "user");

  if (!latestUser) {
    return jsonError("缺少 user 消息，无法生成回复。", 400);
  }

  if (isLatestUserJailbreak(apiMessages)) {
    const tokenStats = computeInputTokenStats(apiMessages);
    logJailbreakBlocked({
      conversationId,
      saved_input_tokens_est: tokenStats.local_trimmed_input,
    });
    return createFixedTextSseResponse(getJailbreakRejectionMessage());
  }

  const tokenStats = computeInputTokenStats(apiMessages);
  const tokenQuota = recordChatTokenUsage(
    session.userId,
    tokenStats.local_trimmed_input,
  );
  if (!tokenQuota.allowed) {
    return jsonError("已达到今日 token 使用上限，请明天再试。", 429);
  }

  const modelMessages = buildModelMessages(apiMessages);

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
