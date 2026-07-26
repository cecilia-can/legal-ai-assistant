# 学习知识库：AI 流式输出方案对比与选型

> 类型：跨 Change 通用参考  
> 来源：Change 1.4 spec 讨论（Plain text vs SSE vs WebSocket、EventSource、主流平台实践）  
> 日期：2026-07-25

本文档汇总 AI 问答产品中「流式输出」常见方案的对比、业界实践、与本项目 roadmap 的选型关系，供 Change 1.4 实现前 review 及后续 Agent 阶段演进参考。

---

## 1. 核心结论（先读这段）

| 问题 | 结论 |
|------|------|
| 流式和不流式的区别？ | 流式 = HTTP body 分块到达，边收边显示；非流式 = 等全文生成完再一次返回 JSON |
| 主流 AI 平台用什么？ | **模型 API 层几乎全是 SSE**；产品 Web 端用 **POST + fetch 读流**，不是 WebSocket |
| A（plain text）和 B（SSE）差在哪？ | **都走 HTTP 流**；差别是 chunk **有没有 `data:` 协议包装** |
| Agent 阶段必须 WebSocket 吗？ | **不必**；多步进度用 **SSE + JSON 事件** 即可；WS 留给协作/语音/主动推送等场景 |
| EventSource 和 SSE 是一回事吗？ | **不是**；SSE 是数据格式，`EventSource` 是只能 **GET** 的浏览器 API |
| 本项目 1.4 spec 选什么？ | **方案 B（SSE + JSON 事件）** — 上游 DeepSeek SSE（SDK）→ BFF 重打包 `token`/`done` 事件 → 前端 fetch POST 解析 |

---

## 2. 方案全景

### 2.1 五种常见方案

| 方案 | 浏览器 ↔ 后端 | 后端 ↔ 模型 | 前端消费 | 复杂度 | 打字机 | 典型场景 |
|------|---------------|-------------|----------|--------|--------|----------|
| **A. Plain text 流** | HTTP 流 `text/plain` | SDK `stream: true` | `fetch` + `getReader()` 拼字符串 | ⭐⭐ | ✅ | 学习/MVP、简单 ChatBot |
| **B. SSE 事件流** | HTTP 流 `text/event-stream` | SDK / 解析上游 SSE | `fetch` + 解析 `data:` 行 | ⭐⭐⭐ | ✅ | **业界 API 标准**、Agent 进度 |
| **B+. SSE + JSON 事件** | 同 B | 同 B | 按 `type` 分支处理 | ⭐⭐⭐⭐ | ✅ | Tool call、ReAct 可视化 |
| **C. WebSocket** | 全双工 WS | SDK / 编排层 | `WebSocket.onmessage` | ⭐⭐⭐⭐ | ✅ | 语音、多人协作、服务端主动推 |
| **D. 非流式 JSON** | 普通 POST 响应 | 非 stream | `await res.json()` | ⭐ | ❌ | 内部批处理、不关心 UX |

### 2.2 数据流总览（本项目 1.4）

```text
浏览器
  │  POST /api/chat  { messages: [...] }
  │  fetch + AbortController
  ▼
Next.js Route Handler
  │  ReadableStream 转发
  │  （1.4 spec：plain text chunk）
  ▼
lib/ai/client.ts（openai SDK）
  │  stream: true
  ▼
DeepSeek API（OpenAI 兼容 SSE 上游）
```

**关键：** 上游永远是 SSE；**A/B 的区别在「服务端 → 浏览器」这一段是否再包一层 SSE 协议。**

---

## 3. 方案 A vs 方案 B（最易混淆）

### 3.1 相同点

- 底层都是 **HTTP 流式响应**（body 持续有数据）
- 前端都用 **`fetch` + `response.body.getReader()`**（聊天要 POST，不用 `EventSource`）
- 都能做打字机效果
- 都能用 `AbortController` 取消

### 3.2 不同点：线上 chunk 长什么样

假设模型依次输出「你」「好」：

**方案 A（plain text）— 浏览器读到的 body：**

```text
你
好
```

**方案 B（SSE）— 浏览器读到的 body：**

```text
data: 你

data: 好

data: [DONE]

```

### 3.3 前端处理差异

| | A Plain text | B SSE |
|--|--------------|-------|
| 解析 | `decoder.decode(value)` 直接拼接 | 按行找 `data:`，去掉前缀再拼接 |
| Content-Type | `text/plain; charset=utf-8` | `text/event-stream` |
| 传纯文本 | 天然适合 | 可以，多一层包装 |
| 传结构化事件 | 需自造分隔符，易乱 | 标准做法：`data: {"type":"tool_start",...}` |

### 3.4 心智模型

- **A = 流式 TXT**：水管里直接流字符
- **B = 流式带面单的快递**：每块前有 `data: `，块间用 `\n\n` 分隔

**用户体验可以完全一样**；**开发者体验**是 A 简单、B 更利于 Agent 扩展。

---

## 4. EventSource 与 fetch 的关系

### 4.1 「EventSource 不能 POST」是什么意思

`EventSource` 是浏览器订阅 SSE 的 API，但：

- **只能 GET**，不能 `method: "POST"`
- **不能带 JSON body**（多轮对话历史无法提交）
- **不能方便设置** `Authorization` 等 header

聊天必须 POST 消息数组，因此：

```javascript
// ❌ 不存在
new EventSource("/api/chat", { method: "POST", body: "..." });

// ✅ 主流写法
fetch("/api/chat", { method: "POST", body: JSON.stringify({ messages }) });
// 再用 getReader() 读 SSE 或 plain text 流
```

### 4.2 概念对照表

| 概念 | 是什么 |
|------|--------|
| **SSE** | 一种** wire format**（`data: xxx\n\n`） |
| **EventSource** | 读 SSE 的一种**浏览器 API**（仅 GET） |
| **fetch + reader** | 读 SSE 的**另一种方式**（可 POST，聊天主流） |

**结论：** 业界用 **B（SSE 格式）** ≠ 必须用 **`EventSource` API**。

### 4.3 EventSource 真正适合的场景

- GET `/notifications/stream` — 订阅通知、无 body
- 服务器推送、参数可放 URL 或无参数

**不适合：** POST 一整段 `messages` 历史的 Chat Completions。

---

## 5. WebSocket：什么时候才需要

### 5.1 Agent ≠ 必须 WebSocket

Agent 常见需求与协议关系：

| 需求 | 是否必须 WS |
|------|-------------|
| 打字机输出 | ❌ HTTP 流 |
| 「正在查法规…」步骤展示 | ❌ 同一条 SSE 流发 `tool_start` 事件 |
| ReAct 多步推理 | ❌ 一次 POST，服务端编排，流式推进度 |
| 用户 cancel | ❌ `AbortController` |
| 服务端无用户操作时主动推送 | ⚠️ 可能需要 WS / 长连接 |
| 多人实时协作编辑 | ⚠️ 更可能需要 WS |
| 单次任务 5～30 分钟怕 HTTP 超时 | ⚠️ 任务队列 + SSE 订阅 job，不一定 WS |

### 5.2 本项目 roadmap 对照

| 阶段 | 流式形态 | 是否规划 WS |
|------|----------|-------------|
| Change 1.4 | **SSE + JSON 事件**（`token` / `done`）+ `lib/api/sse.ts` | ❌ |
| Change 4.x Agent | 同协议扩展 `tool_start` / `tool_result` 等 | ❌（roadmap 未写） |
| Phase 5 案件协作 | 视需求再评估 | 可能有 |

**演进路径：**

```text
1.4  B（SSE + token/done 事件）
  → 4.x  同协议加 Agent 事件（tool_start / tool_result / …）
  → 5.x  若有多人协作再评估 WebSocket
```

---

## 6. 主流 AI 平台实践

### 6.1 官方 API 层

| 平台 | 流式协议 | 流内内容 |
|------|----------|----------|
| OpenAI / DeepSeek | SSE | `data: {"choices":[{"delta":{"content":"..."}}]}` |
| Claude | SSE | 结构化事件：`content_block_delta`、`message_stop` 等 |
| Gemini 等 | SSE 或等价 stream | JSON chunk |

### 6.2 产品 Web 端（ChatGPT、Claude.ai 等）

```text
浏览器 --POST--> 产品自家后端（BFF，Key 不暴露）
                    ↓
               模型 API（SSE）
                    ↓
浏览器 <--HTTP 流-- fetch + reader 解析
```

- **不是**浏览器直连模型 API（生产环境）
- **通常不是** WebSocket 做文字问答
- Agent 步骤可视化：同一条流里混多种 **SSE JSON 事件**

### 6.3 为何主流不用 plain text（A）作对外协议

1. 一种流里要传 token、工具、错误、用量 — plain text 表达力弱  
2. 与上游 OpenAI/Claude SSE JSON 对齐，BFF 抽文本会丢 metadata  
3. SDK、文档、生态都围绕 SSE 事件模型  

**本项目 1.4 选 A 的理由：** 学习阶段只需文字打字机，实现成本最低；**不锁死**后续升级 B+。

---

## 7. 本项目 Change 1.4 spec 选型摘要

来源：`openspec/changes/ai-api-streaming/design.md`（2026-07-25 由方案 A 调整为方案 B）。

| 决策项 | 选择 |
|--------|------|
| AI 提供商 | DeepSeek（OpenAI Compatible） |
| SDK | `openai` npm 包 |
| 下游转发格式 | **B：SSE + JSON 事件**（`text/event-stream`） |
| 本阶段事件类型 | `token`（文本增量）、`done`（结束）、`error`（可选） |
| 上游处理 | SDK 抽 `delta.content`，**不透传** OpenAI 原始 SSE 给浏览器 |
| 前端消费 | **fetch POST + `getReader()` 解析 SSE**（不用 EventSource） |
| SSE 工具 | `lib/api/sse.ts` 编解码 |
| 流开始前错误 | JSON envelope（`jsonError`） |
| System Prompt | 留待 Change 1.7 |
| 状态管理 | `chatStore`（Zustand），与 `conversationStore` 分离 |
| 取消 | 新消息 / 切换会话 / 新建聊天 → `AbortController` |
| 重试 | 429、5xx 最多 1 次 |
| 上下文 | 内存中全量 history（Token 限制留 1.7） |
| 持久化 | 不做（Change 1.5） |

---

## 8. 选型决策树（速查）

```text
只需要文字打字机、快速学习？
  └─ YES → A（plain text）；或精简 B（token/done）← **本项目 1.4 选 B**

需要 tool 步骤、Agent 可视化、对齐 OpenAI 生态？
  └─ YES → B+（SSE + JSON 事件）← 本项目 4.x 方向

需要服务端主动推、多人实时协作、语音双向？
  └─ YES → 评估 WebSocket 或 任务队列 + SSE

只是内部脚本、不关心 UX？
  └─ YES → D（非流式 JSON）
```

---

## 9. 相关文档

| 文档 | 内容 |
|------|------|
| [`openspec/changes/ai-api-streaming/design.md`](../../openspec/changes/ai-api-streaming/design.md) | 1.4 设计决策 |
| [`docs/roadmap.md`](../roadmap.md) | Phase 1.4 / 4.x Agent |
| [`docs/learning/general-backend-concepts.md`](./general-backend-concepts.md) | 传统后端概念对照 |
| [MDN: Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) | SSE 标准 |
| [OpenAI Streaming](https://platform.openai.com/docs/api-reference/streaming) | 上游 SSE 格式 |

---

## 10. 【面试官追问】

以下按常见面试深度排列，含参考解答要点。

---

### Q1：ChatGPT 那种打字机效果，技术上是怎么实现的？

**参考解答：**

核心是 **HTTP 流式响应**，不是等全文再显示。流程是：前端 POST 对话历史到 BFF → BFF 调模型 API 并设 `stream: true` → 模型通过 SSE 逐 token 返回 → BFF 转发给浏览器 → 前端用 `fetch` 的 `ReadableStream` 逐块读取，追加到 assistant 消息上触发 React 重渲染。关键点是 **增量更新 UI** 和 **连接保持打开**，而不是 WebSocket。

**加分点：** 提到首 token 延迟（TTFT）、`AbortController` 取消、流式中途错误处理。

---

### Q2：SSE 和 WebSocket 有什么区别？AI 聊天该用哪个？

**参考解答：**

- **SSE**：基于 HTTP，**单向**（服务器 → 客户端），文本协议，自动重连（若用 EventSource），适合流式生成、进度推送。  
- **WebSocket**：独立协议，**全双工**，适合高频双向、协作、语音。  

AI **文字问答**主流是 **HTTP + SSE 风格流**（POST + fetch reader），因为一轮对话本质是「客户端提交 prompt → 服务器流式返回生成结果」，单向为主。Agent 多步进度也可在同一条 SSE 流里用 JSON 事件表达，不必 WebSocket。

**加分点：** Vercel Serverless 对长连接 WS 不友好；SSE over HTTP 更易部署。

---

### Q3：既然 SSE 是主流，为什么还有项目用 plain text 流？

**参考解答：**

Plain text 流是 SSE 的**简化子集**：同样 HTTP chunked body，但不包装 `data:` 行。优点是前后端实现简单，前端直接字符串拼接；缺点是难以在同一条流里传递 tool 事件、token 用量等结构化信息。适合 MVP、教学、或 BFF 内部只转发纯文本的场景。生产级 Agent 产品通常会升级为 **SSE + JSON 事件**。

---

### Q4：EventSource 和 fetch 读 SSE 流有什么区别？

**参考解答：**

`EventSource` 只能 **GET**，不能 POST body，不能方便带 Authorization header，因此**不适合**需要提交 messages JSON 的 Chat API。`fetch` POST 可以带 body 和 headers，再用 `response.body.getReader()` 手动解析 SSE 的 `data:` 行。所以聊天产品**协议是 SSE，API 是 fetch**，不是 `new EventSource()`。

**易错点：** 把「用了 SSE 格式」和「用了 EventSource API」混为一谈。

---

### Q5：模型 API 返回的 SSE，和你的 BFF 转发给前端的 SSE 是一回事吗？

**参考解答：**

**不完全是。** DeepSeek/OpenAI 上游 SSE 的 `data:` 里是完整 JSON（含 `choices[].delta.content`）。BFF 可以：

1. **透传**上游 SSE（前端/SDK 自己 parse JSON）— 接近原生 B  
2. **抽文本再转发** plain text — 方案 A，前端更简单  
3. **重打包**成自家 SSE JSON 事件（`type: token | tool_start | done`）— B+，Agent 常用  

三层可以格式不同；关键是理解 **「上游 SSE → BFF 翻译 → 下游格式」**。

---

### Q6：如何实现「用户点击停止生成」？

**参考解答：**

前端：`AbortController`，在 `fetch('/api/chat', { signal })` 上传入，`stop()` 时 abort。  
后端：监听 request 的 `abort`/`signal`，停止从模型 stream 读取并 `controller.close()`，释放资源。  
还要清理 UI 状态（`streamingConversationId`、半成品 assistant 消息保留或标记 interrupted）。

**加分点：** 避免 abort 后仍更新 store（检查 signal.aborted）；Vercel 上注意 runaway stream 消费。

---

### Q7：流式 API 的错误怎么处理？和普通 JSON API 有何不同？

**参考解答：**

分两阶段：

1. **流开始前**（参数校验、Key 缺失、模型 4xx）：仍返回普通 JSON HTTP 响应（如 400/500），本项目用 `{ code, message, data }` envelope。  
2. **流开始后**：HTTP 200 已发出，中途失败可能在 stream 内发 error 事件（Claude/OpenAI 规范）或连接直接断开；前端需处理 `reader` 异常、不完整 assistant 消息。

**易错点：** 不能对整个流式成功响应再套 JSON envelope，因为 body 不是 JSON。

---

### Q8：Agent 多步骤执行，一定要用 WebSocket 吗？

**参考解答：**

不一定。一次 `POST /api/agent/run` 开启 HTTP 流，服务端跑 ReAct 循环，每步往流里写事件，例如 `{type:"tool_start"}`, `{type:"tool_result"}`, `{type:"token"}`, `{type:"done"}`。前端按 type 更新步骤面板和答案区。只有需要**服务端主动推送**（用户未发起请求）、**多人实时协作**或**语音全双工**时，才更倾向 WebSocket。

---

### Q9：为什么 ChatGPT 不用 WebSocket 做普通聊天？

**参考解答：**

普通聊天交互模型是 **request-response 变体**：用户发一条 → 服务器生成一条流式回复 → 结束。单向推送为主，HTTP SSE 足够。WebSocket 的优势是低延迟双向和多路复用，但增加连接管理、扩容、鉴权复杂度。大规模产品会在 BFF 层统一 HTTP 流，便于 CDN、网关、Serverless 和缓存策略；WS 留给真正需要双向的场景。

---

### Q10：Vercel 部署流式 API 要注意什么？

**参考解答：**

- 使用 Route Handler 返回 `ReadableStream`，不要缓冲全文再 `return`。  
- 注意 **function duration 上限**，超长生成可能超时 → Agent 长任务可改 job 队列 + 轮询/SSE。  
- 关闭不必要的 `buffering`（反向代理层 `proxy_buffering off` 等）。  
- 流式响应 **Content-Type** 正确（`text/plain` 或 `text/event-stream`）。  
- 客户端断开时服务端应停止读模型 stream，避免浪费 token。

---

### Q11：如果让你从 0 设计一个法律 Agent 产品，流式协议怎么演进？

**参考解答（结合本项目）：**

- **Phase 1 ChatBot**：plain text 或精简 SSE token 事件，快速验证 UX。  
- **Phase 4 Agent**：SSE + JSON 多事件（tool、thinking、token、done），Execution 可视化。  
- **Phase 5 协作**：若多人同案实时编辑再评估 WebSocket 或 CRDT + 轮询。  
- 始终 **浏览器 → 自家 BFF**，Key 不暴露；上下文与 Token 管理独立模块（1.7 `prompts.ts` / `context.ts`）。

**加分点：** 展示对 roadmap 分阶段交付的理解，而非过度设计。

---

### Q12：fetch 读流时，一次 `reader.read()` 读到的内容和 token 是一一对应的吗？

**参考解答：**

**不是。** TCP/HTTP chunk 边界与模型 token 边界无关。一次 `read()` 可能包含多个 token 的部分字节，或多个 token 被拆到多次 `read()`。前端应使用 `TextDecoder` 的 `stream: true` 处理 UTF-8 多字节字符被截断的情况。UI 层只关心「追加新文本」，不要假设 chunk 与 token 对齐。

---

## 11. 标签与复习

- **标签**：`#streaming` `#sse` `#websocket` `#fetch` `#EventSource` `#agent` `#architecture` `#general` `#interview`
- **状态**：`#待复习`
- **延伸**：
  - Change 1.4 实现后对照本文复盘实际代码路径 ✅
  - Phase 4 启动时更新「演进路径」一节是否仍成立 ✅
  - UTF-8 流式解码 `TextDecoder { stream: true }` ⚠️需结合实现验证
