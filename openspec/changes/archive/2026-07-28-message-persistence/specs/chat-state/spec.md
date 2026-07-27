## ADDED Requirements

### Requirement: 加载会话历史消息
`chatStore` SHALL 提供 `loadMessages(conversationId)`（或等价 action），从消息 API 拉取历史并写入 `messagesByConversation`。

- 消息 id MUST 使用服务端返回的数据库 id。
- 加载过程中 SHOULD 暴露 loading 状态，避免重复并发加载同一会话。
- 若该会话内存中已有缓存，本阶段 MAY 跳过重复请求；删除会话后 MUST 清除缓存。

#### Scenario: 切换到已有历史的会话
- **WHEN** 用户选中一个在数据库中已有消息的会话且内存无缓存
- **THEN** store 请求消息列表并将 `items` 写入该会话的消息数组

#### Scenario: 加载失败时提示错误
- **WHEN** 消息列表 API 返回错误
- **THEN** store 设置 `error` 为可读文案，且不清空其他会话的缓存

### Requirement: 流式结束后持久化本轮消息（含 abort 半截）
`chatStore` SHALL 在本轮需要落库时，通过消息 API 持久化 user 与 assistant 消息。

触发落库的条件：

- 收到 SSE `done`，且 assistant content 非空；或
- 发生 abort（或等价取消），且 assistant content 非空（允许半截回复入库）。

规则：

- MUST 先创建 user，再创建 assistant（或等价顺序保证时间线正确）。
- 持久化成功后 MUST 用服务端 id 替换内存中的临时 id。
- 流开始前失败，或 abort 时 assistant 仍为空时，MUST NOT 写入本轮消息。

#### Scenario: 一轮对话成功后可刷新恢复
- **WHEN** 用户完成一轮流式对话（收到 `done`）并刷新页面后再次打开该会话
- **THEN** 通过 `loadMessages` 能看到该轮 user 与 assistant 消息

#### Scenario: abort 且已有内容时落库半截回复
- **WHEN** 用户在 assistant 已产生非空文本后 abort（例如切换会话）
- **THEN** 本轮 user 与当时已有的 assistant content 被写入数据库，刷新后仍可加载

#### Scenario: abort 且无 assistant 文本时不落库
- **WHEN** 用户在 assistant 仍为空（仅占位）时 abort
- **THEN** 本轮消息不被写入数据库

#### Scenario: 落库失败时保留内存并提示
- **WHEN** 触发落库后消息创建 API 失败
- **THEN** 内存中仍保留本轮消息，store 设置 `error`，不静默丢弃 UI 内容

### Requirement: 删除消息同步内存
`chatStore` SHALL 提供删除单条消息的 action：调用删除 API 成功后，从对应会话的内存列表移除该消息。

#### Scenario: 删除后列表更新
- **WHEN** 用户删除一条已持久化消息且 API 成功
- **THEN** 该消息立即从当前会话消息列表消失
