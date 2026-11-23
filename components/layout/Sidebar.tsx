import type { ReactNode } from "react";
import Link from "next/link";
import { PanelLeftClose, X } from "lucide-react";
import { UserMenu } from "@/components/auth/UserMenu";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";

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
            <IconButton
              icon={X}
              label="关闭会话列表"
              onClick={onClose}
            />
          ) : onCollapse ? (
            <IconButton
              icon={PanelLeftClose}
              label="收起侧栏"
              className="hidden md:inline-flex"
              onClick={onCollapse}
            />
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
      <Link href="/knowledge-bases" className="mx-4 mb-3 rounded-lg border border-border px-3 py-2 text-center text-sm text-muted hover:border-primary/40 hover:text-primary">知识库管理</Link>
      <UserMenu />
    </aside>
  );
}
