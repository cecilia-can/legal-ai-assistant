import { Trash2 } from "lucide-react";
import type { ChatMessage } from "@/types/chat";
import { IconButton } from "@/components/ui/IconButton";

interface MessageBubbleProps {
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

export function MessageBubble({
  message,
  onDelete,
  deleteDisabled = false,
  isDeleting = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const canDelete = Boolean(onDelete) && message.role !== "system";

  return (
    <article
      className={`group flex w-full ${isUser ? "justify-end" : "justify-start"}`}
      aria-label={`${roleLabels[message.role]}消息`}
    >
      <div
        className={`relative max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed md:max-w-[70%] ${
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
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </article>
  );
}
