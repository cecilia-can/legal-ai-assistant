## MODIFIED Requirements

### Requirement: SSE 事件类型定义
系统 SHALL 为 BFF → 浏览器 的聊天流定义 JSON 事件类型（`ChatStreamEvent`）。

本阶段 MUST 支持：

- `{ "type": "token", "text": string }` — assistant 文本增量，`text` 非空。
- `{ "type": "done" }` — 本轮生成正常结束，且是唯一表示成功完成的事件。
- `{ "type": "error", "message": string, "code": string }` — 流已开始后的受控失败事件。
- `{ "type": "cancelled" }` — 用户主动停止后的终态事件。

类型定义 MUST 位于 `types/chat.ts` 或 `lib/api/sse.ts` 并可被前后端共用。客户端在未收到 `done` 前读流结束时 MUST 将该轮视为非成功终态。

#### Scenario: token 事件携带文本增量
- **WHEN** 模型产生 text delta "你"
- **THEN** BFF 向客户端写入 `data: {"type":"token","text":"你"}\n\n`

#### Scenario: 正常结束
- **WHEN** 模型 stream 正常结束且服务端已持久化 completed 状态
- **THEN** BFF 在关闭流前写入 `data: {"type":"done"}\n\n`

#### Scenario: 非预期断流不视为成功
- **WHEN** 客户端读取结束但未收到 `done`
- **THEN** 客户端将该轮显示为失败或取消，且不得将其当作 completed 回复

#### Scenario: 用户取消
- **WHEN** 用户停止正在进行的流式回复
- **THEN** BFF 在持久化 cancelled 状态后发送 `cancelled` 事件或以等价终态响应结束流
