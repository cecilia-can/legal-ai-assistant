## 为什么

Change 1.4–1.8 已打通流式对话、持久化、Markdown 渲染、Prompt 工程与 UX 优化，但系统仍是单租户 MVP：所有会话共享同一数据库空间，API 无鉴权，任意客户端可读写任意 `conversationId`。Change 1.9 引入用户体系与数据隔离，是 Phase 2（法律知识库 / RAG）的强制前置——文档、向量与案件数据必须先有归属主体。

## 变更内容

- 安装 **Auth.js v5**（JWT session），配置 Credentials 邮箱密码登录；OAuth 拆至 Change 1.9.1。
- 扩展 Prisma Schema：新增 Auth.js 标准 `User` / `Account` / `Session` / `VerificationToken` 表；`Conversation` 增加 `userId` 外键。
- 建立 **DAL**（`lib/auth/dal.ts`）与 **service 层归属校验**（`assertConversationOwnership`）。
- 改造所有会话 / 消息 API 与 **`/api/chat`**：按 `session.user.id` 隔离；聊天历史改由服务端从数据库读取。
- 新增 **`proxy.ts`** 乐观重定向、登录 / 注册页、侧栏用户菜单、前端 401 统一处理。
- 新增 **per-user 速率限制** 与 **自动化越权测试脚本**。
- 存量数据 **清库重建**（无真实用户数据）。

## 能力范围

### 新增能力

- `user-auth`：Auth.js 配置、DAL、proxy、登录注册 UI、限流、越权测试。

### 修改能力

- `data-persistence`：`User` 模型与 `Conversation.userId`。
- `conversation-api`：鉴权过滤与动态渲染。
- `message-api`：鉴权过滤。
- `message-service`：归属校验强制 `userId`。
- `chat-api`：服务端取历史、归属校验、限流。
- `conversation-state` / `chat-state`：401 处理与 `/api/chat` 请求体变更。

## 影响范围

- 影响代码：`auth.ts`、`auth.config.ts`、`app/api/auth/[...nextauth]/route.ts`、`lib/auth/dal.ts`、`proxy.ts`、`prisma/schema.prisma`、`lib/services/messageService.ts`、`app/api/**`、`lib/stores/*`、`app/(auth)/**`、`components/layout/**`、`lib/ai/rateLimit.ts`、`scripts/verify-tenant-isolation.ts`、`.env.example`。
- 新 npm 依赖：`next-auth`、`@auth/prisma-adapter`、`bcryptjs`（或 `argon2`）、`zod`。
- 新环境变量：`AUTH_SECRET`、`AUTH_URL`（或 `NEXTAUTH_*` 等价项）。
- 数据库：新 migration + **清库**（开发环境）。
- 明确不做：OAuth（Change 1.9.1）、组织 / RBAC、邮箱验证、密码重置、MFA、database session 策略。
