"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainPanel } from "@/components/layout/MainPanel";
import { ConversationList } from "@/components/chat/ConversationList";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatErrorBoundary } from "@/components/ChatErrorBoundary";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InlineError } from "@/components/ui/InlineError";
import {
  isDefaultConversationTitle,
  titleFromFirstMessage,
} from "@/lib/conversation-defaults";
import { useChatKeyboardShortcuts } from "@/lib/hooks/useChatKeyboardShortcuts";
import {
  getActiveConversation,
  useConversationStore,
} from "@/lib/stores/conversationStore";
import {
  getConversationMessages,
  useChatStore,
} from "@/lib/stores/chatStore";

const CHAT_INPUT_ID = "chat-input-textarea";

export default function HomePage() {
  const conversations = useConversationStore((state) => state.conversations);
  const activeId = useConversationStore((state) => state.activeId);
  const isLoading = useConversationStore((state) => state.isLoading);
  const deletingId = useConversationStore((state) => state.deletingId);
  const conversationError = useConversationStore((state) => state.error);

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

  const messagesByConversation = useChatStore(
    (state) => state.messagesByConversation,
  );
  const streamingConversationId = useChatStore(
    (state) => state.streamingConversationId,
  );
  const loadingConversationId = useChatStore(
    (state) => state.loadingConversationId,
  );
  const deletingMessageId = useChatStore((state) => state.deletingMessageId);
  const chatError = useChatStore((state) => state.error);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const abortStream = useChatStore((state) => state.abortStream);
  const deleteMessage = useChatStore((state) => state.deleteMessage);
  const regenerateMessage = useChatStore((state) => state.regenerateMessage);
  const clearConversationMessages = useChatStore(
    (state) => state.clearConversationMessages,
  );
  const clearChatError = useChatStore((state) => state.clearError);

  const [pendingDeleteConversation, setPendingDeleteConversation] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState<{
    id: string;
    preview: string;
  } | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const [scrollToBottomNonce, setScrollToBottomNonce] = useState(0);

  const activeConversation = getActiveConversation(conversations, activeId);
  const activeMessages = getConversationMessages(
    messagesByConversation,
    activeId,
  );
  const isStreaming = streamingConversationId === activeId;
  const isMessagesLoading = loadingConversationId === activeId;

  const handleFocusInput = useCallback(() => {
    document.getElementById(CHAT_INPUT_ID)?.focus();
  }, []);

  const handleRetryConversations = useCallback(() => {
    void fetchConversations();
  }, [fetchConversations]);

  const handleRetryMessages = useCallback(() => {
    if (!activeId) {
      return;
    }

    clearChatError();
    void loadMessages(activeId);
  }, [activeId, clearChatError, loadMessages]);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!activeId) {
      return;
    }

    void loadMessages(activeId);
  }, [activeId, loadMessages]);

  async function handleNewChat() {
    abortStream();
    clearChatError();
    await createConversation();
    setMobileSidebarOpen(false);
  }

  function handleSelectConversation(id: string) {
    abortStream();
    clearChatError();
    selectConversation(id);
    setMobileSidebarOpen(false);
  }

  function handleDeleteRequest(id: string) {
    if (pendingDeleteConversation || pendingDeleteMessage || deletingId) {
      return;
    }

    const conversation = conversations.find((item) => item.id === id);
    if (!conversation) {
      return;
    }

    setPendingDeleteConversation({ id, title: conversation.title });
  }

  function handleCancelDeleteConversation() {
    if (deletingId) {
      return;
    }

    setPendingDeleteConversation(null);
  }

  async function handleConfirmDeleteConversation() {
    if (!pendingDeleteConversation || deletingId) {
      return;
    }

    const { id } = pendingDeleteConversation;

    if (activeId === id) {
      abortStream();
    }

    await deleteConversation(id);
    clearConversationMessages(id);
    setPendingDeleteConversation(null);
  }

  function handleDeleteMessageRequest(messageId: string) {
    if (
      !activeId ||
      pendingDeleteConversation ||
      pendingDeleteMessage ||
      deletingMessageId ||
      isStreaming
    ) {
      return;
    }

    const message = activeMessages.find((item) => item.id === messageId);
    if (!message) {
      return;
    }

    const preview =
      message.content.trim().slice(0, 40) +
      (message.content.trim().length > 40 ? "…" : "");

    setPendingDeleteMessage({ id: messageId, preview });
  }

  function handleCancelDeleteMessage() {
    if (deletingMessageId) {
      return;
    }

    setPendingDeleteMessage(null);
  }

  async function handleConfirmDeleteMessage() {
    if (!activeId || !pendingDeleteMessage || deletingMessageId) {
      return;
    }

    const { id } = pendingDeleteMessage;
    setPendingDeleteMessage(null);
    await deleteMessage(activeId, id);
  }

  function handleStopStream() {
    abortStream();
  }

  useChatKeyboardShortcuts({
    onNewChat: () => void handleNewChat(),
    onFocusInput: handleFocusInput,
    onCloseDrawer: () => setMobileSidebarOpen(false),
    onStopStream: handleStopStream,
    isDrawerOpen: mobileSidebarOpen,
    isStreaming,
  });

  function handleRegenerateMessage(messageId: string) {
    if (!activeId || isStreaming || deletingMessageId) {
      return;
    }

    clearChatError();
    setScrollToBottomNonce((n) => n + 1);
    void regenerateMessage(activeId, messageId);
  }

  function handleSubmitMessage(content: string) {
    if (!activeId) {
      return;
    }

    const existingMessages = messagesByConversation[activeId] ?? [];
    const isFirstMessage = existingMessages.length === 0;

    clearChatError();
    setScrollToBottomNonce((n) => n + 1);
    void sendMessage(activeId, content);

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
        {conversationError ? (
          <div className="border-b border-border px-4 py-3">
            <InlineError
              message={conversationError}
              onRetry={handleRetryConversations}
              retrying={isLoading}
            />
          </div>
        ) : null}
        {isLoading && conversations.length === 0 && !conversationError ? (
          <p
            className="px-4 py-6 text-sm text-muted"
            aria-busy="true"
            aria-label="正在加载会话列表"
          >
            正在加载…
          </p>
        ) : (
          <ConversationList
            conversations={conversations}
            activeId={activeId ?? undefined}
            onSelect={handleSelectConversation}
            onDelete={handleDeleteRequest}
            deleteDisabled={
              pendingDeleteConversation !== null ||
              pendingDeleteMessage !== null
            }
            deletingId={deletingId}
          />
        )}
      </Sidebar>
    );
  }

  const messageLoadError =
    isMessagesLoading || activeMessages.length > 0 ? null : chatError;

  return (
    <>
      <ConfirmDialog
        open={pendingDeleteConversation !== null}
        title="删除会话？"
        description={
          pendingDeleteConversation
            ? `「${pendingDeleteConversation.title}」将被永久删除，此操作无法撤销。`
            : ""
        }
        confirmLabel="确定删除"
        cancelLabel="取消"
        isConfirming={
          pendingDeleteConversation !== null &&
          deletingId === pendingDeleteConversation.id
        }
        onConfirm={() => void handleConfirmDeleteConversation()}
        onCancel={handleCancelDeleteConversation}
      />
      <ConfirmDialog
        open={pendingDeleteMessage !== null}
        title="删除消息？"
        description={
          pendingDeleteMessage
            ? `将永久删除该消息${
                pendingDeleteMessage.preview
                  ? `：「${pendingDeleteMessage.preview}」`
                  : ""
              }，此操作无法撤销。`
            : ""
        }
        confirmLabel="确定删除"
        cancelLabel="取消"
        isConfirming={
          pendingDeleteMessage !== null &&
          deletingMessageId === pendingDeleteMessage.id
        }
        onConfirm={() => void handleConfirmDeleteMessage()}
        onCancel={handleCancelDeleteMessage}
      />
      <AppShell
        mobileSidebarOpen={mobileSidebarOpen}
        onMobileSidebarClose={() => setMobileSidebarOpen(false)}
        desktopSidebarCollapsed={desktopSidebarCollapsed}
        onDesktopSidebarCollapse={() => setDesktopSidebarCollapsed(true)}
        renderSidebar={renderSidebar}
        main={
          <ChatErrorBoundary>
            <MainPanel
              title={activeConversation?.title ?? "法律 AI 助手"}
              isStreaming={isStreaming}
              subtitle={
                activeId
                  ? isStreaming
                    ? "AI 正在回复… 可停止或输入新问题"
                    : "输入法律问题，AI 将流式回复；历史消息已持久化"
                  : "创建或选择一个会话开始对话"
              }
              messages={
                <div className="flex h-full min-h-0 flex-col">
                  {chatError && activeMessages.length > 0 ? (
                    <div className="shrink-0 border-b border-border px-4 py-3 md:px-6">
                      <InlineError
                        message={chatError}
                        onDismiss={clearChatError}
                        onRetry={handleRetryMessages}
                        retrying={isMessagesLoading}
                      />
                    </div>
                  ) : null}
                  <div className="min-h-0 flex-1">
                    <MessageList
                      key={activeId ?? "none"}
                      messages={activeMessages}
                      isStreaming={isStreaming}
                      scrollToBottomNonce={scrollToBottomNonce}
                      isLoading={isMessagesLoading}
                      loadingError={messageLoadError}
                      onRetryLoad={activeId ? handleRetryMessages : undefined}
                      retryingLoad={isMessagesLoading}
                      onDeleteMessage={
                        activeId ? handleDeleteMessageRequest : undefined
                      }
                      deletingMessageId={deletingMessageId}
                      onRegenerateMessage={
                        activeId ? handleRegenerateMessage : undefined
                      }
                      regenerateDisabled={
                        Boolean(deletingMessageId) ||
                        pendingDeleteConversation !== null ||
                        pendingDeleteMessage !== null
                      }
                    />
                  </div>
                </div>
              }
              input={
                <ChatInput
                  inputId={CHAT_INPUT_ID}
                  onSubmit={handleSubmitMessage}
                  disabled={!activeId || isLoading}
                  isStreaming={isStreaming}
                  onStop={handleStopStream}
                />
              }
              onOpenSidebar={() => setMobileSidebarOpen(true)}
              desktopSidebarCollapsed={desktopSidebarCollapsed}
              onExpandDesktopSidebar={() => setDesktopSidebarCollapsed(false)}
            />
          </ChatErrorBoundary>
        }
      />
    </>
  );
}
