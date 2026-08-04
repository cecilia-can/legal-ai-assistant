## MODIFIED Requirements

### Requirement: sendMessage 请求体与 SSE
`sendMessage(conversationId, content)` SHALL POST `/api/chat` 时仅发送：

```json
{ "conversationId": "<id>", "content": "<本轮 user 文本>" }
```

MUST NOT 再发送完整客户端 `messages` 数组作为模型历史。

fetch MUST 使用 `credentials: "include"`。

#### Scenario: 发送消息使用新 API 契约
- **WHEN** 用户发送一条新消息
- **THEN** `/api/chat` 请求 body 含 conversationId 与 content，不含 messages 数组

### Requirement: chatStore 401 与流式 session 失效
`chatStore` SHALL 在 API 返回 401 时终止进行中的 SSE（abort），清除流式状态，并触发登录重定向。

流式过程中收到 401 MUST NOT 继续 append token。

#### Scenario: 流式中 session 失效
- **WHEN** SSE 进行中 session 过期且后续请求返回 401
- **THEN** abort 当前流，`streamingConversationId` 置 null，用户被引导登录

#### Scenario: 401 与 500 区分
- **WHEN** 加载历史消息返回 401
- **THEN** 重定向登录；返回 500 时展示 InlineError 重试
