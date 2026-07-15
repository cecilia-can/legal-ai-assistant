import type { ReactNode } from "react";

interface AppShellProps {
  renderSidebar: (options: {
    onClose?: () => void;
    onCollapse?: () => void;
  }) => ReactNode;
  main: ReactNode;
  mobileSidebarOpen: boolean;
  onMobileSidebarClose: () => void;
  desktopSidebarCollapsed: boolean;
  onDesktopSidebarCollapse: () => void;
}

export function AppShell({
  renderSidebar,
  main,
  mobileSidebarOpen,
  onMobileSidebarClose,
  desktopSidebarCollapsed,
  onDesktopSidebarCollapse,
}: AppShellProps) {
  return (
    <div className="flex h-full min-h-screen w-full overflow-hidden bg-background md:flex-row">
      <div
        className={`hidden h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-out md:flex ${
          desktopSidebarCollapsed ? "md:w-0" : "md:w-80"
        }`}
      >
        {renderSidebar({ onCollapse: onDesktopSidebarCollapse })}
      </div>

      <button
        type="button"
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${
          mobileSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onMobileSidebarClose}
        aria-label="关闭会话列表"
        tabIndex={mobileSidebarOpen ? 0 : -1}
      />

      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(85vw,20rem)] transform transition-transform duration-300 ease-out md:hidden ${
          mobileSidebarOpen
            ? "translate-x-0"
            : "pointer-events-none -translate-x-full"
        }`}
        role="dialog"
        aria-modal={mobileSidebarOpen}
        aria-hidden={!mobileSidebarOpen}
      >
        {renderSidebar({ onClose: onMobileSidebarClose })}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{main}</div>
    </div>
  );
}
