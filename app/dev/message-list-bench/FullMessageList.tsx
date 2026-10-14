"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";

import { MessageBubble } from "@/components/chat/MessageBubble";
import { IconButton } from "@/components/ui/IconButton";
import type { ChatMessage } from "@/types/chat";

const NEAR_BOTTOM_THRESHOLD_PX = 80;

type FullMessageListProps = {
  messages: ChatMessage[];
};

function isNearBottom(element: HTMLElement): boolean {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    NEAR_BOTTOM_THRESHOLD_PX
  );
}

/**
 * 仅用于开发基准页的全量渲染对照组。
 * 它沿用当前 MessageBubble、样式和回到底部交互，只移除虚拟窗口化。
 */
export function FullMessageList({ messages }: FullMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    element.scrollTo({ top: element.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    scrollToBottom("auto");
  }, [scrollToBottom]);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    setShowScrollToBottom(!isNearBottom(element) && messages.length > 0);
  }, [messages.length]);

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-4 md:px-6"
      >
        <div className="flex flex-col">
          {messages.map((message) => (
            <div key={message.id} className="pb-4">
              <MessageBubble message={message} />
            </div>
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
            onClick={() => scrollToBottom("smooth")}
          />
        </div>
      ) : null}
    </div>
  );
}
