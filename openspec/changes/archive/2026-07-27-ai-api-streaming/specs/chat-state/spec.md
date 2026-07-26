## ADDED Requirements

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
