## 0. 前置 Spike

- [x] 0.1 安装 `next-auth@5.0.0-beta.30`（或 spike 验证通过的版本）、`@auth/prisma-adapter`、`bcryptjs`、`zod`；确认与 Next.js 16 peer dependency 无冲突
- [x] 0.2 验证 `@auth/prisma-adapter` 能否配合 Prisma 7 `provider = "prisma-client"` + 自定义 output + `@prisma/adapter-pg`；记录结论；若不通过则切换自建 jose session 方案并更新 design

## 1. 数据库与 Auth 配置

- [x] 1.1 扩展 `prisma/schema.prisma`：`User`、`Account`、`Session`、`VerificationToken`；`Conversation.userId` 必填 + `@@index([userId, updatedAt])`
- [x] 1.2 运行 migration；开发环境清库（migration SQL 清空既有 Conversation/Message）
- [x] 1.3 创建 `auth.config.ts`、`auth.ts`（JWT strategy）、`app/api/auth/[...nextauth]/route.ts`
- [x] 1.4 更新 `.env.example`：`AUTH_SECRET`、`AUTH_URL` 等

## 2. DAL 与 proxy

- [x] 2.1 创建 `lib/auth/dal.ts`：`verifySession()`、`getOptionalSession()`，React `cache()` 去重
- [x] 2.2 创建根目录 `proxy.ts`：公开 `/login`、`/register`、`/api/auth/**`；未登录重定向登录页
- [x] 2.3 spike 确认 `proxy.ts` 导出写法与 Auth.js 兼容（`export default auth(...)`，build 通过）

## 3. 注册与登录 UI

- [x] 3.1 实现注册 Server Action + Zod 校验 + bcrypt 哈希
- [x] 3.2 创建 `app/(auth)/login/page.tsx`、`app/(auth)/register/page.tsx`，复用 Skeleton / InlineError
- [x] 3.3 侧栏用户菜单与登出；聊天页布局接入

## 4. Service 与 Conversation API

- [x] 4.1 改造 `messageService`：`assertConversationOwnership`；所有导出函数增加必填 `userId`
- [x] 4.2 改造 `/api/conversations` GET/POST：verifySession + userId 过滤/绑定 + `force-dynamic`
- [x] 4.3 改造 `/api/conversations/[id]` PATCH/DELETE：owner 校验，非 owner 404
- [x] 4.4 改造消息 API routes：传入 userId + 401/404 + `force-dynamic`

## 5. Chat API 与限流

- [x] 5.1 改造 `/api/chat`：新 body `{ conversationId, content? }`；DB 加载历史；归属校验
- [x] 5.2 创建 `lib/ai/rateLimit.ts`；超限 429
- [x] 5.3 改造 `chatStore.sendMessage` / `regenerate`：新 API 契约 + `credentials: "include"`

## 6. 前端 401 处理

- [x] 6.1 `conversationStore` / `chatStore`：401 → 重定向登录；500 等保留 InlineError 重试
- [x] 6.2 流式过程中 401：abort SSE + 清理 streaming 状态
- [x] 6.3 所有 store fetch 添加 `credentials: "include"`

## 7. 测试与文档

- [x] 7.1 创建 `scripts/verify-tenant-isolation.ts` 自动化越权测试
- [x] 7.2 创建 `docs/user-auth-testing.md` 手工验收清单（登录、越权、限流、401）

## 8. 验证

- [x] 8.1 运行 `npm run lint`
- [x] 8.2 运行 `npm run build`
- [x] 8.3 运行越权测试脚本
- [ ] 8.4 `npm run dev` 手工验收：注册 → 登录 → 聊天 → 登出 → 双用户隔离
