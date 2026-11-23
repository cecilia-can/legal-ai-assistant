import type { MessageRecord } from "@/lib/services/messageService";
import type { MessageJson } from "@/types/chat";
import { parseChatSources } from "@/lib/rag/sources";

export type { MessageJson };

export function serializeMessage(message: MessageRecord): MessageJson {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    sources: parseChatSources(message.sources),
    createdAt: message.createdAt.toISOString(),
  };
}

export function parseMessageJson(raw: MessageJson) {
  return {
    id: raw.id,
    conversationId: raw.conversationId,
    role: raw.role,
    content: raw.content,
    sources: parseChatSources(raw.sources),
    createdAt: new Date(raw.createdAt),
  };
}
