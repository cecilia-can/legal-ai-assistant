## Purpose

Define REST API endpoints for listing, creating, and deleting messages within a conversation.

## Requirements

### Requirement: 查询会话消息列表 API
系统 SHALL 提供 `GET /api/conversations/[id]/messages`，按分页返回指定会话的消息。

- 成功响应 MUST 为统一 envelope；`data` MUST 为 `{ items: MessageJson[], nextCursor: string | null }`。
- `MessageJson` MUST 包含 `id`、`conversationId`、`role`、`content`、`createdAt`（ISO 8601）。
- `items` MUST 按 `createdAt` 升序排列（从旧到新）。
- 查询参数 `limit` 默认 `50`，最大 `100`；非法值 MUST 返回 400。
- 可选查询参数 `cursor` 用于加载更早的消息；无更多数据时 `nextCursor` MUST 为 `null`。
- 首屏（无 cursor）MUST 返回该会话**最近**至多 `limit` 条消息（时间线升序）。
- 会话不存在时 MUST 返回 404 envelope。

#### Scenario: 成功返回最近一页消息
- **WHEN** 客户端请求存在会话的消息列表且数据库可用
- **THEN** 接口返回 HTTP 200 与 envelope，`data.items` 为升序消息数组

#### Scenario: 会话不存在
- **WHEN** 客户端请求不存在的 conversation id
- **THEN** 接口返回 HTTP 404 与 `{ code: 404, message: <可读错误>, data: null }`

#### Scenario: 空会话返回空列表
- **WHEN** 会话存在但尚无消息
- **THEN** 接口返回 HTTP 200，`data.items` 为 `[]`，`nextCursor` 为 `null`

### Requirement: 创建消息 API
系统 SHALL 提供 `POST /api/conversations/[id]/messages`，向指定会话追加一条消息。

- 请求 body MUST 包含 `role`（`user` | `assistant`）与非空 `content`。
- 成功时 MUST 返回 HTTP 201 与 envelope，`data` 为新建的 `MessageJson`。
- 会话不存在时 MUST 返回 404。
- `role` / `content` 非法时 MUST 返回 400。
- 创建成功后 MUST 刷新所属会话的 `updatedAt`。

#### Scenario: 成功创建 user 消息
- **WHEN** 客户端 POST 合法 `role: "user"` 与非空 content
- **THEN** 接口返回 201，`data` 含服务端生成的 `id` 与持久化后的字段

#### Scenario: content 为空时拒绝
- **WHEN** 客户端 POST 空白 content
- **THEN** 接口返回 400 envelope

### Requirement: 删除单条消息 API
系统 SHALL 提供 `DELETE /api/conversations/[id]/messages/[messageId]`，删除属于该会话的一条消息。

- 成功时 MUST 返回 HTTP 200 与 envelope，`data` 为 `null`。
- 消息不存在或不属于该会话时 MUST 返回 404。
- 会话不存在时 MUST 返回 404。

#### Scenario: 成功删除消息
- **WHEN** 客户端删除存在且归属正确的 messageId
- **THEN** 接口返回 200，后续列表不再包含该消息

#### Scenario: 删除归属错误的消息
- **WHEN** messageId 存在但不属于路径中的 conversation id
- **THEN** 接口返回 404，且不删除该消息
