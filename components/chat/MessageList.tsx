"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ChatMessage, ChatTimelineItem } from "@/types/chat";
import { ArrowDown } from "lucide-react";
import { TimelineItem } from "@/components/chat/TimelineItem";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { InlineError } from "@/components/ui/InlineError";

const NEAR_BOTTOM_THRESHOLD_PX = 80;
const NEAR_TOP_THRESHOLD_PX = 80;
const MESSAGE_OVERSCAN = 4;
const ESTIMATED_MESSAGE_HEIGHT_PX = 128;
const ENABLE_SCROLL_DIAGNOSTICS =
  process.env.NODE_ENV !== "production" &&
  typeof performance !== "undefined" &&
  typeof performance.mark === "function" &&
  typeof performance.measure === "function";

interface MessageListProps {
  messages: ChatMessage[];
  /** Agent 接入后可传入混合时间线项；未传时由 messages 生成。 */
  timelineItems?: ChatTimelineItem[];
  isStreaming?: boolean;
  scrollToBottomNonce?: number;
  isLoading?: boolean;
  loadingError?: string | null;
  onRetryLoad?: () => void;
  retryingLoad?: boolean;
  hasOlderMessages?: boolean;
  isLoadingOlder?: boolean;
  olderLoadError?: string | null;
  onLoadOlder?: () => void;
  onRetryOlder?: () => void;
  retryingOlder?: boolean;
  onDeleteMessage?: (messageId: string) => void;
  deletingMessageId?: string | null;
  onRegenerateMessage?: (messageId: string) => void;
  regenerateDisabled?: boolean;
}

export function MessageList({
  messages,
  timelineItems: suppliedTimelineItems,
  isStreaming = false,
  scrollToBottomNonce = 0,
  isLoading = false,
  loadingError = null,
  onRetryLoad,
  retryingLoad = false,
  hasOlderMessages = false,
  isLoadingOlder = false,
  olderLoadError = null,
  onLoadOlder,
  onRetryOlder,
  retryingOlder = false,
  onDeleteMessage,
  deletingMessageId = null,
  onRegenerateMessage,
  regenerateDisabled = false,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const loadOlderRequestedRef = useRef(false);
  const showScrollToBottomRef = useRef(false);
  const onDeleteMessageRef = useRef(onDeleteMessage);
  const onRegenerateMessageRef = useRef(onRegenerateMessage);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // 让时间线项的动作回调在父组件重渲染时保持稳定；ref 始终指向最新实现。
  onDeleteMessageRef.current = onDeleteMessage;
  onRegenerateMessageRef.current = onRegenerateMessage;

  const timelineItems = useMemo<ChatTimelineItem[]>(
    () =>
      suppliedTimelineItems ??
      messages.map((message) => ({
        type: "message" as const,
        id: message.id,
        message,
      })),
    [messages, suppliedTimelineItems],
  );
  const lastTimelineItem = timelineItems[timelineItems.length - 1];
  const streamingMessageId =
    isStreaming && lastTimelineItem?.type === "message" && lastTimelineItem.message.role === "assistant"
      ? lastTimelineItem.message.id
      : null;
  const contentScrollTrigger = `${timelineItems.length}:${streamingMessageId ?? ""}:${messages[messages.length - 1]?.content.length ?? 0}`;

  // TanStack Virtual 通过可变函数驱动滚动与测量；React Compiler 会跳过该 hook 的自动 memo。
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: timelineItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_MESSAGE_HEIGHT_PX,
    getItemKey: (index) => timelineItems[index]?.id ?? index,
    overscan: MESSAGE_OVERSCAN,
    anchorTo: "end",
    scrollEndThreshold: NEAR_BOTTOM_THRESHOLD_PX,
    useFlushSync: false,
    // 将同一批 ResizeObserver 高度通知合并至下一动画帧，避免测量回调中频繁更新范围。
    useAnimationFrameWithResizeObserver: true,
  });

  const handleDeleteMessage = useCallback((messageId: string) => {
    onDeleteMessageRef.current?.(messageId);
  }, []);

  const handleRegenerateMessage = useCallback((messageId: string) => {
    onRegenerateMessageRef.current?.(messageId);
  }, []);

  const scrollToBottom = useCallback(
    (behavior: "auto" | "smooth" | "instant") => {
      virtualizer.scrollToEnd({ behavior });
    },
    [virtualizer],
  );

  const scrollToBottomOnFrame = useCallback(
    (behavior: "auto" | "smooth" | "instant") => {
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

  useEffect(() => {
    if (!isLoadingOlder) {
      loadOlderRequestedRef.current = false;
    }
  }, [isLoadingOlder]);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const scrollStartMark = "message-list:scroll-handler:start";
    if (ENABLE_SCROLL_DIAGNOSTICS) {
      performance.mark(scrollStartMark);
    }

    const nextShowScrollToBottom =
      !virtualizer.isAtEnd(NEAR_BOTTOM_THRESHOLD_PX) &&
      timelineItems.length > 0;

    // React 对相同状态会跳过提交，但这里先跳过状态调度，减少高频 scroll 路径工作。
    if (nextShowScrollToBottom !== showScrollToBottomRef.current) {
      showScrollToBottomRef.current = nextShowScrollToBottom;
      setShowScrollToBottom(nextShowScrollToBottom);
    }

    if (
      element.scrollTop <= NEAR_TOP_THRESHOLD_PX &&
      hasOlderMessages &&
      !isLoadingOlder &&
      onLoadOlder &&
      !loadOlderRequestedRef.current
    ) {
      loadOlderRequestedRef.current = true;
      onLoadOlder();
    }

    if (ENABLE_SCROLL_DIAGNOSTICS) {
      const scrollEndMark = "message-list:scroll-handler:end";
      performance.mark(scrollEndMark);
      performance.measure("message-list:scroll-handler", scrollStartMark, scrollEndMark);
    }
  }, [
    hasOlderMessages,
    isLoadingOlder,
    onLoadOlder,
    timelineItems.length,
    virtualizer,
  ]);

  const handleScrollToBottomClick = useCallback(() => {
    showScrollToBottomRef.current = false;
    setShowScrollToBottom(false);
    scrollToBottom("smooth");
  }, [scrollToBottom]);

  useEffect(() => {
    scrollToBottom("instant");
  }, [scrollToBottom]);

  useEffect(() => {
    if (scrollToBottomNonce <= 0) {
      return;
    }

    scrollToBottom(isStreaming ? "instant" : "smooth");
  }, [isStreaming, scrollToBottom, scrollToBottomNonce]);

  useEffect(() => {
    if (
      timelineItems.length === 0 ||
      !virtualizer.isAtEnd(NEAR_BOTTOM_THRESHOLD_PX)
    ) {
      return;
    }

    if (isStreaming) {
      scrollToBottomOnFrame("instant");
      return;
    }

    scrollToBottom("smooth");
  }, [
    contentScrollTrigger,
    isStreaming,
    scrollToBottom,
    scrollToBottomOnFrame,
    timelineItems.length,
    virtualizer,
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

  if (timelineItems.length === 0) {
    return (
      <EmptyState
        title="开始对话"
        description="在下方输入您的法律问题，助手将为您提供参考性解答。"
      />
    );
  }

  return (
    <div className="relative h-full min-h-0">
      {isLoadingOlder ? (
        <div
          className="pointer-events-none absolute inset-x-4 top-2 z-10 flex justify-center md:inset-x-6"
          aria-busy="true"
          aria-label="正在加载更早消息"
        >
          <span className="rounded-full bg-surface/95 px-3 py-1 text-xs text-muted shadow-sm">
            正在加载更早消息…
          </span>
        </div>
      ) : olderLoadError ? (
        <div className="absolute inset-x-4 top-2 z-10 md:inset-x-6">
          <InlineError
            message={olderLoadError}
            onRetry={onRetryOlder}
            retrying={retryingOlder}
          />
        </div>
      ) : null}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-4 md:px-6"
      >
        <div
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = timelineItems[virtualItem.index];
            if (!item) {
              return null;
            }

            return (
              <div
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                className="absolute inset-x-0 pb-4"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <TimelineItem
                  item={item}
                  streamingMessageId={streamingMessageId}
                  onDeleteMessage={onDeleteMessage ? handleDeleteMessage : undefined}
                  deleteDisabled={Boolean(deletingMessageId) || isStreaming}
                  deletingMessageId={deletingMessageId}
                  onRegenerateMessage={
                    onRegenerateMessage ? handleRegenerateMessage : undefined
                  }
                  regenerateDisabled={regenerateDisabled || isStreaming}
                />
              </div>
            );
          })}
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
