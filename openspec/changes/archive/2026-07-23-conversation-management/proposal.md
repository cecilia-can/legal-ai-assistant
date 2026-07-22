## 为什么

Change 1.2 已完成聊天 UI 骨架，但首页仍使用静态 mock 会话与消息数据，用户无法真正创建、切换或删除持久化会话。Change 1.3 需要把会话列表接到 PostgreSQL，通过 API 和前端状态管理驱动 UI，为 Change 1.4 AI 流式输出和 Change 1.5 消息持久化提供会话上下文。

## 变更内容

- 实现会话 REST API：列表查询、创建、删除、标题更新。
- 引入 **Zustand**，实现 `conversationStore` 与 `useConversationStore`，负责加载、创建、切换、删除与标题更新。
- 将 `app/page.tsx` 从静态 mock 数据改为 API 驱动。
- 扩展 `ConversationList`，支持删除会话操作（含确认对话框与防重复提交）。
- 在用户发送首条本地消息时，自动将会话标题更新为消息摘要（仅更新标题，消息持久化留待 Change 1.5）。

## 能力范围

### 新增能力

- `conversation-api`: 定义会话 CRUD 相关 API 行为与错误处理。
- `conversation-state`: 定义基于 Zustand 的会话状态管理、加载态与页面集成行为。

### 修改能力

- `chat-components`: 扩展会话列表组件，支持删除会话交互与确认对话框。
- `delete-ux`: 定义删除确认、防竞态与 404 幂等客户端行为。

## 影响范围

- 影响代码：`app/api/conversations/`、`lib/stores/conversationStore.ts`、`app/page.tsx`、`components/chat/ConversationList.tsx`。
- 影响体验：侧边栏会话列表将反映数据库中的真实会话；新建/删除/切换会立即生效。
- 依赖影响：新增 npm 依赖 `zustand`；复用现有 Prisma、`lib/db.ts` 和 `types/chat.ts`。
- 系统影响：需要可用的 `DATABASE_URL`；预计不修改 Prisma schema，不新增 migration。
