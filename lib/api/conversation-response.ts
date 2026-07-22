// API与前端的数据格式转换
import type { Conversation } from "@/types/chat";

export type ConversationJson = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

// Pick<T, K> 是 TypeScript 的工具类型，从 Conversation 类型中挑选出指定的属性
// & 是交叉类型，表示"并且"
// 这里强制指定 createdAt 和 updatedAt 的类型必须是 Date
export function serializeConversation(
  conversation: Pick<Conversation, "id" | "title" | "createdAt" | "updatedAt"> & {
    createdAt: Date;
    updatedAt: Date;
  },
): ConversationJson {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

export function parseConversationJson(raw: ConversationJson): Conversation {
  return {
    id: raw.id,
    title: raw.title,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  };
}
