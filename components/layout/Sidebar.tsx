import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

interface SidebarProps {
  children: ReactNode;
  onNewChat?: () => void;
  onClose?: () => void;
  onCollapse?: () => void;
}

export function Sidebar({ children, onNewChat, onClose, onCollapse }: SidebarProps) {
  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-foreground">法律 AI 助手</p>
            <p className="mt-1 text-xs text-muted">Legal AI Assistant</p>
          </div>
          {onClose ? (
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 px-3 py-2"
              onClick={onClose}
              aria-label="关闭会话列表"
            >
              关闭
            </Button>
          ) : onCollapse ? (
            <Button
              type="button"
              variant="secondary"
              className="hidden shrink-0 px-3 py-2 md:inline-flex"
              onClick={onCollapse}
              aria-label="收起侧栏"
            >
              收起
            </Button>
          ) : null}
        </div>
        <div className="mt-4">
          <Button
            type="button"
            variant="primary"
            className="w-full"
            onClick={onNewChat}
            aria-label="新建聊天"
          >
            + 新建聊天
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
