# 项目路线图（Roadmap）

本文档描述了法律 AI 助手项目的开发路线图，按阶段逐步演进。

---

## Phase 1：ChatBot（多轮对话系统）

**目标**：实现一个类似 ChatGPT 的多轮对话系统

**总体时间**：约 15-19 天

**功能范围**：
- 多会话管理
- 多轮对话
- 流式输出
- Markdown 渲染
- 代码高亮
- 聊天记录持久化
- 用户登录鉴权与数据隔离

---

### Change 1.1：基础架构搭建

**时间估算**：1 天

**目标**：
搭建项目基础架构，配置数据库和开发环境。

**工作内容**：
1. 安装并配置 Prisma
2. 设计数据库 Schema（Conversation、Message 表）
3. 配置 PostgreSQL 连接
4. 创建基础目录结构（components、lib、types）
5. 设置环境变量模板

**交付物**：
- `prisma/schema.prisma` - 数据库模型定义
- `lib/db.ts` - 数据库连接
- `.env.example` - 环境变量模板
- 基础目录结构

**依赖关系**：无

---

### Change 1.2：UI 基础组件库

**时间估算**：2 天

**目标**：
构建可复用的 UI 组件库，建立设计系统基础。

**工作内容**：
1. 创建布局组件（Sidebar、Main）
2. 实现会话列表组件
3. 实现消息列表组件
4. 实现输入框组件
5. 配置 Tailwind CSS 主题色
6. 实现响应式布局

**交付物**：
- `components/layout/` - 布局组件
- `components/chat/` - 聊天相关组件
- `components/ui/` - 基础 UI 组件
- `styles/globals.css` - 全局样式

**依赖关系**：Change 1.1（需要数据库 Schema 定义）

---

### Change 1.3：会话管理功能

**时间估算**：2 天

**目标**：
实现多会话管理能力，包括创建、切换、删除会话。

**工作内容**：
1. 实现会话列表 API（GET、POST、DELETE）
2. 实现会话状态管理（React Context 或 Zustand）
3. 实现新建会话功能
4. 实现切换会话功能
5. 实现删除会话功能
6. 实现会话标题自动生成

**交付物**：
- `app/api/conversations/route.ts` - 会话 API
- `lib/hooks/useConversations.ts` - 会话状态管理
- `components/chat/ConversationList.tsx` - 会话列表 UI

**依赖关系**：
- Change 1.1（数据库）
- Change 1.2（UI 组件）

---

### Change 1.4：AI API 集成与流式输出

**时间估算**：2 天

**目标**：
集成 OpenAI API，实现流式响应处理。

**工作内容**：
1. 创建 AI 客户端封装
2. 实现流式 API 端点（POST /api/chat）
3. 处理流式响应（ReadableStream）
4. 实现前端流式接收
5. 错误处理和重试机制
6. 添加请求取消功能

**交付物**：
- `lib/ai/client.ts` - AI 客户端
- `app/api/chat/route.ts` - 聊天 API
- `lib/hooks/useChat.ts` - 聊天状态管理
- `types/chat.ts` - 类型定义

**依赖关系**：Change 1.3（会话管理）

---

### Change 1.5：消息持久化

**时间估算**：2 天

**目标**：
实现聊天消息的持久化存储和历史加载。

**工作内容**：
1. 实现消息保存 API
2. 实现消息列表加载 API
3. 实现会话切换时加载历史消息
4. 优化消息加载性能（分页）
5. 实现消息删除功能
6. 添加数据迁移脚本

**交付物**：
- `app/api/conversations/[id]/messages/route.ts` - 消息 API
- `lib/services/messageService.ts` - 消息服务层
- 消息持久化测试

**依赖关系**：
- Change 1.3（会话管理）
- Change 1.4（聊天 API）

---

### Change 1.6：Markdown 渲染与代码高亮

**时间估算**：1 天

**目标**：
实现 Markdown 内容渲染和代码语法高亮。

**工作内容**：
1. 安装 Markdown 解析库（react-markdown）
2. 安装代码高亮库（highlight.js 或 prism）
3. 实现消息 Markdown 渲染组件
4. 配置代码块主题和样式
5. 实现代码复制功能
6. 优化渲染性能

**交付物**：
- `components/chat/MessageContent.tsx` - 消息内容组件
- `styles/markdown.css` - Markdown 样式
- 代码高亮配置

**依赖关系**：Change 1.4（流式输出）

---

### Change 1.7：Prompt 工程优化

**时间估算**：1 天

**目标**：
优化对话质量和上下文管理。

**工作内容**：
1. 设计 System Prompt（法律助手角色定位）
2. 实现对话上下文管理策略
3. 实现 Token 计数和限制
4. 优化上下文窗口使用
5. 添加对话总结功能（可选）
6. 测试不同 Prompt 策略

**交付物**：
- `lib/ai/prompts.ts` - Prompt 模板
- `lib/ai/context.ts` - 上下文管理
- `lib/ai/tokenizer.ts` - Token 计数
- Prompt 测试文档

**依赖关系**：Change 1.5（消息持久化）

---

### Change 1.8：用户体验优化

**时间估算**：1 天

**目标**：
提升整体用户体验和交互细节。

**工作内容**：
1. 添加加载状态和骨架屏
2. 实现错误提示和重试机制
3. 添加快捷键支持
4. 实现消息自动滚动
5. 优化移动端适配
6. 添加键盘快捷操作

**交付物**：
- 加载状态组件
- 错误边界处理
- 移动端优化
- UX 改进列表

**依赖关系**：Change 1.6（渲染优化）

---

### Change 1.9：多用户登录鉴权与数据隔离

**时间估算**：3 天

**目标**：
引入用户体系，实现登录注册与用户级数据隔离，把平台从「单租户 MVP」演进为可对外开放的多用户系统。这是 Phase 2 开始前的强制前置项——知识库、合同、案件都属于敏感数据，必须先有归属主体。

**方案选型**：

| 维度 | 选择 | 理由 |
|------|------|------|
| 认证框架 | Auth.js v5（NextAuth）+ Prisma Adapter | 开源自建，与 App Router 深度集成，无第三方托管成本 |
| 登录方式 | 仅邮箱密码（Credentials）；OAuth 拆至 Change 1.9.1 | 先掌握哈希与会话原理，同时压缩本阶段范围与外部依赖 |
| Session 策略 | JWT | Auth.js 的 Credentials Provider 不支持 database session；`Session` 表先建好但暂不启用 |
| 隔离粒度 | 用户级：`Conversation` 归属 `userId` | 组织、团队协作与 RBAC 留到 Phase 5 案件工作空间 |
| 授权位置 | DAL（`verifySession()`）+ service 层强制 `userId`，`proxy.ts` 仅做乐观重定向 | Next.js 官方推荐：安全校验贴近数据源，而非只靠路由层 |
| 对话历史来源 | 服务端按 `(conversationId, userId)` 从数据库读取 | 不信任客户端传入的 `messages`，杜绝伪造历史与越权消耗 token |

**前置验证（spike，0.5 天）**：
- 验证 `@auth/prisma-adapter` 能否配合本项目的 Prisma 7 组合工作：`provider = "prisma-client"` 新 ESM generator + 自定义 `output` + `@prisma/adapter-pg` 驱动适配器（官方示例基于旧的 `prisma-client-js`）
- 确认 `next-auth` 版本对 Next.js 16 的 peer dependency，以及 `proxy.ts` 的导出写法
- 若验证不通过，回退方案：按 Next.js 官方文档自建 `jose` + `cookies()` + DAL 的 session 方案

**工作内容**：
1. 安装配置 Auth.js v5（JWT session 策略），创建 `auth.ts`、`auth.config.ts` 与 `app/api/auth/[...nextauth]/route.ts`；`auth.config.ts` 不含 Prisma Adapter，供 `proxy.ts` 单独引入
2. 扩展 Prisma Schema：新增 `User`、`Account`、`Session`、`VerificationToken` 四张 Auth.js 标准表；`Conversation` 增加 `userId` 外键与 `@@index([userId, updatedAt])`
3. 实现 Credentials Provider：注册 Server Action + Zod 校验 + 密码哈希（bcrypt / argon2）
4. 建立数据访问层 `lib/auth/dal.ts`：`verifySession()` 用 React `cache` 去重，作为所有受保护数据请求的统一入口
5. 改造 `lib/services/messageService.ts`：`assertConversationExists` 换成 `assertConversationOwnership(conversationId, userId)`；`listMessages` / `createMessage(s)` / `deleteMessage` 全部增加必填 `userId` 参数，用类型系统强制每个调用点传入身份
6. 改造 `/api/conversations` 与 `/api/conversations/[id]/**`：按 `session.user.id` 过滤，未登录返回 401、越权返回 404；所有 GET 路由显式声明动态渲染，避免响应被缓存导致跨用户泄漏
7. 改造 `/api/chat`：先校验 `(conversationId, userId)` 归属，再从数据库读取历史交给 `buildModelMessages()`，客户端只传本轮新消息
8. 新增 per-user 速率限制（每分钟请求数 + 每日 token 配额），复用 `lib/ai/chatUsageLog.ts` 的统计口径
9. 新增根目录 `proxy.ts`（Next.js 16 中间件的新名称），对未登录用户做基于 Cookie 的乐观重定向
10. 实现登录 / 注册 / 登出页面与侧栏用户菜单，复用 Change 1.8 的 `Skeleton` 与 `InlineError`
11. 前端统一 401 处理：在 `chatStore` / `conversationStore` 的响应解析层区分「可重试错误」与「需重新登录」，后者跳登录页而非展示红字；流式过程中 session 失效需终止 SSE 并提示
12. 存量数据处理：清库重建（当前无真实用户数据，不写回填脚本）
13. 自动化越权测试：A 用户读取 / 改名 / 删除 B 的会话、向 B 的会话发消息、伪造 `conversationId` 打 `/api/chat`，逐条断言状态码

**交付物**：
- `auth.ts`、`auth.config.ts`、`app/api/auth/[...nextauth]/route.ts` - Auth.js 配置与路由
- `lib/auth/dal.ts` - 会话校验与数据访问层
- `proxy.ts` - 路由级乐观鉴权
- `app/(auth)/login/page.tsx`、`app/(auth)/register/page.tsx` - 认证页面
- `prisma/migrations/*_add_user_auth` - 用户表与 `userId` 外键迁移
- `lib/ai/rateLimit.ts`（或等价）- per-user 限流
- `scripts/verify-tenant-isolation.ts` - 自动化越权测试脚本
- 安全检查清单

**依赖关系**：
- Change 1.3（会话管理 API）
- Change 1.5（消息持久化）
- Change 1.8（UX 优化，登录页复用加载状态与错误提示组件）

**风险与注意点**：
- Auth.js 的 Credentials Provider 不支持 database session 策略，本阶段固定使用 JWT；`Session` 表建好但暂不启用，等 1.9.1 接 OAuth 时再决定是否切换
- `@auth/prisma-adapter` 与本项目的新 generator + 驱动适配器组合未经验证，必须先做 spike 再写实现
- `next-auth` 早期版本对 Next.js 16 的 peer dependency 会导致安装失败；`proxy.ts` 必须使用 `proxy` 命名导出或 default 导出，Auth.js 文档里 `export { auth as middleware }` 的写法在 Next 16 上失效
- `proxy.ts` 只做基于 Cookie 的乐观检查，真正的授权判断必须下沉到 DAL 与 service 层，否则 Server Action 等入口会绕过校验
- 仅「按 session 过滤」不足以保护 `/api/chat`：只要历史由客户端提供，已登录用户仍可伪造历史并消耗 token，必须改为服务端取历史
- `Message` 表不带 `userId`、靠 join `Conversation` 判断归属，因此所有消息读写必须经过 `assertConversationOwnership`，漏一个调用点即越权
- Phase 2 起新增的 `Document`、`Case` 等表应从建表起就带 `userId`，避免二次迁移

---

### Change 1.9.1：OAuth 第三方登录

**时间估算**：1 天

**目标**：
在已有用户体系之上接入 GitHub / Google 登录，降低注册门槛。从 Change 1.9 拆出，避免核心鉴权与外部 Provider 配置互相阻塞。

**工作内容**：
1. 注册 GitHub / Google OAuth 应用，配置回调地址与 `AUTH_*` 环境变量
2. 在 `auth.config.ts` 接入两个 Provider，启用 `Account` 表
3. 决定 session 策略是否从 JWT 切换到 database session
4. 处理同邮箱多 Provider 的账号关联策略（自动关联 / 拒绝 / 提示绑定）
5. 登录页增加第三方登录入口

**交付物**：
- OAuth Provider 配置与 `.env.example` 更新
- 账号关联策略说明文档

**依赖关系**：Change 1.9

**风险与注意点**：
- Credentials 与 OAuth 混用时的 session 策略需一次定清，中途切换会使已登录用户全部失效
- 生产环境回调地址与本地开发不同，需在两个 Provider 后台分别配置

---

## Phase 2：法律知识库（RAG）

**目标**：让系统具备法律知识检索能力

**总体时间**：约 15-20 天

**前置条件**：Phase 1 完成（含 Change 1.9 鉴权与数据隔离——文档、向量数据须从建表起带用户归属；Change 1.9.1 OAuth 可选）

---

### Change 2.1：向量数据库集成

**时间估算**：3 天

**目标**：
集成 pgvector 扩展，实现向量存储能力。

**工作内容**：
1. 配置 PostgreSQL pgvector 扩展
2. 扩展 Prisma Schema（Document、Embedding 表）
3. 实现向量索引创建
4. 实现向量存储和查询
5. 性能测试和优化

**依赖关系**：Phase 1 完成

---

### Change 2.2：文档导入与处理

**时间估算**：3 天

**目标**：
实现法律文档的导入、解析和切片。

**工作内容**：
1. 实现文档上传 API
2. 实现文档解析（PDF、DOCX、TXT）
3. 实现文档切片策略
4. 实现切片存储
5. 添加文档管理界面

**依赖关系**：Change 2.1

---

### Change 2.3：向量化与检索

**时间估算**：3 天

**目标**：
实现文档向量化、相似度检索和 RAG 流程。

**工作内容**：
1. 集成 Embedding 模型
2. 实现批量向量化
3. 实现相似度检索
4. 实现 RAG Prompt 构建
5. 集成到聊天流程

**依赖关系**：Change 2.2

---

### Change 2.4：知识库管理界面

**时间估算**：2 天

**目标**：
构建知识库管理界面。

**工作内容**：
1. 实现文档列表页
2. 实现文档上传界面
3. 实现文档详情页
4. 实现搜索和过滤
5. 添加文档预览功能

**依赖关系**：Change 2.2

---

### Change 2.5：检索优化

**时间估算**：2 天

**目标**：
优化检索质量和性能。

**工作内容**：
1. 实现混合检索（向量+关键词）
2. 优化切片策略
3. 实现重排序（Reranking）
4. 添加检索调试界面
5. 性能监控和优化

**依赖关系**：Change 2.3

---

## Phase 3：合同审查

**目标**：实现合同上传与风险分析能力

**总体时间**：约 12-15 天

**前置条件**：Phase 2 完成

---

### Change 3.1：文档上传与解析

**时间估算**：2 天

**目标**：
实现合同文档上传和解析功能。

**工作内容**：
1. 扩展文档上传 API
2. 实现 PDF 高级解析（保留格式）
3. 实现合同文本提取
4. 实现文档结构化存储
5. 添加上传进度显示

**依赖关系**：Phase 2 完成

---

### Change 3.2：条款识别与分类

**时间估算**：3 天

**目标**：
使用 AI 识别和分类合同条款。

**工作内容**：
1. 设计条款分类体系
2. 实现条款识别 Prompt
3. 实现条款提取流程
4. 实现条款分类标注
5. 构建条款展示界面

**依赖关系**：Change 3.1

---

### Change 3.3：风险分析引擎

**时间估算**：3 天

**目标**：
实现合同风险识别和分析。

**工作内容**：
1. 设计风险分析规则
2. 实现风险识别 Prompt
3. 实现风险等级评估
4. 实现风险点标注
5. 集成知识库检索

**依赖关系**：Change 3.2

---

### Change 3.4：审查报告生成

**时间估算**：2 天

**目标**：
生成结构化的合同审查报告。

**工作内容**：
1. 设计报告模板
2. 实现报告生成逻辑
3. 实现报告导出（PDF/Word）
4. 实现报告存储和分享
5. 添加报告历史管理

**依赖关系**：Change 3.3

---

### Change 3.5：审查工作流优化

**时间估算**：2 天

**目标**：
优化审查流程和用户体验。

**工作内容**：
1. 实现审查任务管理
2. 添加审查进度跟踪
3. 实现多版本对比
4. 添加批注和修改建议
5. 优化审查界面交互

**依赖关系**：Change 3.4

---

## Phase 4：案件分析 Agent

**目标**：实现多步骤法律分析能力

**总体时间**：约 18-22 天

**前置条件**：Phase 3 完成

---

### Change 4.1：Agent 框架搭建

**时间估算**：3 天

**目标**：
搭建 Agent 基础框架。

**工作内容**：
1. 研究 Agent 框架选型
2. 设计 Agent 架构
3. 实现基础 Agent 类
4. 实现工具注册机制
5. 实现执行引擎

**依赖关系**：Phase 3 完成

---

### Change 4.2：工具系统实现

**时间估算**：3 天

**目标**：
实现法律分析相关工具。

**工作内容**：
1. 实现法规检索工具
2. 实现案例检索工具
3. 实现文档分析工具
4. 实现网络搜索工具
5. 工具测试和文档

**依赖关系**：Change 4.1

---

### Change 4.3：案件分析 Agent

**时间估算**：4 天

**目标**：
实现案件分析 Agent 核心逻辑。

**工作内容**：
1. 实现事实提取模块
2. 实现法律关系识别
3. 实现多步骤推理
4. 实现分析报告生成
5. Agent 测试和优化

**依赖关系**：Change 4.2

---

### Change 4.4：Planning 与执行优化

**时间估算**：3 天

**目标**：
优化 Agent 规划和执行能力。

**工作内容**：
1. 实现 ReAct 模式
2. 实现任务规划器
3. 实现执行状态管理
4. 添加执行可视化
5. 性能优化

**依赖关系**：Change 4.3

---

### Change 4.5：Agent 界面集成

**时间估算**：2 天

**目标**：
将 Agent 能力集成到用户界面。

**工作内容**：
1. 实现 Agent 调用界面
2. 实现执行过程展示
3. 实现中间结果查看
4. 实现结果导出
5. 用户体验优化

**依赖关系**：Change 4.3

---

## Phase 5：案件工作空间

**目标**：构建以案件为中心的 AI 协作平台

**总体时间**：约 20-25 天

**前置条件**：Phase 4 完成

---

### Change 5.1：案件管理模块

**时间估算**：3 天

**目标**：
实现案件管理基础功能。

**工作内容**：
1. 扩展数据库 Schema
2. 实现案件 CRUD API
3. 实现案件列表界面
4. 实现案件详情页
5. 案件分类和标签

**依赖关系**：Phase 4 完成

---

### Change 5.2：证据管理系统

**时间估算**：3 天

**目标**：
实现证据上传、管理和分析功能。

**工作内容**：
1. 实现证据上传 API
2. 实现证据分类管理
3. 实现证据关联分析
4. 实现证据时间线
5. 证据提取和总结

**依赖关系**：Change 5.1

---

### Change 5.3：文档管理系统

**时间估算**：3 天

**目标**：
实现案件相关文档管理。

**工作内容**：
1. 实现文档分类管理
2. 实现文档版本控制
3. 实现文档协作编辑
4. 实现文档模板库
5. 文档自动生成

**依赖关系**：Change 5.1

---

### Change 5.4：长期记忆系统

**时间估算**：4 天

**目标**：
实现案件级别的长期记忆能力。

**工作内容**：
1. 设计长期记忆架构
2. 实现记忆存储和检索
3. 实现记忆总结和压缩
4. 实现上下文动态加载
5. 记忆可视化

**依赖关系**：Change 5.2、Change 5.3

---

### Change 5.5：AI 协作功能

**时间估算**：3 天

**目标**：
实现人机协作功能。

**工作内容**：
1. 实现 AI 助手面板
2. 实现智能建议系统
3. 实现任务自动化
4. 实现协作历史记录
5. 实现反馈和学习机制

**依赖关系**：Change 5.4

---

### Change 5.6：工作空间优化

**时间估算**：2 天

**目标**：
优化工作空间体验。

**工作内容**：
1. 实现工作空间仪表板
2. 实现快捷操作
3. 实现数据统计和可视化
4. 性能优化
5. 用户体验打磨

**依赖关系**：Change 5.5

---

## 总体时间估算

| Phase | 名称 | 时间估算 | 累计时间 |
|-------|------|----------|----------|
| Phase 1 | ChatBot + 鉴权 | 15-19 天 | 15-19 天 |
| Phase 2 | 法律知识库（RAG） | 15-20 天 | 30-39 天 |
| Phase 3 | 合同审查 | 12-15 天 | 42-54 天 |
| Phase 4 | 案件分析 Agent | 18-22 天 | 60-76 天 |
| Phase 5 | 案件工作空间 | 20-25 天 | 80-101 天 |

**总计**：约 80-101 个工作日（约 4-5 个月）

---

## 开发原则

### 渐进式交付

每个 Change 都是可独立交付的最小单元，确保持续产出可用功能。

### 技术债务控制

每个 Phase 结束后进行代码审查和重构，避免技术债务累积。

### 学习优先

重点记录每个阶段的学习心得和架构决策，形成知识库。

### 灵活调整

根据实际开发情况和技术调研结果，可调整 Change 的划分和时间估算。

---

## 风险与应对

### 技术风险

- **风险**：新版本 Next.js API 变化较大
- **应对**：优先阅读官方文档和更新日志

### 时间风险

- **风险**：实际开发时间可能超出估算
- **应对**：预留 20% 缓冲时间，优先保证核心功能

### 依赖风险

- **风险**：第三方库可能存在兼容性问题
- **应对**：提前调研和测试关键依赖

---

## 下一步行动

开始执行 **Change 1.1：基础架构搭建**。

相关文档：`docs/vision.md`、`docs/deployment.md`
