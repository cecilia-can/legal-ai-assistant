## 为什么

Change 1.4 已实现 AI 流式输出，Change 1.5 已持久化消息，但 `MessageBubble` 仍用纯文本（`whitespace-pre-wrap`）展示 assistant 回复。AI 常返回 Markdown（标题、列表、代码块、链接），纯文本无法正确渲染，影响可读性与专业感。Change 1.6 引入 Markdown 渲染与代码高亮，使聊天内容接近 ChatGPT 等主流产品的展示质量。

初版实现后，合成基准显示 **长会话流式场景**（5000 字 + 20 条历史）单次 chunk 更新 p95 **~90 ms**，超过可感知卡顿线。Change 1.6 因此将 **性能调研、基准工具与渲染优化**（memo、流式纯文本）纳入同一变更，作为与功能同等重要的交付物。

## 变更内容

- 新增 `MessageContent` 组件，基于 `react-markdown` 解析并渲染 assistant 消息。
- 集成 GFM 扩展（表格、删除线、任务列表等）与代码语法高亮。
- 新增 Markdown / 代码块样式（`app/markdown.css`），与现有 light/dark 主题协调。
- 新增 `MessageCopyButton`（或等价组件），user / assistant 气泡内部下方复制整条消息。
- **修改** `MessageBubble`：assistant 历史与非流式消息走 Markdown；流式进行中最后一条 assistant 纯文本展示。
- **修改** `ChatInput`：流式中可编辑输入；空输入时「停止生成」；有输入时发送即 abort 并追问。
- **性能优化（P0/P1/P2）**：`React.memo(MessageBubble)`；流式纯文本 + 结束后一次性 Markdown；`memo(MessageContent)`。
- **性能基准**：终端脚本（`npm run measure:markdown`）与 dev 浏览器基准页（`/dev/markdown-bench`，四模式 + legacy A/B）；法律向合成 fixture。
- 详细调研与数据见 `docs/learning/1.6面试文档/1.6-markdown-rendering-performance-investigation.md`。

## 能力范围

### 新增能力

- `markdown-rendering`: 消息 Markdown 解析、GFM 支持、代码高亮、代码复制、流式渲染性能策略与相关样式。

### 修改能力

- `chat-components`: 更新消息气泡与输入区——流式停止/追问、`MessageBubble` memo 等（见 delta spec）。

## 影响范围

- 影响代码：`components/chat/MessageContent.tsx`（新建）、`components/chat/MessageBubble.tsx`、`components/chat/MessageList.tsx`、`components/chat/ChatInput.tsx`、`app/markdown.css`（新建）、`app/layout.tsx`（引入样式）、`app/page.tsx`。
- 性能与基准（dev）：`lib/benchmark/`、`scripts/benchmark-markdown-render.ts`、`app/dev/markdown-bench/`。
- 新增 npm 依赖：`react-markdown`、`remark-gfm`、`rehype-highlight`、`highlight.js`（及必要类型包）。
- 新增 npm script：`measure:markdown`。
- 不影响 API、数据库、环境变量或外部服务。
- 系统影响：不实现 Prompt 优化（1.7）、完整 UX 骨架屏（1.8）、虚拟滚动（留后续）；不引入 HTML 原始渲染（安全考虑，禁用 `rehype-raw`）。
