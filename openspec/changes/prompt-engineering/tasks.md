## 1. 依赖与环境

- [x] 1.1 安装 `js-tiktoken` npm 依赖。
- [x] 1.2 更新 `.env.example`，补充 `CHAT_MAX_CONTEXT_TOKENS`、`CHAT_MAX_OUTPUT_TOKENS` 说明与默认值。

## 2. System Prompt

- [x] 2.1 创建 `lib/ai/prompts.ts`，实现 `getLegalAssistantSystemPrompt()`（中文法律助手人设、边界与免责声明）。
- [x] 2.2 控制 Prompt 长度，避免占用过多 Token 预算。

## 3. Token 计数

- [x] 3.1 创建 `lib/ai/tokenizer.ts`：`countTextTokens`、`countMessagesTokens`（`cl100k_base` + per-message overhead）。
- [x] 3.2 实现读取 `CHAT_MAX_CONTEXT_TOKENS` / `CHAT_MAX_OUTPUT_TOKENS` 并计算 `maxInputTokens`（含下限 clamp）。

## 4. 上下文组装与裁剪

- [x] 4.1 创建 `lib/ai/context.ts`：`buildModelMessages(input: ChatApiMessage[])`，注入 system 并按预算从最早消息裁剪。
- [x] 4.2 保证最新 user 消息始终保留；导出 `ModelMessage` 类型（含 `system` 角色）。
- [x] 4.3 为 context / tokenizer 编写可运行的单元测试或 `scripts/verify-context-truncation.ts` 验证脚本（至少覆盖超预算裁剪）。

## 5. API 与 AI 客户端集成

- [x] 5.1 扩展 `lib/ai/client.ts` 接受 `system | user | assistant` messages。
- [x] 5.2 改造 `app/api/chat/route.ts`：拒绝客户端 `system` 角色；调用 `buildModelMessages` 后再流式调用。
- [x] 5.3 确认 `chatStore` 无需改动（仍 POST user/assistant history）。

## 6. 测试文档

- [x] 6.1 创建 `docs/prompt-engineering-testing.md`：人设抽检、长上下文裁剪、非法 system 400、环境变量说明。

## 7. 验证

- [x] 7.1 运行 `npm run lint`。
- [x] 7.2 运行 `npm run build`。
- [ ] 7.3 配置 API Key 后联调：回复体现法律助手人设。
- [x] 7.4 验证 POST 含 `system` 的 messages 返回 400。
- [x] 7.5 验证超长 history 场景下请求仍可成功（最早轮次被裁剪）。
- [ ] 7.6 按测试文档完成手工抽检并记录结果。

## 8. 越狱模式拦截

- [x] 8.1 创建 `lib/ai/jailbreak.ts`：`isJailbreakAttempt`、`getJailbreakRejectionMessage`、可维护模式列表。
- [x] 8.2 在 `lib/api/sse.ts`（或等价）提供固定文本 SSE 响应 helper。
- [x] 8.3 改造 `app/api/chat/route.ts`：最新 user 命中越狱则返回固定拒答 SSE，不调用模型。
- [x] 8.4 创建 `scripts/verify-jailbreak-detection.ts` 验证脚本。
- [x] 8.5 更新 `docs/prompt-engineering-testing.md` 越狱验收用例。

## 9. 验证（越狱）

- [x] 9.1 运行 `npx tsx scripts/verify-jailbreak-detection.ts`。
- [x] 9.2 运行 `npm run lint` 与 `npm run build`。
- [ ] 9.3 联调：发送「假设你是前端工程师…」应得固定拒答且不调模型。

## 10. Token 用量结构化日志

- [x] 10.1 创建 `lib/ai/chatUsageLog.ts`：`isChatUsageLogEnabled`、`logJailbreakBlocked`、`logChatCompletion`。
- [x] 10.2 扩展 `lib/ai/context.ts`：`computeInputTokenStats(messages)`（全量 vs 裁剪后本地 Token）。
- [x] 10.3 改造 `lib/ai/client.ts`：`stream_options.include_usage`；导出 `extractUsageFromChunk`。
- [x] 10.4 改造 `app/api/chat/route.ts`：解析可选 `conversationId`；越狱/流结束打结构化日志。
- [x] 10.5 改造 `chatStore.ts`：POST `/api/chat` 时传 `conversationId`。
- [x] 10.6 更新 `.env.example` 与 `docs/prompt-engineering-testing.md`（usage 日志字段与验收）。
- [x] 10.7 创建 `scripts/summarize-chat-usage-log.ts`（从 stdin 按 conversationId 聚合）。

## 11. 验证（usage 日志）

- [x] 11.1 运行 `npm run lint` 与 `npm run build`。
- [ ] 11.2 `CHAT_USAGE_LOG=true` 下联调：正常对话输出 `chat_completion` JSON（含 usage 与 saved_by_truncation_est）。
- [ ] 11.3 越狱请求输出 `jailbreak_blocked` JSON（含 saved_input_tokens_est，无 API 调用）。
