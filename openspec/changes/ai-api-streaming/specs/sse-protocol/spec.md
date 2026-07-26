## ADDED Requirements

### Requirement: SSE 事件类型定义
系统 SHALL 为 BFF → 浏览器 的聊天流定义 JSON 事件类型（`ChatStreamEvent`）。

本阶段 MUST 支持：

- `{ "type": "token", "text": string }` — assistant 文本增量，`text` 非空。
- `{ "type": "done" }` — 本轮生成正常结束。
- `{ "type": "error", "message": string }` — 流内错误（可选实现，供流已开始后失败使用）。

类型定义 MUST 位于 `types/chat.ts` 或 `lib/api/sse.ts` 并可被前后端共用。

#### Scenario: token 事件携带文本增量
- **WHEN** 模型产生 text delta "你"
- **THEN** BFF 向客户端写入 `data: {"type":"token","text":"你"}\n\n`

#### Scenario: 正常结束
- **WHEN** 模型 stream 结束且无错误
- **THEN** BFF 在关闭流前写入 `data: {"type":"done"}\n\n`

### Requirement: SSE 编解码工具
系统 SHALL 在 `lib/api/sse.ts` 提供 SSE 编解码能力。

- MUST 提供 `encodeSseEvent(event: ChatStreamEvent): string`，输出符合 SSE 规范的 `data: ...\n\n`。
- MUST 提供增量解析能力，处理 TCP chunk 与 SSE 帧边界不对齐（缓冲 remainder）。
- 解析时 MUST 忽略空行；以 `:` 开头的 SSE 注释行 SHOULD 忽略。
- JSON 解析失败的事件 SHOULD 跳过或触发 `error` 事件，不崩溃整个流。

#### Scenario: 编码单个事件
- **WHEN** 调用 `encodeSseEvent({ type: "token", text: "好" })`
- **THEN** 返回字符串以 `data: ` 开头、以 `\n\n` 结尾

#### Scenario: 跨 chunk 解析
- **WHEN** 一个 SSE 帧被拆到两次 `reader.read()` 结果中
- **THEN** 解析器缓冲并在帧完整后产出事件

### Requirement: 不使用 EventSource API
前端 MUST NOT 使用浏览器 `EventSource` 调用 `/api/chat`。

- MUST 使用 `fetch` POST 携带 JSON body。
- MUST 通过 `ReadableStream` reader 消费 SSE 响应。

#### Scenario: POST 携带 messages
- **WHEN** 客户端发起聊天
- **THEN** 请求方法为 POST，body 含 messages 数组，Accept 可包含 `text/event-stream`
