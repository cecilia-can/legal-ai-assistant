## Purpose

Define the streaming chat API endpoint (`POST /api/chat`) that returns SSE events to the browser.

## Requirements

### Requirement: 流式聊天 API 端点
系统 SHALL 提供 `POST /api/chat` Route Handler，接收对话消息并返回 **SSE 流式** AI 响应。

请求 body MUST 为 JSON，包含：

- `messages`: 非空数组，每项含 `role`（`user` | `assistant`）与 `content`（非空字符串）。

成功响应 MUST 满足：

- HTTP 200
- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache`（或等效，避免缓冲）
- body 为 SSE 事件序列，每事件一行 `data: <JSON>\n\n`

流开始前的错误 MUST 使用 `jsonError` 返回 `{ code, message, data }` envelope。

#### Scenario: 成功发起 SSE 流式响应
- **WHEN** 客户端 POST 合法 messages 且 AI 配置有效
- **THEN** 接口返回 200、`Content-Type: text/event-stream`，body 含 `token` 与 `done` 事件

#### Scenario: messages 为空时拒绝
- **WHEN** 客户端 POST 空 messages 或缺失 messages
- **THEN** 接口返回 400 JSON envelope，message 说明参数无效

#### Scenario: AI 服务不可用
- **WHEN** 模型调用在流开始前失败且重试仍失败
- **THEN** 接口返回 502 或 500 JSON envelope，message 可读

### Requirement: 上游 SSE 重打包为下游 SSE 事件
Route Handler SHALL 从 DeepSeek/OpenAI SDK stream 提取 `delta.content`，通过 `encodeSseEvent` 写入 `{ type: "token", text }` 事件；**不得**将上游原始 OpenAI SSE JSON 直接透传给浏览器。

Route Handler SHALL NOT 缓冲完整回复后再返回；MUST 增量写入 `ReadableStream`。

#### Scenario: 增量转发 token 事件
- **WHEN** 模型连续产生多个 text delta
- **THEN** 客户端在不等待流结束的情况下陆续收到多个 `token` 事件

#### Scenario: 结束时发送 done
- **WHEN** 上游 stream 正常结束
- **THEN** 客户端收到 `done` 事件后流关闭

### Requirement: 聊天 API 与消息持久化职责分离
`POST /api/chat` SHALL 继续仅负责校验 messages、调用模型并以 SSE 推送 `token` / `done` 事件。

- 该 Handler MUST NOT 直接写入 `Message` 表。
- 消息持久化 MUST 通过会话消息 API（或由其背后的 `messageService`）完成。

#### Scenario: 流式聊天本身不写库
- **WHEN** 客户端仅调用 `POST /api/chat` 完成一轮 SSE 且未调用消息创建 API
- **THEN** `Message` 表不因该次 `/api/chat` 调用而新增记录
