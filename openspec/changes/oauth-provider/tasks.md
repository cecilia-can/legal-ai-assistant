## 1. Spike 与依赖

- [x] 1.1 验证当前 Auth.js v5 beta 与 Next.js 16、Prisma Adapter、JWT Session 的 OAuth Provider 兼容性。
- [x] 1.2 确认 GitHub / Google 回调 URL、环境变量命名和未配置时的降级行为。

## 2. Auth.js 配置

- [x] 2.1 在 `auth.config.ts` 添加 GitHub / Google Provider，并保持配置可被 `proxy.ts` 安全引入。
- [x] 2.2 保持 `auth.ts` 的 Prisma Adapter、JWT Session、用户 ID 回调不变。
- [x] 2.3 增加 OAuth 配置校验与安全日志，禁止输出 client secret。

## 3. 账号关联与安全

- [x] 3.1 明确并实现已有邮箱账号与 OAuth 账号冲突时的拒绝/引导流程。
- [x] 3.2 确认 OAuth 创建的用户与 Account 正确归属，Conversation 隔离不回归。
- [x] 3.3 增加配置缺失、重复账号、跨用户访问的自动化验证。
- [x] 3.4 开发已注册账号的账号绑定流程：用户身份验证、服务端单次意图、原子绑定和冲突处理。

## 4. UI 与文档

- [x] 4.1 登录页增加 GitHub / Google 登录按钮和 pending 状态。
- [x] 4.2 展示 OAuth 取消、失败、账号冲突等可理解错误。
- [x] 4.3 更新 `.env.example` 和 OAuth 手工验收文档。
- [x] 4.4 在账号冲突时展示明确的绑定提示与验证页面，并保持邮箱密码登录入口可用。

## 5. 验证

- [x] 5.1 运行 `npm run lint`。
- [x] 5.2 运行 `npm run build`。
- [ ] 5.3 手工验证 GitHub / Google 登录、登出、回调错误与多用户数据隔离。
