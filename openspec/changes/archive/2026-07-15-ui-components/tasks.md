## 1. 主题与页面基础

- [x] 1.1 更新 `app/globals.css`，加入 background、foreground、surface、muted、border、primary 等应用主题 token。
- [x] 1.2 更新基础 body 样式，使其支持聊天应用布局。
- [x] 1.3 移除 `app/page.tsx` 中默认起始页的视觉假设。

## 2. 基础 UI 组件

- [x] 2.1 创建 `components/ui/Button.tsx`，支持 primary 和 secondary 变体。
- [x] 2.2 为按钮组件添加禁用状态和 focus-visible 状态。
- [x] 2.3 创建 `components/ui/Textarea.tsx`，支持占位提示、禁用状态和值变更处理。
- [x] 2.4 创建 `components/ui/EmptyState.tsx`，支持标题、描述和可选操作。

## 3. 布局组件

- [x] 3.1 创建 `components/layout/AppShell.tsx`，承载整体聊天外壳。
- [x] 3.2 创建 `components/layout/Sidebar.tsx`，展示产品标识、新建聊天操作和会话导航。
- [x] 3.3 创建 `components/layout/MainPanel.tsx`，承载聊天头部、消息区域和输入区域。
- [x] 3.4 确保桌面端布局中固定宽度侧栏（`md:w-80`）和主面板并排展示。
- [x] 3.5 确保移动端默认展示主聊天区，不发生水平溢出，并保持聊天输入框可访问。
- [x] 3.6 在 `MainPanel` 中为移动端提供「会话」入口，用于打开会话列表。
- [x] 3.7 在 `AppShell` 中实现移动端左侧滑出抽屉，包含遮罩层、关闭按钮和滑入/滑出过渡。
- [x] 3.8 在移动端选中会话后自动关闭抽屉，并回到对应主聊天区。
- [x] 3.9 在 `Sidebar` 中为桌面端提供「收起」入口，收起时侧栏宽度过渡为 0。
- [x] 3.10 在 `MainPanel` 中为桌面端侧栏收起状态提供「侧栏」展开入口。
- [x] 3.11 在 `app/page.tsx` 中管理 `desktopSidebarCollapsed` 状态，并串联收起/展开交互。

## 4. 聊天组件

- [x] 4.1 创建 `components/chat/ConversationList.tsx`，支持会话渲染、当前项样式和空状态。
- [x] 4.2 创建 `components/chat/MessageBubble.tsx`，支持按消息角色展示不同样式。
- [x] 4.3 创建 `components/chat/MessageList.tsx`，支持按顺序渲染消息和空状态。
- [x] 4.4 创建 `components/chat/ChatInput.tsx`，支持本地输入状态和提交回调。
- [x] 4.5 阻止空消息或仅空白字符消息提交。
- [x] 4.6 在 `ChatInput` 中支持 Enter 提交行为。

## 5. 首页集成

- [x] 5.1 在 `app/page.tsx` 中添加静态示例会话和消息。
- [x] 5.2 在首页组合 `AppShell`、`Sidebar`、`MainPanel`、`ConversationList`、`MessageList` 和 `ChatInput`。
- [x] 5.3 将默认 Next.js 起始页内容替换为法律 AI 助手聊天 UI。
- [x] 5.4 保持页面实现不包含数据库查询、API 调用和 AI 服务调用。

## 6. 验证

- [x] 6.1 运行 `npm run lint`。
- [x] 6.2 运行 `npm run build`。
- [x] 6.3 启动开发服务器，并在 `http://localhost:3000` 视觉验收桌面端双栏布局，以及侧栏收起/展开交互。
- [x] 6.4 验证移动端默认主聊天区可用，会话抽屉可打开/关闭，选中会话后自动关闭，且无水平溢出。
