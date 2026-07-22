## ADDED Requirements

### Requirement: 查询会话列表 API
系统 SHALL 提供 `GET /api/conversations` 接口，返回当前数据库中所有会话。

响应 MUST 为 JSON 数组，每项包含 `id`、`title`、`createdAt`、`updatedAt`；列表 MUST 按 `updatedAt` 降序排列。

#### Scenario: 成功返回会话列表
- **WHEN** 客户端请求 `GET /api/conversations` 且数据库可用
- **THEN** 接口返回 `200` 与会话数组

#### Scenario: 无会话时返回空数组
- **WHEN** 数据库中不存在任何会话
- **THEN** 接口返回 `200` 与空数组 `[]`

#### Scenario: 数据库不可用时返回错误
- **WHEN** 数据库连接失败或 Prisma 抛出错误
- **THEN** 接口返回 `500` 与可读错误信息

### Requirement: 创建会话 API
系统 SHALL 提供 `POST /api/conversations` 接口，用于创建新会话。

创建时 MUST 生成唯一 `id`；若未提供标题，MUST 使用默认标题 `新对话`。

#### Scenario: 创建默认标题会话
- **WHEN** 客户端发送 `POST /api/conversations` 且未提供标题
- **THEN** 接口返回 `201` 与新创建的会话对象，标题为 `新对话`

#### Scenario: 创建自定义标题会话
- **WHEN** 客户端发送 `POST /api/conversations` 且 body 包含合法 `title`
- **THEN** 接口返回 `201` 与对应标题的新会话

### Requirement: 删除会话 API
系统 SHALL 提供 `DELETE /api/conversations/[id]` 接口，用于删除指定会话。

删除 MUST 级联删除该会话下的消息（依赖数据库 onDelete Cascade）。

#### Scenario: 成功删除存在的会话
- **WHEN** 客户端请求删除一个存在的会话 id
- **THEN** 接口返回 `200` 或 `204`，且该会话不再出现在列表中

#### Scenario: 删除不存在的会话
- **WHEN** 客户端请求删除一个不存在的会话 id
- **THEN** 接口返回 `404` 与可读错误信息

### Requirement: 更新会话标题 API
系统 SHALL 提供 `PATCH /api/conversations/[id]` 接口，用于更新会话标题。

请求 body MUST 接受 `title` 字符串；更新成功后 MUST 刷新 `updatedAt`。

#### Scenario: 成功更新标题
- **WHEN** 客户端发送包含非空 `title` 的 PATCH 请求
- **THEN** 接口返回 `200` 与更新后的会话对象

#### Scenario: 标题为空时拒绝更新
- **WHEN** 客户端发送空白或仅空白的 `title`
- **THEN** 接口返回 `400` 与可读错误信息

#### Scenario: 更新不存在会话的标题
- **WHEN** 客户端 PATCH 一个不存在的会话 id
- **THEN** 接口返回 `404` 与可读错误信息
