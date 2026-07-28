## 背景

当前状态：

- `MessageBubble` 对所有角色统一使用 `<p className="whitespace-pre-wrap">` 展示内容。
- AI 流式回复与历史加载均已就绪（Change 1.4 / 1.5）。
- 项目使用 Tailwind CSS v4 + CSS 变量主题（`app/globals.css`），支持 `prefers-color-scheme: dark`。

本 Change 仅改前端展示层，不涉及后端或持久化逻辑。

## 目标 / 非目标

**目标：**

- assistant 消息支持 CommonMark + GFM 子集（标题、段落、列表、链接、引用、表格、行内/块级代码）。
- 代码块语法高亮，主题在 light/dark 下均可读。
- 代码块一键复制，复制成功有短暂视觉反馈。
- 流式输出时随 content 增量更新 Markdown 渲染。
- user 消息保持纯文本 + 换行保留（用户输入通常非 Markdown）。

**非目标：**

- 渲染任意 HTML（`rehype-raw`）或执行脚本。
- LaTeX / 数学公式（后续可选）。
- 图片上传与内联图片渲染优化（外链图片可展示，不做 CDN 代理）。
- Mermaid 图表、PDF 预览。
- Prompt 工程、Token 管理（Change 1.7）。
- 完整 loading 骨架屏体系（Change 1.8）。

## 设计决策

### 1. 技术栈：react-markdown + remark-gfm + rehype-highlight

**决策：**

| 包 | 用途 |
|----|------|
| `react-markdown` | React 友好的 Markdown 渲染 |
| `remark-gfm` | GFM 扩展（表格、任务列表、删除线等） |
| `rehype-highlight` | 将 `<pre><code>` 转为 highlight.js 高亮 |
| `highlight.js` | 语法高亮引擎与主题 CSS |

**理由：** 生态成熟、与 React 19 兼容、插件链清晰；`rehype-highlight` 比手写 prism 集成更简单。

**备选（否决）：**

- `@uiw/react-md-editor`：偏重编辑器，非只读渲染场景。
- 自研正则解析：维护成本高、边界 case 多。

### 2. 角色分流：仅 assistant 走 Markdown

**决策：**

- `role === "assistant"` → `<MessageContent content={...} />`
- `role === "user" | "system"` → 现有 `whitespace-pre-wrap` 纯文本

**理由：** 用户输入一般为自然语言；对 user 消息做 Markdown 可能意外渲染 `*`、`` ` `` 等字符。assistant 由模型生成结构化 Markdown，收益最大。

### 3. 流式渲染策略

**决策（初版）：**

- `MessageContent` 接收 `content: string`，随 props 更新重渲染。
- 流式过程中允许未闭合代码块/列表的临时展示（`react-markdown` 容错即可，不做额外 buffering）。
- 不使用 `memo` 阻断更新；若性能问题再考虑按消息 id 的轻量 memo（本阶段不预优化）。

**决策（性能优化后，2026-07-28）：**

- **P0** `MessageBubble` 使用 `React.memo`，仅在 `message` 字段或 `useMarkdown` / 删除状态变化时重渲染。
- **P1** 流式进行中：当前会话**最后一条 assistant** 使用纯文本（`whitespace-pre-wrap`），不走 Markdown parse。
- 流式结束（`isStreaming=false`）后：该条与其他 assistant 历史一样走 `MessageContent` Markdown 渲染（一次性 parse，可接受短暂格式化闪变）。
- `MessageContent` 使用 `memo`，避免父级无关更新。

**理由：** 基准显示 history=20 时 full-list p95 ~175ms；memo 消除历史重复 render，流式纯文本消除 chunk 阶段反复 parse。

### 4. 代码块与复制按钮

**决策：**

- 通过 `react-markdown` 的 `components` 覆盖 `pre` / `code`：
  - 块级代码：外层 `relative` 容器 + 右上角复制 `IconButton`（复用现有 `IconButton` + lucide `Copy` / `Check`）。
  - 行内代码：`<code>` 仅样式，无复制按钮。
- 复制使用 `navigator.clipboard.writeText`；失败时静默或 `console.warn`（本阶段不做 toast 体系）。
- 复制成功后按钮图标切换为 Check，约 2s 后恢复。

### 4b. 整条消息复制

**决策：**

- **Assistant**：气泡**内部最下方**（右对齐）复制图标；内容为 `message.content` **Markdown 源码**。
- **User**：气泡**内部最下方**（右对齐）复制图标；内容为 `message.content` **纯文本**（与输入一致，保留换行）。
- 共用 `MessageCopyButton` 组件，通过 `className` 适配不同气泡配色。
- 空 content 不展示；成功反馈 Check 图标约 2s。

### 5. 样式组织

**决策：**

- 新建 `app/markdown.css`：Markdown 排版（标题间距、列表、引用、表格）、行内 code、代码块容器。
- 在 `app/layout.tsx` 中 `import "./markdown.css"`。
- highlight.js 主题：选用 `github`（light）+ 在 dark 媒体查询下覆盖或使用 `github-dark` 类切换；或通过 CSS 变量微调以贴合 `--foreground` / `--surface`。

**理由：** 与现有 `app/globals.css` 并列，职责清晰；roadmap 中的 `styles/markdown.css` 与本项目 `app/` 约定对齐为 `app/markdown.css`。

### 6. 安全

**决策：**

- 不启用 `rehype-raw`。
- 外链 `<a>` 添加 `target="_blank"` 与 `rel="noopener noreferrer"`。
- 不渲染用户提供的 HTML。

## 风险 / 权衡

- **[风险] 流式未闭合 Markdown 闪烁**  
  → Mitigation：可接受；流式结束后语法稳定。1.8 可加强 UX。

- **[风险] highlight.js 包体积**  
  → Mitigation：默认全语言注册简单可靠；若 bundle 过大可后续改为按需 register（非本阶段目标）。

- **[风险] 表格在窄屏溢出**  
  → Mitigation：`markdown.css` 为 `.markdown-body table` 外包 `overflow-x-auto`。

- **[风险] user 气泡内 Markdown 需求**  
  → Mitigation：本阶段不做；若未来需要可加设置项。

## 迁移计划

1. 安装依赖。
2. 实现 `MessageContent` + `markdown.css`。
3. 修改 `MessageBubble` 接入。
4. `layout.tsx` 引入样式与 highlight 主题 CSS。
5. `npm run lint` / `npm run build`；`npm run dev` 视觉验收（含 light/dark、流式、代码复制）。

回滚：移除组件与依赖，恢复 `MessageBubble` 纯文本一行。

## 性能基准与文档

| 入口 | 用途 |
|------|------|
| `npm run measure:markdown` | 终端解析链快速回归 |
| `/dev/markdown-bench` | 浏览器四模式基准（dev only） |
| `docs/learning/1.6面试文档/1.6-markdown-rendering-performance-investigation.md` | 完整调研、数据、面试 Q&A |

**验收主指标：** `incremental-update · history=20 · p95` < 16 ms（5000 legal-typical 实测 **1.1 ms**）。

## 待决问题

- highlight.js 主题：默认 `github` + dark 媒体查询覆盖，实现时再微调。
- 是否在 assistant 空 content 时跳过 `MessageContent`（避免空 DOM）——默认跳过或渲染空 fragment。
