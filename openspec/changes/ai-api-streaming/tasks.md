## 1. 依赖与环境

- [x] 1.1 安装 `openai` npm 依赖。
- [x] 1.2 更新 `.env.example`，补充 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` 说明。
- [x] 1.3 在 `types/chat.ts` 定义 `ChatStreamEvent`（`token` | `done` | `error`）。

## 2. SSE 协议层

- [x] 2.1 创建 `lib/api/sse.ts`：`encodeSseEvent`、`parseSseChunk`（或等价增量解析器）。
- [x] 2.2 实现跨 chunk 缓冲（remainder）与 UTF-8 `TextDecoder` stream 模式。
- [x] 2.3 忽略 SSE 注释行与空行；JSON 解析失败时安全降级。

## 3. AI 客户端

- [x] 3.1 创建 `lib/ai/client.ts`：读取环境变量、初始化 OpenAI 客户端（DeepSeek base URL）。
- [x] 3.2 实现流式 completion，从 SDK stream 提取 `delta.content`。
- [x] 3.3 实现 429 / 5xx 最多 1 次重试与固定退避。
- [x] 3.4 缺少 `OPENAI_API_KEY` 时抛出可读错误。

## 4. 流式 Chat API（SSE）

- [x] 4.1 创建 `app/api/chat/route.ts`，校验请求 body（非空 messages）。
- [x] 4.2 返回 `Content-Type: text/event-stream; charset=utf-8` 与 `ReadableStream`。
- [x] 4.3 将每个 text delta 编码为 `{ type: "token", text }` SSE 事件；结束时发送 `{ type: "done" }`。
- [x] 4.4 流开始前错误使用 `jsonError` envelope；不透传上游 OpenAI 原始 SSE。
- [x] 4.5 本阶段不写入数据库。

## 5. chatStore（Zustand）

- [x] 5.1 创建 `lib/stores/chatStore.ts`：`messagesByConversation`、`streamingConversationId`、`error`。
- [x] 5.2 实现 `sendMessage`：`fetch` POST + SSE 解析，按事件类型更新 assistant content。
- [x] 5.3 实现 `AbortController` 与 `abortStream`；abort 后忽略后续事件。
- [x] 5.4 实现 `clearConversationMessages` 供删除会话使用。
- [x] 5.5 **不使用** `EventSource` API。

## 6. UI 集成

- [x] 6.1 重构 `app/page.tsx`：移除 `messagesByConversation` useState，接入 `chatStore`。
- [x] 6.2 切换会话、新建聊天时调用 `abortStream`。
- [x] 6.3 删除会话时调用 `clearConversationMessages`。
- [x] 6.4 流式进行中禁用 `ChatInput`；更新 `MainPanel` subtitle。
- [x] 6.5 保留首条消息自动更新会话标题逻辑（与 1.3 兼容）。
- [x] 6.6 `MessageList` 智能滚动：底部附近才自动跟随；否则显示「回到底部」；发送/切换会话强制到底。

## 7. 验证

- [x] 7.1 运行 `npm run lint`。
- [x] 7.2 运行 `npm run build`。
- [ ] 7.3 配置 DeepSeek Key 后联调：SSE token 事件、done 事件、打字机效果、多轮上下文。
- [ ] 7.4 验证切换会话 / 新建聊天 / 重复发送时的 abort 行为。
- [ ] 7.5 验证 API Key 缺失或无效时的 JSON 错误（流开始前）。
- [ ] 7.6 在 DevTools Network 中确认响应为 `text/event-stream` 且 `data:` 行格式正确。
- [ ] 7.7 验证智能滚动：底部附近流式跟随；向上阅读时不打断；「回到底部」按钮；发送消息后强制到底。
