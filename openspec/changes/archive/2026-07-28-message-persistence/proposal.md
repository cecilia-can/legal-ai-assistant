## 为什么

Change 1.4 已打通 DeepSeek SSE 流式对话，但消息仅存于 `chatStore` 内存：刷新页面、重新打开会话后历史丢失。Change 1.5 需要把 user / assistant 消息写入已有 Prisma `Message` 表，并在切换会话时从数据库加载，使多轮对话真正可持久、可恢复，为 Change 1.6 渲染与 1.7 上下文管理提供稳定数据基础。

## 变更内容

- 新增消息服务层 `lib/services/messageService.ts`，封装列表、创建、删除与分页查询。
- 新增消息 API：`GET` / `POST` `/api/conversations/[id]/messages`，以及单条删除 `DELETE /api/conversations/[id]/messages/[messageId]`。
- 扩展 `chatStore`：会话切换时加载历史；流式 `done` 或 abort（assistant 已有非空内容）时持久化 user + assistant；删除会话时仍依赖级联清理。
- 为分页查询补充必要的数据库索引（Prisma migration，若当前 schema 尚无合适索引）。
- **修改** `POST /api/chat` 相关规格：撤销「本阶段不写库」约束（落库由消息 API / store 编排完成，聊天流本身仍可不直接写库）。

## 能力范围

### 新增能力

- `message-api`: 会话下消息的 REST API（列表分页、创建、删除）与统一 envelope。
- `message-service`: Prisma 消息读写服务层（排序、分页、归属校验）。

### 修改能力

- `chat-state`: `chatStore` 增加历史加载与发送后持久化编排。
- `chat-api`: 移除「服务端不持久化消息」要求（持久化改由消息 API 承担）。
- `data-persistence`: 如需，为 `Message` 增加 `(conversationId, createdAt)` 索引以支持分页。

## 影响范围

- 影响代码：`lib/services/messageService.ts`、`app/api/conversations/[id]/messages/`、`lib/stores/chatStore.ts`、`app/page.tsx`（切换会话触发加载）、`types/chat.ts`、可能的 `prisma/schema.prisma` + migration。
- 影响体验：刷新或切换会话后可恢复历史消息；流式过程仍先更新内存，`done` 或 abort（有内容）后再落库，半截回复可保留。
- 依赖影响：无新 npm 依赖；继续使用现有 PostgreSQL / Prisma。
- 系统影响：不引入用户认证；不实现 Markdown 渲染（1.6）；不实现 Token 截断（1.7）。
