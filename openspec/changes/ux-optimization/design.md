## 背景

当前状态：

- **加载**：`app/page.tsx` 与会话侧栏使用 `<p>正在加载…</p>` 纯文本；`MessageList` 同理。
- **错误**：`conversationStore` / `chatStore` 已有 `error` 字段，侧栏以红色段落展示，消息区以 destructive 文本展示，**无重试按钮**。
- **滚动**：`MessageList` 已实现 stick-to-bottom、80px 阈值、「回到底部」按钮（Change 1.6 spec 已覆盖）。
- **快捷键**：`ChatInput` 仅支持 Enter 发送 / Shift+Enter 换行。
- **移动端**：`AppShell` 已有抽屉与遮罩；未处理 iOS safe-area、footer 键盘顶起等细节。
- **错误边界**：无 React Error Boundary。

本 Change 纯前端 UX 层，不涉及后端。

## 目标 / 非目标

**目标：**

- 加载态使用脉冲骨架屏，减少布局跳动（layout shift）。
- 可恢复错误（网络/API 失败）提供明确重试路径。
- 常用操作支持键盘快捷键，提升桌面端效率。
- 移动端在窄屏下输入区始终可达、触控目标 ≥ 44px。
- 流式生成时 header 有轻量视觉指示（如 pulse 点或 animated 文案）。

**非目标：**

- 全局 Toast / Snackbar 体系。
- 虚拟滚动或消息分页 UI。
- 快捷键帮助弹层（`/help` 或 `?`）——本阶段仅在输入区 hint 文案中列出常用键。
- 登录/注册页（Change 1.9 复用组件即可）。
- 修改 stick-to-bottom 核心算法（除非验收发现 bug）。

## 设计决策

### 1. Skeleton 组件：Tailwind `animate-pulse` + 语义块

**决策：**

- 新建 `components/ui/Skeleton.tsx`：基础块级 `div`，`rounded` + `bg-muted/40` + `animate-pulse`。
- `ConversationListSkeleton`：3–5 条固定高度条，模拟会话项。
- `MessageListSkeleton`：2–3 组左右交替气泡形块，模拟 user/assistant。

**理由：** 零依赖、与现有 Tailwind v4 主题一致；骨架形状贴近真实布局，降低 CLS。

### 2. 错误展示：InlineError + 页面级 retry 回调

**决策：**

- `InlineError`：`role="alert"`，展示 `message` + 可选「重试」按钮；destructive 色系与现有 `text-destructive` 一致。
- 重试逻辑在 `app/page.tsx` 绑定 store 方法，而非组件内硬编码：
  - 会话列表失败 → `fetchConversations()`
  - 消息加载失败 → `loadMessages(activeId)`
  - AI 发送失败 → 保留 `chatStore.error`，提供「清除并重试」或再次发送（若最后一条为失败 assistant 占位则移除后重发——**本阶段简化为清除 error + 用户手动重发**，避免复杂状态机）。
- 侧栏与会话区错误统一用 `InlineError` 替换 `<p className="text-destructive">`。

**理由：** Store 已有 error 状态；重试只需 re-invoke 现有 action，不扩 API。

### 3. ChatErrorBoundary

**决策：**

- 客户端组件 `ChatErrorBoundary` 包裹 `MainPanel` 的 messages + input 区域（或整个 main）。
- Fallback：简短说明 + 「刷新页面」按钮（`window.location.reload()`）。
- 开发环境可 `console.error` 记录 componentStack。

**理由：** 防止单条消息 Markdown 等渲染异常导致整页白屏；Change 1.9 前无全局 error.tsx 也可局部兜底。

### 4. 键盘快捷键

**决策：**

| 快捷键 | 行为 | 条件 |
|--------|------|------|
| `Mod+Shift+O` | 新建会话 | 全局；**不用** `Mod+N`（浏览器 reserved） |
| `Shift+Escape` | 聚焦聊天输入框 | 全局 |
| `Escape` | 关闭移动端会话抽屉 | `mobileSidebarOpen === true`；**不**终止会话 |
| `Mod+.` | 停止流式生成 | `isStreaming === true` |

- `Mod` = Ctrl（Windows/Linux）或 Meta（macOS）。
- 在 `textarea` / `input` 内：`Shift+Escape` 聚焦输入；`Escape` 仅在抽屉打开时关抽屉。
- 实现：`lib/hooks/useChatKeyboardShortcuts.ts`，在 `app/page.tsx` 调用；依赖项传入 handlers。

**理由：** 对齐 ChatGPT 类产品的核心快捷键 subset；避免过度设计完整 shortcut registry。

### 5. 移动端优化

**决策：**

- `app/globals.css` 或 layout：为 `body` / 主容器添加 `env(safe-area-inset-*)` padding（尤其 bottom footer）。
- `MainPanel` footer：`pb-[max(1rem,env(safe-area-inset-bottom))]`。
- 图标按钮：`min-h-11 min-w-11`（44px）于移动端关键入口（侧栏、回到底部）。
- `ChatInput` textarea：`text-base` on mobile（≥16px）减少 iOS 自动缩放。

**理由：** 常见 PWA / 移动 Web Chat 最佳实践；改动局部 CSS。

### 6. 流式视觉反馈

**决策：**

- `MainPanel` header subtitle 区域：流式时在标题旁显示小 pulse 圆点（`animate-pulse` + `bg-primary`）。
- 保留现有文案「AI 正在回复…」。

**理由：** 低实现成本，增强可感知反馈。

## 风险 / 权衡

- **[风险] 快捷键与浏览器/系统冲突**  
  → Mitigation：仅注册少量组合键；文档注明；输入聚焦时不抢 `/` 若用户正在输入路径。

- **[风险] 骨架屏与真实列表高度不一致**  
  → Mitigation：固定合理 min-height，加载时间短时闪烁可接受。

- **[风险] ErrorBoundary 吞掉开发调试信息**  
  → Mitigation：dev 下 console.error；fallback 提供刷新。

## 迁移计划

1. 实现 UI  primitives（Skeleton、InlineError）。
2. 实现 skeleton 列表组件并接入 page。
3. 接入 InlineError + retry handlers。
4. 实现 ErrorBoundary + keyboard hook。
5. 移动端 CSS 微调 + 流式 indicator。
6. `npm run lint` / `npm run build` / dev 视觉与快捷键验收。

回滚：移除新组件与 hook，恢复纯文本 loading/error。

## 待决问题

- AI 发送失败后是否自动保留 user 消息——**保持现有 store 行为**（user 已乐观展示），重试由用户再次发送。
- 是否在侧栏 loading 时也展示 skeleton——**是**，与会话列表区域一致。
