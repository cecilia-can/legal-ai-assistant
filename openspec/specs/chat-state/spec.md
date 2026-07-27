## Purpose

Define the Zustand `chatStore` for in-memory messages, SSE streaming lifecycle, abort behavior, and separation from conversation list state.

## Requirements

### Requirement: chatStore 消息与流式状态
系统 SHALL 提供 `lib/stores/chatStore.ts`（Zustand），管理各会话内存消息与流式生命周期。

Store MUST 暴露至少：

- `messagesByConversation: Record<string, ChatMessage[]>`
- `streamingConversationId: string | null`
- `error: string | null`

Store MUST 暴露至少 actions：`sendMessage`、`abortStream`、`clearConversationMessages`。

UI MUST 通过 selector 订阅，不使用 Context Provider。

#### Scenario: 按会话隔离消息
- **WHEN** 用户在会话 A 与 B 分别发送消息
- **THEN** 切换会话时各自展示对应消息历史（内存中保留，刷新页面前有效）

#### Scenario: 流式生成中标记状态
- **WHEN** `sendMessage` 正在接收 SSE 流
- **THEN** `streamingConversationId` 等于当前会话 id

### Requirement: sendMessage 通过 SSE 事件更新 UI
`sendMessage(conversationId, content)` SHALL：

1. 追加 user 消息；
2. 追加空的 assistant 占位消息；
3. `fetch` POST `/api/chat`，携带该会话全部 user/assistant 历史；
4. 使用 `lib/api/sse.ts` 解析响应流；
5. 收到 `token` 事件时 append `text` 到 assistant `content`；
6. 收到 `done` 时清除 `streamingConversationId`；
7. 收到 `error` 或流开始前 HTTP 错误时设置 `error` 并清理占位消息。

#### Scenario: 打字机效果
- **WHEN** 连续收到多个 `token` 事件
- **THEN** UI 中 assistant 消息内容逐步变长

#### Scenario: 流开始前失败
- **WHEN** `/api/chat` 返回 4xx/5xx JSON envelope
- **THEN** store 设置 `error`，移除空的 assistant 占位，保留 user 消息

#### Scenario: 收到 done 事件
- **WHEN** 解析到 `{ type: "done" }`
- **THEN** `streamingConversationId` 置为 null，assistant 消息保留最终 content

### Requirement: 请求取消
系统 SHALL 使用 `AbortController` 取消进行中的 `/api/chat` 请求。

以下场景 MUST 触发 abort：

- 同一会话再次 `sendMessage`
- 切换会话（`selectConversation`）
- 新建聊天（`createConversation`）

abort 后 MUST 忽略后续 SSE 事件，不再更新 store。

#### Scenario: 切换会话取消流
- **WHEN** 会话 A 正在流式生成且用户切换到会话 B
- **THEN** 会话 A 的 fetch 被 abort，不再更新 UI

#### Scenario: 发送新消息取消上一轮
- **WHEN** 上一轮 assistant 尚未生成完且用户发送新消息
- **THEN** 上一轮流被 abort，新消息正常发起

### Requirement: 与会话 store 职责分离
`chatStore` SHALL NOT 管理会话列表或 `activeId`；该职责保留在 `conversationStore`。

#### Scenario: store 边界
- **WHEN** Change 1.5 需要加载历史消息
- **THEN** 可扩展 `chatStore` 或新增 action，而无需重构 `conversationStore`

### Requirement: 为 Agent 事件预留扩展
`chatStore` 的 SSE 解析 SHOULD 使用 `switch (event.type)` 结构，便于 Phase 4 增加 `tool_start` 等分支而无需重写传输层。

#### Scenario: 未知事件类型
- **WHEN** 收到本阶段未定义的 event type
- **THEN** 解析器忽略该事件，不导致崩溃

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
