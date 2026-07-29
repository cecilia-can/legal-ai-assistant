/**
 * 验证上下文裁剪逻辑（Change 1.7）。
 *
 * Usage:
 *   npx tsx scripts/verify-context-truncation.ts
 */
import { buildModelMessagesWithBudget } from "../lib/ai/context";
import { countMessagesTokens } from "../lib/ai/tokenizer";
import type { ChatApiMessage } from "../types/chat";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function makeHistory(rounds: number): ChatApiMessage[] {
  const messages: ChatApiMessage[] = [];
  for (let index = 0; index < rounds; index += 1) {
    messages.push({
      role: "user",
      content: `用户问题 ${index + 1}：` + "法".repeat(200),
    });
    messages.push({
      role: "assistant",
      content: `助手回答 ${index + 1}：` + "答".repeat(200),
    });
  }
  messages.push({
    role: "user",
    content: "最新问题：劳动合同试用期最长多久？",
  });
  return messages;
}

function run(): void {
  const history = makeHistory(20);
  const tightBudget = 800;

  const modelMessages = buildModelMessagesWithBudget(history, tightBudget);
  const tokenCount = countMessagesTokens(modelMessages);

  assert(modelMessages[0]?.role === "system", "首条应为 system");
  assert(
    modelMessages.some(
      (message) =>
        message.role === "user" &&
        message.content.includes("最新问题：劳动合同试用期最长多久？"),
    ),
    "必须保留最新 user 消息",
  );
  assert(tokenCount <= tightBudget, `Token 数 ${tokenCount} 应 ≤ 预算 ${tightBudget}`);
  assert(modelMessages.length < history.length + 1, "应裁剪部分最早历史");

  const firstUser = history[0];
  if (firstUser) {
    assert(
      !modelMessages.some(
        (message) => message.role === "user" && message.content === firstUser.content,
      ),
      "最早 user 消息应被裁剪",
    );
  }

  console.log("verify-context-truncation: OK");
  console.log(`  原始轮次: ${history.length} 条`);
  console.log(`  裁剪后: ${modelMessages.length} 条 (含 system)`);
  console.log(`  Token: ${tokenCount} / ${tightBudget}`);
}

run();
