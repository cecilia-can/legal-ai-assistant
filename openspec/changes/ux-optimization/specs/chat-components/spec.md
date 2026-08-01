## ADDED Requirements

### Requirement: 消息列表加载骨架屏
`MessageList`（或等价）在**切换至尚未缓存历史的已有会话**且正在加载时，SHALL 展示消息列表骨架屏。

**新建空会话**（服务端刚创建、本地已 seed 空消息列表）MUST **不**展示 MessageListSkeleton，直接展示 EmptyState。

骨架屏 SHOULD 模拟 user / assistant 气泡的左右交替布局，至少 2 组占位。

#### Scenario: 切换未缓存会话时加载历史
- **WHEN** 用户切换到本地尚无缓存的已有会话，且 `loadMessages` 进行中
- **THEN** 展示 MessageListSkeleton，直至历史加载完成或失败

#### Scenario: 新建空会话无骨架
- **WHEN** 用户新建会话且该会话已 seed 为空消息列表
- **THEN** 直接展示 EmptyState（「开始对话」），不展示 MessageListSkeleton

#### Scenario: 加载完成
- **WHEN** 加载结束且存在消息
- **THEN** 骨架屏消失，展示真实消息列表

#### Scenario: 加载失败
- **WHEN** 加载失败且 `messages.length === 0` 且无 seed 跳过逻辑
- **THEN** 展示 InlineError 与重试入口，而非骨架屏

### Requirement: 会话列表加载骨架屏
首页侧栏在会话列表加载中时 SHALL 展示会话列表骨架屏，而非纯文本「正在加载会话…」。

#### Scenario: 会话列表加载中
- **WHEN** `conversationStore.isLoading` 为 true
- **THEN** 侧栏会话区域展示 ConversationListSkeleton（3–5 条占位）

#### Scenario: 会话加载完成
- **WHEN** 加载结束
- **THEN** 展示真实 ConversationList 或空状态

### Requirement: 消息与聊天错误可重试
当消息加载或 AI 发送失败时，系统 SHALL 向用户提供可理解的错误信息与重试路径。

- 消息历史加载失败：MUST 在消息区域展示 InlineError，`onRetry` 重新调用 `loadMessages(activeId)`。
- AI 发送失败：`chatStore.error` 非空时，MUST 在主聊天区可见位置展示 InlineError；用户可通过「重试」清除错误并重新加载消息，或继续输入发送（与 store 行为一致）。
- 会话列表加载失败：侧栏 MUST 使用 InlineError，`onRetry` 调用 `fetchConversations()`。

#### Scenario: 消息加载失败重试
- **WHEN** 消息 API 加载失败且当前会话无缓存消息
- **THEN** 消息区展示错误与「重试」；点击重试后再次请求消息列表

#### Scenario: 会话列表失败重试
- **WHEN** 会话列表 API 失败
- **THEN** 侧栏展示 InlineError；点击重试后再次 fetch 会话

#### Scenario: AI 发送失败提示
- **WHEN** 流式或发送过程失败且 store 设置 error
- **THEN** 用户在主聊天区可见该错误（banner 或消息区顶部），且可 dismiss 或重试

### Requirement: 流式生成 header 指示
主聊天区 header SHALL 在当前会话流式生成时提供轻量视觉指示。

指示 MUST 与 subtitle 文案「AI 正在回复…」（或等价）同时存在或集成展示。

#### Scenario: 流式时显示指示
- **WHEN** 当前会话 `isStreaming` 为 true
- **THEN** header 区域展示 pulse 动画指示（如圆点）及流式文案

#### Scenario: 非流式时隐藏指示
- **WHEN** 流式结束
- **THEN** pulse 指示消失，subtitle 恢复非流式文案

### Requirement: 聊天输入图标主操作
`ChatInput` 的主操作 MUST 使用图标按钮（对齐 ChatGPT 等主流 Chat 产品），并提供可访问标签。

- **发送**：输入非空且非「停止」态时，MUST 展示圆形 **向上箭头**（`ArrowUp` 或等价）按钮；disabled 时不可提交。
- **停止生成**：流式进行中且输入为空时，MUST 展示 **外圆内实心方块** 停止图标按钮，等价于「停止生成」。
- 按钮 MUST 提供 `aria-label`（如「发送」「停止生成」），不可仅依赖图标。

#### Scenario: 发送图标
- **WHEN** 输入框有非空内容且未处于停止态
- **THEN** 展示圆形向上箭头发送按钮，点击或 Enter 提交消息

#### Scenario: 停止图标
- **WHEN** 当前会话流式生成且输入框为空
- **THEN** 展示外圆内方块停止按钮，点击等价于 abort 流式

#### Scenario: 流式中有输入显示发送
- **WHEN** 流式进行中且用户已输入非空内容
- **THEN** 展示发送箭头（非停止方块），发送将 abort 并追问
