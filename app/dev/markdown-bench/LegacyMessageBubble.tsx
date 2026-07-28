import { Trash2 } from "lucide-react";
import type { ChatMessage } from "@/types/chat";
import { MessageCopyButton } from "@/components/chat/MessageCopyButton";
import { IconButton } from "@/components/ui/IconButton";
import { LegacyMessageContent } from "@/app/dev/markdown-bench/LegacyMessageContent";

interface LegacyMessageBubbleProps {
  message: ChatMessage;
  onDelete?: (messageId: string) => void;
  deleteDisabled?: boolean;
  isDeleting?: boolean;
}

const roleLabels = {
  user: "用户",
  assistant: "助手",
  system: "系统",
} as const;

const userCopyButtonClassName =
  "border-transparent bg-transparent text-primary-foreground opacity-70 transition-opacity hover:bg-primary-foreground/15 hover:opacity-100 focus-visible:opacity-100";

const assistantCopyButtonClassName =
  "text-muted opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100";

/** 优化前：无 memo；assistant 流式阶段也走 Markdown */
export function LegacyMessageBubble({
  message,
  onDelete,
  deleteDisabled = false,
  isDeleting = false,
}: LegacyMessageBubbleProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const canDelete = Boolean(onDelete) && message.role !== "system";
  const showCopyButton = isUser || isAssistant;

  return (
    <article
      className={`group flex w-full ${isUser ? "justify-end" : "justify-start"}`}
      aria-label={`${roleLabels[message.role]}消息`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed md:max-w-[70%] ${
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
        {isAssistant ? (
          <LegacyMessageContent content={message.content} />
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        )}
        {showCopyButton ? (
          <div className="mt-2 flex justify-end">
            <MessageCopyButton
              content={message.content}
              className={
                isUser ? userCopyButtonClassName : assistantCopyButtonClassName
              }
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}
