## 为什么

Change 1.3 已完成会话 CRUD 与 Zustand 状态管理，但首页消息仍为本地静态演示，用户发送消息后没有 AI 回复。Change 1.4 需要接入 DeepSeek（OpenAI Compatible API），实现服务端 **SSE 流式转发**与前端打字机效果，为 Change 1.5 消息持久化、Change 4.x Agent 事件流与 Change 1.7 Prompt 工程提供对话链路基础。

## 变更内容

- 新增 AI 客户端封装（`lib/ai/client.ts`），基于 `openai` npm SDK 连接 DeepSeek。
- 新增流式聊天 API `POST /api/chat`，以 **SSE（`text/event-stream`）** 向浏览器推送结构化事件。
- 新增 SSE 编解码工具（`lib/api/sse.ts`），统一服务端写入与前端解析。
- 新增 `chatStore`（Zustand），管理各会话内存消息、流式状态、错误与请求取消；前端用 **fetch POST + SSE 解析**（不使用 `EventSource`）。
- 重构 `app/page.tsx`：发送消息触发 AI 流式回复；切换/新建会话时 abort 进行中的请求。
- 扩展 `.env.example`，补充 AI 相关环境变量。
- 对 429 / 5xx 实施最多 1 次重试（带简单退避）。

## 能力范围

### 新增能力

- `ai-client`: DeepSeek / OpenAI Compatible 客户端配置、流式调用与重试策略。
- `sse-protocol`: 定义 BFF → 浏览器的 SSE 事件格式与编解码。
- `chat-api`: 流式聊天 Route Handler 的请求校验、错误处理与 SSE 响应。
- `chat-state`: 基于 Zustand 的 `chatStore`，管理内存消息、SSE 消费与流式生命周期。

### 修改能力

- `chat-components`: 消息列表与输入区接入流式状态（生成中禁用输入、展示 assistant 占位/增量内容）。

## 影响范围

- 影响代码：`lib/ai/`、`lib/api/sse.ts`、`app/api/chat/`、`lib/stores/chatStore.ts`、`app/page.tsx`、`types/chat.ts`、`.env.example`。
- 影响体验：用户发送消息后可看到 AI 流式回复；刷新页面后消息仍会丢失（持久化留待 1.5）。
- 依赖影响：新增 npm 依赖 `openai`。
- 环境依赖：需要 `OPENAI_API_KEY`、可选 `OPENAI_BASE_URL`（DeepSeek）、`OPENAI_MODEL`。
- 系统影响：不修改 Prisma schema，不新增 migration；法律 System Prompt 精调留待 Change 1.7。
