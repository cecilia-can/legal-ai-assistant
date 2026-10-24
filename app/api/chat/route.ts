import OpenAI from "openai";
import { jsonError } from "@/lib/api/api-response";
import { encodeSseEvent, getSseResponseHeaders } from "@/lib/api/sse";
import { buildModelMessages, computeInputTokenStats } from "@/lib/ai/context";
import { logChatCompletion, logJailbreakBlocked } from "@/lib/ai/chatUsageLog";
import { checkChatRateLimit, recordChatTokenUsage } from "@/lib/ai/rateLimit";
import { getJailbreakRejectionMessage, isLatestUserJailbreak } from "@/lib/ai/jailbreak";
import { AiConfigError, AiServiceError, createChatCompletionStream, extractDeltaText, extractUsageFromChunk } from "@/lib/ai/client";
import { requireApiSession } from "@/lib/auth/require-api-session";
import { buildRagContext } from "@/lib/rag/context";
import { isRagEnabled } from "@/lib/rag/config";
import { retrieveRelevantChunks } from "@/lib/rag/retrieval";
import { ChatRunServiceError, completeChatRun, createOrGetChatRun, finishChatRun } from "@/lib/services/chatRunService";
import { MessageServiceError, listConversationMessagesForChat } from "@/lib/services/messageService";
import type { ChatApiMessage, ChatStreamEvent } from "@/types/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const FIRST_TOKEN_TIMEOUT_MS = 15_000;
const IDLE_STREAM_TIMEOUT_MS = 30_000;
const TOTAL_STREAM_TIMEOUT_MS = 90_000;

function parseNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toChatApiMessages(records: Awaited<ReturnType<typeof listConversationMessagesForChat>>): ChatApiMessage[] {
  return records
    .filter((record) => (record.role === "user" || record.role === "assistant") && record.content.trim().length > 0)
    .map((record) => ({ role: record.role as "user" | "assistant", content: record.content }));
}

function sseResponse(
  start: (controller: ReadableStreamDefaultController<Uint8Array>) => Promise<void>,
  runId?: string,
) {
  const headers = new Headers(getSseResponseHeaders());
  if (runId) headers.set("X-Chat-Run-Id", runId);
  return new Response(new ReadableStream<Uint8Array>({ start }), {
    status: 200,
    headers,
  });
}

function streamError(message: string, code: "UPSTREAM_ERROR" | "UPSTREAM_TIMEOUT"): ChatStreamEvent {
  return { type: "error", message, code };
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session.error) return session.error;

  const body = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) return jsonError("请求体必须是 JSON 对象。", 400);

  const payload = body as Record<string, unknown>;
  const conversationId = parseNonEmptyString(payload.conversationId);
  const content = parseNonEmptyString(payload.content);
  const clientRequestId = parseNonEmptyString(payload.clientRequestId);
  if (!conversationId || !content || !clientRequestId) {
    return jsonError("conversationId、content 和 clientRequestId 不能为空。", 400);
  }
  if (clientRequestId.length > 128) return jsonError("clientRequestId 长度不能超过 128。", 400);

  const rateLimit = checkChatRateLimit(session.userId);
  if (!rateLimit.allowed) {
    return jsonError(rateLimit.reason === "requests" ? "请求过于频繁，请稍后再试。" : "已达到今日 token 使用上限，请明天再试。", 429);
  }

  let creation: Awaited<ReturnType<typeof createOrGetChatRun>>;
  try {
    creation = await createOrGetChatRun({ conversationId, userId: session.userId, content, clientRequestId });
  } catch (error) {
    if (error instanceof MessageServiceError) return jsonError(error.message, 404);
    if (error instanceof ChatRunServiceError) return jsonError(error.message, 409);
    console.error("POST /api/chat failed creating run:", error);
    return jsonError("无法创建生成任务，请稍后重试。", 500);
  }
  if (creation.kind === "existing") return jsonError("该请求已被处理，请刷新会话查看结果。", 409);
  const run = creation.run;

  let apiMessages: ChatApiMessage[];
  try {
    apiMessages = toChatApiMessages(await listConversationMessagesForChat(conversationId, session.userId));
  } catch (error) {
    await finishChatRun({ runId: run.id, status: "failed", content: "", failureReason: "UPSTREAM_ERROR" });
    console.error("POST /api/chat failed loading history:", error);
    return jsonError("无法加载会话历史，请稍后重试。", 500);
  }

  const latestUser = apiMessages.at(-1);
  if (!latestUser || latestUser.role !== "user") {
    await finishChatRun({ runId: run.id, status: "failed", content: "", failureReason: "UPSTREAM_ERROR" });
    return jsonError("缺少 user 消息，无法生成回复。", 400);
  }

  if (isLatestUserJailbreak(apiMessages)) {
    const rejection = getJailbreakRejectionMessage();
    await completeChatRun({ runId: run.id, content: rejection });
    logJailbreakBlocked({ conversationId, saved_input_tokens_est: computeInputTokenStats(apiMessages).local_trimmed_input });
    return sseResponse(async (controller) => {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(encodeSseEvent({ type: "token", text: rejection })));
      controller.enqueue(encoder.encode(encodeSseEvent({ type: "done" })));
      controller.close();
    }, run.id);
  }

  let ragContext: string | undefined;
  if (isRagEnabled()) {
    try {
      ragContext = buildRagContext(await retrieveRelevantChunks({ userId: session.userId, query: latestUser.content }))?.content;
    } catch (error) {
      await finishChatRun({ runId: run.id, status: "failed", content: "", failureReason: "UPSTREAM_ERROR" });
      console.error("POST /api/chat failed retrieving RAG context:", error);
      return jsonError("知识库检索暂时不可用，请稍后重试。", 503);
    }
  }

  const tokenStats = computeInputTokenStats(apiMessages, ragContext);
  if (!recordChatTokenUsage(session.userId, tokenStats.local_trimmed_input).allowed) {
    await finishChatRun({ runId: run.id, status: "failed", content: "", failureReason: "UPSTREAM_ERROR" });
    return jsonError("已达到今日 token 使用上限，请明天再试。", 429);
  }

  let upstream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  const upstreamController = new AbortController();
  let timedOut = false;
  let firstTokenTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timedOut = true;
    upstreamController.abort();
  }, FIRST_TOKEN_TIMEOUT_MS);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const totalTimer = setTimeout(() => {
    timedOut = true;
    upstreamController.abort();
  }, TOTAL_STREAM_TIMEOUT_MS);
  const abortFromClient = () => upstreamController.abort();
  request.signal.addEventListener("abort", abortFromClient, { once: true });
  try {
    upstream = await createChatCompletionStream(buildModelMessages(apiMessages, ragContext), { signal: upstreamController.signal });
  } catch (error) {
    clearTimeout(totalTimer);
    if (firstTokenTimer) clearTimeout(firstTokenTimer);
    request.signal.removeEventListener("abort", abortFromClient);
    const timeout = timedOut || (error instanceof Error && error.name === "APIConnectionTimeoutError");
    await finishChatRun({ runId: run.id, status: request.signal.aborted ? "cancelled" : "failed", content: "", failureReason: timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR" });
    if (error instanceof AiConfigError) return jsonError(error.message, 500);
    if (error instanceof AiServiceError) return jsonError(error.message || "AI 服务不可用，请稍后重试。", error.status && error.status >= 400 && error.status < 600 ? error.status : 502);
    return jsonError("AI 服务不可用，请稍后重试。", 502);
  }

  return sseResponse(async (controller) => {
    const encoder = new TextEncoder();
    let text = "";
    let lastUsage: { prompt_tokens: number; completion_tokens: number } | null = null;
    try {
      for await (const chunk of upstream) {
        if (request.signal.aborted) {
          await finishChatRun({ runId: run.id, status: "cancelled", content: text });
          controller.enqueue(encoder.encode(encodeSseEvent({ type: "cancelled" })));
          return;
        }
        const usage = extractUsageFromChunk(chunk);
        if (usage) lastUsage = usage;
        const delta = extractDeltaText(chunk);
        if (delta) {
          if (firstTokenTimer) {
            clearTimeout(firstTokenTimer);
            firstTokenTimer = null;
          }
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            timedOut = true;
            upstreamController.abort();
          }, IDLE_STREAM_TIMEOUT_MS);
          text += delta;
          controller.enqueue(encoder.encode(encodeSseEvent({ type: "token", text: delta })));
        }
      }
      await completeChatRun({ runId: run.id, content: text });
      if (lastUsage) logChatCompletion({ conversationId, usage: lastUsage, local_full_input: tokenStats.local_full_input, local_trimmed_input: tokenStats.local_trimmed_input, saved_by_truncation_est: tokenStats.saved_by_truncation_est });
      controller.enqueue(encoder.encode(encodeSseEvent({ type: "done" })));
    } catch (error) {
      const cancelled = request.signal.aborted;
      const timeout = timedOut || (error instanceof Error && error.name === "APIConnectionTimeoutError");
      await finishChatRun({ runId: run.id, status: cancelled ? "cancelled" : "failed", content: text, failureReason: timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR" });
      controller.enqueue(encoder.encode(cancelled ? encodeSseEvent({ type: "cancelled" }) : encodeSseEvent(streamError("流式响应中断，请稍后重试。", timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR"))));
    } finally {
      clearTimeout(totalTimer);
      if (firstTokenTimer) clearTimeout(firstTokenTimer);
      if (idleTimer) clearTimeout(idleTimer);
      request.signal.removeEventListener("abort", abortFromClient);
      controller.close();
    }
  }, run.id);
}
