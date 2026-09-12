/**
 * 聊天消息客户端状态：按会话存储消息、发起流式 AI 请求、处理 SSE 增量更新。
 * 流式结束后（done 或 abort 且有内容）经消息 API 持久化；切换会话时可从 DB 加载历史。
 */
import {
  API_SUCCESS_CODE,
  isApiResponse,
  parseApiResponse,
  readApiMessage,
} from "@/lib/api/api-response";
import { apiFetch } from "@/lib/api/client-fetch";
import { retryTransientNotFound } from "@/lib/api/retry";
import { consumeSseStream } from "@/lib/api/sse";
import { createDisplayQueue } from "@/lib/streaming/displayQueue";
import type {
  ChatMessage,
  MessageJson,
  MessageListData,
  MessageRole,
} from "@/types/chat";
import { create } from "zustand";

interface ChatState {
  /** 按 conversationId 索引的消息列表 */
  messagesByConversation: Record<string, ChatMessage[]>;
  /** 当前正在接收 SSE 的会话 ID，null 表示空闲 */
  streamingConversationId: string | null;
  /** 正在从 API 加载历史的会话 ID */
  loadingConversationId: string | null;
  /** 正在加载更早历史消息的会话 ID */
  loadingOlderConversationId: string | null;
  /** 按会话保存更早消息的分页游标；null 表示没有更多历史 */
  nextCursorByConversation: Record<string, string | null>;
  /** 加载更早历史失败时的独立错误，避免覆盖发送/初始加载错误 */
  olderMessagesError: string | null;
  /** 正在删除的消息 ID */
  deletingMessageId: string | null;
  error: string | null;
  loadMessages: (conversationId: string) => Promise<void>;
  loadOlderMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string) => Promise<void>;
  abortStream: () => void;
  regenerateMessage: (
    conversationId: string,
    assistantMessageId: string,
  ) => Promise<void>;
  deleteMessage: (
    conversationId: string,
    messageId: string,
  ) => Promise<void>;
  clearConversationMessages: (conversationId: string) => void;
  clearError: () => void;
  /** 新建空会话时预置空列表，避免无意义的加载骨架与重复请求 */
  seedEmptyConversation: (conversationId: string) => void;
}

let abortController: AbortController | null = null;
let activeStreamConversationId: string | null = null;
let activeDisplayQueue: ReturnType<typeof createDisplayQueue> | null = null;

function createMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPersistedMessageId(id: string): boolean {
  return !id.startsWith("user-") && !id.startsWith("assistant-");
}

type ChatStoreSet = (
  partial:
    | ChatState
    | Partial<ChatState>
    | ((state: ChatState) => ChatState | Partial<ChatState>),
) => void;

async function deletePersistedMessage(
  conversationId: string,
  messageId: string,
): Promise<void> {
  const response = await apiFetch(
    `/api/conversations/${conversationId}/messages/${messageId}`,
    { method: "DELETE" },
  );
  const payload = await parseApiResponse<null>(response);

  if (!response.ok || payload.code !== API_SUCCESS_CODE) {
    throw new Error(readApiMessage(payload, "删除消息失败，请稍后重试。"));
  }
}

function toChatMessage(raw: MessageJson): ChatMessage {
  const role: MessageRole =
    raw.role === "user" || raw.role === "assistant" || raw.role === "system"
      ? raw.role
      : "assistant";

  return {
    id: raw.id,
    role,
    content: raw.content,
    createdAt: new Date(raw.createdAt),
  };
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

async function postPersistedRound(
  conversationId: string,
  userContent: string,
  assistantContent: string,
): Promise<{ user: MessageJson; assistant: MessageJson }> {
  const response = await retryTransientNotFound(
    () =>
      apiFetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "user", content: userContent },
            { role: "assistant", content: assistantContent },
          ],
        }),
      }),
    (candidate) => candidate.status === 404,
  );

  const payload = await parseApiResponse<{ items: MessageJson[] }>(response);

  if (!response.ok || payload.code !== API_SUCCESS_CODE || !payload.data?.items) {
    throw new Error(readApiMessage(payload, "保存消息失败，请稍后重试。"));
  }

  const [user, assistant] = payload.data.items;
  if (!user || !assistant) {
    throw new Error("保存消息失败：返回数据不完整。");
  }

  return { user, assistant };
}

async function postPersistedAssistant(
  conversationId: string,
  assistantContent: string,
): Promise<MessageJson> {
  const response = await retryTransientNotFound(
    () =>
      apiFetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "assistant", content: assistantContent }),
      }),
    (candidate) => candidate.status === 404,
  );

  const payload = await parseApiResponse<MessageJson>(response);

  if (!response.ok || payload.code !== API_SUCCESS_CODE || !payload.data) {
    throw new Error(readApiMessage(payload, "保存消息失败，请稍后重试。"));
  }

  return payload.data;
}

async function finalizeRegenerateRound(
  set: ChatStoreSet,
  conversationId: string,
  assistantTempId: string,
  assistantContent: string,
) {
  if (!assistantContent.trim()) {
    set((state) => {
      const current = state.messagesByConversation[conversationId] ?? [];
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: current.filter(
            (message) => message.id !== assistantTempId,
          ),
        },
      };
    });
    return;
  }

  set((state) => {
    const current = state.messagesByConversation[conversationId] ?? [];
    return {
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: current.map((message) =>
          message.id === assistantTempId
            ? { ...message, content: assistantContent }
            : message,
        ),
      },
    };
  });

  try {
    const persisted = await postPersistedAssistant(
      conversationId,
      assistantContent,
    );

    set((state) => {
      const current = state.messagesByConversation[conversationId] ?? [];
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: current.map((message) =>
            message.id === assistantTempId
              ? toChatMessage(persisted)
              : message,
          ),
        },
      };
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "保存消息失败，请稍后重试。";
    set({ error: message });
  }
}

async function runAssistantStream(
  set: ChatStoreSet,
  options: {
    conversationId: string;
    assistantMessageId: string;
    content?: string;
    onFinalize: (networkAssistantText: string) => Promise<void>;
    onStreamError: (assistantMessageId: string) => void;
  },
): Promise<void> {
  const {
    conversationId,
    assistantMessageId,
    content,
    onFinalize,
    onStreamError,
  } = options;

  const controller = new AbortController();
  abortController = controller;
  activeStreamConversationId = conversationId;

  let networkAssistantText = "";

  const displayQueue = createDisplayQueue(
    (chunk) => {
      appendAssistantChunk(set, conversationId, assistantMessageId, chunk);
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
    const response = await apiFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        content
          ? { conversationId, content }
          : { conversationId },
      ),
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
          networkAssistantText += event.text;
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
      displayQueue.flushSync();
      clearStreamingIfMatch(set, conversationId);
      await onFinalize(networkAssistantText);
    } else {
      displayQueue.flushSync();
      displayQueue.cancel();
      await onFinalize(networkAssistantText);
      clearStreamingIfMatch(set, conversationId);
    }
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        displayQueue.cancel();
        clearStreamingIfMatch(set, conversationId);
        return;
      }

      if (controller.signal.aborted) {
        displayQueue.flushSync();
        displayQueue.cancel();
        await onFinalize(networkAssistantText);
        clearStreamingIfMatch(set, conversationId);
        return;
      }

      displayQueue.cancel();
      onStreamError(assistantMessageId);
    const message =
      error instanceof Error ? error.message : "AI 回复失败，请稍后重试。";
    set({
      error: message,
      streamingConversationId: null,
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
}

/**
 * 方案 B：assistant 非空则事务落库 user + assistant 并替换临时 id；
 * assistant 为空则仅移除空占位，不落库。
 * 使用网络侧已收到的完整文本，不等待打字机队列排空，避免刷新只留下 user。
 */
async function finalizeRound(
  set: (
    partial:
      | ChatState
      | Partial<ChatState>
      | ((state: ChatState) => ChatState | Partial<ChatState>),
  ) => void,
  conversationId: string,
  userTempId: string,
  assistantTempId: string,
  userContent: string,
  assistantContent: string,
) {
  if (!assistantContent.trim()) {
    set((state) => {
      const current = state.messagesByConversation[conversationId] ?? [];
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: current.filter(
            (message) => message.id !== assistantTempId,
          ),
        },
      };
    });
    return;
  }

  // 先把内存里的 assistant 同步为完整网络文本，再落库
  set((state) => {
    const current = state.messagesByConversation[conversationId] ?? [];
    return {
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: current.map((message) => {
          if (message.id === userTempId) {
            return { ...message, content: userContent };
          }

          if (message.id === assistantTempId) {
            return { ...message, content: assistantContent };
          }

          return message;
        }),
      },
    };
  });

  try {
    const persisted = await postPersistedRound(
      conversationId,
      userContent,
      assistantContent,
    );

    set((state) => {
      const current = state.messagesByConversation[conversationId] ?? [];
      const updated = current.map((message) => {
        if (message.id === userTempId) {
          return toChatMessage(persisted.user);
        }

        if (message.id === assistantTempId) {
          return toChatMessage(persisted.assistant);
        }

        return message;
      });

      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: updated,
        },
      };
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "保存消息失败，请稍后重试。";
    set({ error: message });
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  messagesByConversation: {},
  streamingConversationId: null,
  loadingConversationId: null,
  loadingOlderConversationId: null,
  nextCursorByConversation: {},
  olderMessagesError: null,
  deletingMessageId: null,
  error: null,

  loadMessages: async (conversationId) => {
    if (Object.hasOwn(get().messagesByConversation, conversationId)) {
      return;
    }

    if (get().loadingConversationId === conversationId) {
      return;
    }

    set({ loadingConversationId: conversationId, error: null });

    try {
      const response = await apiFetch(
        `/api/conversations/${conversationId}/messages`,
      );
      const payload = await parseApiResponse<MessageListData>(response);

      if (!response.ok || payload.code !== API_SUCCESS_CODE || !payload.data) {
        throw new Error(readApiMessage(payload, "加载消息失败，请稍后重试。"));
      }

      const data = payload.data;
      const items = data.items.map(toChatMessage);

      set((state) => {
        if (Object.hasOwn(state.messagesByConversation, conversationId)) {
          return { loadingConversationId: null };
        }

        return {
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: items,
          },
          nextCursorByConversation: {
            ...state.nextCursorByConversation,
            [conversationId]: data.nextCursor,
          },
          loadingConversationId: null,
        };
      });
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        set((state) => ({
          loadingConversationId:
            state.loadingConversationId === conversationId
              ? null
              : state.loadingConversationId,
        }));
        return;
      }

      const message =
        error instanceof Error ? error.message : "加载消息失败，请稍后重试。";

      set((state) => ({
        error: message,
        loadingConversationId:
          state.loadingConversationId === conversationId
            ? null
            : state.loadingConversationId,
      }));
    }
  },

  loadOlderMessages: async (conversationId) => {
    const cursor = get().nextCursorByConversation[conversationId];
    if (!cursor || get().loadingOlderConversationId === conversationId) {
      return;
    }

    set({ loadingOlderConversationId: conversationId, olderMessagesError: null });

    try {
      const params = new URLSearchParams({ cursor });
      const response = await apiFetch(
        `/api/conversations/${conversationId}/messages?${params.toString()}`,
      );
      const payload = await parseApiResponse<MessageListData>(response);

      if (!response.ok || payload.code !== API_SUCCESS_CODE || !payload.data) {
        throw new Error(readApiMessage(payload, "加载更早消息失败，请稍后重试。"));
      }

      const data = payload.data;
      const olderItems = data.items.map(toChatMessage);

      set((state) => {
        const current = state.messagesByConversation[conversationId] ?? [];
        const existingIds = new Set(current.map((message) => message.id));
        const uniqueOlderItems = olderItems.filter(
          (message) => !existingIds.has(message.id),
        );

        return {
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: [...uniqueOlderItems, ...current],
          },
          nextCursorByConversation: {
            ...state.nextCursorByConversation,
            [conversationId]: data.nextCursor,
          },
          loadingOlderConversationId: null,
          olderMessagesError: null,
          error: null,
        };
      });
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        set((state) => ({
          loadingOlderConversationId:
            state.loadingOlderConversationId === conversationId
              ? null
              : state.loadingOlderConversationId,
        }));
        return;
      }

      set((state) => ({
        olderMessagesError:
          error instanceof Error
            ? error.message
            : "加载更早消息失败，请稍后重试。",
        loadingOlderConversationId:
          state.loadingOlderConversationId === conversationId
            ? null
            : state.loadingOlderConversationId,
      }));
    }
  },

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

    /** 网络侧已收到的完整 assistant 文本（不受打字机延迟影响） */
    let networkAssistantText = "";

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
      const response = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, content: trimmed }),
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
            networkAssistantText += event.text;
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
        displayQueue.flushSync();
        clearStreamingIfMatch(set, conversationId);
        // 落库使用网络完整文本；UI 流式状态已在 flush 后结束
        await finalizeRound(
          set,
          conversationId,
          userMessage.id,
          assistantMessage.id,
          trimmed,
          networkAssistantText,
        );
      } else {
        displayQueue.flushSync();
        displayQueue.cancel();
        await finalizeRound(
          set,
          conversationId,
          userMessage.id,
          assistantMessage.id,
          trimmed,
          networkAssistantText,
        );
        clearStreamingIfMatch(set, conversationId);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        displayQueue.cancel();
        clearStreamingIfMatch(set, conversationId);
        return;
      }

      if (controller.signal.aborted) {
        displayQueue.flushSync();
        displayQueue.cancel();
        await finalizeRound(
          set,
          conversationId,
          userMessage.id,
          assistantMessage.id,
          trimmed,
          networkAssistantText,
        );
        clearStreamingIfMatch(set, conversationId);
        return;
      }

      displayQueue.cancel();
      const message =
        error instanceof Error ? error.message : "AI 回复失败，请稍后重试。";

      set((state) => {
        const messages = state.messagesByConversation[conversationId] ?? [];
        const withoutEmptyAssistant = messages.filter(
          (item) =>
            !(item.id === assistantMessage.id && item.content.length === 0),
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

    // 先冲刷展示队列，避免 abort 丢掉已收到但未上屏的 token（方案 B 需落库半截）
    activeDisplayQueue?.flushSync();
    activeDisplayQueue?.cancel();
    activeDisplayQueue = null;
    activeStreamConversationId = null;
    set({ streamingConversationId: null });
  },

  regenerateMessage: async (conversationId, assistantMessageId) => {
    get().abortStream();

    const messages = get().messagesByConversation[conversationId] ?? [];
    const assistantIndex = messages.findIndex(
      (message) => message.id === assistantMessageId,
    );

    if (assistantIndex < 0) {
      return;
    }

    const assistant = messages[assistantIndex];
    if (assistant.role !== "assistant" || !assistant.content.trim()) {
      return;
    }

    const userIndex = assistantIndex - 1;
    const userMessage = messages[userIndex];
    if (!userMessage || userMessage.role !== "user") {
      return;
    }

    const toRemove = messages.slice(assistantIndex);

    set({ error: null });

    try {
      await Promise.all(
        toRemove
          .filter((message) => isPersistedMessageId(message.id))
          .map((message) =>
            deletePersistedMessage(conversationId, message.id),
          ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "删除消息失败，请稍后重试。";
      set({ error: message });
      return;
    }

    const newAssistant: ChatMessage = {
      id: createMessageId("assistant"),
      role: "assistant",
      content: "",
      createdAt: new Date(),
    };

    set({
      messagesByConversation: {
        ...get().messagesByConversation,
        [conversationId]: [
          ...messages.slice(0, assistantIndex),
          newAssistant,
        ],
      },
      streamingConversationId: conversationId,
    });

    await runAssistantStream(set, {
      conversationId,
      assistantMessageId: newAssistant.id,
      onFinalize: (networkAssistantText) =>
        finalizeRegenerateRound(
          set,
          conversationId,
          newAssistant.id,
          networkAssistantText,
        ),
      onStreamError: (tempAssistantId) => {
        set((state) => {
          const current = state.messagesByConversation[conversationId] ?? [];
          return {
            messagesByConversation: {
              ...state.messagesByConversation,
              [conversationId]: current.filter(
                (message) =>
                  !(
                    message.id === tempAssistantId &&
                    message.content.length === 0
                  ),
              ),
            },
          };
        });
      },
    });
  },

  deleteMessage: async (conversationId, messageId) => {
    if (get().deletingMessageId) {
      return;
    }

    const previous = get().messagesByConversation[conversationId] ?? [];
    const targetIndex = previous.findIndex(
      (message) => message.id === messageId,
    );
    if (targetIndex < 0) {
      return;
    }

    const target = previous[targetIndex];

    // 乐观更新：先从 UI 移除，失败再回滚（减轻 Neon 远程延迟体感）
    set({
      deletingMessageId: messageId,
      error: null,
      messagesByConversation: {
        ...get().messagesByConversation,
        [conversationId]: previous.filter(
          (message) => message.id !== messageId,
        ),
      },
    });

    try {
      const response = await apiFetch(
        `/api/conversations/${conversationId}/messages/${messageId}`,
        { method: "DELETE" },
      );
      const payload = await parseApiResponse<null>(response);

      if (!response.ok || payload.code !== API_SUCCESS_CODE) {
        throw new Error(readApiMessage(payload, "删除消息失败，请稍后重试。"));
      }

      set({ deletingMessageId: null });
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        set({ deletingMessageId: null });
        return;
      }

      const message =
        error instanceof Error ? error.message : "删除消息失败，请稍后重试。";
      set((state) => {
        const current = state.messagesByConversation[conversationId] ?? [];
        const restored = [...current];
        restored.splice(Math.min(targetIndex, restored.length), 0, target);

        return {
          error: message,
          deletingMessageId: null,
          messagesByConversation: {
            ...state.messagesByConversation,
            [conversationId]: restored,
          },
        };
      });
    }
  },

  clearConversationMessages: (conversationId) => {
    set((state) => {
      const next = { ...state.messagesByConversation };
      delete next[conversationId];
      const nextCursors = { ...state.nextCursorByConversation };
      delete nextCursors[conversationId];

      return {
        messagesByConversation: next,
        nextCursorByConversation: nextCursors,
      };
    });
  },

  clearError: () => {
    set({ error: null, olderMessagesError: null });
  },

  seedEmptyConversation: (conversationId) => {
    set((state) => {
      if (Object.hasOwn(state.messagesByConversation, conversationId)) {
        return state;
      }

      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: [],
        },
        nextCursorByConversation: {
          ...state.nextCursorByConversation,
          [conversationId]: null,
        },
      };
    });
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
