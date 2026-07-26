/**
 * 聊天消息客户端状态：按会话存储消息、发起流式 AI 请求、处理 SSE 增量更新。
 * 消息仅存内存，刷新页面会丢失；会话元数据由 conversationStore 管理。
 */
import { consumeSseStream } from "@/lib/api/sse";
import { isApiResponse, readApiMessage } from "@/lib/api/api-response";
import { createDisplayQueue } from "@/lib/streaming/displayQueue";
import type { ChatApiMessage, ChatMessage } from "@/types/chat";
import { create } from "zustand";

interface ChatState {
  /** 按 conversationId 索引的消息列表 */
  messagesByConversation: Record<string, ChatMessage[]>;
  /** 当前正在接收 SSE 的会话 ID，null 表示空闲 */
  streamingConversationId: string | null;
  error: string | null;
  /** 向指定会话发送用户消息，经 SSE 流式接收 AI 回复并更新 UI */
  sendMessage: (conversationId: string, content: string) => Promise<void>;
  /** 中断当前进行中的流式请求（fetch + SSE 读取） */
  abortStream: () => void;
  /** 清除指定会话在内存中的消息缓存（如删除会话时调用） */
  clearConversationMessages: (conversationId: string) => void;
  /** 清除最近一次聊天错误提示 */
  clearError: () => void;
}

/**
 * 进行中的 fetch / SSE 控制柄，放在 store 外以避免无意义的重渲染。
 * 同一时刻只允许一条活跃流。
 */
let abortController: AbortController | null = null;
/** 与 abortController 配对，用于丢弃切换会话后迟到的 token 事件 */
let activeStreamConversationId: string | null = null;
/** 进行中的展示队列，abort 时需 cancel */
let activeDisplayQueue: ReturnType<typeof createDisplayQueue> | null = null;

/** 将 UI 消息转为 POST /api/chat 所需格式（去掉 id、createdAt，过滤非 user/assistant 角色） */
function toApiMessages(messages: ChatMessage[]): ChatApiMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));
}

function createMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function appendAssistantChunk(
  set: (
    partial:
      | ChatState
      | Partial<ChatState>
      | ((state: ChatState) => ChatState | Partial<ChatState>),
  ) => void,
  conversationId: string,
  assistantMessageId: string,
  chunk: string,
) {
  set((state) => {
    const messages = state.messagesByConversation[conversationId];
    if (!messages?.length) {
      return state;
    }

    const updated = messages.map((message) =>
      message.id === assistantMessageId
        ? { ...message, content: message.content + chunk }
        : message,
    );

    return {
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: updated,
      },
    };
  });
}

function clearStreamingIfMatch(
  set: (
    partial:
      | ChatState
      | Partial<ChatState>
      | ((state: ChatState) => ChatState | Partial<ChatState>),
  ) => void,
  conversationId: string,
) {
  set((state) =>
    state.streamingConversationId === conversationId
      ? { streamingConversationId: null }
      : state,
  );
}

/** 聊天 Zustand store：消息按会话分桶，同一时刻仅允许一条活跃 SSE 流 */
export const useChatStore = create<ChatState>((set, get) => ({
  messagesByConversation: {},
  streamingConversationId: null,
  error: null,

  /**
   * 发送一条用户消息并流式获取 AI 回复。
   *
   * 流程：中断旧流 → 乐观插入 user + 空 assistant → POST /api/chat
   * → SSE token 写入展示队列 → 按节奏 reveal 到 UI → 队列排空后结束 streaming。
   */
  sendMessage: async (conversationId, content) => {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    get().abortStream();

    const now = new Date();
    const userMessage: ChatMessage = {
      id: createMessageId("user"),
      role: "user",
      content: trimmed,
      createdAt: now,
    };

    const assistantMessage: ChatMessage = {
      id: createMessageId("assistant"),
      role: "assistant",
      content: "",
      createdAt: now,
    };

    const previousMessages = get().messagesByConversation[conversationId] ?? [];
    const nextMessages = [...previousMessages, userMessage, assistantMessage];

    set((state) => ({
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: nextMessages,
      },
      streamingConversationId: conversationId,
      error: null,
    }));

    const controller = new AbortController();
    abortController = controller;
    activeStreamConversationId = conversationId;

    const displayQueue = createDisplayQueue(
      (chunk) => {
        appendAssistantChunk(set, conversationId, assistantMessage.id, chunk);
      },
      () => {
        if (activeDisplayQueue === displayQueue) {
          activeDisplayQueue = null;
        }

        clearStreamingIfMatch(set, conversationId);
      },
    );

    activeDisplayQueue = displayQueue;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: toApiMessages([...previousMessages, userMessage]),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let message = "AI 回复失败，请稍后重试。";

        try {
          const payload: unknown = await response.json();
          if (isApiResponse(payload)) {
            message = readApiMessage(payload, message);
          }
        } catch {
          // ignore JSON parse errors
        }

        throw new Error(message);
      }

      if (!response.body) {
        throw new Error("AI 响应无效。");
      }

      const reader = response.body.getReader();

      await consumeSseStream(
        reader,
        (event) => {
          if (
            controller.signal.aborted ||
            activeStreamConversationId !== conversationId
          ) {
            return;
          }

          if (event.type === "token") {
            displayQueue.enqueue(event.text);
            return;
          }

          if (event.type === "error") {
            throw new Error(event.message);
          }
        },
        { signal: controller.signal },
      );

      if (!controller.signal.aborted) {
        displayQueue.markNetworkDone();
        await displayQueue.waitUntilIdle();
      } else {
        displayQueue.cancel();
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      displayQueue.cancel();
      const message =
        error instanceof Error ? error.message : "AI 回复失败，请稍后重试。";

      set((state) => {
        const messages = state.messagesByConversation[conversationId] ?? [];
        const withoutEmptyAssistant = messages.filter(
          (message) =>
            !(
              message.id === assistantMessage.id && message.content.length === 0
            ),
        );

        return {
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: withoutEmptyAssistant,
          },
          error: message,
          streamingConversationId:
            state.streamingConversationId === conversationId
              ? null
              : state.streamingConversationId,
        };
      });
    } finally {
      if (abortController === controller) {
        abortController = null;
        activeStreamConversationId = null;
      }

      if (activeDisplayQueue === displayQueue) {
        activeDisplayQueue = null;
      }
    }
  },

  abortStream: () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }

    activeDisplayQueue?.cancel();
    activeDisplayQueue = null;
    activeStreamConversationId = null;
    set({ streamingConversationId: null });
  },

  clearConversationMessages: (conversationId) => {
    set((state) => {
      const next = { ...state.messagesByConversation };
      delete next[conversationId];
      return { messagesByConversation: next };
    });
  },

  clearError: () => {
    set({ error: null });
  },
}));

export function getConversationMessages(
  messagesByConversation: Record<string, ChatMessage[]>,
  conversationId: string | null,
): ChatMessage[] {
  if (!conversationId) {
    return [];
  }

  return messagesByConversation[conversationId] ?? [];
}
