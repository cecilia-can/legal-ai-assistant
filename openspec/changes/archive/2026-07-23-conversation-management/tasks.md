## 1. 会话 API

- [x] 1.1 创建 `app/api/conversations/route.ts`，实现 `GET` 列表（按 `updatedAt` 降序）与 `POST` 创建。
- [x] 1.2 创建 `app/api/conversations/[id]/route.ts`，实现 `DELETE` 删除与 `PATCH` 标题更新。
- [x] 1.3 为 API 添加基础错误处理（404、400、500）与 JSON 响应格式。
- [x] 1.4 确保 API 使用 `lib/db.ts` 的 Prisma Client，不引入新 migration。

## 2. 会话状态管理（Zustand）

- [x] 2.1 安装 `zustand` 依赖。
- [x] 2.2 创建 `lib/stores/conversationStore.ts`，定义 state 与 actions（fetch、create、select、delete、updateTitle）。
- [x] 2.3 在 store action 中处理 ISO 日期字符串与 `Date` 类型转换。
- [x] 2.4 删除当前会话时，自动切换到剩余第一项或清空选中态。
- [x] 2.5 UI 通过 `useConversationStore` selector 订阅，不使用 Context Provider。

## 3. UI 集成

- [x] 3.1 扩展 `ConversationList`，增加删除按钮与 `onDelete` prop。
- [x] 3.2 重构 `app/page.tsx`：移除静态 mock 会话，接入 `useConversationStore`。
- [x] 3.3 在页面挂载时调用 `fetchConversations` 初始化数据。
- [x] 3.4 新建聊天、切换会话、删除会话与现有布局/抽屉交互保持兼容。
- [x] 3.5 首条本地消息发送时，对默认标题会话自动 PATCH 更新标题。
- [x] 3.6 加载中与错误态在 UI 中有基础反馈（如 loading / error 提示）。

## 5. 删除体验优化

- [x] 5.1 新建 `components/ui/ConfirmDialog.tsx`，删除前弹出确认对话框。
- [x] 5.2 `app/page.tsx` 接入确认流程：取消不请求 API，确认后删除并清理本地消息。
- [x] 5.3 `conversationStore` 增加 `deletingId`、防重复 delete、404 幂等处理。
- [x] 5.4 删除进行中禁用列表删除按钮与确认按钮。
- [x] 5.5 更新 OpenSpec（`chat-components`、`conversation-state`、`design.md`）。

## 4. 验证

- [x] 4.1 运行 `npm run lint`。
- [x] 4.2 运行 `npm run build`。
- [x] 4.3 启动 dev server，验证创建/切换/删除会话与标题自动更新。
- [x] 4.4 验证空列表、删除当前会话、API 错误时 UI 不崩溃。
