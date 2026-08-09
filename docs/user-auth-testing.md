# Change 1.9 用户鉴权与数据隔离 — 手工验收清单

## 前置

- [ ] `npm run db:up` 且 migration `add_user_auth` 已应用
- [ ] `.env` 已配置 `AUTH_SECRET`、`AUTH_URL`
- [ ] `npm run dev` 启动后访问 `http://localhost:3000`

## 登录 / 注册

- [ ] 未登录访问 `/` 重定向到 `/login`
- [ ] 注册新账号（邮箱 + 密码）后进入聊天页
- [ ] 登出后回到 `/login`
- [ ] 已登录访问 `/login` 重定向到 `/`

## 会话隔离（双用户）

- [ ] 用户 A 创建会话并发送消息
- [ ] 用户 B 登录后看不到 A 的会话
- [ ] 用户 B 直接请求 A 的 `conversationId` API 返回 404

## `/api/chat`

- [ ] 登录用户发送消息可正常流式回复
- [ ] 伪造他人 `conversationId` 返回 404
- [ ] 未登录调用返回 401

## 401 与限流

- [ ] 清除 Cookie 后刷新聊天页跳转登录（非红字 error）
- [ ] 快速连续触发 chat 超限后返回 429（可选，需调低 `CHAT_RATE_LIMIT_PER_MINUTE`）

## 自动化

- [ ] `npx tsx scripts/verify-tenant-isolation.ts` 通过

## OAuth（Change 1.9.1，可选）

- [ ] 配置 GitHub 后，登录页显示 GitHub 按钮，回调地址为 `/api/auth/callback/github`
- [ ] 配置 Google 后，登录页显示 Google 按钮，回调地址为 `/api/auth/callback/google`
- [ ] 未配置 Provider 时，邮箱密码登录仍可用，页面不显示未配置按钮
- [ ] OAuth 登录成功后可创建会话，且只能看到当前用户的会话
- [ ] OAuth 邮箱与已有 Credentials 账号相同时，不会静默合并，页面显示账号关联提示
- [ ] OAuth 邮箱与已有 Credentials 账号冲突时，点击“验证并绑定当前账号”进入 `/login/link`
- [ ] 在绑定页输入正确的原账号密码后，GitHub / Google 账号写入同一用户的 `Account` 记录并进入聊天页
- [ ] 绑定页输入错误密码、使用过期链接或重复提交时，不创建或修改 `Account` 绑定
- [ ] 绑定成功后再次使用同一个 OAuth 账号登录，直接进入原账号的聊天页
- [ ] 取消授权或 Provider 返回错误时，登录页显示可理解的失败提示

## 构建

- [ ] `npm run lint`
- [ ] `npm run build`
