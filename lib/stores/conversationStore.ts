import { create } from "zustand";
import type { ConversationJson } from "@/lib/api/conversation-response";
import { parseConversationJson } from "@/lib/api/conversation-response";
import type { Conversation } from "@/types/chat";

interface ConversationState {
  conversations: Conversation[];
  activeId: string | null;
  isLoading: boolean;
  deletingId: string | null;
  error: string | null;
  fetchConversations: () => Promise<void>;
  createConversation: () => Promise<void>;
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

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
  } catch {
    // ignore JSON parse errors
  }

  return fallback;
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
      const response = await fetch("/api/conversations");
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "无法加载会话列表，请稍后重试。"),
        );
      }

      const data = (await response.json()) as ConversationJson[];
      const conversations = data.map(parseConversationJson);

      set((state) => ({
        conversations,
        isLoading: false,
        error: null,
        activeId: resolveActiveId(conversations, state.activeId),
      }));
    } catch (error) {
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
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "无法创建会话，请稍后重试。"),
        );
      }

      const conversation = parseConversationJson(
        (await response.json()) as ConversationJson,
      );

      set((state) => ({
        conversations: [conversation, ...state.conversations],
        activeId: conversation.id,
        error: null,
      }));
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "无法创建会话，请稍后重试。",
      });
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
      const response = await fetch(`/api/conversations/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        if (response.status === 404) {
          set((state) => removeConversationFromState(state.conversations, id, state.activeId));
          return;
        }

        throw new Error(
          await readErrorMessage(response, "无法删除会话，请稍后重试。"),
        );
      }

      set((state) => removeConversationFromState(state.conversations, id, state.activeId));
    } catch (error) {
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
      const response = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle }),
      });

      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "无法更新会话标题，请稍后重试。"),
        );
      }

      const updated = parseConversationJson(
        (await response.json()) as ConversationJson,
      );

      set((state) => ({
        conversations: state.conversations.map((conversation) =>
          conversation.id === id ? updated : conversation,
        ),
        error: null,
      }));
    } catch (error) {
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
