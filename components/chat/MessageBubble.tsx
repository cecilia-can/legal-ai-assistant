"use client";

import { memo } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import type { ChatMessage } from "@/types/chat";
import { MessageContent } from "@/components/chat/MessageContent";
import { MessageCopyButton } from "@/components/chat/MessageCopyButton";
import { IconButton } from "@/components/ui/IconButton";

interface MessageBubbleProps {
  message: ChatMessage;
  /** assistant 消息：false 时流式阶段用纯文本，完成后为 true 走 Markdown */
  useMarkdown?: boolean;
  onDelete?: (messageId: string) => void;
  deleteDisabled?: boolean;
  isDeleting?: boolean;
  onRegenerate?: (messageId: string) => void;
  regenerateDisabled?: boolean;
}

const roleLabels = {
  user: "用户",
  assistant: "助手",
  system: "系统",
} as const;

const externalActionButtonClassName =
  "border-border bg-surface text-muted shadow-sm opacity-70 transition-opacity hover:bg-background hover:opacity-100 focus-visible:opacity-100";

function messageBubblePropsAreEqual(
  prev: MessageBubbleProps,
  next: MessageBubbleProps,
): boolean {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.role === next.message.role &&
    prev.useMarkdown === next.useMarkdown &&
    prev.deleteDisabled === next.deleteDisabled &&
    prev.isDeleting === next.isDeleting &&
    prev.regenerateDisabled === next.regenerateDisabled
  );
}

function MessageBubbleComponent({
  message,
  useMarkdown = true,
  onDelete,
  deleteDisabled = false,
  isDeleting = false,
  onRegenerate,
  regenerateDisabled = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const canDelete = Boolean(onDelete) && message.role !== "system";
  const showCopyButton = isUser || isAssistant;
  const showRegenerate =
    isAssistant &&
    Boolean(onRegenerate) &&
    message.content.trim().length > 0;
  const showAssistantMarkdown = isAssistant && useMarkdown;
  const showExternalActions = showCopyButton || showRegenerate;

  return (
    <article
      className={`group flex w-full ${isUser ? "justify-end" : "justify-start"}`}
      aria-label={`${roleLabels[message.role]}消息`}
    >
      <div
        className={`flex max-w-[85%] flex-col gap-1 md:max-w-[70%] ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        <div
          className={`min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-surface text-foreground"
          }`}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-medium opacity-80">
              {roleLabels[message.role]}
            </p>
            {canDelete ? (
              <IconButton
                icon={Trash2}
                label={isDeleting ? "正在删除消息" : "删除消息"}
                iconSize={14}
                inset={4}
                disabled={deleteDisabled || isDeleting}
                className={`opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 ${
                  isUser
                    ? "border-transparent bg-transparent text-primary-foreground hover:bg-primary-foreground/15"
                    : ""
                }`}
                onClick={() => onDelete?.(message.id)}
              />
            ) : null}
          </div>
          {showAssistantMarkdown ? (
            <MessageContent content={message.content} />
          ) : (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          )}
        </div>
        {showExternalActions ? (
          <div
            className={`flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${
              isUser ? "justify-end" : "justify-start"
            }`}
          >
            {showRegenerate ? (
              <IconButton
                icon={RefreshCw}
                label="重新生成"
                iconSize={14}
                inset={4}
                disabled={regenerateDisabled}
                className={externalActionButtonClassName}
                onClick={() => onRegenerate?.(message.id)}
              />
            ) : null}
            {showCopyButton ? (
              <MessageCopyButton
                content={message.content}
                className={externalActionButtonClassName}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export const MessageBubble = memo(MessageBubbleComponent, messageBubblePropsAreEqual);
