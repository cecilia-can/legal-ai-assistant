import type { ChatApiMessage } from "@/types/chat";

/** 常见越狱 / 角色扮演 / 指令覆盖模式（仅用于最新 user 消息）。 */
const JAILBREAK_PATTERNS: RegExp[] = [
  /假设你(是|为|作为)/,
  /你现在是(一位|一名|一个)?/,
  /请你?扮演/,
  /扮演(一位|一名|一个)?/,
  /忽略(以上|前面|之前|上述|先前)?(的)?(规则|指令|提示|设定|限制)/,
  /无视(以上|前面|之前|上述|先前)?(的)?(规则|指令|提示|设定|限制)/,
  /忘记(你|之前)?(的)?(角色|身份|指令|设定|规则)/,
  /切换(到|为)(新的)?(角色|身份|人设)/,
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|rules?|prompts?)/i,
  /you\s+are\s+now\s+/i,
  /act\s+as\s+(a|an)\s+/i,
];

const JAILBREAK_REJECTION_MESSAGE =
  "我是法律 AI 助手，身份与职责由系统固定，无法按您的要求切换为其他角色或领域专家。" +
  "请提出与中国法律相关的咨询问题；若需其他领域帮助，请使用相应的专业工具或服务。";

export function getJailbreakRejectionMessage(): string {
  return JAILBREAK_REJECTION_MESSAGE;
}

export function isJailbreakAttempt(content: string): boolean {
  const normalized = content.trim();
  if (!normalized) {
    return false;
  }

  return JAILBREAK_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function getLatestUserContent(messages: ChatApiMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return message.content;
    }
  }
  return null;
}

export function isLatestUserJailbreak(messages: ChatApiMessage[]): boolean {
  const latestUser = getLatestUserContent(messages);
  if (!latestUser) {
    return false;
  }
  return isJailbreakAttempt(latestUser);
}
