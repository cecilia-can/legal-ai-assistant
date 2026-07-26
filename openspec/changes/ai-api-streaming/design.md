## 背景

Change 1.3 已用 `conversationStore` 管理会话列表与选中态；`app/page.tsx` 仍用 `messagesByConversation` 本地 state 存消息，且无 AI 回复。Change 1.4 要把「发消息 → 调模型 → 流式展示回复」整条链路打通，并将消息状态迁入独立的 `chatStore`，与 `conversationStore` 职责分离。

**流式协议选型更新：** 由方案 A（plain text chunk）改为 **方案 B（SSE + JSON 事件）**，对齐主流 AI 平台实践，并为 Phase 4 Agent 多事件流预留扩展点。

## 目标 / 非目标

**目标：**

- 通过 DeepSeek（OpenAI Compatible API）实现多轮对话与流式输出。
- 服务端 `POST /api/chat` 将模型 delta **重打包为 SSE 事件**转发给浏览器。
- 前端使用 **`fetch` POST + 手动解析 SSE**（不使用 `EventSource`）。
- `chatStore` 按 `conversationId` 维护内存消息；切换会话保留各会话历史（直至刷新）。
- 发送新消息、切换会话、新建聊天时 cancel 进行中的流式请求。
- 429 / 5xx 最多重试 1 次；4xx（如 Key 无效）不重试。
- 将当前会话内存中的**全部历史**作为上下文发给 API（Token 限制留待 1.7）。

**非目标：**

- 消息持久化到数据库（Change 1.5）。
- Markdown 渲染、代码高亮（Change 1.6）。
- 法律助手 System Prompt 精调（Change 1.7 交付 `lib/ai/prompts.ts`）。
- Agent 级多事件（`tool_start` / `tool_result` 等，Phase 4 再扩展）。
- RAG、Tool Calling。
- 新增 Prisma migration 或用户认证。

## 设计决策

### 1. AI 提供商：DeepSeek + openai SDK

**决策：**

- 使用官方 `openai` npm 包，通过环境变量配置 DeepSeek：
  - `OPENAI_API_KEY` — API 密钥
  - `OPENAI_BASE_URL` — 默认 `https://api.deepseek.com`
  - `OPENAI_MODEL` — 默认 `deepseek-chat`
- 封装于 `lib/ai/client.ts`，导出流式 completion 函数。

**理由：** DeepSeek 兼容 OpenAI Chat Completions API；SDK 维护成本低；上游已是 SSE，由 BFF 解析后重打包。

### 2. 本阶段不注入法律 System Prompt

**决策：** 1.4 不传 system message。完整法律人设与 `lib/ai/prompts.ts` 在 Change 1.7 实现。

**理由：** roadmap 将 Prompt 工程独立为 1.7；1.4 聚焦流式链路与 SSE 协议。

### 3. 下游协议：SSE + JSON 事件（方案 B）

**决策：**

- `POST /api/chat` 成功时返回 **`Content-Type: text/event-stream; charset=utf-8`**。
- 每个事件一行 `data: <JSON>\n\n`（标准 SSE 帧格式）。
- 本阶段事件类型（`types/chat.ts` 或 `lib/api/sse.ts`）：

| type | 字段 | 含义 |
|------|------|------|
| `token` | `text: string` | assistant 文本增量 |
| `done` | — | 本轮生成正常结束 |
| `error` | `message: string` | 流内错误（可选，流已开始后） |

**示例 wire 格式：**

```text
data: {"type":"token","text":"你"}

data: {"type":"token","text":"好"}

data: {"type":"done"}

```

- 流开始**之前**的错误（配置缺失、校验失败、模型 4xx）仍返回 JSON `{ code, message, data }` envelope（`jsonError`）。
- **不透传** DeepSeek 原始 OpenAI SSE JSON 给浏览器，由 BFF 抽 `delta.content` 后重打包，降低前端耦合。

**理由：**

- 对齐 ChatGPT/Claude 等「HTTP 流 + SSE 事件」主流形态。
- Phase 4 可在同一协议上扩展 `tool_start` 等，无需从 plain text 迁移。
- 本阶段仅 `token` / `done`，复杂度可控。

**备选方案（已否决）：**

- 方案 A plain text：实现快，但与 Agent 事件流演进路径不一致。
- 透传上游 OpenAI SSE：前端需解析 `choices[].delta`，与 DeepSeek/OpenAI 耦合过紧。

### 4. 前端消费：fetch POST，不用 EventSource

**决策：**

- 聊天必须 POST `messages` JSON body，故 **不使用** `EventSource`（仅支持 GET）。
- 使用 `fetch('/api/chat', { method: 'POST', body, signal })` + `response.body.getReader()`。
- SSE 解析逻辑封装于 `lib/api/sse.ts`（如 `parseSseStream(reader, onEvent)`），处理：
  - 按 `\n\n` 分帧
  - 提取 `data:` 行 JSON
  - UTF-8 多字节字符截断（`TextDecoder` `{ stream: true }`）
  - 忽略空行与注释行（`:` 开头）

**理由：** 业界 Chat 产品标准做法；可带 body、headers、`AbortController`。

### 5. SSE 编解码模块

**决策：** 新建 `lib/api/sse.ts`：

- `encodeSseEvent(payload: unknown): string` — 生成 `data: ...\n\n`
- `parseSseChunk(buffer: string): { events: ChatStreamEvent[]; remainder: string }` — 增量解析
- 或等价的 async iterator 封装供 `chatStore` 调用

**理由：** 服务端 Route Handler 与前端 store 共用类型与解析规则，避免重复实现。

### 6. chatStore 与 conversationStore 分离

**决策：** 新建 `lib/stores/chatStore.ts`（结构同前），`sendMessage` 内按 SSE 事件类型更新 UI：

- `token` → append 到 assistant `content`
- `done` → 清除 `streamingConversationId`
- `error` → 设置 `error`，清理占位消息

### 7. 请求取消策略

**决策：** 以下场景 `AbortController.abort()`：

1. 同一会话再次 `sendMessage`
2. 切换会话
3. 新建聊天

abort 后忽略后续 SSE 事件，避免写错会话。

### 8. 重试策略

**决策：** 服务端 AI 客户端层，429 / 5xx 最多 1 次重试，固定延迟约 500ms。4xx 不重试。

### 9. 上下文窗口（本阶段）

**决策：** 内存中该会话全部 `user` / `assistant` 消息传给 API。Token 限制留 1.7。

### 10. 消息列表智能自动滚动

**决策：** `MessageList` 自行持有滚动容器（自 `MainPanel` 的 `overflow-y-auto` 下沉），实现 ChatGPT 式滚动：

- 距底部 ≤ 80px 视为「在底部附近」，新消息 / 流式 token 才自动滚到底。
- 用户向上阅读时保持当前视口，显示悬浮「回到底部」按钮。
- 用户发送消息（`scrollToBottomNonce`）或切换会话（`key={activeId}` remount）时强制滚到底并恢复跟随。
- 流式期间用 `scrollTo({ behavior: "auto" })` 避免 smooth 动画堆积。

**理由：** 流式回复时若无条件 `scrollIntoView`，用户无法回看历史；与主流 Chat 产品体验一致。

**备选方案（已否决）：** 始终自动滚到底 — 实现简单，但打断阅读历史。

## Agent 阶段演进（预留）

本阶段 SSE 协议刻意预留扩展，Phase 4 可新增事件类型而不改传输层：

```text
data: {"type":"tool_start","name":"法规检索"}
data: {"type":"tool_result","summary":"..."}
data: {"type":"token","text":"根据"}
data: {"type":"done"}
```

无需切换 WebSocket，除非 Phase 5 协作场景另有要求。

## 风险 / 权衡

- [风险] SSE 解析比 plain text 复杂 → 用共享 `lib/api/sse.ts` + 单元测试降低 bug。
- [风险] `reader.read()` chunk 与 SSE 帧不对齐 → 必须缓冲 `remainder` 字符串。
- [风险] 未配置 `OPENAI_API_KEY` → 流开始前 JSON 错误。
- [风险] Vercel 流式超时 → 开发阶段可接受。

## 实施计划

1. 安装 `openai`，更新 `.env.example`。
2. 定义 `ChatStreamEvent` 类型与 `lib/api/sse.ts`。
3. 实现 `lib/ai/client.ts`（上游 SSE → text delta）。
4. 实现 `app/api/chat/route.ts`（下游 SSE 编码）。
5. 实现 `chatStore`（fetch + SSE 解析）。
6. 重构 `app/page.tsx`。
7. lint / build / DeepSeek 联调。

## 已确认问题

- AI 提供商：DeepSeek ✓
- System Prompt：留待 1.7 ✓
- SDK：openai npm 包 ✓
- **流式协议：方案 B（SSE + JSON 事件）** ✓（用户 2026-07-25 确认变更）
- 前端：fetch POST，不用 EventSource ✓
- 内存多会话消息保留 ✓
- abort / 重试 / 上下文：同前 ✓
