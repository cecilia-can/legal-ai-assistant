## ADDED Requirements

### Requirement: 会话 Zustand Store
系统 SHALL 提供基于 Zustand 的 `conversationStore`（`lib/stores/conversationStore.ts`），用于管理会话列表、当前选中会话、加载态与错误态。

Store MUST 暴露至少以下 state：`conversations`、`activeId`、`isLoading`、`deletingId`、`error`。

Store MUST 暴露至少以下 actions：`fetchConversations`、`createConversation`、`selectConversation`、`deleteConversation`、`updateConversationTitle`。

UI MUST 通过 `useConversationStore` selector 订阅所需字段，而不是使用 React Context Provider。

#### Scenario: 初始化加载会话列表
- **WHEN** 首页 Client Component 挂载且调用 `fetchConversations`
- **THEN** store 请求 `GET /api/conversations` 并填充 `conversations`

#### Scenario: 加载失败时暴露错误
- **WHEN** 初始化请求失败
- **THEN** store 设置 `error` 且 `isLoading` 结束

#### Scenario: 创建会话后更新列表
- **WHEN** 调用 `createConversation`
- **THEN** store 调用 POST API，并将新会话设为 `activeId`

#### Scenario: 删除当前会话后切换选中项
- **WHEN** 删除的是当前 `activeId` 对应会话
- **THEN** store 自动选中剩余列表中的第一项，或在列表为空时清空 `activeId`

#### Scenario: 删除进行中防重复提交
- **WHEN** 对同一会话 id 的 DELETE 已在进行中（`deletingId` 已设置）
- **THEN** 再次调用 `deleteConversation` MUST 被忽略，不发起第二个 DELETE 请求

#### Scenario: 重复删除 404 不误导用户
- **WHEN** DELETE 返回 `404`（会话在服务端已不存在）
- **THEN** store MUST 从本地列表移除该会话（若仍存在），且 MUST NOT 将「会话不存在。」展示为错误态

#### Scenario: Selector 精确订阅
- **WHEN** UI 组件仅订阅 `activeId` 或 `conversations`
- **THEN** 其他 state 变更不应导致该组件不必要的重渲染（通过 Zustand selector 实现）

### Requirement: 首页接入真实会话数据
系统 SHALL 在 `app/page.tsx` 使用 `useConversationStore` 驱动会话列表与当前会话，而不是静态 mock 会话数组。

#### Scenario: 页面展示数据库会话
- **WHEN** 用户打开首页且存在持久化会话
- **THEN** 侧边栏展示来自 API 的会话列表

#### Scenario: 新建聊天调用 API
- **WHEN** 用户点击「新建聊天」
- **THEN** 系统通过 store action 创建新会话并切换为当前会话

### Requirement: 首条消息触发标题自动生成
系统 SHALL 在用户发送首条本地消息时，若当前会话标题仍为默认值（`新对话` 或 `New Chat`），自动调用 `updateConversationTitle` 更新标题为消息内容摘要（去除首尾空白后截断，例如前 20 字符）。

#### Scenario: 默认标题会话收到首条消息
- **WHEN** 用户在标题为默认值的会话中发送首条非空消息
- **THEN** store 调用 PATCH 更新会话标题，且侧边栏展示新标题

#### Scenario: 已有自定义标题时不覆盖
- **WHEN** 会话标题已不是默认值
- **THEN** 发送消息不会自动修改标题

### Requirement: 为后续 Phase 预留 store 扩展
系统 SHALL 将会话状态隔离在 `conversationStore` 中，不与会话消息、流式输出状态混放。

#### Scenario: store 职责边界清晰
- **WHEN** Change 1.4 需要新增聊天/流式状态
- **THEN** 可在 `lib/stores/` 下新增独立 store（如 `chatStore`），而无需重构 `conversationStore`
