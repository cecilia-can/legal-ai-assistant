## ADDED Requirements

### Requirement: Markdown 消息内容组件
系统 SHALL 提供 `MessageContent` 组件，用于将 Markdown 字符串渲染为结构化 React 内容。

- MUST 使用 `react-markdown` 作为解析器。
- MUST 启用 GFM 支持（`remark-gfm`），至少覆盖：标题、段落、有序/无序列表、引用、链接、表格、行内代码、围栏代码块。
- MUST NOT 渲染原始 HTML（不启用 `rehype-raw`）。
- 外链 MUST 使用 `target="_blank"` 与 `rel="noopener noreferrer"`。

#### Scenario: 渲染标题与段落
- **WHEN** `MessageContent` 接收到含 `# 标题` 与段落的 Markdown
- **THEN** 页面展示对应级别的标题元素与段落文本

#### Scenario: 渲染 GFM 表格
- **WHEN** 内容包含 GFM 表格语法
- **THEN** 渲染为 HTML 表格，且在窄屏下可横向滚动（不撑破气泡布局）

#### Scenario: 拒绝原始 HTML
- **WHEN** 内容包含 `<script>` 或任意 HTML 标签
- **THEN** 以转义文本或安全子集展示，不执行脚本

### Requirement: 代码语法高亮
系统 SHALL 对围栏代码块应用语法高亮。

- MUST 通过 `rehype-highlight`（或等价方案）集成 highlight.js。
- 行内 code MUST 有区别于正文的背景/字体样式，但不需要语言级高亮。
- 代码块 MUST 使用等宽字体，并与 light/dark 主题协调可读。

#### Scenario: 高亮指定语言代码块
- **WHEN** assistant 消息包含 ```javascript 围栏代码块
- **THEN** 代码块展示语法高亮，且语言标识正确传递至高亮器

#### Scenario: 未标注语言的代码块
- **WHEN** 围栏代码块未指定语言
- **THEN** 仍渲染为代码块样式，高亮器 MAY 使用 plain/auto 模式

### Requirement: 代码块复制
系统 SHALL 为块级代码块提供复制功能。

- MUST 在每个块级代码块区域提供可访问的复制控件（按钮或等效）。
- 点击后 MUST 将代码块纯文本写入剪贴板（`navigator.clipboard.writeText` 或等价 API）。
- 复制成功后 SHOULD 在约 2 秒内展示成功反馈（如图标变为勾选）。

#### Scenario: 成功复制代码
- **WHEN** 用户点击某代码块的复制按钮且剪贴板 API 可用
- **THEN** 剪贴板内容与该代码块文本一致，且控件展示短暂成功状态

#### Scenario: 行内代码无复制按钮
- **WHEN** 内容仅含行内 `` `code` ``
- **THEN** 不展示块级复制按钮

### Requirement: 整条 assistant 消息复制
系统 SHALL 为 assistant 消息提供「复制整条消息」控件。

- 控件 MUST 位于 assistant 消息气泡**内部最下方**，右对齐于气泡内容区（与 user 消息一致）。
- 点击后 MUST 将 `message.content` 原文（Markdown 源码）写入剪贴板，而非渲染后的 HTML 或纯文本。
- 复制成功后 SHOULD 在约 2 秒内展示成功反馈（如图标变为勾选）。
- 当 `content` 为空时 MUST NOT 展示该控件。

#### Scenario: 复制整条 Markdown 消息
- **WHEN** 用户点击 assistant 消息气泡内部下方的复制按钮且剪贴板 API 可用
- **THEN** 剪贴板内容与 `message.content` 一致（含 Markdown 语法标记）

#### Scenario: 空消息无复制按钮
- **WHEN** assistant 消息 `content` 为空字符串
- **THEN** 气泡内部不展示复制控件

#### Scenario: 流式生成中可复制当前内容
- **WHEN** assistant 消息在流式生成过程中已有非空 content
- **THEN** 复制按钮可用，且复制结果为当前已生成的 Markdown 原文

### Requirement: 整条 user 消息复制
系统 SHALL 为 user 消息提供「复制整条消息」控件。

- 控件 MUST 位于 user 消息气泡**内部最下方**，右对齐于气泡内容区。
- 点击后 MUST 将 `message.content` 纯文本原文写入剪贴板。
- 复制成功后 SHOULD 在约 2 秒内展示成功反馈（如图标变为勾选）。
- 当 `content` 为空时 MUST NOT 展示该控件。
- 按钮样式 MUST 与 user 气泡 primary 配色协调（如使用 `primary-foreground` 色系）。

#### Scenario: 复制 user 纯文本消息
- **WHEN** 用户点击 user 气泡内部下方的复制按钮且剪贴板 API 可用
- **THEN** 剪贴板内容与 `message.content` 一致（纯文本，保留换行）

#### Scenario: user 空消息无复制按钮
- **WHEN** user 消息 `content` 为空字符串
- **THEN** 气泡内部不展示复制控件

### Requirement: Markdown 样式
系统 SHALL 提供专用 Markdown 样式表，并与应用主题一致。

- MUST 存在 `app/markdown.css`（或经 layout 引入的等价文件）。
- 样式 MUST 覆盖：标题层级间距、列表缩进、引用左边框、表格边框、行内 code、代码块容器。
- 在 `prefers-color-scheme: dark` 下 MUST 保持可读对比度。

#### Scenario: 暗色模式下可读
- **WHEN** 用户系统偏好为 dark
- **THEN** Markdown 正文、代码块与表格在 assistant 气泡内清晰可读

### Requirement: 流式渲染性能策略
系统 SHALL 在流式 assistant 回复期间避免对每个 content chunk 反复执行完整 Markdown 解析，并在流式结束后一次性渲染 Markdown。

- 流式进行中（`isStreaming=true`）：当前会话**最后一条 assistant** MUST 以纯文本展示（`whitespace-pre-wrap` 或等价），MUST NOT 调用 `MessageContent` / `react-markdown`。
- 流式结束后（`isStreaming=false`）：该条 assistant MUST 与其他 assistant 历史一样通过 `MessageContent` 渲染 Markdown（一次性 parse）。
- 流式期间复制整条消息 MUST 仍复制 `message.content` Markdown 源码（与展示形式无关）。
- `MessageContent` MUST 使用 `React.memo`（或等价）避免 props 未变时重渲染。

#### Scenario: 流式期间纯文本展示
- **WHEN** 会话处于流式状态且最后一条 assistant 的 `content` 在 chunk 追加过程中多次变长
- **THEN** 该气泡以纯文本展示更新后的 content，且不触发 Markdown 解析

#### Scenario: 流式结束后切换 Markdown
- **WHEN** 流式结束且该 assistant 消息 `content` 非空
- **THEN** 气泡展示格式化后的 Markdown（标题、列表、代码块等），且仅对该条执行一次完整 parse

#### Scenario: 历史 assistant 不受流式 chunk 影响
- **WHEN** 流式进行中且会话已有其他 assistant 历史消息
- **THEN** 历史 assistant 气泡 MUST NOT 因流式 chunk 更新而重新 Markdown 解析（通过 `MessageBubble` memo 实现）

#### Scenario: 空内容
- **WHEN** assistant 消息 `content` 为空字符串
- **THEN** 不渲染可见 Markdown 占位或仅渲染空容器，不产生布局跳动

### Requirement: 渲染性能基准（dev）
系统 SHALL 提供可重复的 Markdown 渲染性能基准，用于回归与验收（仅 dev，生产环境不可访问）。

- MUST 提供终端脚本 `npm run measure:markdown`，测量与 `MessageContent` 相同插件链的解析耗时。
- MUST 提供 dev 页面 `/dev/markdown-bench`，至少支持：`content-only`、`full-list`、`incremental-update`、`incremental-update-legacy` 四种模式。
- MUST 提供法律向合成 fixture（typical / heavy / table 等 profile）。
- 验收主指标：`incremental-update · history=20 · p95`（真实聊天同树增量更新路径）。

#### Scenario: 终端快速回归
- **WHEN** 开发者运行 `npm run measure:markdown -- --legal`
- **THEN** 输出各用例 p50/p95 统计，无需启动浏览器

#### Scenario: 浏览器 A/B 对比
- **WHEN** 开发者在 `/dev/markdown-bench` 运行法律向全量基准
- **THEN** 同时输出优化后（incremental-update）与优化前行为（incremental-update-legacy）的 p95，供对比

### Requirement: MessageContent 增量更新（非流式）
当 `MessageContent` 被挂载且 `content` prop 变化时，SHALL 重新渲染以展示更新后的 Markdown。本要求适用于**非流式**或**流式已结束**的 assistant 消息；流式进行中的最后一条 assistant 不适用（见「流式渲染性能策略」）。

#### Scenario: 非流式 content 更新
- **WHEN** 已结束的 assistant 消息 `content` 被更新（如编辑，若未来支持）
- **THEN** `MessageContent` 展示更新后的 Markdown
