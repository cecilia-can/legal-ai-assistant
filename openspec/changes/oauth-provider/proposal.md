## 为什么

Change 1.9 已完成邮箱密码认证与用户级数据隔离。为了降低注册门槛，下一阶段接入 GitHub 与 Google OAuth，同时保持现有 JWT Session 和 Credentials 登录可用。

## 变更内容

- 接入 GitHub / Google OAuth Provider。
- 明确 OAuth 与已有邮箱账号的关联策略，避免账号劫持或重复账号。
- 更新环境变量模板与本地/生产回调地址说明。
- 在登录页增加第三方登录入口，并保留邮箱密码登录。
- 增加 OAuth 配置缺失、登录成功、取消授权和账号关联的验收项。

## 非目标

- 不切换 database session 策略。
- 不实现邮箱验证、密码重置、MFA 或组织级 RBAC。
- 不在本阶段新增其他 OAuth Provider。
