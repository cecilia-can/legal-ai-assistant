export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
}

/**
 * 消息区内部使用的可扩展时间线项。
 * 目前页面只传入 message；Agent 接入后可直接传入其余类型，无需重写列表容器。
 */
export type ChatTimelineItem =
  | {
      type: "message";
      id: string;
      message: ChatMessage;
    }
  | {
      type: "tool-call";
      id: string;
      toolName: string;
      summary: string;
      status: "pending" | "running" | "completed" | "failed";
    }
  | {
      type: "tool-result";
      id: string;
      toolName: string;
      summary: string;
      content: string;
      status: "completed" | "failed";
    }
  | {
      type: "execution-status";
      id: string;
      label: string;
      detail?: string;
      status: "pending" | "running" | "completed" | "failed";
    };

/** GET/POST /api/conversations/[id]/messages 的 JSON 消息形状 */
export type MessageJson = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: string;
};

export type MessageListData = {
  items: MessageJson[];
  nextCursor: string | null;
};

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Messages sent to POST /api/chat (no id / createdAt). */
export type ChatApiMessage = {
  role: "user" | "assistant";
  content: string;
};

/** POST /api/chat request body. */
export type ChatApiRequestBody = {
  messages: ChatApiMessage[];
  conversationId?: string;
};

/** Messages sent to the AI provider (includes system). */
export type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatStreamTokenEvent = {
  type: "token";
  text: string;
};

export type ChatStreamDoneEvent = {
  type: "done";
};

export type ChatStreamErrorEvent = {
  type: "error";
  message: string;
};

export type ChatStreamEvent =
  | ChatStreamTokenEvent
  | ChatStreamDoneEvent
  | ChatStreamErrorEvent;

export function isChatStreamEvent(value: unknown): value is ChatStreamEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.type === "token") {
    return typeof record.text === "string";
  }

  if (record.type === "done") {
    return true;
  }

  if (record.type === "error") {
    return typeof record.message === "string";
  }

  return false;
}
