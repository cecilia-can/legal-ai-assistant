## MODIFIED Requirements

### Requirement: 流式聊天 API 端点
系统 SHALL 提供 `POST /api/chat` Route Handler，接收**当前会话 id 与本轮 user 内容**，从数据库加载真实历史后返回 **SSE 流式** AI 响应。

请求 body MUST 为 JSON，包含：

- `conversationId`：非空字符串，MUST 属于当前登录用户
- `content`：非空字符串（本轮 user 消息）

Handler MUST NOT 接受客户端传入的完整 `messages` 数组作为权威历史。

未登录 MUST 返回 401；conversation 不存在或非 owner MUST 返回 404。

成功响应 MUST 满足：

- HTTP 200
- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache`（或等效，避免缓冲）
- body 为 SSE 事件序列，每事件一行 `data: <JSON>\n\n`

流开始前的错误 MUST 使用 `jsonError` 返回 `{ code, message, data }` envelope。

Route MUST 声明 `export const dynamic = "force-dynamic"`。

#### Scenario: 成功发起 SSE 流式响应
- **WHEN** 已登录客户端 POST 合法 conversationId + content 且 AI 配置有效
- **THEN** 接口返回 200、`Content-Type: text/event-stream`，body 含 `token` 与 `done` 事件

#### Scenario: 未登录拒绝
- **WHEN** 无 session POST `/api/chat`
- **THEN** 返回 401 JSON envelope

#### Scenario: 越权 conversationId 拒绝
- **WHEN** 已登录用户 POST 不属于其的 conversationId
- **THEN** 返回 404 JSON envelope

#### Scenario: content 为空时拒绝
- **WHEN** 客户端 POST 空 content 或缺失 content
- **THEN** 接口返回 400 JSON envelope

#### Scenario: AI 服务不可用
- **WHEN** 模型调用在流开始前失败且重试仍失败
- **THEN** 接口返回 502 或 500 JSON envelope，message 可读

### Requirement: 聊天 API 与消息持久化职责分离
`POST /api/chat` SHALL 继续**不直接写入** `Message` 表。

消息持久化 MUST 通过会话消息 API（或由其背后的 `messageService`）完成；`/api/chat` 仅读取历史用于模型上下文。

#### Scenario: 流式聊天本身不写库
- **WHEN** 客户端仅调用 `POST /api/chat` 完成一轮 SSE 且未调用消息创建 API
- **THEN** `Message` 表不因该次 `/api/chat` 调用而新增记录

### Requirement: 服务端构建模型上下文
`POST /api/chat` SHALL 在调用 `buildModelMessages` 前从数据库加载该会话已有 user/assistant 消息，并 append 本轮 `content` 作为最新 user 消息。

加载的历史 MUST NOT 包含客户端伪造的 system 消息。

#### Scenario: 历史来自数据库
- **WHEN** 会话 DB 中已有 4 条消息且客户端只 POST 本轮 content
- **THEN** 模型输入包含 DB 中 4 条 + 本轮 user 消息（经 context 截断策略）
