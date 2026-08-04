import {
  API_SUCCESS_CODE,
  parseApiResponse,
  readApiMessage,
} from "@/lib/api/api-response";
import { apiFetch } from "@/lib/api/client-fetch";
import type { ConversationJson } from "@/lib/api/conversation-response";
import { parseConversationJson } from "@/lib/api/conversation-response";
import type { Conversation } from "@/types/chat";
import { create } from "zustand";
import { useChatStore } from "@/lib/stores/chatStore";

interface ConversationState {
  conversations: Conversation[];
  activeId: string | null;
  isLoading: boolean;
  deletingId: string | null;
  error: string | null;
  fetchConversations: () => Promise<void>;
  createConversation: () => Promise<string | null>;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
}

function resolveActiveId(
  conversations: Conversation[],
  currentActiveId: string | null,
): string | null {
  if (
    currentActiveId &&
    conversations.some((conversation) => conversation.id === currentActiveId)
  ) {
    return currentActiveId;
  }

  return conversations[0]?.id ?? null;
}

function assertSuccessConversationJson(
  data: ConversationJson | null,
  fallback: string,
): ConversationJson {
  if (!data || typeof data !== "object") {
    throw new Error(fallback);
  }

  return data;
}

function assertSuccessConversationList(
  data: ConversationJson[] | null,
  fallback: string,
): ConversationJson[] {
  if (!Array.isArray(data)) {
    throw new Error(fallback);
  }

  return data;
}

function removeConversationFromState(
  conversations: Conversation[],
  id: string,
  activeId: string | null,
) {
  const nextConversations = conversations.filter(
    (conversation) => conversation.id !== id,
  );

  return {
    conversations: nextConversations,
    activeId:
      activeId === id
        ? resolveActiveId(nextConversations, null)
        : activeId,
    error: null,
  };
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  activeId: null,
  isLoading: false,
  deletingId: null,
  error: null,

  fetchConversations: async () => {
    set({ isLoading: true, error: null });

    try {
      const response = await apiFetch("/api/conversations");
      const payload = await parseApiResponse<ConversationJson[]>(response);

      if (!response.ok || payload.code !== API_SUCCESS_CODE) {
        throw new Error(
          readApiMessage(payload, "无法加载会话列表，请稍后重试。"),
        );
      }

      const conversations = assertSuccessConversationList(
        payload.data,
        "无法加载会话列表，请稍后重试。",
      ).map(parseConversationJson);

      set((state) => ({
        conversations,
        isLoading: false,
        error: null,
        activeId: resolveActiveId(conversations, state.activeId),
      }));
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        set({ isLoading: false });
        return;
      }

      set({
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "无法加载会话列表，请稍后重试。",
      });
    }
  },

  createConversation: async () => {
    set({ error: null });

    try {
      const response = await apiFetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await parseApiResponse<ConversationJson>(response);

      if (!response.ok || payload.code !== API_SUCCESS_CODE) {
        throw new Error(
          readApiMessage(payload, "无法创建会话，请稍后重试。"),
        );
      }

      const conversation = parseConversationJson(
        assertSuccessConversationJson(
          payload.data,
          "无法创建会话，请稍后重试。",
        ),
      );

      useChatStore.getState().seedEmptyConversation(conversation.id);

      set((state) => ({
        conversations: [conversation, ...state.conversations],
        activeId: conversation.id,
        error: null,
      }));

      return conversation.id;
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        return null;
      }

      set({
        error:
          error instanceof Error
            ? error.message
            : "无法创建会话，请稍后重试。",
      });
      return null;
    }
  },

  selectConversation: (id) => {
    set({ activeId: id });
  },

  deleteConversation: async (id) => {
    const { deletingId, conversations } = get();

    if (deletingId === id) {
      return;
    }

    if (!conversations.some((conversation) => conversation.id === id)) {
      return;
    }

    set({ deletingId: id, error: null });

    try {
      const response = await apiFetch(`/api/conversations/${id}`, {
        method: "DELETE",
      });
      const payload = await parseApiResponse<null>(response);

      if (!response.ok || payload.code !== API_SUCCESS_CODE) {
        if (response.status === 404) {
          set((state) =>
            removeConversationFromState(state.conversations, id, state.activeId),
          );
          return;
        }

        throw new Error(
          readApiMessage(payload, "无法删除会话，请稍后重试。"),
        );
      }

      set((state) =>
        removeConversationFromState(state.conversations, id, state.activeId),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        set({ deletingId: null });
        return;
      }

      set({
        error:
          error instanceof Error
            ? error.message
            : "无法删除会话，请稍后重试。",
      });
    } finally {
      set({ deletingId: null });
    }
  },

  updateConversationTitle: async (id, title) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return;
    }

    set({ error: null });

    try {
      const response = await apiFetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle }),
      });
      const payload = await parseApiResponse<ConversationJson>(response);

      if (!response.ok || payload.code !== API_SUCCESS_CODE) {
        throw new Error(
          readApiMessage(payload, "无法更新会话标题，请稍后重试。"),
        );
      }

      const updated = parseConversationJson(
        assertSuccessConversationJson(
          payload.data,
          "无法更新会话标题，请稍后重试。",
        ),
      );

      set((state) => ({
        conversations: state.conversations.map((conversation) =>
          conversation.id === id ? updated : conversation,
        ),
        error: null,
      }));
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        return;
      }

      set({
        error:
          error instanceof Error
            ? error.message
            : "无法更新会话标题，请稍后重试。",
      });
    }
  },
}));

export function getActiveConversation(
  conversations: Conversation[],
  activeId: string | null,
): Conversation | undefined {
  if (!activeId) {
    return undefined;
  }

  return conversations.find((conversation) => conversation.id === activeId);
}
