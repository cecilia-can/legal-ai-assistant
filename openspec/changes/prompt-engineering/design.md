## 背景

当前状态：

- `POST /api/chat` 校验客户端 `messages`（仅 `user` / `assistant`），直接传给 `createChatCompletionStream`（Change 1.4）。
- `ai-client` spec 明确要求「本阶段不注入法律 System Prompt」（留待 1.7）。
- `chatStore.sendMessage` 将内存中该会话全部历史 + 新 user 消息 POST 给 `/api/chat`；Change 1.5 持久化不影响 API 形状。
- DeepSeek（`deepseek-chat`）上下文窗口较大，但仍有上限；无 Token 计数时长对话存在失败或截断风险。

本 Change 在 **服务端 BFF** 统一完成 Prompt 注入与上下文裁剪，客户端无需感知 Token 逻辑。

## 目标 / 非目标

**目标：**

- 定义并注入法律助手 System Prompt（中文为主，明确能力边界与免责声明）。
- 使用 `js-tiktoken`（`cl100k_base` 编码）估算消息 Token 数；对 DeepSeek 为近似值，足够用于预算裁剪。
- 实现 `buildModelMessages(history)`：输出 `[system, ...trimmedHistory]`，保证最新 user 消息始终保留。
- 可配置输入 Token 预算（总上下文 − 预留输出 Token）。
- 历史超预算时从**最早**的 user/assistant 对开始丢弃，直至满足预算或仅剩最新 user。
- 更新 `ai-client` / `chat-api` 规格，与实现一致。
- 提供 Prompt 测试文档，覆盖人设、拒答边界、长上下文裁剪、越狱拦截。

**非目标：**

- 调用模型生成「对话摘要」替代被丢弃的历史（roadmap 可选项，本阶段用滑动窗口即可）。
- RAG / 知识库片段注入（Phase 2）。
- 前端展示「已省略 N 条历史」UI（Change 1.8 可接）。
- 按消息重要性重排序、Function Calling、多 System Prompt 切换。
- 数据库 Schema 变更或用户级 Prompt 定制。
- **非法律话题 LLM/小模型分类**（本阶段不做；越狱用规则，其余靠 System Prompt）。

## 设计决策

### 1. System Prompt 位置：仅服务端注入

**决策：** `lib/ai/prompts.ts` 导出 `getLegalAssistantSystemPrompt(): string`；**仅** `lib/ai/context.ts` / `/api/chat` 使用。客户端 POST body MUST NOT 包含 `role: "system"`。

**理由：** 防止 Prompt 注入与篡改；单一真相源；与 Change 1.9 鉴权前的 MVP 一致。

**备选（否决）：** 客户端附带 system — 不安全且难维护。

### 2. 上下文组装：`lib/ai/context.ts`

**决策：** 导出 `buildModelMessages(input: ChatApiMessage[]): ModelMessage[]`，其中 `ModelMessage.role` 为 `system | user | assistant`。

流程：

1. 取 `getLegalAssistantSystemPrompt()` 作为首条 system。
2. 过滤 input：仅保留合法 `user` / `assistant`，按原序。
3. 计算 `system + 全部 history` Token 数。
4. 若超过 `maxInputTokens`，从 index 0 起移除最早的 message，重复直到满足预算或只剩最后一条 user（必须保留）。
5. 若单条 user 消息仍超预算，仍发送（由模型/API 报错；本阶段不拆分 user 内容）。

**理由：** 保留最近上下文，符合 Chat 产品惯例；实现简单可测。

### 3. Token 计数：`js-tiktoken` + `cl100k_base`

**决策：**

- 依赖 `js-tiktoken`，封装 `countMessageTokens(messages)` 与 `countTextTokens(text)`。
- 使用 `cl100k_base`（GPT-4 / DeepSeek 常用近似）。
- 每条 message 计数：`tokens(role + content)` + 固定 per-message overhead（OpenAI chat 格式约 4 tokens，可在实现中常量化）。

**理由：** 比字符/4 准确；纯 JS、无 native 依赖；DeepSeek 无官方 JS tokenizer 时业界常用近似。

**备选（否决）：** 纯字符估算 — 误差大，长中文会话易误判。

### 4. Token 预算环境变量

**决策：**

| 变量 | 默认 | 含义 |
|------|------|------|
| `CHAT_MAX_CONTEXT_TOKENS` | `32000` | 模型上下文窗口上限（输入+输出） |
| `CHAT_MAX_OUTPUT_TOKENS` | `4096` | 为 assistant 生成预留的 Token |

`maxInputTokens = CHAT_MAX_CONTEXT_TOKENS - CHAT_MAX_OUTPUT_TOKENS`（下限 clamp，如至少 1024）。

**理由：** 与 OpenAI SDK `max_tokens` 概念对齐；部署时可按模型调整。

### 5. 法律助手 System Prompt 要点

**决策：** Prompt 须包含（正文中文）：

- 角色：专业、谨慎的中国法律 **信息辅助** AI（非执业律师）。
- 能力：解释法律概念、梳理思路、提示常见条款与风险点。
- 边界：不替代律师意见；不保证结论正确；复杂案件建议咨询执业律师。
- 风格：结构清晰、引用法条时说明「需以最新有效文本为准」。
- 安全：拒绝明显违法请求与非法律滥用。

具体文案存于 `prompts.ts`，本 spec 不锁定逐字稿，但 MUST 覆盖上述要点。

### 6. `/api/chat` 集成点

**决策：** Route Handler 在校验 `messages` 后：

```text
clientMessages
  → [最新 user 越狱检测] → 命中则固定拒答 SSE（不调模型）
  → buildModelMessages
  → createChatCompletionStream(modelMessages)
```

校验增强：若任一项 `role === "system"`，返回 400。

`lib/ai/client.ts` 的 `createChatCompletionStream` 参数类型扩展为接受 `system` 角色。

**理由：** 最小侵入；chatStore 无需改动。

### 7. 越狱模式拦截（规则 + 固定拒答）

**决策：**

- 新增 `lib/ai/jailbreak.ts`（或等价模块），导出 `isJailbreakAttempt(content)` 与 `getJailbreakRejectionMessage()`。
- **仅检测最新一条 user 消息**（当前轮输入），不扫描历史 assistant/user，避免误杀引用性表述。
- 规则为轻量正则/模式列表，覆盖常见角色扮演与指令覆盖，例如：
  - `假设你是…` / `你现在是…` / `扮演…`
  - `忽略以上规则` / `忽略前面指令` 等变体
- 命中时 **不调用** `createChatCompletionStream`；返回 HTTP 200 SSE，`token` 事件内容为 **固定拒答模板**（说明身份不可更改、邀请提出法律问题），随后 `done`。
- **不做**「是否法律话题」分类；非法律但非越狱的问题仍交给模型 + System Prompt。

**理由：** 性价比高、零额外 Token、行为可预期；补 System Prompt 在越狱场景下不稳定的问题。

**备选（否决）：**

- 后置检测 + 重试 — 成本高，本阶段不做。
- 扫描全部 history — 误杀高（讨论「假设你是乙方」等法律语境）。

### 8. 对话总结（roadmap 可选）

**决策：** 本阶段 **不** 调用 LLM 生成 summary。超预算仅丢弃最早消息。在 `docs/prompt-engineering-testing.md` 中记录「未来可在裁剪前对丢弃块做摘要」作为增强项。

**理由：** 控制 scope；滑动窗口已满足 MVP；总结需额外 API 调用与失败处理。

### 9. 测试与验收

**决策：** 新增 `docs/prompt-engineering-testing.md`：

- 人设与免责声明抽检用例
- 超长历史模拟（构造多轮 messages 或说明如何用 DevTools）
- Token 裁剪：确认最早轮次被丢弃、最新 user 仍在请求中
- 非法 system 角色 POST 返回 400
- **越狱拦截**：角色扮演类 user 返回固定拒答 SSE，且不消耗模型 Token

可选：轻量 `scripts/verify-context-truncation.ts`、`scripts/verify-jailbreak-detection.ts`。

## 风险 / 权衡

- **[风险] cl100k_base 与 DeepSeek 实际 Token 不一致** → 留 10–15% 预算余量；环境变量可调小 `CHAT_MAX_CONTEXT_TOKENS`。
- **[风险] 裁剪丢早期关键事实** → 文档说明限制；Phase 2 RAG / 总结可缓解。
- **[风险] System Prompt 过长占预算** → 控制 Prompt 长度（建议 < 800 tokens）；计数含 system。
- **[风险] 单条超长 user 仍超限** → 本阶段接受 API 错误；不在 1.7 做 user 内容拆分。

## 迁移计划

1. 安装 `js-tiktoken`，新增 env 变量说明。
2. 实现 prompts / tokenizer / context 模块。
3. 更新 `/api/chat` 与 `client.ts` 类型。
4. lint / build / 手工 Prompt 验收。
5. 无 DB migration；部署时可选调整 env。

## 已确认问题

- 裁剪策略：丢弃最早消息（滑动窗口）✓
- 总结功能：本阶段不做 ✓
- Token 库：`js-tiktoken` ✓
- System Prompt：仅服务端 ✓
- 越狱拦截：仅最新 user + 规则 + 固定拒答 SSE ✓

### 10. Token 用量结构化日志

**决策：**

- 新增 `lib/ai/chatUsageLog.ts`（或等价）：统一输出 **单行 JSON** 结构化日志。
- 环境变量 `CHAT_USAGE_LOG`（默认 `false`）：为 `true` / `1` 时在服务端 `console.info` 打印；不向浏览器 SSE 透传。
- `POST /api/chat` body 增加 **可选** `conversationId: string`，由 `chatStore` 传入，便于按会话聚合。
- AI 客户端流式请求设置 `stream_options: { include_usage: true }`；Route Handler 在流结束时读取 DeepSeek 官方 `usage`（最后一个含 usage 的 chunk）。
- 每次请求记录两类事件之一：
  - `jailbreak_blocked`：未调 API；记录 `saved_input_tokens_est`（本地 `buildModelMessages` 估算本会发送的 input）。
  - `chat_completion`：已调 API；记录 `usage.prompt_tokens` / `completion_tokens`（官方）+ 本地 `local_full_input` / `local_trimmed_input` / `saved_by_truncation_est`。
- 本阶段 **不** 做前端展示、不写 DB、不接 Datadog；可选 `scripts/summarize-chat-usage-log.ts` 从 stdin 聚合演示。

**理由：** 量化裁剪与越狱的成本节省，便于内测/面试/校准 js-tiktoken；scope 控制在观测层。

**备选（否决）：** SSE 增加 `meta` 事件给前端 — 需改 chatStore，本阶段不做。
