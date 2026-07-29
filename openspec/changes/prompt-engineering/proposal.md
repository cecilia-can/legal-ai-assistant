## 为什么

Change 1.4–1.6 已打通流式对话、消息持久化与 Markdown 渲染，但 AI 仍无明确法律助手人设，且 `/api/chat` 将客户端传入的全部历史原样发给模型，长会话易超出上下文窗口或浪费 Token。Change 1.7 需要在服务端统一注入 System Prompt、计数 Token 并裁剪历史，提升回复质量与稳定性，为 Phase 2 RAG 预留 Prompt 扩展点。

## 变更内容

- 新增 `lib/ai/prompts.ts`：法律助手 System Prompt 模板与导出函数。
- 新增 `lib/ai/tokenizer.ts`：基于 `js-tiktoken` 的消息 Token 计数。
- 新增 `lib/ai/context.ts`：组装 `[system, ...history]`、按 Token 预算从最早消息起裁剪，并保留最新一轮 user 输入。
- 改造 `POST /api/chat`：在调用模型前经 context 层处理；**拒绝**客户端传入的 `system` 角色消息。
- 新增 **越狱模式拦截**：对最新一条 user 消息做规则检测；命中则返回固定拒答 SSE，**不调用模型**（不做非法律话题分类）。
- 新增 **Token 用量结构化日志**：引入 DeepSeek 流式 `usage`、可选 `conversationId`、量化裁剪/越狱节省（`CHAT_USAGE_LOG` 开关）。
- 扩展 `.env.example`：`CHAT_MAX_CONTEXT_TOKENS`、`CHAT_MAX_OUTPUT_TOKENS`（或等价命名）。
- 新增 Prompt 策略测试文档（手工验收清单 + 可选脚本入口）。
- 安装 npm 依赖 `js-tiktoken`。

## 能力范围

### 新增能力

- `prompt-engineering`：System Prompt、Token 计数、上下文窗口裁剪、越狱模式拦截、Token 用量结构化日志与节省量化。

### 修改能力

- `ai-client`：流式封装含 `system` 角色；开启 `stream_options.include_usage` 供 usage 日志读取。
- `chat-api`：`POST /api/chat` 在调模型前 MUST 经 context 层注入 system 并裁剪历史；客户端 body 仍仅允许 `user` / `assistant`。

## 影响范围

- 影响代码：`lib/ai/prompts.ts`、`lib/ai/tokenizer.ts`、`lib/ai/context.ts`、`lib/ai/chatUsageLog.ts`、`lib/ai/jailbreak.ts`、`app/api/chat/route.ts`、`lib/ai/client.ts`、`lib/stores/chatStore.ts`、`types/chat.ts`、`.env.example`。
- 影响体验：回复风格更贴近法律助手；超长会话自动丢弃最早轮次而非整请求失败。
- 依赖影响：新增 `js-tiktoken`。
- 环境依赖：可选 Token 预算环境变量；无 Prisma migration。
- 明确不做：LLM 对话总结（留作后续增强）、RAG 检索注入、前端 Token 展示 UI、用户认证、**非法律话题自动分类**、Datadog/第三方 APM 接入（本阶段仅服务端 JSON 日志）。
