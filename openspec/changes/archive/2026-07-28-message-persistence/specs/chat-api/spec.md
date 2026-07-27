## REMOVED Requirements

### Requirement: 服务端不持久化消息
**Reason**: Change 1.5 引入消息持久化；「本阶段不写库」约束已过期。  
**Migration**: 消息落库由 `message-api` / `chatStore` 编排；`POST /api/chat` 保持 SSE 职责，不在流式 Handler 内直接写 `Message` 表。

## ADDED Requirements

### Requirement: 聊天 API 与消息持久化职责分离
`POST /api/chat` SHALL 继续仅负责校验 messages、调用模型并以 SSE 推送 `token` / `done` 事件。

- 该 Handler MUST NOT 直接写入 `Message` 表。
- 消息持久化 MUST 通过会话消息 API（或由其背后的 `messageService`）完成。

#### Scenario: 流式聊天本身不写库
- **WHEN** 客户端仅调用 `POST /api/chat` 完成一轮 SSE 且未调用消息创建 API
- **THEN** `Message` 表不因该次 `/api/chat` 调用而新增记录
