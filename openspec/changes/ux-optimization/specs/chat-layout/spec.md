## ADDED Requirements

### Requirement: 移动端 Safe Area 适配
聊天布局 SHALL 在移动端视口考虑设备 safe area，避免内容与 Home Indicator 重叠。

主聊天区 footer（输入区域）MUST 使用 `env(safe-area-inset-bottom)`（或 Tailwind 等价）增加底部内边距。

#### Scenario: iOS 底部安全区
- **WHEN** 视口为移动端且设备存在 bottom safe area
- **THEN** 聊天输入区底部留有额外 padding，输入框不被 Home Indicator 遮挡

### Requirement: 移动端输入字号与触控目标
移动端聊天界面 SHALL 优化输入与关键操作的触控体验。

聊天输入 textarea 在移动端 MUST 使用至少 `16px` 字号（或 `text-base`），以减少 iOS 聚焦时自动缩放。

移动端关键 IconButton（打开侧栏、回到底部等）SHOULD 满足最小约 44×44px 触控目标。

#### Scenario: 移动端输入聚焦不缩放
- **WHEN** 用户在 iOS Safari 聚焦聊天 textarea
- **THEN** 页面不发生非预期的整体 zoom

#### Scenario: 侧栏按钮触控区域
- **WHEN** 用户在移动端点击「打开会话列表」按钮
- **THEN** 可点击区域足够大，易于单指操作

### Requirement: 输入区固定于主面板底部
主聊天布局 MUST 保持输入区域固定在主面板底部，消息列表在中间可滚动区域扩展。

#### Scenario: 长消息列表时输入可达
- **WHEN** 消息数量超过视口高度
- **THEN** 消息列表内部滚动，footer 输入区始终固定在主面板底部可见
