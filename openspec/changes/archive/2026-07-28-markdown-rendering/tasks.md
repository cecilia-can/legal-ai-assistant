## 1. 依赖安装

- [x] 1.1 安装 `react-markdown`、`remark-gfm`、`rehype-highlight`、`highlight.js`。
- [x] 1.2 确认 TypeScript 编译无额外类型包缺失（按需安装 `@types/*`）。

## 2. Markdown 样式

- [x] 2.1 创建 `app/markdown.css`：标题、列表、引用、表格、行内 code、代码块容器样式。
- [x] 2.2 配置 highlight.js 主题 CSS，适配 light/dark（媒体查询或类名切换）。
- [x] 2.3 在 `app/layout.tsx` 引入 `markdown.css` 与 highlight 主题样式。

## 3. MessageContent 组件

- [x] 3.1 创建 `components/chat/MessageContent.tsx`，配置 `react-markdown` + `remark-gfm` + `rehype-highlight`。
- [x] 3.2 自定义 `components`：`a`（外链安全属性）、`pre`/`code`（块级 vs 行内区分）。
- [x] 3.3 实现代码块复制按钮（`IconButton` + Copy/Check 反馈，约 2s 恢复）。
- [x] 3.4 根容器使用 `markdown-body`（或等价类名）以便样式命中；空 content 时不渲染占位。

## 4. MessageBubble 集成

- [x] 4.1 修改 `MessageBubble`：assistant → `MessageContent`；user/system → 保留 `whitespace-pre-wrap`。
- [x] 4.2 确认 user 气泡 primary 配色下 Markdown 子元素不会误应用（assistant 仅在非 user 气泡内渲染 Markdown）。
- [x] 4.3 创建 `MessageCopyButton`，user 与 assistant 气泡内部下方均提供复制按钮。

## 5. 验证

- [x] 5.1 运行 `npm run lint`。
- [x] 5.2 运行 `npm run build`。
- [x] 5.3 手动验证：assistant 消息展示标题、列表、表格、链接。
- [x] 5.4 手动验证：代码块语法高亮 + 复制按钮可用。
- [x] 5.5 手动验证：流式进行中 assistant 纯文本展示；流式结束后 Markdown 渲染（含格式化闪变可接受）。
- [x] 5.6 手动验证：user 消息中 `*`、反引号等不被误解析；dark 模式下可读。
- [x] 5.7 手动验证：assistant 气泡内部下方复制按钮可复制整条 Markdown 消息。
- [x] 5.8 手动验证：user 气泡内部下方复制按钮可复制纯文本消息。

## 6. 性能调研与优化

- [x] 6.1 创建合成 Markdown fixture 与统计工具（`lib/benchmark/markdownFixtures.ts`、`stats.ts`）。
- [x] 6.2 终端基准脚本 `scripts/benchmark-markdown-render.ts`，npm script `measure:markdown`。
- [x] 6.3 dev 浏览器基准页 `/dev/markdown-bench`（content-only / full-list / incremental-update / incremental-update-legacy）。
- [x] 6.4 法律向 preset（typical / heavy / table×N）与 incremental-legacy A/B 对比。
- [x] 6.5 **P0**：`React.memo(MessageBubble)` + 稳定 props 比较（忽略 `onDelete` 引用变化）。
- [x] 6.6 **P1**：`MessageList` 流式时最后一条 assistant 设 `useMarkdown={false}`（纯文本）；流式结束后切 Markdown。
- [x] 6.7 **P2**：`MessageContent` 使用 `memo`。
- [x] 6.8 复跑法律向基准，验收 `incremental-update · history=20 · p95` < 16 ms（5000 typical：**1.1 ms**）。
- [x] 6.9 沉淀调研文档 `docs/learning/1.6面试文档/1.6-markdown-rendering-performance-investigation.md`。

## 7. 流式停止与追问

- [x] 7.1 `ChatInput`：流式中输入框可编辑；空输入展示「停止生成」并调用 `abortStream`。
- [x] 7.2 流式中有输入时「发送」：`sendMessage` 先 abort 再发起新轮（移除 `page` 层 isStreaming 发送拦截）。
- [x] 7.3 更新 delta spec「流式进行中的停止与追问」。
- [x] 7.4 手动验证：停止后半截保留；停止后立即追问；流式中直接发新问题。
