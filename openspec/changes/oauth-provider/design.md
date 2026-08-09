## 设计决策

### 1. 保持 JWT Session

继续使用 Change 1.9 的 `session: { strategy: "jwt" }`。OAuth 登录创建或复用 `User` 与 `Account`，JWT 仍通过现有 `session.user.id` 向 DAL 提供用户身份，避免一次 Provider 接入导致所有现有登录会话失效。

### 2. Provider 配置

在 `auth.config.ts` 中集中声明 GitHub 与 Google Provider，并从环境变量读取客户端凭据。`auth.ts` 继续负责 Prisma Adapter 和完整 Auth.js 配置；`proxy.ts` 只依赖不访问数据库的 auth config。

### 3. 账号关联策略

Provider 返回的 `provider + providerAccountId` 绑定到 Auth.js `Account`。当 OAuth 邮箱与已有 Credentials 用户相同时，不自动静默合并；要求用户先登录已有账号，再通过明确的绑定流程完成关联。未实现绑定流程前，返回可理解的冲突错误，防止未经验证的邮箱声明造成账号接管。

### 4. UI 与错误处理

登录页新增 GitHub / Google 按钮。OAuth 回调错误统一转换为登录页可展示的提示；Provider 未配置时按钮不显示或进入明确的配置错误，不影响邮箱密码登录。

### 5. 配置与验证

`.env.example` 增加 `AUTH_GITHUB_ID`、`AUTH_GITHUB_SECRET`、`AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET`，并记录本地与生产回调 URL。自动化测试覆盖配置校验和账号归属规则；真实 OAuth 回调保留手工验收。
