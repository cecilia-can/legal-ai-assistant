## MODIFIED Requirements

### Requirement: 会话 Zustand Store
系统 SHALL 提供基于 Zustand 的 `conversationStore`（`lib/stores/conversationStore.ts`），用于管理会话列表、当前选中会话、加载态与错误态。

Store MUST 暴露至少以下 state：`conversations`、`activeId`、`isLoading`、`deletingId`、`error`。

Store MUST 暴露至少以下 actions：`fetchConversations`、`createConversation`、`selectConversation`、`deleteConversation`、`updateConversationTitle`。

UI MUST 通过 `useConversationStore` selector 订阅所需字段，而不是使用 React Context Provider。

Store MUST 从 API 响应 envelope 的 `data` 字段读取业务数据，从 `message` 字段读取失败文案；MUST NOT 再依赖 `{ error: "..." }` 或直出 JSON 数组/对象格式。

#### Scenario: 初始化加载会话列表
- **WHEN** 首页 Client Component 挂载且调用 `fetchConversations`
- **THEN** store 请求 `GET /api/conversations`，从响应 envelope 的 `data` 数组填充 `conversations`

#### Scenario: 加载失败时暴露错误
- **WHEN** 初始化请求失败（HTTP 非 2xx 或 envelope `code !== 0`）
- **THEN** store 从 envelope 的 `message` 设置 `error` 且 `isLoading` 结束

#### Scenario: 创建会话后更新列表
- **WHEN** 调用 `createConversation`
- **THEN** store 调用 POST API，从 envelope 的 `data` 取得新会话并设为 `activeId`

#### Scenario: 删除当前会话后切换选中项
- **WHEN** 删除的是当前 `activeId` 对应会话
- **THEN** store 自动选中剩余列表中的第一项，或在列表为空时清空 `activeId`

#### Scenario: 删除进行中防重复提交
- **WHEN** 对同一会话 id 的 DELETE 已在进行中（`deletingId` 已设置）
- **THEN** 再次调用 `deleteConversation` MUST 被忽略，不发起第二个 DELETE 请求

#### Scenario: 重复删除 404 不误导用户
- **WHEN** DELETE 返回 HTTP `404` 且 envelope 为 `{ "code": 404, "message": "会话不存在。", "data": null }`
- **THEN** store MUST 从本地列表移除该会话（若仍存在），且 MUST NOT 将 `message` 展示为错误态

#### Scenario: Selector 精确订阅
- **WHEN** UI 组件仅订阅 `activeId` 或 `conversations`
- **THEN** 其他 state 变更不应导致该组件不必要的重渲染（通过 Zustand selector 实现）
