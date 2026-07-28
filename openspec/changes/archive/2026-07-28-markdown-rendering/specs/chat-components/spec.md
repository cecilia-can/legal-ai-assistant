## MODIFIED Requirements

### Requirement: 消息气泡组件
系统 SHALL 提供可复用的消息气泡组件。

该组件 MUST 展示消息内容，并根据角色使用对应样式。

- assistant 消息的正文：默认 MUST 通过 `MessageContent`（或等价 Markdown 渲染组件）展示。
- 当 `useMarkdown=false`（或等价 prop）时，assistant 正文 MUST 以纯文本展示（`whitespace-pre-wrap`），用于流式进行中的最后一条 assistant。
- `MessageBubble` MUST 使用 `React.memo`（或等价），仅在 `message` 内容、`useMarkdown`、删除状态等相关 props 变化时重渲染。
- user 与 system 消息 MUST 继续使用纯文本展示，并保留换行（`whitespace-pre-wrap` 或等价行为）。
- assistant 与 user 消息气泡内部最下方 MUST 均提供复制整条消息的图标按钮（assistant 复制 Markdown 源码，user 复制纯文本原文）。
- 气泡头部（角色标签、删除按钮）行为 MUST 与 Change 1.5 保持一致。

#### Scenario: 渲染 assistant Markdown
- **WHEN** 消息角色为 assistant、`useMarkdown` 为 true（或未设且非流式最后一条），且内容含 Markdown 语法（如列表或代码块）
- **THEN** 气泡内展示格式化后的 Markdown，而非原始 Markdown 源文本

#### Scenario: 渲染 user 纯文本
- **WHEN** 消息角色为 user 且内容含 `*` 或 `` ` `` 等 Markdown 特殊字符
- **THEN** 以字面文本展示，不解析为 Markdown

#### Scenario: 渲染消息内容
- **WHEN** 消息气泡接收到文本内容
- **THEN** 它展示消息内容，且不截断正常长度文本

#### Scenario: 保留消息换行
- **WHEN** user 或 system 消息内容包含换行
- **THEN** 渲染后的气泡保留可读的换行分隔

#### Scenario: assistant 流式进行中纯文本
- **WHEN** 会话处于流式状态，该条为最后一条 assistant，且 `content` 在流式过程中持续增长
- **THEN** 气泡内以纯文本（保留换行）展示 content 更新，不解析 Markdown；删除按钮等 chrome 仍可用（受既有 streaming 禁用规则约束）

#### Scenario: assistant 流式结束后 Markdown
- **WHEN** 流式结束且该 assistant 消息 `content` 含 Markdown 语法
- **THEN** 气泡内展示格式化后的 Markdown（允许相对流式纯文本阶段的短暂格式化变化）

#### Scenario: 历史 assistant 不因流式 chunk 重渲染
- **WHEN** 流式进行中，其他已完成的 assistant 历史消息 content 未变
- **THEN** 这些气泡 MUST NOT 因最后一条 assistant 的 chunk 更新而重新执行 render 路径中的 Markdown 解析

#### Scenario: 复制整条 assistant 消息
- **WHEN** 用户点击 assistant 气泡内部下方的复制图标
- **THEN** 剪贴板获得该消息的 Markdown 原文，且按钮短暂显示成功反馈

#### Scenario: 复制整条 user 消息
- **WHEN** 用户点击 user 气泡内部下方的复制图标
- **THEN** 剪贴板获得该消息的纯文本原文，且按钮短暂显示成功反馈

#### Scenario: system 消息无复制按钮
- **WHEN** 消息角色为 system
- **THEN** 气泡内部不展示复制控件

### Requirement: 流式进行中的停止与追问
`ChatInput` SHALL 在当前会话流式生成时支持「停止生成」与「立刻追问」，对齐主流 Chat 产品（如 ChatGPT）交互。

- 流式进行中：**输入框 MUST 保持可编辑**（不因流式而整体 disabled）。
- 流式进行中且输入为空：主操作 MUST 展示 **「停止生成」**，点击 MUST 调用 `abortStream`（或等价）停止当前 SSE。
- 流式进行中且输入非空：主操作 MUST 为 **「发送」**；发送 MUST 先 abort 当前流式请求再发起新一轮（`sendMessage` 内聚）。
- 停止后：若 assistant 已有非空 content，MUST 按方案 B 持久化半截回复；用户 MUST 可立即输入并发送下一条。

#### Scenario: 点击停止生成
- **WHEN** 当前会话处于流式状态且输入框为空，用户点击「停止生成」
- **THEN** 流式请求被取消，`streamingConversationId` 清空，输入框保持可用

#### Scenario: 流式中发送新问题
- **WHEN** 当前会话处于流式状态且用户输入非空内容并发送
- **THEN** 当前流式被取消，新 user 消息与 assistant 占位出现，并发起新的流式回复

#### Scenario: 停止后可立刻追问
- **WHEN** 用户停止生成或流式自然结束
- **THEN** 输入框无需刷新即可继续输入并发送下一条消息
