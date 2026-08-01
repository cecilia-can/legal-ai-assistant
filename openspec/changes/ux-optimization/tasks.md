## 1. UI 基础组件

- [x] 1.1 创建 `components/ui/Skeleton.tsx`：脉冲动画、muted 色系、可 `className` 定制。
- [x] 1.2 创建 `components/ui/InlineError.tsx`：`role="alert"`、message、`onRetry`、`retrying` 支持。

## 2. 骨架屏列表

- [x] 2.1 创建 `components/chat/ConversationListSkeleton.tsx`（3–5 条会话形占位）。
- [x] 2.2 创建 `components/chat/MessageListSkeleton.tsx`（2–3 组左右交替气泡占位）。
- [x] 2.3 改造 `app/page.tsx` 侧栏：loading 时展示 ConversationListSkeleton。
- [x] 2.4 改造 `MessageList`：loading 且无消息时展示 MessageListSkeleton。

## 3. 错误与重试

- [x] 3.1 侧栏：用 InlineError 替换纯文本 error，重试绑定 `fetchConversations()`。
- [x] 3.2 消息区：加载失败用 InlineError + `loadMessages(activeId)` 重试。
- [x] 3.3 主聊天区：AI / 聊天 error 可见 InlineError，支持 dismiss（`clearChatError`）与合适重试。
- [x] 3.4 确认重试时清除 store error 并设置 loading 状态。

## 4. Error Boundary

- [x] 4.1 创建 `components/ChatErrorBoundary.tsx`（客户端）：fallback UI + 刷新按钮。
- [x] 4.2 在 `app/page.tsx` 包裹 MainPanel 的 messages + input（或 main 整体）。

## 5. 键盘快捷键

- [x] 5.1 创建 `lib/hooks/useChatKeyboardShortcuts.ts`：`Mod+Shift+O` 新建、`Shift+Esc` 聚焦、`Escape` 关抽屉、`Mod+.` 停止。
- [x] 5.2 在 `app/page.tsx` 接入 hook，传入 newChat / focusInput / closeDrawer / stopStream handlers。
- [x] 5.3 为 ChatInput textarea 添加 `ref` 或 `id` 供 focus 使用。
- [x] 5.4 更新 ChatInput hint 文案，列出常用快捷键（对齐 ChatGPT）。

## 6. 流式与移动端

- [x] 6.1 `MainPanel`：流式时在 header 展示 pulse 指示 + 保留 subtitle 文案。
- [x] 6.2 `app/globals.css` 或 layout：safe-area 变量 / body padding。
- [x] 6.3 `MainPanel` footer：bottom safe-area padding。
- [x] 6.4 移动端 textarea `text-base`；关键 IconButton min 44px。
- [x] 6.5 验收 MessageList stick-to-bottom 与「回到底部」无回归（无需改算法除非发现 bug）。

## 6b. 新建空会话与输入图标（ChatGPT 对齐）

- [x] 6b.1 `chatStore.seedEmptyConversation` + `createConversation` 内同步 seed，新建会话不展示 MessageListSkeleton。
- [x] 6b.2 `ChatInput`：发送改为圆形 ArrowUp 图标；停止改为外圆内 Square 图标。

## 7. 文档

- [x] 7.1 创建 `docs/ux-optimization-testing.md`：骨架屏、错误重试、快捷键、移动端、流式指示、Error Boundary 验收项。

## 8. 验证

- [x] 8.1 运行 `npm run lint`。
- [x] 8.2 运行 `npm run build`。
- [ ] 8.3 `npm run dev` 视觉验收：桌面 loading skeleton、错误重试、快捷键、流式 header。
- [ ] 8.4 移动端视口（DevTools）：safe-area、输入可达、抽屉 Esc 关闭。
- [ ] 8.5 按 `docs/ux-optimization-testing.md` 完成手工抽检。
