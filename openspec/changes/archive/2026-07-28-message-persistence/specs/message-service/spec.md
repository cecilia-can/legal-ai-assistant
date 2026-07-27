## ADDED Requirements

### Requirement: 消息服务层
系统 SHALL 在 `lib/services/messageService.ts` 提供消息持久化服务，供 Route Handler 调用。

服务 MUST 至少提供：

- `listMessages(conversationId, options)` — 分页查询
- `createMessage(conversationId, input)` — 创建消息
- `deleteMessage(conversationId, messageId)` — 删除消息

服务 MUST 使用共享 Prisma Client（`lib/db.ts`），MUST NOT 在服务层构造 HTTP Response。

#### Scenario: 通过服务创建并查询消息
- **WHEN** 调用 `createMessage` 后调用 `listMessages`
- **THEN** 新建消息出现在该会话的查询结果中

### Requirement: 分页与游标
`listMessages` SHALL 支持基于 `createdAt` + `id` 的游标分页。

- 无 cursor 时 MUST 取该会话最近 `limit` 条，再按时间升序返回。
- 有 cursor 时 MUST 返回该游标之前（更早）的至多 `limit` 条，升序返回。
- 仍有更早数据时 MUST 产生可编码的 `nextCursor`；否则为 `null`。

#### Scenario: 首屏取最近消息
- **WHEN** 会话有超过 `limit` 条消息且未传 cursor
- **THEN** 返回最晚的 `limit` 条（升序），且 `nextCursor` 非空以允许加载更早消息

#### Scenario: 使用 cursor 加载更早消息
- **WHEN** 客户端携带上一页提供的 cursor
- **THEN** 返回更早一页消息，且不与上一页重复

### Requirement: 归属校验
消息服务在创建 / 删除前 SHALL 校验会话存在；删除时 SHALL 校验消息属于该会话。

#### Scenario: 会话不存在时创建失败
- **WHEN** `createMessage` 传入不存在的 conversationId
- **THEN** 服务抛出可识别的 not-found 错误（或返回等价失败结果），供 API 映射为 404

#### Scenario: 跨会话删除被拒绝
- **WHEN** `deleteMessage` 的 messageId 不属于给定 conversationId
- **THEN** 服务视为 not-found，不删除任何行
