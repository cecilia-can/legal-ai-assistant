## ADDED Requirements

### Requirement: Auth.js 配置与 JWT 会话
系统 SHALL 使用 Auth.js v5（`next-auth`）提供认证，session 策略 MUST 为 JWT。

配置 MUST 包含：

- 根目录 `auth.ts`（完整配置 + Prisma Adapter）
- `auth.config.ts`（不含 Prisma Adapter，供 `proxy.ts` 使用）
- `app/api/auth/[...nextauth]/route.ts` 导出 `{ GET, POST }`

Credentials Provider MUST 支持邮箱 + 密码登录；密码 MUST 以 bcrypt（或 argon2）哈希存储，明文不得入库。

环境变量 MUST 包含 `AUTH_SECRET`；`.env.example` MUST 文档化所需变量。

#### Scenario: 凭据正确时登录成功
- **WHEN** 用户提交已注册邮箱与正确密码
- **THEN** 系统创建 JWT session 并设置 HttpOnly cookie

#### Scenario: 凭据错误时拒绝登录
- **WHEN** 用户提交错误密码或不存在的邮箱
- **THEN** 登录失败且 MUST NOT 泄露具体是邮箱还是密码错误（统一文案）

#### Scenario: 未登录访问受保护 API
- **WHEN** 无有效 session 的请求访问受保护 Route Handler
- **THEN** 返回 HTTP 401 与 JSON envelope

### Requirement: 用户注册
系统 SHALL 提供注册 Server Action 与 `/register` 页面。

注册 MUST 使用 Zod 校验邮箱格式与密码强度；邮箱 MUST 唯一。

成功注册后 MUST 自动登录或引导至登录页（实现时二选一并在 UI 说明）。

#### Scenario: 注册新用户
- **WHEN** 用户提交合法且未使用的邮箱与符合规则的密码
- **THEN** 数据库创建 `User` 记录（含 password 哈希）且用户可登录

#### Scenario: 重复邮箱拒绝注册
- **WHEN** 用户提交已存在邮箱
- **THEN** 注册失败并展示可读错误

### Requirement: 数据访问层 verifySession
系统 SHALL 在 `lib/auth/dal.ts` 提供 `verifySession()`，使用 React `cache()` 去重。

`verifySession()` MUST 解析当前请求 session 并返回 `{ userId: string }`（及可选安全字段）。

Route Handler 与 Server Action 在访问受保护数据前 MUST 调用 `verifySession()` 或等价 helper。

#### Scenario: 有效 session 返回 userId
- **WHEN** 请求携带有效 JWT session cookie
- **THEN** `verifySession()` 返回对应 `userId`

#### Scenario: 无效 session 在 API 层失败
- **WHEN** Route Handler 调用 `verifySession()` 且无有效 session
- **THEN** Handler 返回 401，不访问数据库业务数据

### Requirement: proxy 乐观重定向
系统 SHALL 在根目录 `proxy.ts` 对页面路由做基于 Cookie 的乐观鉴权。

未登录用户访问受保护页面 MUST 重定向至 `/login`（可带 `callbackUrl`）。

`proxy.ts` MUST NOT 执行数据库查询；`/api/**` 的细粒度授权由各自 Handler 负责。

公开路径 MUST 至少包含：`/login`、`/register`、`/api/auth/**`。

#### Scenario: 未登录访问首页聊天
- **WHEN** 无 session 的用户请求 `/`
- **THEN** 重定向至 `/login`

#### Scenario: 已登录访问登录页
- **WHEN** 有效 session 用户访问 `/login`
- **THEN** 重定向至 `/` 或 callbackUrl

### Requirement: 登录注册 UI 与登出
系统 SHALL 提供 `/login`、`/register` 页面与侧栏用户菜单（含登出）。

页面 MUST 复用 Change 1.8 的 `Skeleton`、`InlineError` 处理加载与错误。

登出 MUST 清除 session 并重定向至 `/login`。

#### Scenario: 侧栏展示当前用户
- **WHEN** 用户已登录并打开聊天页
- **THEN** 侧栏可见用户标识（邮箱或名称）与登出入口

### Requirement: per-user 速率限制
系统 SHALL 对 `/api/chat` 按 `userId` 实施速率限制。

超限 MUST 返回 HTTP 429 与 JSON envelope。

限制阈值 SHOULD 可通过环境变量配置。

#### Scenario: 超出每分钟配额
- **WHEN** 用户在 1 分钟内超过配置的 chat 请求次数
- **THEN** 后续请求返回 429

### Requirement: 租户隔离自动化测试
系统 SHALL 提供 `scripts/verify-tenant-isolation.ts`（或等价）脚本，自动化验证越权场景。

脚本 MUST 覆盖：用户 A 读取 / 修改 / 删除用户 B 的会话；向 B 的会话发消息；伪造 `conversationId` 调用 `/api/chat`。

每项 MUST 断言预期 HTTP 状态码（401 或 404）。

#### Scenario: 跨用户读取会话列表不可见
- **WHEN** 用户 A 登录并请求 `GET /api/conversations`
- **THEN** 响应 MUST NOT 包含用户 B 的会话

#### Scenario: 跨用户 DELETE 返回 404
- **WHEN** 用户 A 尝试 DELETE 用户 B 的 conversationId
- **THEN** 返回 HTTP 404
