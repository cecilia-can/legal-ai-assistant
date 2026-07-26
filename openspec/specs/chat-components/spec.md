## Purpose

Define chat UI components for conversation lists, message lists, message bubbles, and chat input behavior.

## Requirements

### Requirement: 会话列表组件
系统 SHALL 提供用于展示聊天会话的会话列表组件。

该组件 MUST 接收会话类数据，并在提供当前会话时高亮对应会话。组件 MUST 支持删除单个会话的操作入口。

#### Scenario: 渲染会话项
- **WHEN** 组件接收到一个或多个会话
- **THEN** 它在列表中展示每个会话标题

#### Scenario: 高亮当前会话
- **WHEN** 提供当前会话 id
- **THEN** 匹配的会话项在视觉上区别于非当前会话项

#### Scenario: 渲染会话空状态
- **WHEN** 组件接收到空会话列表
- **THEN** 它展示有帮助的空状态提示

#### Scenario: 触发删除会话
- **WHEN** 用户点击某个会话项上的删除操作
- **THEN** 组件调用 `onDelete` 并传入该会话 id，且不触发会话切换

#### Scenario: 删除前需用户确认
- **WHEN** 用户点击删除操作
- **THEN** 系统 MUST 展示确认对话框，说明该会话将被永久删除；在用户确认前 MUST NOT 调用 DELETE API

#### Scenario: 用户取消删除
- **WHEN** 用户在确认对话框中点击取消、关闭或按 Esc
- **THEN** 对话框关闭，会话保留，且不发起 DELETE 请求

#### Scenario: 删除进行中禁用重复操作
- **WHEN** 用户已确认删除且 DELETE 请求进行中
- **THEN** 确认按钮 MUST 显示进行中状态并 disabled；列表删除按钮 SHOULD disabled，避免重复提交

### Requirement: 消息列表组件
系统 SHALL 提供用于按顺序展示聊天消息的消息列表组件。

该组件 MUST 以可区分的展示方式渲染 user、assistant 和 system 消息。

#### Scenario: 按顺序渲染消息
- **WHEN** 组件接收到消息列表
- **THEN** 它按照传入顺序展示消息

#### Scenario: 区分用户与助手消息
- **WHEN** 消息同时包含 user 和 assistant 角色
- **THEN** 用户消息与助手消息具有不同的对齐方式或样式

#### Scenario: 渲染消息空状态
- **WHEN** 消息列表为空
- **THEN** 组件展示提示或空状态，引导用户开始对话

### Requirement: 消息气泡组件
系统 SHALL 提供可复用的消息气泡组件。

该组件 MUST 展示消息内容，并根据角色使用对应样式。

#### Scenario: 渲染消息内容
- **WHEN** 消息气泡接收到文本内容
- **THEN** 它展示消息内容，且不截断正常长度文本

#### Scenario: 保留消息换行
- **WHEN** 消息内容包含换行
- **THEN** 渲染后的气泡保留可读的换行分隔

### Requirement: 聊天输入组件
系统 SHALL 提供用于编写消息的聊天输入组件。

该组件 MUST 支持文本输入、提交、占位提示和禁用状态。

#### Scenario: 提交非空消息
- **WHEN** 用户输入非空文本并提交
- **THEN** 组件使用去除首尾空白后的消息内容调用提交处理函数

#### Scenario: 阻止空消息提交
- **WHEN** 输入为空或仅包含空白字符
- **THEN** 组件不调用提交处理函数

#### Scenario: 输入禁用状态
- **WHEN** 组件处于禁用状态
- **THEN** 文本提交控件在视觉上禁用，且不能提交

#### Scenario: 键盘提交行为
- **WHEN** 用户按下 Enter 且没有请求换行
- **THEN** 如果当前消息有效，组件提交当前消息

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
