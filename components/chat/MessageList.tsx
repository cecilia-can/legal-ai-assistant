"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/types/chat";
import { ArrowDown } from "lucide-react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { InlineError } from "@/components/ui/InlineError";

/** 距底部多少 px 内视为「在底部附近」，与 ChatGPT 类似 */
const NEAR_BOTTOM_THRESHOLD_PX = 80;

interface MessageListProps {
  messages: ChatMessage[];
  /** 流式生成中：在底部附近时用 instant 滚动跟随 token */
  isStreaming?: boolean;
  /** 用户发送消息后递增，强制滚到底部并恢复 stick-to-bottom */
  scrollToBottomNonce?: number;
  isLoading?: boolean;
  loadingError?: string | null;
  onRetryLoad?: () => void;
  retryingLoad?: boolean;
  onDeleteMessage?: (messageId: string) => void;
  deletingMessageId?: string | null;
  onRegenerateMessage?: (messageId: string) => void;
  regenerateDisabled?: boolean;
}

function isNearBottom(element: HTMLElement): boolean {
  const distance =
    element.scrollHeight - element.scrollTop - element.clientHeight;
  return distance <= NEAR_BOTTOM_THRESHOLD_PX;
}

export function MessageList({
  messages,
  isStreaming = false,
  scrollToBottomNonce = 0,
  isLoading = false,
  loadingError = null,
  onRetryLoad,
  retryingLoad = false,
  onDeleteMessage,
  deletingMessageId = null,
  onRegenerateMessage,
  regenerateDisabled = false,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const scrollRafRef = useRef<number | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const lastMessage = messages[messages.length - 1];
  const streamingMessageId =
    isStreaming && lastMessage?.role === "assistant" ? lastMessage.id : null;
  const contentScrollTrigger = `${messages.length}:${lastMessage?.content.length ?? 0}`;

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    element.scrollTo({
      top: element.scrollHeight,
      behavior,
    });
  }, []);

  /** 流式期间每帧最多滚一次，避免每个 token 都触发布局重算 */
  const scrollToBottomOnFrame = useCallback(
    (behavior: ScrollBehavior) => {
      if (scrollRafRef.current !== null) {
        return;
      }

      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        scrollToBottom(behavior);
      });
    },
    [scrollToBottom],
  );

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const near = isNearBottom(element);
    isNearBottomRef.current = near;
    setShowScrollToBottom(!near && messages.length > 0);
  }, [messages.length]);

  const handleScrollToBottomClick = useCallback(() => {
    isNearBottomRef.current = true;
    setShowScrollToBottom(false);
    scrollToBottom("smooth");
  }, [scrollToBottom]);

  useEffect(() => {
    scrollToBottom("auto");
  }, [scrollToBottom]);

  useEffect(() => {
    if (scrollToBottomNonce <= 0) {
      return;
    }

    isNearBottomRef.current = true;
    scrollToBottom(isStreaming ? "auto" : "smooth");
  }, [scrollToBottomNonce, isStreaming, scrollToBottom]);

  useEffect(() => {
    if (messages.length === 0 || !isNearBottomRef.current) {
      return;
    }

    if (isStreaming) {
      scrollToBottomOnFrame("auto");
      return;
    }

    scrollToBottom("smooth");
  }, [
    contentScrollTrigger,
    isStreaming,
    messages.length,
    scrollToBottom,
    scrollToBottomOnFrame,
  ]);

  if (isLoading && messages.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center px-4 py-12 text-sm text-muted md:px-6"
        aria-busy="true"
        aria-label="正在加载消息"
      >
        正在加载…
      </div>
    );
  }

  if (loadingError && messages.length === 0) {
    return (
      <div className="px-4 py-6 md:px-6">
        <InlineError
          message={loadingError}
          onRetry={onRetryLoad}
          retrying={retryingLoad}
        />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <EmptyState
        title="开始对话"
        description="在下方输入您的法律问题，助手将为您提供参考性解答。"
      />
    );
  }

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-4 md:px-6"
      >
        <div className="flex flex-col gap-4">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              useMarkdown={
                message.role !== "assistant" ||
                message.id !== streamingMessageId
              }
              onDelete={onDeleteMessage}
              deleteDisabled={Boolean(deletingMessageId) || isStreaming}
              isDeleting={deletingMessageId === message.id}
              onRegenerate={onRegenerateMessage}
              regenerateDisabled={regenerateDisabled || isStreaming}
            />
          ))}
        </div>
      </div>
      {showScrollToBottom ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <IconButton
            icon={ArrowDown}
            label="回到底部"
            buttonSize={44}
            className="pointer-events-auto rounded-full shadow-md"
            onClick={handleScrollToBottomClick}
          />
        </div>
      ) : null}
    </div>
  );
}
