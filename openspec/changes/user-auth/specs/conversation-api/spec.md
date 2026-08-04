## MODIFIED Requirements

### Requirement: 查询会话列表 API
系统 SHALL 提供 `GET /api/conversations` 接口，返回**当前登录用户**的会话列表。

响应 MUST 为统一 envelope `{ code, message, data }`；成功时 `data` MUST 为会话数组，每项包含 `id`、`title`、`createdAt`、`updatedAt`；列表 MUST 按 `updatedAt` 降序排列。`createdAt` / `updatedAt` MUST 为 ISO 8601 字符串。

未登录 MUST 返回 HTTP 401。

Route MUST 声明 `export const dynamic = "force-dynamic"`，避免响应缓存导致跨用户泄漏。

#### Scenario: 成功返回当前用户会话列表
- **WHEN** 已登录客户端请求 `GET /api/conversations` 且数据库可用
- **THEN** 接口返回 HTTP `200` 与 `{ "code": 0, "message": "success", "data": [ ...ConversationJson ] }`，且每项会话 `userId` 对客户端不可见或不在 JSON 中暴露

#### Scenario: 无会话时返回空数组
- **WHEN** 当前用户不存在任何会话
- **THEN** 接口返回 HTTP `200` 与 `{ "code": 0, "message": "success", "data": [] }`

#### Scenario: 未登录返回 401
- **WHEN** 无 session 请求 `GET /api/conversations`
- **THEN** 接口返回 HTTP 401 与 JSON envelope

#### Scenario: 数据库不可用时返回错误
- **WHEN** 数据库连接失败或 Prisma 抛出错误
- **THEN** 接口返回 HTTP `500` 与 `{ "code": 500, "message": "<可读错误>", "data": null }`

### Requirement: 创建会话 API
系统 SHALL 提供 `POST /api/conversations` 接口，用于创建新会话。

创建时 MUST 生成唯一 `id` 并将 `userId` 设为当前登录用户；若未提供标题，MUST 使用默认标题 `新对话`。未登录 MUST 返回 401。

成功响应 MUST 使用 envelope，`data` 为单个会话对象。

#### Scenario: 创建默认标题会话
- **WHEN** 已登录客户端发送 `POST /api/conversations` 且未提供标题
- **THEN** 接口返回 HTTP `201` 与 `{ "code": 0, "message": "success", "data": { ...ConversationJson, "title": "新对话" } }`

#### Scenario: 创建自定义标题会话
- **WHEN** 已登录客户端发送 `POST /api/conversations` 且 body 包含合法 `title`
- **THEN** 接口返回 HTTP `201` 与 `{ "code": 0, "message": "success", "data": { ...ConversationJson } }`

### Requirement: 删除会话 API
系统 SHALL 提供 `DELETE /api/conversations/[id]` 接口，用于删除指定会话。

删除 MUST 仅允许资源 owner；非 owner 或不存在 MUST 返回 HTTP 404（统一文案）。

删除 MUST 级联删除该会话下的消息（依赖数据库 onDelete Cascade）。成功时 MUST 返回 envelope 且 `data` 为 `null`。

#### Scenario: 成功删除存在的会话
- **WHEN** 已登录用户请求删除其拥有的会话 id
- **THEN** 接口返回 HTTP `200` 与 `{ "code": 0, "message": "success", "data": null }`，且该会话不再出现在列表中

#### Scenario: 删除不存在的会话或非 owner
- **WHEN** 客户端请求删除不存在或不属于当前用户的会话 id
- **THEN** 接口返回 HTTP `404` 与 `{ "code": 404, "message": "<可读错误>", "data": null }`

### Requirement: 更新会话标题 API
系统 SHALL 提供 `PATCH /api/conversations/[id]` 接口，用于更新会话标题。

请求 body MUST 接受 `title` 字符串；更新 MUST 仅允许 owner；非 owner MUST 返回 404。

更新成功后 MUST 刷新 `updatedAt`。成功响应 MUST 使用 envelope，`data` 为更新后的会话对象。

#### Scenario: 成功更新标题
- **WHEN** 已登录 owner 发送包含非空 `title` 的 PATCH 请求
- **THEN** 接口返回 HTTP `200` 与 `{ "code": 0, "message": "success", "data": { ...ConversationJson } }`

#### Scenario: 标题为空时拒绝更新
- **WHEN** 客户端发送空白或仅空白的 `title`
- **THEN** 接口返回 HTTP `400` 与 `{ "code": 400, "message": "<可读错误>", "data": null }`

#### Scenario: 更新非 owner 会话
- **WHEN** 已登录用户 PATCH 不属于其的会话 id
- **THEN** 接口返回 HTTP `404`
