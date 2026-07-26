import type { ReactNode } from "react";
import { PanelLeft } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
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
            <IconButton
              icon={PanelLeft}
              label="打开会话列表"
              className="md:hidden"
              onClick={onOpenSidebar}
            />
          ) : null}
          {desktopSidebarCollapsed && onExpandDesktopSidebar ? (
            <IconButton
              icon={PanelLeft}
              label="展开侧栏"
              className="hidden md:inline-flex"
              onClick={onExpandDesktopSidebar}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
            {subtitle ? (
              <p className="mt-1 truncate text-xs text-muted">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">{messages}</div>
      <footer className="border-t border-border bg-surface px-4 py-4 md:px-6">
        {input}
      </footer>
    </section>
  );
}
