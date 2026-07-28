# 学习知识库：后端技术栈 / 语言选型决策

> 类型：跨 Phase 架构决策 · 面试向  
> 来源：Phase 1 完成后，规划 Phase 2（RAG）/ Phase 4（Agent）前的技术栈讨论  
> 日期：2026-07-28  
> 状态：✅ 已决策（Phase 2–4 继续 Next.js 全栈；Python 作为可选并行学习路径）

---

## 1. 背景与问题

项目 Phase 1（ChatBot）已用 **Next.js App Router + Route Handlers + Prisma + PostgreSQL** 跑通多会话、流式对话、消息持久化。进入 Phase 2（法律知识库 / RAG）、Phase 4（案件分析 Agent）前，出现三个核心疑问：

1. **知识库、Agent 应该用什么技术栈写？** 是否必须换 Python？
2. **Next.js 写的后端和 Node.js 后端差距大吗？** 后期能否迁到独立 Node 服务？
3. **若希望学习 Python，能否另开 Python 项目，当前项目只做前端？**

本文记录对上述问题的调研、对比与**当前决策**，供后续 Phase 实施与面试复盘引用。

---

## 2. 决策摘要（TL;DR）

| 维度 | 决策 |
|------|------|
| **Phase 2–4 主路径** | 继续在 **Next.js 全栈（TypeScript / Node 运行时）** 上实现 RAG、Tool Calling、Agent |
| **数据层** | **PostgreSQL + pgvector**（与现有 Prisma 共用，Docker 已选 pgvector 镜像） |
| **AI 能力** | **OpenAI Compatible API**（Embedding + Chat + Tool Calling），不本地跑模型 |
| **代码组织** | 业务逻辑放 `lib/rag/`、`lib/agent/`、`lib/services/`，Route Handler 保持薄层 |
| **Python** | **不作为主路径**；若学 Python，采用 **并行 lab 项目** 或 **Phase 3 后局部 AI 微服务**，而非立刻拆双栈 |
| **后期迁移** | 优先 **Next.js → 独立 Node（Fastify/Hono）** 抽 `lib/`；仅在 PDF 解析 / 超长 Agent 等硬瓶颈时 **局部引入 Python Worker** |

**一句话**：Next.js 后端就是 Node.js 后端；RAG/Agent 不是 Python 专属，API 型架构下 TypeScript 足够；Python 是生态与学习路径的加分项，不是当前项目的必选项。

---

## 3. 候选方案对比

### 3.1 方案 A：Next.js 全栈延续（✅ 选用）

```text
浏览器 → Next.js Route Handlers → lib/rag | lib/agent → Prisma → PostgreSQL + pgvector → LLM API
```

| 优点 | 缺点 |
|------|------|
| 与 Phase 1 无缝衔接，一个 repo、一套部署（Vercel + Neon） | Vercel Serverless 有 execution duration 上限 |
| 前后端同语言（TS），类型与工具链统一 | TS 侧 LangChain 等生态小于 Python |
| SSE + JSON 事件流已为 Agent 预留扩展（Change 1.4） | 复杂 PDF 解析库不如 Python 丰富 |
| `lib/` 模块化后易于日后抽离 | |
| 符合 `docs/vision.md`、`docs/roadmap.md` 既定规划 | |

### 3.2 方案 B：Next.js 前端 + 独立 Node 后端

```text
浏览器 → Next.js UI/BFF → Fastify/Hono → lib/ → DB / LLM
```

| 优点 | 缺点 |
|------|------|
| 摆脱 Serverless 限制，可长连接、长任务 | 多一个服务部署与运维 |
| `lib/` 可从 Next.js 几乎原样迁移 | Phase 2 初期收益不明显 |
| 团队前后端分工更清晰 | 当前单人学习阶段 ROI 低 |

**定位**：**演进选项**，非 Phase 2 起点。触发条件：Vercel 超时、需自托管、或团队拆分。

### 3.3 方案 C：Next.js 前端 + Python 后端（FastAPI）

```text
浏览器 → Next.js UI → FastAPI → LangChain/LlamaIndex → DB / LLM
```

| 优点 | 缺点 |
|------|------|
| Python AI 生态最全（LangChain、LangGraph、文档解析） | 双语言、双部署、接口对齐成本高 |
| 面试 / 就业向 AI 工程资料多 | 与现有 Prisma、Route Handlers 重复建设 |
| 复杂法律 PDF 处理潜力更大 | 学习阶段易「工程复杂度 > 业务进度」 |

**定位**：**并行学习** 或 **Phase 3 后局部 AI 服务**，非全量替换 Phase 1 后端。

### 3.4 方案 D：一开始就双栈（Next.js + Python 各写一遍）

**结论：❌ 不推荐。**

每个 Change 维护两套实现，联调、鉴权、数据 ID 对齐、双部署会吞噬 RAG/Agent 原理的学习时间。

---

## 4. 关键认知澄清

### 4.1 Next.js 后端 ≠ 另一种后端语言

`app/api/chat/route.ts` 运行在 **Node.js 运行时**，使用标准 Web API（`Request`、`Response`、`ReadableStream`）。与 Express/Fastify 的差异在 **框架与部署形态**，不在 JavaScript/TypeScript 能力本身。

当前聊天 API 已是典型 Node 后端模式：

- 解析 JSON body、校验输入
- 调用 `lib/ai/client.ts` 封装的上游 SDK
- 用 `ReadableStream` 输出 SSE

Phase 2 的 RAG、Phase 4 的 Agent **同样是 Node 代码**，只是模块从 `lib/ai/` 扩展到 `lib/rag/`、`lib/agent/`。

### 4.2 Python「更好」吗？——分场景，非绝对

| 场景 | Node/TS | Python | 本项目 Phase |
|------|---------|--------|--------------|
| 调 LLM API 做 Chat / Embedding | ✅ | ✅ | 1.4 已做 |
| pgvector 向量检索 | ✅ | ✅ | 2.1–2.3 |
| 文档切片 + RAG Prompt | ✅ | ✅ | 2.2–2.3 |
| 复杂 PDF / 法律版式保留 | ⚠️ | ✅ 更强 | 3.1 |
| ReAct / 多步 Agent | ✅ LangChain.js / 自研 | ✅ LangGraph 等 | 4.1–4.4 |
| 本地模型 / 传统 NLP | ❌ 弱 | ✅ | 未规划 |
| 与 React 前端统一栈 | ✅ | ❌ | 持续受益 |

**结论**：做 **API 驱动的 RAG/Agent**，Node 与 Python **能力等价**；Python 在 **框架成熟度、文档解析、AI 就业向资料** 上更占优。对本项目学习目标是「现代 AI 应用架构」，Node 全栈可以完整覆盖 roadmap。

### 4.3 后期迁移成本评估

| 迁移路径 | 成本 | 说明 |
|----------|------|------|
| Next.js → 独立 Node | ⭐ 低～中 | `lib/` 原样搬；重写 HTTP 路由层；Prisma 不变 |
| Next.js → Python AI 服务 | ⭐⭐ 中 | AI 层重写；UI + 会话 CRUD 可保留在 Next.js |
| Node 全栈 → Python 全栈 | ⭐⭐⭐ 高 | 非必要不做 |

**架构原则**：Route Handler **薄**、领域逻辑 **厚**，为迁移留接口而非留债务。

---

## 5. 演进路径（决策后的落地计划）

```text
Phase 1（已完成）
  Next.js 全栈：Chat、SSE、Prisma、消息持久化

Phase 2–4（主路径）
  + lib/rag/（chunker、embedder、retriever）
  + lib/agent/（tools、ReAct loop）
  + pgvector + Embedding API
  + 聊天 API 注入 RAG context；SSE 扩展 Agent 事件

若遇 Vercel 超时 / 需自托管
  lib/ 抽到 Fastify/Hono Worker（仍 Node）

若 Phase 3 PDF 解析或 Phase 4 超长 Agent 遇硬瓶颈
  局部 Python FastAPI 微服务（仅 AI 管道）
  Next.js 保留 UI + 会话 BFF

并行学习（可选）
  legal-ai-python-lab：FastAPI + LangChain 复现 mini-RAG，不对主 repo 强依赖
```

### 5.1 推荐目录结构（Phase 2 起）

```text
lib/
  ai/           # 已有：client、prompts、context
  rag/          # chunker、embedder、retriever
  agent/        # tools、planner、executor
  services/     # documentService、messageService
app/api/
  chat/         # 薄层：组 messages + 调 lib
  documents/    # 上传、管理
```

---

## 6. 与项目文档的一致性

| 文档 | 相关内容 |
|------|----------|
| [`docs/vision.md`](../vision.md) | 后端：Route Handlers；未来：pgvector、Tool Calling、Agent Framework |
| [`docs/roadmap.md`](../roadmap.md) | Phase 2 pgvector；Phase 4 Agent 框架搭建 |
| [`docs/deployment.md`](../deployment.md) | Vercel + Neon；duration 上限需关注 |
| [`docs/learning/general-backend-concepts.md`](./general-backend-concepts.md) | 单体 Next.js、不做微服务 |
| [`docs/learning/general-streaming-protocols.md`](./general-streaming-protocols.md) | Agent 用 SSE + JSON，不必 WebSocket |

本决策 **不修改 roadmap 阶段划分**，仅明确 **语言/运行时** 与 **可选演进分支**。

---

## 7. 面试官追问与解答思路

> 使用说明：采用 **「结论 → 原理 → 结合项目 → trade-off」** 四段式；结合 `legal-ai-assistant` 真实路径加分。

---

### Q1：你们后端用的什么技术栈？为什么不用 Python 做 AI？

**解答思路：**

1. **结论**：后端是 **Next.js Route Handlers + TypeScript**，跑在 **Node.js** 上；数据库 **PostgreSQL + Prisma**；AI 走 **OpenAI Compatible API**（DeepSeek）。Phase 2 RAG 用 **pgvector + Embedding API**，不本地推理。
2. **原理**：RAG/Agent 核心是 **HTTP 调 LLM + 向量检索 + 编排逻辑**，与语言无关；Node 的 OpenAI SDK、LangChain.js 足够。
3. **结合项目**：Phase 1 已实现 SSE 流式（`app/api/chat/route.ts`），协议预留 Agent 事件；Docker 已选 pgvector 镜像，避免 Phase 2 换环境。
4. **Trade-off**：Python 生态更厚，但双栈会增加部署与联调成本；学习阶段优先 **一个 repo 跑通全链路**。

**加分项**：提到 BFF 藏密钥、统一 SSE 协议。  
**减分项**：说「AI 必须用 Python」或「Next.js 不是真正的后端」。

---

### Q2：Next.js 写后端和 Express 写后端有什么区别？

**解答思路：**

1. **结论**：**运行时都是 Node.js**；Next.js 用 **文件路由 + Web 标准 Request/Response**；Express 用中间件 + 自建路由。业务能力（Prisma、调 API、流式）一致。
2. **原理**：Next.js 是 **全栈框架**，API 与前端同构部署；Express 是 **独立 HTTP 框架**，常单独部署。
3. **结合项目**：`lib/ai/client.ts`、`lib/services/messageService.ts` 与框架无关；Route Handler 只做参数校验和 SSE 封装。
4. **Trade-off**：Vercel Serverless 有 cold start 和 duration 限制；流量大或长任务时可把 `lib/` 抽到 Fastify，**不是重写业务**。

**加分项**：画三层：Route（薄）→ lib（厚）→ Prisma/API。

---

### Q3：如果以后要把后端从 Next.js 拆出来，工作量大吗？

**解答思路：**

1. **结论**：**不大**，关键是业务在 `lib/` 而非写在 Route 里；迁移主要是 HTTP 层和部署。
2. **原理**：Route Handler 与 Express/Fastify 路由是 **同构的异步请求处理**；Prisma、pgvector 查询、OpenAI SDK 跨框架复用。
3. **结合项目**：按 roadmap 规划，`lib/rag/`、`lib/agent/` 从第一天就独立于 `app/api/`。
4. **Trade-off**：拆服务带来运维成本，只在 **超时、自托管、团队分工** 等触发条件下做。

**加分项**：提到 Next.js → Node Worker → 可选 Python 微服务的渐进路径。

---

### Q4：RAG 为什么不用 Pinecone / Milvus，而用 pgvector？

**解答思路：**

1. **结论**：选用 **PostgreSQL + pgvector**，与会话、消息共用同一数据库，Prisma 管业务表，向量用 raw SQL 或扩展。
2. **原理**：项目规模学习阶段，**运维最小化**；pgvector 对百万级以下向量足够；避免多一个向量库的连接与同步。
3. **结合项目**：`docker-compose.yml` 已用 `pgvector/pgvector:pg17`；Change 2.1 roadmap 明确 pgvector。
4. **Trade-off**：超大规模或专用 ANN 需求时 Pinecone/Qdrant 更合适；当前非瓶颈。

---

### Q5：Agent 你们打算用什么框架？LangChain 还是自研？

**解答思路：**

1. **结论**：Phase 4 **优先轻量自研 ReAct 循环**（Planner + Tool Registry + Executor）；若重复劳动多再引入 **LangChain.js** 或 **Vercel AI SDK**。
2. **原理**：学习项目要 **理解 Agent 状态机与 Tool Calling**；重型框架易黑盒化。
3. **结合项目**：Change 1.4 SSE 已定义 `{ type: token | done | error }`，Phase 4 扩展 `tool_start`、`tool_result`；不必 WebSocket。
4. **Trade-off**：LangGraph（Python）编排更强，但引入 Python 是 **局部服务决策**，非 Phase 4 默认。

**加分项**：对比 ReAct vs Plan-and-Execute；提到 Tool 复用 RAG 检索能力。

---

### Q6：Vercel 上跑 Agent 长任务会不会超时？怎么办？

**解答思路：**

1. **结论**：**会**，Serverless 有 function duration 上限（见 `docs/deployment.md`）；短 Agent 可同步 SSE；长任务改 **异步 Job + 轮询/SSE** 或 **独立 Worker**。
2. **原理**：HTTP 请求与计算解耦；队列（BullMQ、Inngest）或常驻 Node 进程跑 Agent loop。
3. **结合项目**：Phase 3 合同审查、Phase 4 多步推理是潜在长任务；roadmap 当前以同步 API 为主，**预留队列扩展**。
4. **Trade-off**：过早引入 Redis/队列增加复杂度；先同步跑通，超时再拆 Worker。

**加分项**：提到 Neon 连接池、冷启动与 AI 延迟的关系。

---

### Q7：想用 Python 学 AI 后端，和当前项目冲突吗？

**解答思路：**

1. **结论**：**不冲突**，但建议 **并行 lab** 或 **Phase 3 后 Python 只承担 AI 管道**，而非 Phase 2 起全量双栈。
2. **原理**：主项目负责 **产品闭环与架构理解**；Python lab 负责 **框架生态与文档解析实验**。
3. **结合项目**：Next.js 做 UI + 会话 BFF；Python FastAPI 提供 `/rag/query`、`/agent/run`；共用 PostgreSQL 或 lab 独立库。
4. **Trade-off**：双栈适合 **就业向 Python 能力**；全栈 TS 适合 **快速交付与学习 AI 应用架构**。

**加分项**：提到 CORS、SSE 代理、conversation_id 跨服务对齐。

---

### Q8：Node 做 PDF 解析会不会成为短板？

**解答思路：**

1. **结论**：Phase 2 简单文档（TXT、基础 PDF）**Node 够用**（`pdf-parse` 等）；Phase 3 **复杂版式、扫描件** Python 更强，可作为 **第一个 Python 微服务切入点**。
2. **原理**：文档解析是 **CPU/库生态** 问题，不是 RAG 检索本身的问题；解析结果入库后，后续 pipeline 语言无关。
3. **结合项目**：Change 3.1 才涉及高级 PDF；Phase 2 不必 preemptively 上 Python。
4. **Trade-off**：`unstructured`、`PyMuPDF` vs Node 库；按 **解析质量需求** 决策，非按语言信仰。

---

### Q9：为什么不做微服务，把 RAG、Agent、Chat 各拆一个服务？

**解答思路：**

1. **结论**：学习阶段 **单体 Next.js + 清晰模块边界**（Chat / Retrieval / Tool / Agent），符合 `docs/vision.md` 渐进式演进。
2. **原理**：微服务解决 **团队规模、独立扩缩、异构技术栈**；单人小流量时运维成本 > 收益。
3. **结合项目**：`general-backend-concepts.md` 明确当前不做微服务；模块在 `lib/` 分目录，未来可物理拆分。
4. **Trade-off**：案件工作空间（Phase 5）规模上来后再评估服务边界。

---

### Q10：如果面试官问「你这套架构的生产级短板是什么？」

**解答思路（诚实 + 有预案）：**

1. **鉴权**：当前无多用户；上线需 JWT / Session、API 限流。
2. **AI 成本与稳定性**：无熔断、无限流；需对 OpenAI 调用做 retry、timeout、降级文案。
3. **长任务**：Serverless duration；Agent/合同审查需 Job 队列。
4. **RAG 质量**：需混合检索、Rerank、评测集；roadmap Change 2.5 已规划。
5. **可观测性**：日志、tracing、RAG 调试界面尚未建设。

**加分项**：每条短板对应 roadmap 或演进路径，体现 **知道限制且有计划**。

---

## 8. 决策记录（ADR 摘要）

| 字段 | 内容 |
|------|------|
| **日期** | 2026-07-28 |
| **状态** | Accepted |
| **背景** | Phase 2 前评估 RAG/Agent 技术栈与语言 |
| **决策** | Phase 2–4 继续 Next.js 全栈（Node/TS）；pgvector；lib 模块化；Python 为可选并行学习或局部微服务 |
| **理由** | 与 vision/roadmap 一致；降低学习阶段工程复杂度；Node 对 API 型 RAG/Agent 足够；保留迁移与局部 Python 空间 |
| **后果** | 需自律将 RAG/Agent 逻辑写入 `lib/`；关注 Vercel duration；Phase 3 再评估 PDF 解析栈 |

---

## 9. 相关文档

| 文档 | 关系 |
|------|------|
| [`docs/vision.md`](../vision.md) | 项目技术栈总览 |
| [`docs/roadmap.md`](../roadmap.md) | Phase 2–5 功能范围 |
| [`docs/deployment.md`](../deployment.md) | Vercel + Neon 与 Serverless 限制 |
| [`docs/learning/general-backend-concepts.md`](./general-backend-concepts.md) | 传统后端概念映射 |
| [`docs/learning/general-streaming-protocols.md`](./general-streaming-protocols.md) | 流式与 Agent 协议 |
| [`docs/learning/1.4面试文档/1.4-interview-followup.md`](./1.4面试文档/1.4-interview-followup.md) | SSE / BFF 面试追问 |

---

## 10. 标签

`#architecture` `#backend` `#nextjs` `#nodejs` `#python` `#rag` `#agent` `#adr` `#interview` `#general` `#已决策`
