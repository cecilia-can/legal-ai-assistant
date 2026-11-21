import type { MessageRecord } from "@/lib/services/messageService";
import type { ConversationMemoryContent } from "./schema";

export function getConversationMemorySystemPrompt(): string {
  return `你负责维护法律咨询会话的内部记忆，不向用户输出内容。

仅提取消息中明确出现的信息，不推断、不补充、不生成法律结论。用户单方陈述必须标为 user_stated；仅在用户提供的文件或资料明确支持时标为 document_supported；无法确定时标为 uncertain。不要把助手的分析或建议写成事实。

输出必须是单个合法 JSON 对象，不要使用 Markdown 代码块。严格使用以下字段和类型，不要改名，也不要额外嵌套对象：
- summary: 字符串；topics、conclusions、openQuestions: 字符串数组。
- case 可省略；若提供，parties、timeline、facts、evidence、issues 五个字段都必须存在，可以是空数组。
- case.parties: {"role": "字符串", "name": "可选字符串"} 的数组。
- case.timeline: {"date": "可选字符串", "event": "字符串", "sourceMessageIds": ["消息ID"]} 的数组。
- case.facts: {"statement": "事实陈述字符串", "status": "user_stated", "sourceMessageIds": ["消息ID"]} 的数组；status 只能是 user_stated、document_supported、uncertain 三者之一。
- case.evidence: {"item": "证据字符串", "status": "mentioned", "sourceMessageIds": ["消息ID"]} 的数组；status 只能是 provided、mentioned、needed 三者之一。
- case.issues: 字符串数组，不能包含对象。
所有事实、时间线、证据必须附 sourceMessageIds，且只能引用提供的消息 ID。没有来源的内容不要写入。`;
}

export function buildConversationMemoryPrompt(input: {
  previous: ConversationMemoryContent | null;
  messages: MessageRecord[];
}): string {
  const previous = input.previous ? JSON.stringify(input.previous) : "无";
  const messages = input.messages
    .map((message) => `[${message.id}] ${message.role}: ${message.content}`)
    .join("\n\n");
  return `已有记忆：\n${previous}\n\n需要合并的连续原始消息：\n${messages}`;
}
