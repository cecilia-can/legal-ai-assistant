import type { ChatMessage } from "@/types/chat";

interface MessageBubbleProps {
  message: ChatMessage;
}

const roleLabels = {
  user: "用户",
  assistant: "助手",
  system: "系统",
} as const;

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <article
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
      aria-label={`${roleLabels[message.role]}消息`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed md:max-w-[70%] ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-surface text-foreground"
        }`}
      >
        <p className="mb-1 text-xs font-medium opacity-80">{roleLabels[message.role]}</p>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </article>
  );
}
