## MODIFIED Requirements

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
