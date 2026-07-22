"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainPanel } from "@/components/layout/MainPanel";
import { ConversationList } from "@/components/chat/ConversationList";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  isDefaultConversationTitle,
  titleFromFirstMessage,
} from "@/lib/conversation-defaults";
import {
  getActiveConversation,
  useConversationStore,
} from "@/lib/stores/conversationStore";
import type { ChatMessage } from "@/types/chat";

export default function HomePage() {
  const conversations = useConversationStore((state) => state.conversations);
  const activeId = useConversationStore((state) => state.activeId);
  const isLoading = useConversationStore((state) => state.isLoading);
  const deletingId = useConversationStore((state) => state.deletingId);
  const error = useConversationStore((state) => state.error);
  
  const fetchConversations = useConversationStore(
    (state) => state.fetchConversations,
  );
  const createConversation = useConversationStore(
    (state) => state.createConversation,
  );
  const selectConversation = useConversationStore(
    (state) => state.selectConversation,
  );
  const deleteConversation = useConversationStore(
    (state) => state.deleteConversation,
  );
  const updateConversationTitle = useConversationStore(
    (state) => state.updateConversationTitle,
  );

  const [messagesByConversation, setMessagesByConversation] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

  const activeConversation = getActiveConversation(conversations, activeId);
  const activeMessages = activeId ? (messagesByConversation[activeId] ?? []) : [];

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  async function handleNewChat() {
    await createConversation();
    setMobileSidebarOpen(false);
  }

  function handleSelectConversation(id: string) {
    selectConversation(id);
    setMobileSidebarOpen(false);
  }

  function handleDeleteRequest(id: string) {
    if (pendingDelete || deletingId) {
      return;
    }

    const conversation = conversations.find((item) => item.id === id);
    if (!conversation) {
      return;
    }

    setPendingDelete({ id, title: conversation.title });
  }

  function handleCancelDelete() {
    if (deletingId) {
      return;
    }

    setPendingDelete(null);
  }

  async function handleConfirmDelete() {
    if (!pendingDelete || deletingId) {
      return;
    }

    const { id } = pendingDelete;
    await deleteConversation(id);

    setMessagesByConversation((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setPendingDelete(null);
  }

  function handleSubmitMessage(content: string) {
    if (!activeId) {
      return;
    }

    const now = new Date();
    const userMessage: ChatMessage = {
      id: `msg-${now.getTime()}`,
      role: "user",
      content,
      createdAt: now,
    };

    const existingMessages = messagesByConversation[activeId] ?? [];
    const isFirstMessage = existingMessages.length === 0;

    setMessagesByConversation((current) => ({
      ...current,
      [activeId]: [...(current[activeId] ?? []), userMessage],
    }));

    if (
      isFirstMessage &&
      activeConversation &&
      isDefaultConversationTitle(activeConversation.title)
    ) {
      void updateConversationTitle(
        activeId,
        titleFromFirstMessage(content),
      );
    }
  }

  function renderSidebar({
    onClose,
    onCollapse,
  }: {
    onClose?: () => void;
    onCollapse?: () => void;
  }) {
    return (
      <Sidebar onNewChat={handleNewChat} onClose={onClose} onCollapse={onCollapse}>
        {error ? (
          <p className="border-b border-border px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {isLoading ? (
          <p className="px-4 py-6 text-sm text-muted">正在加载会话…</p>
        ) : (
          <ConversationList
            conversations={conversations}
            activeId={activeId ?? undefined}
            onSelect={handleSelectConversation}
            onDelete={handleDeleteRequest}
            deleteDisabled={pendingDelete !== null}
            deletingId={deletingId}
          />
        )}
      </Sidebar>
    );
  }

  return (
    <>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除会话？"
        description={
          pendingDelete
            ? `「${pendingDelete.title}」将被永久删除，此操作无法撤销。`
            : ""
        }
        confirmLabel="确定删除"
        cancelLabel="取消"
        isConfirming={
          pendingDelete !== null && deletingId === pendingDelete.id
        }
        onConfirm={() => void handleConfirmDelete()}
        onCancel={handleCancelDelete}
      />
      <AppShell
        mobileSidebarOpen={mobileSidebarOpen}
        onMobileSidebarClose={() => setMobileSidebarOpen(false)}
        desktopSidebarCollapsed={desktopSidebarCollapsed}
        onDesktopSidebarCollapse={() => setDesktopSidebarCollapsed(true)}
        renderSidebar={renderSidebar}
        main={
          <MainPanel
            title={activeConversation?.title ?? "法律 AI 助手"}
            subtitle={
              activeId
                ? "本界面为静态演示，尚未接入 AI 回复"
                : "创建或选择一个会话开始对话"
            }
            messages={<MessageList messages={activeMessages} />}
            input={
              <ChatInput
                onSubmit={handleSubmitMessage}
                disabled={!activeId || isLoading}
              />
            }
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            desktopSidebarCollapsed={desktopSidebarCollapsed}
            onExpandDesktopSidebar={() => setDesktopSidebarCollapsed(false)}
          />
        }
      />
    </>
  );
}
