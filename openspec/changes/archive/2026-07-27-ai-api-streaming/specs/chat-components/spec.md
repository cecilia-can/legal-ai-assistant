## MODIFIED Requirements

### Requirement: 首页接入 AI 流式对话
系统 SHALL 在 `app/page.tsx` 使用 `chatStore` 驱动消息列表与发送逻辑，替换本地 `messagesByConversation` useState。

发送消息 MUST 触发 AI 流式回复；`MainPanel` subtitle MUST 不再显示「静态演示」类文案。

#### Scenario: 用户收到 AI 回复
- **WHEN** 用户在有效会话中发送消息且 AI 配置正确
- **THEN** 消息列表出现 user 消息与流式增长的 assistant 回复

#### Scenario: 无选中会话时不可发送
- **WHEN** `activeId` 为空
- **THEN** 输入框保持禁用（与 1.3 行为一致）

### Requirement: 流式进行中的输入禁用
`ChatInput` SHALL 在当前会话处于流式生成时禁用发送（`disabled` 或等效逻辑）。

#### Scenario: 生成中禁止重复发送
- **WHEN** `streamingConversationId === activeId`
- **THEN** 输入框 disabled，避免并发流式请求

### Requirement: 消息列表智能自动滚动
`MessageList` SHALL 采用与 ChatGPT 类似的滚动策略：仅在用户位于列表底部附近时自动跟随新内容；否则不强制滚动，并显示「回到底部」按钮。

- 底部附近判定：滚动容器 `scrollHeight - scrollTop - clientHeight ≤ 80px`（可配置常量）。
- 用户发送消息时 MUST 强制滚到底部并恢复「跟随底部」状态。
- 切换会话时 MUST 滚到底部并重置跟随状态（`MessageList` 以 `activeId` 为 `key`  remount）。
- 流式生成中：若处于底部附近，使用 `behavior: "auto"` 即时跟随 token；非流式新消息使用 `smooth`。
- 「回到底部」按钮 MUST 在用户不在底部附近且有消息时显示；点击后 smooth 滚到底部并恢复跟随。

#### Scenario: 在底部附近时流式跟随
- **WHEN** 用户视口距底部 ≤ 80px 且 assistant 消息流式增长
- **THEN** 列表自动滚到底部，不显示「回到底部」按钮

#### Scenario: 向上阅读时不打断
- **WHEN** 用户向上滚动离开底部附近，且流式 token 继续到达
- **THEN** 视口位置保持不变，显示「回到底部」按钮

#### Scenario: 点击回到底部
- **WHEN** 用户点击「回到底部」
- **THEN** 列表 smooth 滚到底部，按钮隐藏，后续流式 token 恢复自动跟随

#### Scenario: 发送消息后强制到底
- **WHEN** 用户发送一条新消息
- **THEN** 列表滚到底部并恢复跟随，即使发送前用户曾向上滚动

### Requirement: 删除会话清理本地消息
删除会话时，`app/page.tsx` MUST 调用 `chatStore.clearConversationMessages(id)` 清理内存消息。

#### Scenario: 删除会话后消息消失
- **WHEN** 用户确认删除某会话
- **THEN** 该会话在 `messagesByConversation` 中的条目被移除
