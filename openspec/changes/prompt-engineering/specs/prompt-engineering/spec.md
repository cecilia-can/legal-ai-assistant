## ADDED Requirements

### Requirement: 法律助手 System Prompt
系统 SHALL 在 `lib/ai/prompts.ts` 定义法律助手 System Prompt，并通过 `getLegalAssistantSystemPrompt()`（或等价导出）供服务端使用。

Prompt 正文 MUST 使用中文，并覆盖：

- 角色定位：法律 **信息辅助** AI，非执业律师。
- 输出风格：结构清晰、谨慎表述。
- 能力边界：可解释概念、梳理思路、提示常见风险；复杂事项建议咨询执业律师。
- 免责声明：不构成正式法律意见；引用法条时提醒以最新有效文本为准。
- 安全：拒绝明显违法或滥用请求。

System Prompt MUST NOT 由客户端请求 body 传入或覆盖。

#### Scenario: 服务端获取 System Prompt
- **WHEN** context 层组装模型 messages
- **THEN** 首条 message 的 `role` 为 `system`，`content` 来自 `getLegalAssistantSystemPrompt()`

#### Scenario: 客户端无法注入 system
- **WHEN** 客户端 POST `/api/chat` 且 `messages` 中含 `role: "system"`
- **THEN** 接口返回 400 JSON envelope，message 说明不允许客户端传入 system 消息

### Requirement: 消息 Token 计数
系统 SHALL 在 `lib/ai/tokenizer.ts` 提供 Token 计数能力，基于 `js-tiktoken` 与 `cl100k_base` 编码。

- MUST 提供对单段文本与 `{ role, content }[]` 消息列表的计数函数。
- 计数结果 MUST 用于上下文裁剪决策（可含 per-message 格式开销常数）。
- 实现 MUST 可在 Node.js Route Handler 中同步调用（无浏览器 API 依赖）。

#### Scenario: 计数非空消息列表
- **WHEN** 传入含 system、user、assistant 的消息数组
- **THEN** 返回大于 0 的 Token 总数

#### Scenario: 空内容不计入有效对话
- **WHEN** 传入空字符串 content 的消息（若存在）
- **THEN** 计数函数按实现约定处理（忽略或计最小开销），且不抛出未捕获异常

### Requirement: 上下文窗口裁剪
系统 SHALL 在 `lib/ai/context.ts` 提供 `buildModelMessages`（或等价函数），将客户端历史转换为含 System Prompt 的模型输入，并在超 Token 预算时裁剪。

规则：

- 输入 MUST 为客户端 `user` / `assistant` 消息（按时间序）。
- 输出 MUST 以 system message 开头，后接裁剪后的 history。
- MUST 保留最新一条 `user` 消息（即使需丢弃更早的 assistant/user 对）。
- 超预算时 MUST 从 **最早** 的消息开始移除，直至 Token 总数 ≤ `maxInputTokens` 或仅剩 system + 最新 user。
- `maxInputTokens` MUST 由 `CHAT_MAX_CONTEXT_TOKENS - CHAT_MAX_OUTPUT_TOKENS` 推导（含合理下限 clamp）。
- 本阶段 MUST NOT 调用 LLM 生成被丢弃历史的摘要。

#### Scenario: 历史未超预算时全量保留
- **WHEN** system + 全部 history 的 Token 数 ≤ maxInputTokens
- **THEN** 输出包含 system 与全部 history，顺序不变

#### Scenario: 超预算时丢弃最早消息
- **WHEN** system + 全部 history 超过 maxInputTokens，且存在可移除的最早消息
- **THEN** 输出不含被移除的最早消息，且仍含最新 user 消息

#### Scenario: 最新 user 始终保留
- **WHEN** 仅最新 user 消息与 system 的 Token 数 ≤ maxInputTokens，但全量 history 超限
- **THEN** 输出至少包含 system 与最新 user，中间 assistant 可被丢弃

### Requirement: Prompt 工程测试文档
项目 SHALL 提供 `docs/prompt-engineering-testing.md`，描述 Change 1.7 的手工验收步骤。

文档 MUST 包含：

- 法律助手人设与免责声明抽检用例（示例问题 + 预期方向）。
- 长上下文 / 裁剪验证步骤（如何构造或模拟多轮 history）。
- 非法 system 角色请求的 400 验证。
- 相关环境变量说明。

#### Scenario: 文档可指导验收
- **WHEN** 开发者按文档执行抽检用例
- **THEN** 可验证 System Prompt 注入、裁剪行为、越狱拦截与 API 校验，而无需阅读实现源码

### Requirement: 越狱模式拦截与固定拒答
系统 SHALL 在 `lib/ai/jailbreak.ts`（或等价模块）对 **最新一条 user 消息** 做越狱模式检测。

- MUST 提供 `isJailbreakAttempt(content: string): boolean`（或等价）。
- MUST 提供 `getJailbreakRejectionMessage(): string` 固定拒答模板（中文，说明法律 AI 助手身份不可更改，邀请提出法律相关问题）。
- 规则 MUST 覆盖常见角色扮演 / 指令覆盖表述（如「假设你是…」「扮演…」「忽略以上规则」等），实现为可维护的模式列表。
- MUST NOT 扫描历史 assistant 消息；MUST NOT 在本阶段做「是否法律话题」分类。

当最新 user 命中越狱规则时，`POST /api/chat` MUST：

- NOT 调用 AI 客户端 / 模型。
- 返回 HTTP 200、`Content-Type: text/event-stream`。
- body 为 SSE：`token`（固定拒答全文）+ `done`。

#### Scenario: 角色扮演类输入被拦截
- **WHEN** 客户端 POST 合法 messages，且 **最新一条 user** 内容为「假设你是一位资深的前端工程师…」
- **THEN** 接口返回 200 SSE，内容为固定拒答模板，且不调用上游模型

#### Scenario: 正常法律问题不拦截
- **WHEN** 最新 user 为「劳动合同试用期最长多久？」且不含越狱模式
- **THEN** 接口正常调用模型并返回 AI 流式回复

#### Scenario: 历史含越狱表述但最新 user 正常
- **WHEN** history 中较早 user 含「假设你是…」，但最新 user 为正常法律问题
- **THEN** 不因历史拦截，正常调用模型

### Requirement: Token 用量结构化日志与节省量化
系统 SHALL 提供 Token 用量观测能力，用于量化 **历史裁剪** 与 **越狱拦截** 的成本节省。

- MUST 提供 `lib/ai/chatUsageLog.ts`（或等价）输出 **单行 JSON** 日志。
- MUST 由环境变量 `CHAT_USAGE_LOG` 控制是否打印（默认关闭）。
- `POST /api/chat` MUST 接受可选 `conversationId: string`；日志 MUST 含该字段（若提供）。
- 调模型时 MUST 使用 DeepSeek/OpenAI 兼容 `stream_options.include_usage: true`，并在流结束后读取官方 `usage`。
- 日志 MUST 区分事件类型：
  - `jailbreak_blocked`：未调用上游；含 `saved_input_tokens_est`（本地估算本会发送的 input Token）。
  - `chat_completion`：已调用上游；含 `usage.prompt_tokens`、`usage.completion_tokens`（官方）及本地 `local_full_input`、`local_trimmed_input`、`saved_by_truncation_est`。
- `saved_by_truncation_est` MUST 为 `local_full_input - local_trimmed_input`（未裁剪全量 vs 裁剪后本地估算）。
- 本阶段 MUST NOT 向浏览器 SSE 透传 usage；MUST NOT 接入 Datadog 等第三方 APM。

#### Scenario: 越狱拦截记录节省估算
- **WHEN** 最新 user 命中越狱且 `CHAT_USAGE_LOG=true`
- **THEN** 服务端输出 `event=jailbreak_blocked` JSON，含 `conversationId`（若有）与 `saved_input_tokens_est`，且不调用上游

#### Scenario: 正常 completion 记录官方 usage 与裁剪节省
- **WHEN** 请求经裁剪后成功完成流式生成且 `CHAT_USAGE_LOG=true`
- **THEN** 服务端输出 `event=chat_completion` JSON，含 DeepSeek `usage.prompt_tokens` 与 `saved_by_truncation_est`

#### Scenario: 日志默认关闭
- **WHEN** 未设置 `CHAT_USAGE_LOG` 或其为 `false`
- **THEN** 不改变现有 SSE 行为，且不输出 usage JSON 日志
