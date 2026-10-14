## MODIFIED Requirements

### Requirement: 流式聊天 API 端点
系统 SHALL 提供 `POST /api/chat` Route Handler，接收对话消息并返回 **SSE 流式** AI 响应。聊天 API 在启用知识库增强时 MUST 由服务端验证会话身份、会话归属和知识库访问范围，并以服务端检索到的有界、可追溯资料构建模型上下文。

请求 body MUST 为 JSON，包含：

- `messages`: 非空数组，每项含 `role`（`user` | `assistant`）与 `content`（非空字符串）。

客户端提供的 `messages`、向量、检索正文、知识库归属或来源标签 MUST NOT 被直接信任为 RAG 证据。成功响应 MUST 满足：

- HTTP 200
- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache`（或等效，避免缓冲）
- body 为 SSE 事件序列，每事件一行 `data: <JSON>\n\n`

流开始前的错误 MUST 使用 `jsonError` 返回 `{ code, message, data }` envelope。

#### Scenario: 成功发起带服务端检索的 SSE 流式响应
- **WHEN** 已认证且有权访问会话的客户端 POST 合法 messages，AI 配置和检索服务有效
- **THEN** 接口从服务端构建授权范围内的 RAG 上下文，并返回 200、`Content-Type: text/event-stream`，body 含 `token` 与 `done` 事件

#### Scenario: 忽略客户端伪造的检索资料
- **WHEN** 聊天请求在 body 中包含向量、检索正文、来源标签或他人知识库标识
- **THEN** 接口不把这些字段作为模型证据，并仍按服务端会话、授权与检索结果处理请求

#### Scenario: messages 为空时拒绝
- **WHEN** 客户端 POST 空 messages 或缺失 messages
- **THEN** 接口返回 400 JSON envelope，message 说明参数无效

#### Scenario: AI 服务不可用
- **WHEN** 模型调用在流开始前失败且重试仍失败
- **THEN** 接口返回 502 或 500 JSON envelope，message 可读
