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

## 构建

- [ ] `npm run lint`
- [ ] `npm run build`
