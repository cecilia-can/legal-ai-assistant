## 背景

Change 1.1 已提供 `Conversation` / `Message` 模型与 Prisma Client；Change 1.2 已提供聊天布局与会话列表 UI，但 `app/page.tsx` 仍使用硬编码 mock 数据。Change 1.3 要把「会话」作为第一个真正持久化的用户可见实体接入产品。

## 目标 / 非目标

**目标：**

- 提供会话列表、创建、删除、标题更新的 API。
- 用 **Zustand** 的 `conversationStore` 统一管理会话列表与当前选中会话，并通过 selector 供 UI 订阅。
- 首页加载时从 API 拉取会话；新建/切换/删除与 UI 联动。
- 首条用户消息发送时，若会话标题仍为默认值，则自动更新标题（截断摘要）。

**非目标：**

- 不实现 AI 聊天、流式输出（Change 1.4，届时扩展 `chatStore`）。
- 不实现消息保存、历史消息加载 API（Change 1.5）。
- 不修改 Prisma schema 或新增 migration。
- 不引入用户认证、多租户或权限控制。
- 不引入 Redux（本阶段 Zustand 足够，且更利于后续按 domain 拆分 store）。

## 设计决策

### 1. API 路由按资源拆分

**决策：**

- `GET/POST` → `app/api/conversations/route.ts`
- `PATCH/DELETE` → `app/api/conversations/[id]/route.ts`

**理由：** 符合 Next.js App Router 惯例；单条资源操作与集合操作分离，便于后续扩展。

### 2. 列表按 `updatedAt` 降序返回

**决策：** `GET /api/conversations` 返回按 `updatedAt desc` 排序的会话数组。

**理由：** 与 ChatGPT 类产品一致，最近活跃的会话排在前面。

### 3. 使用 Zustand 管理会话状态

**决策：** 创建 `lib/stores/conversationStore.ts`，使用 Zustand 管理 `conversations`、`activeId`、`isLoading`、`error` 及异步 actions（fetch、create、delete、updateTitle）。UI 通过 `useConversationStore` selector 订阅所需字段，**不使用 React Context Provider**。

**理由：**

- roadmap 后续 Phase 1.4 流式消息、1.5 消息持久化需要高频局部更新，Zustand 比 Context 更合适。
- 可按 domain 拆分 store（`conversationStore` → 后续 `chatStore`），与 roadmap 分阶段交付对齐。
- API 简单，无需 Redux 级别的样板与中间件。

**Store 结构（示意）：**

```text
lib/stores/
  conversationStore.ts   ← Change 1.3
  chatStore.ts           ← Change 1.4 / 1.5（后续）
```

**备选方案：**

- React Context + Hook：实现快，但 1.4 流式更新易触发整树重渲染，后续迁移成本高。
- Redux (RTK)：适合更大团队与 RTK Query 统一缓存，对本项目当前阶段过重。

### 4. API 响应使用 ISO 8601 日期字符串

**决策：** API JSON 中 `createdAt` / `updatedAt` 使用 ISO 字符串；store action 层转换为 `Date` 供 UI 使用。

**理由：** JSON 不支持原生 `Date`；与 `types/chat.ts` 的 `Date` 类型在边界处转换即可。

### 5. 标题自动生成策略（本阶段）

**决策：**

- 创建会话时默认标题为 `新对话`（API 层创建时可显式写入中文默认值）。
- 当用户在本阶段发送首条本地消息且标题仍为默认值时，调用 `PATCH /api/conversations/[id]` 更新标题为消息前 20 个字符。
- 消息内容本身不在本阶段持久化。

**理由：** roadmap 要求「会话标题自动生成」，但在消息 API（1.5）之前只能先实现标题更新能力；首条消息触发标题更新可提前验证 UX。

### 6. 删除会话的 UI 与行为

**决策：** `ConversationList` 每项增加删除按钮；点击后先弹出 `ConfirmDialog` 确认，用户确认后再调用 store 删除；删除后若删除的是当前会话，则自动切换到列表第一项或清空选中态。

**理由：** 满足删除能力；避免误触不可逆操作；确认弹框与 store 层 `deletingId` 防重复共同避免连点导致的竞态与误报错误。

**实现要点：**

- 新建 [`components/ui/ConfirmDialog.tsx`](../../../../components/ui/ConfirmDialog.tsx)，复用 `Button` 样式；支持 Esc / 遮罩取消（删除进行中除外）。
- [`app/page.tsx`](../../../../app/page.tsx) 维护 `pendingDelete`，确认后调 `deleteConversation` 并清理本地 `messagesByConversation`。
- [`conversationStore`](../../../../lib/stores/conversationStore.ts) 暴露 `deletingId`；同 id 删除进行中忽略重复调用；DELETE 404 按幂等成功处理（同步本地列表，不写入 `error`）。
- API 保持 spec：删不存在 → 404，不改后端契约。

### 7. 初始化时机

**决策：** 在 `app/page.tsx` 挂载时调用 `fetchConversations()`（或通过 store 的 init action），不依赖 Provider 包裹。

**理由：** Zustand store 为模块级单例，Client Component 挂载时拉取即可；减少 Provider 嵌套。

## 风险 / 权衡

- [风险] 数据库未配置导致 API 失败 → store 维护 `error` 状态，页面展示可读错误提示。
- [风险] 首条消息标题更新与 1.5 消息持久化重复 → 1.5 可复用同一标题更新 action，本阶段仅 PATCH 标题。
- [风险] 新增 `zustand` 依赖 → 包体积极小（~1KB），收益大于成本。

## 实施计划

1. 安装 `zustand` 依赖。
2. 实现 `app/api/conversations` 路由（GET、POST、PATCH、DELETE）。
3. 实现 `lib/stores/conversationStore.ts`。
4. 扩展 `ConversationList` 删除交互。
5. 重构 `app/page.tsx` 接入 store。
6. 运行 `npm run lint`、`npm run build`，并手动验证 API 与 UI。

**回滚：** 恢复 `app/page.tsx` mock 数据并删除 API/store 文件即可；卸载 `zustand` 可选；不影响数据库 schema。

## 待确认问题

- 无。实现阶段若数据库连接异常，按 error 状态处理，不阻塞 spec 范围。
