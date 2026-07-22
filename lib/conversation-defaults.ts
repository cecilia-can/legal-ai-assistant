export const DEFAULT_CONVERSATION_TITLE = "新对话";

export const LEGACY_DEFAULT_TITLES = ["新对话", "New Chat"] as const;

export function isDefaultConversationTitle(title: string): boolean {
  return (LEGACY_DEFAULT_TITLES as readonly string[]).includes(title);
}

export function titleFromFirstMessage(content: string, maxLength = 20): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return DEFAULT_CONVERSATION_TITLE;
  }
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}
