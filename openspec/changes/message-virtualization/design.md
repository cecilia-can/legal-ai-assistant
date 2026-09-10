# 设计：消息流虚拟滚动与 Agent UI 预留

## 1. 总体方案

将 `MessageList` 拆为三层：

1. **滚动容器**：继续由 `MessageList` 持有，负责 near-bottom 判定、用户滚动事件和「回到底部」按钮。
2. **虚拟化适配层**：根据消息时间线长度和滚动位置计算可见索引，渲染可见项及 overscan 项，并维护每项的动态高度。
3. **时间线项渲染层**：普通 `ChatMessage` 继续渲染 `MessageBubble`；未来的工具调用、工具结果和执行状态通过独立 item renderer 展示。

虚拟化库只负责可见窗口计算，不拥有聊天业务状态。消息内容、流式状态、删除和重新生成回调仍由现有 store 与页面传入。

## 2. 虚拟化与动态高度

- 采用 `@tanstack/react-virtual` 的 React adapter。它提供 `useVirtualizer`、`measureElement`、稳定 item key、动态高度测量和自定义滚动行为，保留现有消息组件的渲染控制权。
- 使用其 chat 场景支持的 `anchorTo: "end"`、`followOnAppend` 和 `scrollEndThreshold: 80` 处理底部跟随、流式增长与历史消息 prepend。
- React 19 下将显式设置 `useFlushSync: false`，避免滚动期间出现 `flushSync` 生命周期警告；滚动精度通过组件测试和手工验收确认。
- 每个时间线项使用稳定的 `key` 和稳定索引标识，避免流式 content 更新造成整列重建。
- 通过测量回调或 `ResizeObserver` 更新消息高度；Markdown 解析完成、代码高亮完成和展开/折叠时都必须触发重新测量。
- 使用少量 overscan 缓冲，避免快速滚动时出现空白；具体数量通过桌面和移动端验收确定。
- 消息较少时允许直接渲染全部项，但必须复用同一个滚动行为和 item renderer，避免两套交互逻辑分叉。

### 方案验证结果

- **动态高度**：官方 API 提供 `measureElement`，可使用 `ResizeObserver` 重新测量 Markdown、代码高亮和展开后的消息。
- **聊天滚动**：官方 Chat 指南提供 end anchoring、流式输出保持底部、prepend 稳定和 follow-on-append 模式，与本 Change 的滚动要求一致。
- **React 19**：官方 React adapter 文档说明 `useFlushSync: false` 可避免 React 19 滚动期 `flushSync` 警告。
- **Next.js 16**：该方案只依赖 React hook 和浏览器滚动容器，接入现有已标记为客户端组件的 `MessageList`，不需要改 API 或服务端渲染结构。
- **Tailwind CSS 4**：虚拟化组件只写必要的定位/尺寸 style，现有 Tailwind 样式继续由消息内容和容器负责。
- **结论**：锁定 `@tanstack/react-virtual`；暂不选择 `react-virtuoso`，因为当前项目需要保留消息项、Agent 时间线和滚动状态的细粒度控制。

## 3. 流式输出与自动滚动

沿用现有 80px near-bottom 规则：

- 用户在底部附近时，流式内容增长只更新可见 assistant 项，并在 `requestAnimationFrame` 中合并滚动调整。
- 用户主动向上阅读时，不得因为 token 到达而强制滚动；继续显示「回到底部」按钮。
- 用户发送新消息、切换会话或点击「回到底部」时，恢复 stick-to-bottom 状态。
- 虚拟列表滚到底部时使用最后一项的虚拟位置，不直接依赖完整 DOM 的 `scrollHeight`。
- 流式结束后重新测量最后一项，确保 Markdown 从纯文本切换到富文本后滚动位置正确。

## 4. 历史消息分页与位置保持

- 历史 API 返回更早消息时，先记录加载前的第一条可见消息及其相对偏移。
- 将历史项插入时间线顶部后，等待虚拟器完成测量，再根据锚点恢复滚动位置。
- 加载历史期间显示轻量顶部 loading 状态，不遮挡当前可见消息。
- 如果当前用户已经位于底部，追加新消息仍按现有策略滚到底部；如果用户正在阅读历史，则保持其阅读位置。

## 5. 长内容与 Agent 时间线

不把 Agent 的所有内部过程直接渲染为普通 Markdown 气泡。时间线项使用可扩展的内部模型，例如：

- `message`：现有 user / assistant / system 消息；
- `tool-call`：工具名称、参数摘要、执行状态；
- `tool-result`：结果摘要、错误状态、可展开的详细内容；
- `execution-status`：计划、执行中、完成或失败状态。

本 Change 只实现 UI 层扩展点和折叠容器，不新增这些事件的服务端来源。工具结果默认展示摘要，长文本、JSON、日志和代码块默认折叠或延迟渲染；用户展开后才执行完整 Markdown / 高亮渲染。

## 6. 兼容性与回滚

- 保持 `MessageList` 对现有 `messages: ChatMessage[]` 的调用兼容，避免影响页面和 store 的业务接口。
- 不修改 API、Prisma 或环境变量。
- 如果虚拟化依赖在目标浏览器或 Next.js 16 下出现兼容问题，可以暂时关闭虚拟化适配层，回退到同一 item renderer 的普通列表，不影响消息数据和交互逻辑。

## 7. 验证策略

- 单元/组件测试：长列表可见项、动态高度、展开折叠、流式更新和滚动锚点。
- 回归测试：普通消息、Markdown、代码高亮、删除、复制、重新生成、切换会话。
- 手工验收：桌面端快速滚动、移动端触摸滚动、流式期间上下滚动、顶部加载历史、底部加载新消息。
- 工具链验证：`npm run lint`、`npm run build`，并通过开发服务器完成视觉验收。
