# 项目面试复盘：Legal AI Assistant（法律智能助手）

> 日期：2026-10-13
> 分析范围：完整项目（以当前工作区代码为准）
> 岗位：AI 全栈开发工程师
> 场景：秋招技术一面题库

## 证据与边界

- 已阅读：`app/api/chat/route.ts`、`lib/api/sse.ts`、`lib/stores/chatStore.ts`、`lib/streaming/displayQueue.ts`、`lib/ai/{context,prompts,jailbreak}.ts`、`lib/services/messageService.ts`、`prisma/schema.prisma`、会话/消息 API、认证模块及性能、流式、持久化学习文档。
- 已验证事实：项目使用 Next.js App Router、React、TypeScript、Zustand、Prisma/PostgreSQL、Auth.js；支持多会话、流式回复、消息持久化、基于用户 ID 的会话隔离和 Markdown 渲染。
- 待确认：简历中的项目日期、个人独立负责范围，以及虚拟列表压测指标的测试环境与原始 trace。
- 重要更正：当前 `components/chat/MessageList.tsx` 使用 `messages.map()` 全量渲染；`package.json` 中未发现虚拟列表依赖，仓库内也未发现“35877 / 150～238 / Paint 63% / Commit 26%”的压测记录。因此这组“聊天虚拟列表性能优化”不应陈述为当前已完成实现。

## 30 秒项目讲解

这是一个面向中国法律咨询的信息辅助型 AI 对话应用。用户通过 Auth.js 登录后，可创建和管理自己的会话；前端用 Zustand 管理按会话分桶的消息状态，使用 `fetch + ReadableStream` 消费服务端统一封装的 SSE JSON 事件。服务端先校验登录和会话归属，再加载历史、做越狱拦截、Token 预算裁剪与可选 RAG 上下文拼接，随后把上游模型流转换为 `token/done/error` 事件。流结束或用户取消后，客户端将完整轮次通过消息 API 以 Prisma 事务持久化到 PostgreSQL。

可主动说明边界：项目是法律信息辅助工具，不替代律师意见；当前安全策略主要是服务端 System Prompt、规则拦截和上下文治理，而非完备的内容安全系统。

## 技术点 1：AI 流式响应与会话控制

### 实现与调用链

`app/api/chat/route.ts` 在拿到上游 OpenAI-compatible `AsyncIterable` 后，为每个增量文本调用 `encodeSseEvent({ type: "token", text })`；正常结束发 `done`，捕获流内异常发 `error`。`lib/api/sse.ts` 采用 `data: JSON\\n\\n` 的 SSE 帧，客户端 `consumeSseStream` 维护 remainder，解决网络字节块恰好切断 JSON/SSE 帧的问题。

`chatStore` 用 `AbortController` 向 `fetch` 传递 `signal`；全局保存当前 `activeStreamConversationId`，事件到达时再次校验会话 ID 和 abort 状态，避免旧会话的迟到事件写入新会话。`displayQueue` 将网络到达与 UI 按字符展示解耦，并对滚动使用 `requestAnimationFrame` 节流。流结束或取消时，先 flush 已收到文本，再按网络侧完整文本落库。

### 面试官提问 1：为什么不用 EventSource？

- **难度 / 意图**：必须掌握；考察协议与浏览器 API 选择。
- **回答要点**：该接口需要 POST JSON body、认证链路和 AbortSignal；原生 EventSource 主要面向 GET，取消和携带请求体不如 fetch 自然。因此选择 `fetch + response.body.getReader()`，但服务端协议仍保持标准 SSE 帧，易于调试。
- **参考回答**：我把“传输格式”和“客户端 API”分开考虑。格式上用 SSE，因为单向 token 推送、文本调试和代理兼容性都合适；消费端不用 EventSource，而是 fetch 读取 `ReadableStream`。原因是聊天请求需要携带 conversationId 和本轮内容的 POST JSON，也需要用户点击停止时精确 abort。前端不能假设一次 `reader.read()` 等于一个 token 或一条 SSE，所以我累积 decoder 输出，以空行切帧，并保留尾部不完整片段到下一次读取。
- **追问路径**：字节 chunk 为什么不能直接 JSON.parse？；服务端中途异常如何通知？；代理缓冲会怎样影响首字延迟？；若要断线重连如何设计 requestId / last event id？
- **失分点**：把 TCP chunk、模型 token、SSE event、React 渲染帧说成一一对应。

### 面试官提问 2：如何保证切换会话不会串流？

- **难度 / 意图**：必须掌握；考察并发与 UI 状态边界。
- **回答要点**：新发送前调用 `abortStream()`；请求绑定 controller；回调中同时检查 `controller.signal.aborted` 与 `activeStreamConversationId === conversationId`；消息状态按 `messagesByConversation[conversationId]` 分桶。
- **参考回答**：我不只依赖“切页时 abort”。网络取消有时存在已经排队的回调，所以消费每个事件前都会再做身份校验。即使旧流有迟到 token，它也不会追加到不匹配的会话桶。代价是当前实现同一浏览器实例只允许一个流；这是为了换取清晰的交互语义。若产品要允许多会话并行生成，我会把 controller、display queue 和流状态改成按 conversationId 的 Map。
- **追问路径**：abort 后是否保存部分回复？；全局单流的产品限制是什么？；如何为每次请求引入 requestId？

## 技术点 2：消息持久化、多会话与用户隔离

### 实现与调用链

`Conversation` 带 `userId`，`Message` 归属 `conversationId`，并建有 `(userId, updatedAt)` 与 `(conversationId, createdAt)` 索引。所有会话和消息 API 均先调用 `requireApiSession()`；消息服务通过 `assertConversationOwnership(conversationId, userId)` 查询 `{ id, userId }`，再进行读写删，避免仅凭客户端传入 ID 越权。

生成流不直接写库。客户端流结束后调用 `POST /api/conversations/:id/messages`；`createMessages` 在一个 Prisma `$transaction` 中顺序创建 user 和 assistant 消息并更新会话时间。这样避免“两次 POST 时 user 成功、assistant 失败”的孤儿数据。分页使用 `createdAt + id` 编码的 keyset cursor，避免深分页 OFFSET 的扫描与错位问题。

### 面试官提问 3：为什么流接口不直接写消息表？

- **难度 / 意图**：应当理解；考察流式失败、持久化与一致性边界。
- **参考回答**：我把生成和 CRUD 分开：`/api/chat` 的职责是生成并尽快推送，消息 API 的职责是短请求和事务。流在网络异常、用户 stop、模型中断时存在部分文本；如果流 handler 一边推一边写，需要处理半写入、回滚和重复写。当前方案用网络侧累计的 `networkAssistantText`，在 done 或 abort 后一次性批量落库；只要 assistant 有非空内容，就和 user 在同一事务保存。代价是多一次 HTTP 往返，但一致性边界更清楚。
- **追问路径**：持久化失败如何提示和重试？；为什么不等打字机动画结束？；事务里更新 Conversation.updatedAt 的目的？；如何处理重复提交？
- **失分点**：声称“事务能覆盖 SSE 已经发送给用户的内容”。事务只能保证数据库原子性。

### 面试官提问 4：用户隔离做在哪一层？

- **难度 / 意图**：必须掌握；考察 API 授权是否真正落地。
- **参考回答**：不是只在前端隐藏别人的会话。每个 API 先从 Auth.js session 得到服务器可信的 userId；会话查询以 userId 过滤，消息服务在查询或写入前校验 conversationId 同时属于该 userId。数据库关系通过 Conversation.userId 和级联关系表达归属，前端传来的 conversationId 只是待校验输入。当前模型属于应用层多租户隔离；如果未来要提升到数据库层，还可以使用 PostgreSQL RLS 作为纵深防御。
- **追问路径**：`findUnique({id})` 为什么不够？；删会话的 cascade 风险？；RLS 的策略如何设计？

## 技术点 3：Prompt 安全与上下文治理

### 实现与调用链

`getLegalAssistantSystemPrompt()` 只在 `buildModelMessages()` 服务端创建 system message；客户端请求只传 conversationId/content，不能提交或覆盖 system prompt。`isLatestUserJailbreak()` 对最新用户消息执行中英文角色覆盖、忽略规则等正则检测；命中后由 `createFixedTextSseResponse()` 返回统一 SSE 拒答，不调用模型。

`trimHistoryToBudget()` 始终保留 system message 和最新 user 消息，从最早历史开始滑动裁剪直到满足 `MAX_INPUT_TOKENS`。`computeInputTokenStats()` 记录裁剪前后估算 token；聊天路由还通过每用户的请求/Token 配额限制滥用。可选 RAG 内容由服务端以“已授权知识库资料”追加到 system message。

### 面试官提问 5：System Prompt 为什么说不可覆盖？

- **难度 / 意图**：必须掌握；考察信任边界。
- **参考回答**：这里的“不可覆盖”是架构意义的：system prompt 不暴露给客户端配置，也不是拼接在用户输入里，而是在服务端以 role=system 放到模型消息数组第一个位置。用户文本即使出现“忽略以上规则”，在模型协议中仍是 user role；同时我们在调用模型前对典型覆盖模式做规则拦截。我要诚实说明：这不是数学上的绝对安全，模型仍可能被新型注入绕过，所以生产环境还需要模型侧安全能力、审计、持续红队样本和输出侧策略。
- **追问路径**：正则为何会误杀？；为什么只检查最新 user？；RAG 文档也是不可信输入时怎么办？；系统提示过长如何影响成本？
- **失分点**：把 prompt 当作权限系统，或声称正则能完全防越狱。

### 面试官提问 6：滑动窗口怎样保证最新问题可回答？

- **难度 / 意图**：应当理解；考察 token 预算与语义取舍。
- **参考回答**：先构造固定 system message，再从完整历史的最早处逐步丢弃，直到 `system + 剩余历史` 不超过预算；无论如何保留最新 user。这样保证本轮意图不会因历史过长被裁掉。代价是早期上下文会消失，当前没有摘要压缩；后续可对被裁剪历史做分层摘要，或只为需要跨轮引用的内容保留结构化记忆。Token 计数是本地估算，最终仍应以模型 usage 和可观测日志校准。
- **追问路径**：最新 user 自身超预算怎么办？；摘要何时触发？；RAG context 如何参与总预算？

## 技术点 4：Markdown 与聊天列表性能——简历风险项

### 当前代码事实

助手消息通过 `MessageBubble` / `MessageContent` 渲染 Markdown；流式中的最后一条 assistant 消息暂不走 Markdown，以降低每个增量重复解析的压力，结束后再启用。`MessageList` 有粘底、回到底部按钮和 rAF 滚动节流，但当前是完整 `messages.map()`，并未虚拟化。

### 面试官提问 7：你说做了动态高度虚拟列表，如何实现？

- **结论**：基于当前仓库，不能声称已实现。应从简历删除该指标，或先补齐实现、基准脚本、trace 和可复现说明后再写。
- **可回答的真实替代**：我已做的列表相关优化是：流式阶段禁用 Markdown 渲染、将网络 token 与展示队列解耦、滚动每帧至多执行一次，以及只在用户接近底部时自动跟随。这些优化不等于虚拟列表。
- **若未来真实实现后的设计方向**：采用支持动态测量高度的 windowing（如 `@tanstack/react-virtual`），用 `measureElement` / `ResizeObserver` 更新高度，向上加载历史时保存“首个可见项 + offset”以补偿滚动；流式最后一项高度变化要重新测量，overscan 防止高速滚动白屏。必须用固定 2000 条 fixture、同浏览器和同硬件记录 DOM 节点、React Profiler 与 Chrome Performance trace。

### 面试官提问 8：流式中为什么不实时 Markdown 渲染？

- **难度 / 意图**：应当理解；考察渲染成本与体验取舍。
- **参考回答**：Markdown 解析与生成 React 树会随着消息变长重复执行；流式阶段格式通常也不完整，例如代码块和列表尚未闭合。因此当前最后一条 assistant 在 streaming 时作为纯文本显示，流结束后切回 Markdown。好处是降低连续解析压力并避免半截语法频繁跳变；代价是流式阶段没有完整富文本样式。对于更高要求，可做增量解析或按段落稳定后再渲染，但复杂度和边界处理会显著增加。

## 面试风险与待补强

- **虚拟列表数据不实风险（高）**：在未补实现与 trace 前，删掉“35877→150～238、Paint 63%、Commit 26%”全部数字；这是最容易被现场打开 DevTools 或追问算法击穿的一项。
- **安全表述边界**：说“降低越狱风险”而不是“保障绝对安全”；规则拦截有漏检与误杀。
- **流式异常**：当前协议定义 `error` 事件，但前端消费回调主要处理 token/done；应熟悉非 2xx、流中错误、abort 和落库失败的实际 UI 行为。
- **单流限制**：当前模块变量实现更适合单页面单流，不能泛化为支持任意并行会话。
- **指标归因**：消息持久化文档中的本地 Postgres 延迟改善主要来自消除远程网络 RTT，不能表述成 SQL 本身优化。

## 简历建议（可安全保留的措辞）

- “设计 SSE + JSON 流式协议，统一 token/done/error 事件；前端以 fetch + ReadableStream 增量解析，利用 AbortController 和会话 ID 校验实现取消与防串流。”
- “服务端注入不可由客户端覆盖的法律助手 System Prompt；结合规则化越狱拦截、用户配额及保留最新问题的滑动窗口裁剪，降低提示注入与长上下文失控风险。”
- “基于 Auth.js 与 Prisma/PostgreSQL 实现会话、消息持久化和用户级数据隔离；批量消息以事务写入，使用 keyset cursor 支持会话历史加载。”
- 将“聊天虚拟列表性能优化”改为“流式展示与 Markdown 渲染优化”，除非补齐虚拟列表的真实实现和可复现实验。
