"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/types/chat";
import { ArrowDown } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { LegacyMessageBubble } from "@/app/dev/markdown-bench/LegacyMessageBubble";

const NEAR_BOTTOM_THRESHOLD_PX = 80;

interface LegacyMessageListProps {
  messages: ChatMessage[];
  isStreaming?: boolean;
  scrollToBottomNonce?: number;
  isLoading?: boolean;
  loadingError?: string | null;
  onDeleteMessage?: (messageId: string) => void;
  deletingMessageId?: string | null;
}

function isNearBottom(element: HTMLElement): boolean {
  const distance =
    element.scrollHeight - element.scrollTop - element.clientHeight;
  return distance <= NEAR_BOTTOM_THRESHOLD_PX;
}

/** 优化前 MessageList：无 useMarkdown / 流式纯文本分支 */
export function LegacyMessageList({
  messages,
  isStreaming = false,
  scrollToBottomNonce = 0,
  isLoading = false,
  loadingError = null,
  onDeleteMessage,
  deletingMessageId = null,
}: LegacyMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const scrollRafRef = useRef<number | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const lastMessage = messages[messages.length - 1];
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
      <p className="px-4 py-6 text-sm text-muted md:px-6">正在加载消息…</p>
    );
  }

  if (loadingError && messages.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-destructive md:px-6">{loadingError}</p>
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
            <LegacyMessageBubble
              key={message.id}
              message={message}
              onDelete={onDeleteMessage}
              deleteDisabled={Boolean(deletingMessageId) || isStreaming}
              isDeleting={deletingMessageId === message.id}
            />
          ))}
        </div>
      </div>
      {showScrollToBottom ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <IconButton
            icon={ArrowDown}
            label="回到底部"
            className="pointer-events-auto rounded-full shadow-md"
            onClick={handleScrollToBottomClick}
          />
        </div>
      ) : null}
    </div>
  );
}
