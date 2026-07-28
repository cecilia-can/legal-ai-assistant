# 学习知识库总览（INDEX）

本知识库由 `learning-digest` Skill 维护，按 roadmap 的 **Change** 分文件积累技术复盘知识点。
触发方式：在对话中说“复盘一下”“沉淀知识点”等，Skill 会把当前对话的问答结构化后写入对应文件。

## 目录

### 按 Change

| Change | 文件 | 知识点数 | 最近更新 |
|--------|------|----------|----------|
| 1.2 UI 基础组件库 | [1.2-ui-components.md](./1.2-ui-components.md) | 10 | 2026-07-15 |
| 1.3 会话管理功能 | [1.3-conversation-management.md](./1.3-conversation-management.md) | 8 | 2026-07-22 |
| 1.4 AI API 集成与流式输出 | [1.4-ai-api-streaming.md](./1.4-ai-api-streaming.md) | 9 | 2026-07-26 |
| 1.5 消息持久化 | [1.5-message-persistence.md](./1.5-message-persistence.md) | 8 | 2026-07-27 |
| 1.5 持久化优化与调整复盘 | [1.5面试文档/1.5-message-persistence-optimizations.md](./1.5面试文档/1.5-message-persistence-optimizations.md) | — | 2026-07-27 |
| 1.6 Markdown 渲染性能调研 | [1.6面试文档/1.6-markdown-rendering-performance-investigation.md](./1.6面试文档/1.6-markdown-rendering-performance-investigation.md) | — | 2026-07-28 |
| 1.4 聊天列表滚动与回到底部 | [1.4面试文档/1.4-chat-scroll-ux.md](./1.4面试文档/1.4-chat-scroll-ux.md) | — | 2026-07-26 |
| 1.4 流式观感与展示队列 | [1.4面试文档/1.4-streaming-typewriter-ux.md](./1.4面试文档/1.4-streaming-typewriter-ux.md) | — | 2026-07-27 |
| 1.4 面试追问与解答思路 | [1.4面试文档/1.4-interview-followup.md](./1.4面试文档/1.4-interview-followup.md) | — | 2026-07-26 |

### 通用参考（跨 Change）

| 主题 | 文件 | 说明 | 最近更新 |
|------|------|------|----------|
| 传统后端概念 × 本项目 | [general-backend-concepts.md](./general-backend-concepts.md) | 高并发、熔断、限流等与 roadmap 的对应关系 | 2026-07-17 |
| AI 流式输出方案对比与选型 | [general-streaming-protocols.md](./general-streaming-protocols.md) | Plain text / SSE / WebSocket、EventSource、主流实践、面试追问 | 2026-07-25 |
| 后端技术栈 / 语言选型决策 | [general-backend-stack-decision.md](./general-backend-stack-decision.md) | Next.js vs Node vs Python、RAG/Agent 栈、演进路径、面试追问 | 2026-07-28 |

## 使用说明

- 每个 Change 一个文件，命名 `<change-number>-<slug>.md`（如 `1.2-ui-components.md`）。
- 无法归属到具体 Change 的知识点写入 `general.md`，或独立成 `general-<topic>.md` 并在本 INDEX 的「通用参考」中登记。
- 每条知识点含：来源问题、结论、原理、易错点、延伸、标签、状态、日期。
- 标签约定：`✅` 确定、`⚠️需查证` 待验证、`🔗` 来源、`#待复习` / `#已掌握`。
