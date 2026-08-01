## ADDED Requirements

### Requirement: 全局聊天键盘快捷键
系统 SHALL 在首页聊天界面提供全局键盘快捷键，对齐 ChatGPT 网页版常用组合（`Mod` = Ctrl / Cmd）。

快捷键 MUST 在 `app/page.tsx`（或等价入口）通过专用 hook 注册，并在组件卸载时移除监听。

- `Mod+Shift+O`：新建会话，等价于点击「新建聊天」（**不使用** `Mod+N`，避免与浏览器新建标签冲突）。
- `Shift+Escape`：将焦点移至聊天输入框 textarea。
- `Escape`（无 Shift）：**仅当**移动端会话抽屉打开时关闭抽屉；MUST NOT 用于终止或删除当前会话。
- `Mod+.`：当当前会话处于流式生成时停止流式，等价于停止生成图标按钮。

#### Scenario: 快捷键新建会话
- **WHEN** 用户在首页按下 `Mod+Shift+O`
- **THEN** 系统触发新建会话流程（abort 当前流式、创建新会话、seed 空消息列表）

#### Scenario: 快捷键聚焦输入框
- **WHEN** 用户按下 `Shift+Escape`
- **THEN** 聊天输入 textarea 获得焦点

#### Scenario: Escape 关闭移动端抽屉
- **WHEN** 移动端会话抽屉处于打开状态且用户按下 Escape（未按 Shift）
- **THEN** 抽屉关闭，遮罩消失

#### Scenario: Escape 不终止会话
- **WHEN** 用户按下 Escape
- **THEN** 系统 MUST NOT 删除、结束或清空当前会话

#### Scenario: Escape 不关闭已关抽屉时的输入
- **WHEN** 移动端抽屉已关闭且用户未按 Shift+Escape
- **THEN** Escape 不触发抽屉逻辑（允许默认行为或无操作）

#### Scenario: 快捷键停止流式
- **WHEN** 当前会话正在流式生成且用户按下 `Mod+.`
- **THEN** 当前 SSE 流被取消，流式状态结束

#### Scenario: 非流式时 Mod+. 无操作
- **WHEN** 当前会话未在流式生成
- **THEN** `Mod+.` 不触发停止逻辑

### Requirement: 聊天区域 React 错误边界
系统 SHALL 提供客户端 React Error Boundary，防止聊天主区域单次渲染异常导致整页白屏。

Error Boundary MUST 包裹主聊天区的消息列表与输入区域（或等价 main 内容）。

#### Scenario: 捕获子树渲染错误
- **WHEN** 消息列表或输入区子组件在 render 阶段抛出未捕获错误
- **THEN** Error Boundary 展示友好 fallback UI，而非空白页

#### Scenario: Fallback 提供恢复入口
- **WHEN** Error Boundary 处于错误状态
- **THEN** 用户可见简短错误说明与「刷新页面」操作，点击后重新加载页面

#### Scenario: 开发环境记录错误
- **WHEN** 在 development 模式下发生捕获错误
- **THEN** 错误信息输出到 console 以便调试

### Requirement: UX 验收文档
系统 SHALL 提供 Change 1.8 的手工验收清单文档。

文档 MUST 覆盖：骨架屏、错误重试、快捷键、移动端布局、流式指示、Error Boundary 触发方式（可选 dev 说明）。

#### Scenario: 文档可被测试人员使用
- **WHEN** 测试人员打开验收文档
- **THEN** 可按清单逐项在 dev 环境验证 UX 行为
