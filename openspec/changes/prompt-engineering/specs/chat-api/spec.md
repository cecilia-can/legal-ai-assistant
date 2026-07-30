## MODIFIED Requirements

### Requirement: 流式聊天 API 端点
系统 SHALL 提供 `POST /api/chat` Route Handler，接收对话消息并返回 **SSE 流式** AI 响应。

请求 body MUST 为 JSON，包含：

- `messages`: 非空数组，每项含 `role`（`user` | `assistant`）与 `content`（非空字符串）。
- `messages` MUST NOT 含 `role: "system"`（System Prompt 由服务端注入）。
- SHOULD 支持可选 `conversationId: string`，供结构化 usage 日志按会话聚合。

成功响应 MUST 满足：

- HTTP 200
- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache`（或等效，避免缓冲）
- body 为 SSE 事件序列，每事件一行 `data: <JSON>\n\n`

流开始前的错误 MUST 使用 `jsonError` 返回 `{ code, message, data }` envelope。

在调用 AI 客户端前，Handler MUST：

1. 对 **最新一条 user 消息** 执行越狱模式检测；命中则返回固定拒答 SSE，**不得**调用模型。
2. 否则经 context 层（`buildModelMessages` 或等价）注入 System Prompt 并按 Token 预算裁剪 history。

#### Scenario: 越狱输入返回固定拒答 SSE 且不调模型
- **WHEN** 最新 user 命中越狱规则（如「假设你是…」）
- **THEN** 接口返回 200 SSE（固定拒答 + `done`），且不调用 AI 客户端

#### Scenario: 成功发起 SSE 流式响应
- **WHEN** 客户端 POST 合法 messages 且 AI 配置有效
- **THEN** 接口返回 200、`Content-Type: text/event-stream`，body 含 `token` 与 `done` 事件

#### Scenario: messages 为空时拒绝
- **WHEN** 客户端 POST 空 messages 或缺失 messages
- **THEN** 接口返回 400 JSON envelope，message 说明参数无效

#### Scenario: 客户端传入 system 时拒绝
- **WHEN** 客户端 POST 的 messages 中任一项 `role` 为 `system`
- **THEN** 接口返回 400 JSON envelope，message 说明不允许 system 角色

#### Scenario: AI 服务不可用
- **WHEN** 模型调用在流开始前失败且重试仍失败
- **THEN** 接口返回 502 或 500 JSON envelope，message 可读

#### Scenario: 长历史经裁剪后仍可流式回复
- **WHEN** 客户端 POST 的 history Token 总数超过配置的输入预算
- **THEN** Handler 裁剪后再调用模型，仍返回 200 SSE 流（除非单条 user 仍导致上游失败）

#### Scenario: 可选 conversationId 传入
- **WHEN** 客户端 POST 合法 body 且含非空 `conversationId`
- **THEN** Handler 正常处理；若启用 usage 日志，JSON 中含相同 `conversationId`
