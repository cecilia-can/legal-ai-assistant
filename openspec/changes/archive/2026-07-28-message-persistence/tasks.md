## 1. 数据模型与迁移

- [x] 1.1 在 `prisma/schema.prisma` 的 `Message` 上增加 `@@index([conversationId, createdAt])`。
- [x] 1.2 运行 `npx prisma migrate dev` 生成并应用 migration（无 reset）。
- [x] 1.3 运行 `npx prisma generate` 确认 Client 可用。

## 2. 消息服务层

- [x] 2.1 创建 `lib/services/messageService.ts`，实现 `listMessages`（游标分页、首屏最近 N 条升序返回）。
- [x] 2.2 实现 `createMessage`：校验会话存在、写入消息、更新会话 `updatedAt`。
- [x] 2.3 实现 `deleteMessage`：校验会话与消息归属后硬删除。
- [x] 2.4 定义可映射为 HTTP 404/400 的服务错误类型（或等价约定）。

## 3. 消息 API

- [x] 3.1 实现 `GET /api/conversations/[id]/messages`（`limit` / `cursor`，envelope）。
- [x] 3.2 实现 `POST /api/conversations/[id]/messages`（创建单条，201 + envelope）。
- [x] 3.3 实现 `DELETE /api/conversations/[id]/messages/[messageId]`（204/200 + envelope）。
- [x] 3.4 非法参数与 not-found 路径返回正确 status 与 `{ code, message, data }`。

## 4. chatStore 与页面集成

- [x] 4.1 扩展 `types/chat.ts`（如需要）以对齐 `MessageJson`。
- [x] 4.2 实现 `loadMessages` 与 loading / error 状态；选中会话且无缓存时加载。
- [x] 4.3 更新 `sendMessage`：在 `done`（assistant 非空）时持久化 user + assistant，并用服务端 id 替换临时 id。
- [x] 4.4 abort 且 assistant 非空时同样落库半截回复；abort 且 assistant 为空时不落库。
- [x] 4.5 实现 `deleteMessage` action，成功后同步内存列表。
- [x] 4.6 在 `app/page.tsx`（或等价处）接入加载逻辑；删除会话时继续 `clearConversationMessages`。

## 5. UI（最小可用）

- [x] 5.1 为消息气泡提供删除入口（或等价操作），调用 `deleteMessage`；删除中禁用重复点击。
- [x] 5.2 加载历史时展示简单 loading / 错误提示（不引入完整骨架屏体系，留给 1.8）。

## 6. 验证

- [x] 6.1 运行 `npm run lint`。
- [x] 6.2 运行 `npm run build`。
- [x] 6.3 手动验证：发送一轮 → 刷新 → 历史仍在。
- [x] 6.4 手动验证：切换会话分别加载各自历史；新建会话为空。
- [x] 6.5 手动验证：删除单条消息后列表与刷新后一致。
- [x] 6.6 手动验证：abort 且已有 assistant 文本时，刷新后仍能看到半截回复；abort 时尚无文本则刷新后无本轮消息。
- [ ] 6.7 （可选）会话消息数 > limit 时验证 cursor 加载更早消息。
