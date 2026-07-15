import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

interface MainPanelProps {
  title: string;
  subtitle?: string;
  messages: ReactNode;
  input: ReactNode;
  onOpenSidebar?: () => void;
  desktopSidebarCollapsed?: boolean;
  onExpandDesktopSidebar?: () => void;
}

export function MainPanel({
  title,
  subtitle,
  messages,
  input,
  onOpenSidebar,
  desktopSidebarCollapsed = false,
  onExpandDesktopSidebar,
}: MainPanelProps) {
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <header className="border-b border-border bg-surface px-4 py-4 md:px-6">
        <div className="flex items-start gap-3">
          {onOpenSidebar ? (
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 md:hidden"
              onClick={onOpenSidebar}
              aria-label="打开会话列表"
            >
              会话
            </Button>
          ) : null}
          {desktopSidebarCollapsed && onExpandDesktopSidebar ? (
            <Button
              type="button"
              variant="secondary"
              className="hidden shrink-0 md:inline-flex"
              onClick={onExpandDesktopSidebar}
              aria-label="展开侧栏"
            >
              侧栏
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
            {subtitle ? (
              <p className="mt-1 truncate text-xs text-muted">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">{messages}</div>
      <footer className="border-t border-border bg-surface px-4 py-4 md:px-6">
        {input}
      </footer>
    </section>
  );
}
