import { useEffect } from "react";

interface UseChatKeyboardShortcutsOptions {
  onNewChat: () => void;
  onFocusInput: () => void;
  onCloseDrawer: () => void;
  onStopStream: () => void;
  isDrawerOpen: boolean;
  isStreaming: boolean;
  enabled?: boolean;
}

function isModKey(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

export function useChatKeyboardShortcuts({
  onNewChat,
  onFocusInput,
  onCloseDrawer,
  onStopStream,
  isDrawerOpen,
  isStreaming,
  enabled = true,
}: UseChatKeyboardShortcutsOptions) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        isModKey(event) &&
        event.shiftKey &&
        event.key.toLowerCase() === "o"
      ) {
        event.preventDefault();
        onNewChat();
        return;
      }

      if (event.key === "Escape" && event.shiftKey) {
        event.preventDefault();
        onFocusInput();
        return;
      }

      if (event.key === "Escape" && isDrawerOpen) {
        event.preventDefault();
        onCloseDrawer();
        return;
      }

      if (isModKey(event) && event.key === "." && isStreaming) {
        event.preventDefault();
        onStopStream();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    enabled,
    isDrawerOpen,
    isStreaming,
    onCloseDrawer,
    onFocusInput,
    onNewChat,
    onStopStream,
  ]);
}
