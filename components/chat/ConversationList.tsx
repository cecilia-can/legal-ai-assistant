import type { Conversation } from "@/types/chat";
import { EmptyState } from "@/components/ui/EmptyState";

interface ConversationListProps {
  conversations: Conversation[];
  activeId?: string;
  onSelect?: (id: string) => void;
}

function formatTime(date: Date): string {
  return date.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <EmptyState
        title="暂无会话"
        description="点击上方按钮开始新的法律咨询对话。"
      />
    );
  }

  return (
    <ul className="flex flex-col gap-1 p-2" role="list">
      {conversations.map((conversation) => {
        const isActive = conversation.id === activeId;

        return (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => onSelect?.(conversation.id)}
              aria-current={isActive ? "true" : undefined}
              className={`w-full rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                isActive
                  ? "bg-primary/10 text-foreground"
                  : "text-foreground hover:bg-background"
              }`}
            >
              <p className="truncate text-sm font-medium">{conversation.title}</p>
              <p className="mt-1 text-xs text-muted">
                {formatTime(conversation.updatedAt)}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
