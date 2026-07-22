import type { Conversation } from "@/types/chat";

import { EmptyState } from "@/components/ui/EmptyState";

interface ConversationListProps {
  conversations: Conversation[];
  activeId?: string;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  deleteDisabled?: boolean;
  deletingId?: string | null;
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
  onDelete,
  deleteDisabled = false,
  deletingId = null,
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
            <div
              className={`flex items-stretch gap-1 rounded-lg transition-colors ${
                isActive ? "bg-primary/10" : "hover:bg-background"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect?.(conversation.id)}
                aria-current={isActive ? "true" : undefined}
                className={`min-w-0 flex-1 rounded-lg px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  isActive ? "text-foreground" : "text-foreground"
                }`}
              >
                <p className="truncate text-sm font-medium">{conversation.title}</p>
                <p className="mt-1 text-xs text-muted">
                  {formatTime(conversation.updatedAt)}
                </p>
              </button>
              {onDelete ? (
                <button
                  type="button"
                  disabled={
                    deleteDisabled || deletingId === conversation.id
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(conversation.id);
                  }}
                  aria-label={`删除会话：${conversation.title}`}
                  className="shrink-0 rounded-lg px-3 py-3 text-xs text-muted transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  删除
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
