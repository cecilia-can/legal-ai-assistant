## 背景

当前状态：

- Prisma 已有 `Conversation` / `Message` 模型与级联删除（Change 1.1）。
- 会话 CRUD 与 `conversationStore` 已就绪（Change 1.3）。
- `POST /api/chat` + `chatStore` 提供 SSE 流式回复，消息仅存内存（Change 1.4）。

本 Change 把「内存对话」升级为「可恢复的持久对话」，同时保持流式 UX 不变。

## 目标 / 非目标

**目标：**

- 提供会话维度的消息列表（分页）、创建、删除 API。
- 通过 `messageService` 统一 Prisma 访问，Route Handler 只做校验与 envelope。
- 切换 / 进入会话时从 DB 加载历史到 `chatStore`。
- 一轮对话在 `done` 或 abort（assistant 已有非空内容）后持久化本轮 user 与 assistant 消息（方案 B，允许半截回复入库）。
- 支持按消息 id 删除单条消息，并同步内存状态。
- 必要时为分页增加索引 migration。

**非目标：**

- 在 `POST /api/chat` 内直接写库（保持流式 BFF 与持久化职责分离）。
- Markdown / 代码高亮（Change 1.6）。
- System Prompt、Token 截断、对话总结（Change 1.7）。
- 用户认证与多租户隔离。
- 消息编辑、重新生成、软删除、全文搜索。
- 乐观锁 / 多端实时同步。

## 设计决策

### 1. 持久化时机：客户端编排，API 落库（方案 B）

**决策：**

- `POST /api/chat` 继续只负责 SSE，不写 `Message` 表。
- `chatStore` 在本轮需要落库时，调用消息 API 依次写入：
  1. user 消息（本轮 content）
  2. assistant 消息（当时已有的 content）
- **触发落库的条件（满足其一即可）：**
  1. 收到 SSE `done`，且 assistant 最终 content 非空；
  2. 用户 abort（或等价取消），且 assistant 已有**非空** content（保存半截回复）。
- **不落库：**
  - 流开始前失败（未产生有效 assistant）；
  - abort 时 assistant 仍为空（仅占位，无实质文本）。
- 落库成功后用服务端 id 替换内存临时 id。

**理由：** 更贴近主流 Chat 产品体验——切换会话 / 取消生成时，已打出的内容刷新后仍可恢复；实现仍比「发送即写 user」简单，且与独立 messages API 编排一致。

**备选（否决）：**

- 方案 A（仅 `done` 落库）：历史更干净，但误 abort 会丢整轮已生成内容。
- 在 `/api/chat` 内按 token 增量写库：复杂度高、与 SSE 职责耦合。
- 方案 C（发送即写 user）：user 最稳，但悬空 user、回滚与状态机更重，本阶段不做。

### 2. 消息 API 形状

**决策：**

| 方法 | 路径 | 作用 |
|------|------|------|
| `GET` | `/api/conversations/[id]/messages` | 分页列出消息 |
| `POST` | `/api/conversations/[id]/messages` | 创建一条消息 |
| `DELETE` | `/api/conversations/[id]/messages/[messageId]` | 删除一条消息 |

- 所有 JSON 响应使用既有 `{ code, message, data }` envelope。
- `POST` body：`{ role: "user" \| "assistant", content: string }`。
- `GET` 查询参数：
  - `limit`：默认 `50`，最大 `100`
  - `cursor`：可选，上一页返回的游标（基于 `createdAt` + `id`）
  - 排序：按 `createdAt` **升序**（聊天时间线从旧到新）
  - 分页策略：**取该会话最新的一页**作为首屏（即先按 `createdAt desc` 取 `limit` 条再反转为升序返回），加载更早历史时用 `cursor` 向前翻页。
- 响应 `data` 建议：`{ items: MessageJson[], nextCursor: string | null }`。
- 会话不存在时返回 `404`。

**MessageJson：** `id`、`conversationId`、`role`、`content`、`createdAt`（ISO 8601）。

### 3. messageService 职责

**决策：** `lib/services/messageService.ts` 提供至少：

- `listMessages(conversationId, { limit, cursor })`
- `createMessage(conversationId, { role, content })`
- `deleteMessage(conversationId, messageId)`
- 内部校验 conversation 存在；删除时校验 message 属于该 conversation。
- 创建成功后 SHOULD 触达更新父会话 `updatedAt`（Prisma 关系更新或显式 `conversation.update`），以便会话列表排序反映最近活跃。

Route Handler 不直接堆砌复杂 Prisma 查询。

### 4. chatStore 扩展

**决策：** 新增（名称可微调，语义固定）：

- `loadMessages(conversationId)`：若该会话尚未加载或需刷新，请求 GET；写入 `messagesByConversation`；用 DB `id` 作为消息 id。
- `messagesLoadingByConversation` 或单一 `loadingConversationId`：避免重复请求与闪烁。
- `sendMessage`：在 `done` 或「abort 且 assistant 非空」时调用两次 POST（user 再 assistant），并用返回的服务端 id **替换**内存中临时 id。
- `deleteMessage(conversationId, messageId)`：调用 DELETE 并更新内存。
- 切换会话：`app/page.tsx` / `selectConversation` 路径调用 `loadMessages`（若缓存已有且非 stale，可跳过；本阶段简单策略：**无缓存则加载，有缓存则复用**；删除会话仍 `clearConversationMessages`）。

首条消息自动更新会话标题的逻辑（1.3）保持不变。

### 5. 索引与 migration

**决策：**

- 若 schema 尚无适合分页的索引，为 `Message` 增加 `@@index([conversationId, createdAt])`。
- 通过 `npx prisma migrate dev` 生成 migration；无破坏性数据变更，无需 reset。

### 6. 删除语义

**决策：**

- 单条消息：硬删除。
- 删除会话：继续依赖 DB cascade，无需逐条删消息。
- UI：本阶段 API + store 支持删除即可；侧栏会话删除确认 UX 已有。消息气泡删除入口若时间允许可做最小按钮，否则至少保证 API/store 可测。

## 风险 / 权衡

- **[风险] 落库失败 → 内存有消息、刷新丢失**  
  → Mitigation：设置 `error` 提示用户重试；可选后续加「重新保存」；本阶段不引入本地 outbox。

- **[风险] abort 半截回复进入历史 → 干扰后续多轮上下文**  
  → Mitigation：1.7 Token/上下文策略可过滤或截断过短/未完成轮次；本阶段 UI 可不额外标注「已中断」（留给 1.8 可选优化）。

- **[风险] 长会话首屏只加载最近 N 条 → 发给模型的上下文变短**  
  → Mitigation：`sendMessage` 使用内存中已加载消息；Token 窗口策略留给 1.7。文档注明首屏分页默认 50。

- **[风险] 临时 client id 与 DB id 替换瞬间列表 key 变化**  
  → Mitigation：替换时保持顺序与 content 不变；React key 使用稳定 id，替换后一次更新。

## 迁移计划

1. 更新 Prisma schema 索引（如需要）并 migrate。
2. 实现 `messageService` + messages Route Handlers。
3. 扩展 `chatStore` 与页面加载逻辑。
4. `npm run lint` / `npm run build`；手动验证：发送 → 刷新仍在；切换会话加载；分页；删除。

回滚：还原 API/store 提交；migration 可 `migrate resolve` / 向下迁移（仅删索引时风险低）。

## 待决问题

- 消息气泡上的删除按钮是否纳入本 Change UI（默认：API + store 必做；UI 入口建议做最小可用）。
- 是否提供 `POST` 批量创建（user+assistant 一次请求）——默认两次单条 POST，更简单；若实现中发现竞态再改为 batch。
