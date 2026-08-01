## 为什么

Change 1.4–1.7 已打通流式对话、持久化、Markdown 渲染与 Prompt 工程，核心功能可用，但加载与错误反馈仍停留在纯文本占位（「正在加载…」），失败时无重试入口；全局快捷键与移动端细节也未系统化。Change 1.8 在不动 API / 数据库的前提下，补齐骨架屏、可重试错误提示、键盘快捷操作与移动端体验打磨，使产品更接近 ChatGPT 等主流 Chat 的交互质量，并为 Change 1.9 登录页复用同一套 UX 组件。

## 变更内容

- 新增 **Skeleton** 骨架屏组件，替换会话列表与消息列表加载时的纯文本占位。
- 新增 **InlineError / ErrorBanner** 组件，展示错误信息并提供「重试」按钮；接入会话加载、消息加载与 AI 发送失败场景。
- 新增 **ChatErrorBoundary**，捕获聊天主区域 React 渲染错误，展示友好 fallback 与刷新入口。
- 新增 **全局键盘快捷键**（`useChatKeyboardShortcuts`）：新建会话、聚焦输入框、Esc 关闭移动端抽屉等；输入框内不拦截 Enter / Shift+Enter 既有行为。
- **强化** 消息自动滚动与「回到底部」体验（Change 1.6 已实现基础逻辑，本阶段验收并微调阈值/动画）。
- **优化** 移动端：safe-area 内边距、输入区 sticky、触控目标尺寸、流式时 header 视觉反馈。
- 新增 `docs/ux-optimization-testing.md` 手工验收清单。

## 能力范围

### 新增能力

- `ux-optimization`：键盘快捷键、React 错误边界、UX 验收文档。

### 修改能力

- `ui-foundation`：新增 Skeleton、InlineError 基础组件规范。
- `chat-components`：消息/会话加载骨架屏、带重试的错误展示、流式 header 指示。
- `chat-layout`：移动端 safe-area 与输入区布局优化。

## 影响范围

- 影响代码：`components/ui/Skeleton.tsx`、`components/ui/InlineError.tsx`（新建）、`components/chat/MessageListSkeleton.tsx`、`components/chat/ConversationListSkeleton.tsx`（或等价）、`components/chat/MessageList.tsx`、`components/layout/MainPanel.tsx`、`components/layout/AppShell.tsx`、`lib/hooks/useChatKeyboardShortcuts.ts`、`components/ChatErrorBoundary.tsx`、`app/page.tsx`、`app/globals.css`。
- 不影响：API 路由、Prisma Schema、环境变量、AI / Prompt 逻辑。
- 依赖影响：无新 npm 依赖预期。
- 明确不做：Toast 通知体系、虚拟滚动、完整快捷键帮助面板（可留后续）、用户认证（Change 1.9）、Dark/Light 主题切换 UI。
