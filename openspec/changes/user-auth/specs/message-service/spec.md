## MODIFIED Requirements

### Requirement: 消息服务层
系统 SHALL 在 `lib/services/messageService.ts` 提供消息持久化服务，供 Route Handler 调用。

服务 MUST 至少提供：

- `listMessages(conversationId, userId, options)` — 分页查询
- `createMessage(conversationId, userId, input)` — 创建消息
- `deleteMessage(conversationId, userId, messageId)` — 删除消息

所有方法 MUST 要求必填 `userId` 参数。

服务 MUST 使用共享 Prisma Client（`lib/db.ts`），MUST NOT 在服务层构造 HTTP Response。

#### Scenario: 通过服务创建并查询消息
- **WHEN** owner 调用 `createMessage` 后调用 `listMessages` 且传入相同 userId
- **THEN** 新建消息出现在该会话的查询结果中

### Requirement: 归属校验
消息服务在读写前 SHALL 校验 `(conversationId, userId)` 归属；非 owner MUST 抛出 not-found 错误（映射 API 404）。

`assertConversationExists` MUST 替换为 `assertConversationOwnership(conversationId, userId)`。

删除时 SHALL 额外校验 messageId 属于该 conversationId。

#### Scenario: 非 owner 列出消息失败
- **WHEN** `listMessages` 传入存在但不属于 userId 的 conversationId
- **THEN** 服务抛出 not-found 错误

#### Scenario: 非 owner 创建消息失败
- **WHEN** `createMessage` 传入非 owner 的 conversationId
- **THEN** 服务抛出 not-found 错误，不写入任何行

#### Scenario: 跨会话删除被拒绝
- **WHEN** `deleteMessage` 的 messageId 不属于给定 conversationId
- **THEN** 服务视为 not-found，不删除任何行
