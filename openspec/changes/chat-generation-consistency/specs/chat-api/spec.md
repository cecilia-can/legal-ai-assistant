## MODIFIED Requirements

### Requirement: 聊天 API 与消息持久化职责
`POST /api/chat` SHALL 校验用户身份、会话归属、请求体和客户端请求 ID，并负责创建、运行及终结本轮持久化生成任务。

- Handler MUST 在调用模型前，通过服务层事务创建用户消息、助手占位消息和生成任务。
- Handler MUST 使用生成任务的请求 ID 实现幂等响应，不得为重复请求创建额外消息或调用额外模型请求。
- Handler MUST 将上游 token 增量封装为 SSE 推送；终态时 MUST 由服务端更新助手消息及生成任务状态。
- Handler MUST NOT 要求浏览器在 SSE 结束后另行调用消息创建 API 保存本轮聊天消息。

#### Scenario: 服务端负责一轮消息持久化
- **WHEN** 客户端调用 `POST /api/chat` 并收到完整 SSE 回复
- **THEN** 用户消息、助手消息和生成任务均已由服务端持久化，客户端无需提交第二次消息保存请求

#### Scenario: 重复聊天请求不重复生成
- **WHEN** 客户端以已存在的请求 ID 再次调用 `POST /api/chat`
- **THEN** Handler 返回该请求对应的现有生成任务状态，并且不新增 Message 记录或模型调用
