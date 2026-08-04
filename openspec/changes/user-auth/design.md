## 背景

当前状态：

- **数据模型**：`Conversation` / `Message` 无 `userId`；`GET /api/conversations` 返回全库会话。
- **API 鉴权**：所有 Route Handler 无 session 校验；知道 `conversationId` 即可读写。
- **`/api/chat`**：历史由客户端 `messages` 数组提供，服务端不校验归属，存在伪造历史与 token 滥用风险。
- **messageService**：`assertConversationExists` 仅检查 id 存在，不检查用户归属。
- **前端**：Zustand store 直接 `fetch` API，401 与 500 均展示为红字 error。

本 Change 在不动 AI Prompt 核心逻辑的前提下，补齐认证、授权与租户隔离。

## 目标 / 非目标

**目标：**

- 邮箱密码注册 / 登录 / 登出，JWT session。
- 会话与消息按 `userId` 隔离；越权返回 404（防枚举）。
- `/api/chat` 服务端读取真实历史；客户端只传本轮 user 内容。
- DAL + service 层双重校验；`proxy.ts` 仅乐观重定向。
- per-user 限流；自动化越权测试脚本。
- 登录页复用 Change 1.8 的 `Skeleton` / `InlineError`。

**非目标：**

- OAuth（Change 1.9.1）。
- database session 策略（Credentials 不兼容；`Session` 表建好备用）。
- 邮箱验证、密码重置、MFA。
- 组织 / 团队 / RBAC（Phase 5）。
- 存量数据回填脚本（清库重建）。

## 设计决策

### 1. Auth.js v5 + JWT + 拆分 auth.config

**决策：**

- `auth.config.ts`：Providers（Credentials）、pages、callbacks、**无 Prisma Adapter**——供 `proxy.ts` 引入。
- `auth.ts`：完整配置 + Prisma Adapter + `session: { strategy: "jwt" }`。
- Route：`app/api/auth/[...nextauth]/route.ts` 导出 `{ GET, POST }` handlers。
- 密码：`bcryptjs` 哈希（cost 10–12）；注册走 Server Action + Zod。

**理由：** Next.js 16 要求 `proxy.ts` 不拉入数据库 adapter；Credentials 仅支持 JWT。

### 2. DAL：`verifySession()` + `getOptionalSession()`

**决策：**

- `lib/auth/dal.ts` 使用 React `cache()` 去重。
- `verifySession()`：无 session → 抛错或返回 null（Route Handler 用 401）。
- `getConversationForUser(id, userId)`：复合查询，无归属 → null（映射 404）。

**理由：** 贴近 Next.js 官方 DAL 模式；避免每个 route 重复解析 cookie。

### 3. Service 层强制 userId

**决策：**

- `assertConversationOwnership(conversationId, userId)` 替换 `assertConversationExists`。
- `listMessages` / `createMessage(s)` / `deleteMessage` 签名增加必填 `userId: string`。
- 查询使用 `where: { id: conversationId, userId }`。

**理由：** 类型系统强制每个调用点传身份，漏改一处即编译失败。

### 4. `/api/chat` 请求体变更

**决策：**

- 新 body：`{ conversationId: string, content: string }`（本轮 user 消息）。
- Handler 流程：verifySession → assertOwnership → 从 DB 加载历史 → append user → buildModelMessages → SSE。
- 客户端 `chatStore.sendMessage` 相应调整；持久化仍走消息 API。

**理由：** 消除客户端伪造历史；与 Change 1.7 prompt 安全策略一致。

### 5. 越权响应策略

**决策：**

- 未登录：401 + envelope。
- 已登录但非资源 owner：404 + envelope（与会话不存在相同文案）。

**理由：** 404 不泄露资源是否存在。

### 6. proxy.ts

**决策：**

- 公开路由：`/login`、`/register`、`/api/auth/**`、静态资源。
- 其余页面路由：无 session cookie → redirect `/login?callbackUrl=...`。
- **不在 proxy 查数据库**；API 路由由各自 Handler + DAL 保护。
- 导出：`export { auth as proxy }` 或 `export default auth`（Next 16 兼容写法，spike 确认）。

### 7. 限流

**决策：**

- `lib/ai/rateLimit.ts`：内存计数（开发足够）；按 `userId` 限制 `/api/chat` 每分钟请求数 + 每日估算 token。
- 超限返回 429 JSON envelope。

### 8. 存量数据

**决策：** 开发环境 `prisma migrate dev` 后 `docker compose down -v` 或手动 truncate；migration 中 `Conversation.userId` 设为必填，不做 nullable 回填。

## 风险 / 权衡

- **[风险] @auth/prisma-adapter 与 Prisma 7 新 generator 不兼容**  
  → Mitigation：tasks 第 0 步 spike；失败则回退 jose + cookies 自建 session。

- **[风险] `/api/chat` body 变更破坏现有客户端**  
  → Mitigation：同 PR 内同步改 `chatStore`；无外部 API 消费者。

- **[风险] GET 路由被缓存**  
  → Mitigation：所有受保护 GET 声明 `export const dynamic = "force-dynamic"`。

## 迁移计划

1. Spike：Auth.js + Prisma Adapter 兼容性。
2. Schema migration + 清库。
3. auth 配置 + DAL + proxy。
4. messageService + conversation/message API 改造。
5. `/api/chat` 改造 + rateLimit。
6. 登录注册 UI + store 401 处理。
7. 越权测试脚本 + lint/build。

回滚：revert 分支；数据库 restore 或 reset。

## 待决问题

- Spike 通过后固定 `next-auth` 版本号写入 `package.json`。
- 限流阈值（建议：10 req/min/chat，50k tokens/day/user 可配置 env）。
