## ADDED Requirements

### Requirement: 骨架屏基础组件
系统 SHALL 提供可复用的骨架屏（Skeleton）基础组件，用于加载占位。

Skeleton MUST 使用与主题一致的 muted 色系，并带有脉冲动画（`animate-pulse` 或等价）。

Skeleton MUST 支持通过 `className` 定制宽高与圆角，以便组合成列表项、气泡等形状。

#### Scenario: 渲染脉冲占位块
- **WHEN** Skeleton 组件被渲染
- **THEN** 展示带动画的占位块，且不包含可交互内容

#### Scenario: 自定义尺寸
- **WHEN** 调用方为 Skeleton 传入 `className` 指定高度与宽度
- **THEN** 占位块按指定尺寸渲染

### Requirement: 内联错误与重试组件
系统 SHALL 提供内联错误展示组件（InlineError 或等价），用于 API / 网络失败场景。

组件 MUST 使用 `role="alert"`（或等价）以辅助技术可访问。

组件 MUST 展示人类可读的错误消息。

当提供 `onRetry` 回调时，MUST 展示「重试」按钮；点击 MUST 调用该回调。

#### Scenario: 展示错误消息
- **WHEN** InlineError 接收到非空 `message`
- **THEN** 以 destructive 视觉样式展示该消息

#### Scenario: 重试按钮可用
- **WHEN** 提供了 `onRetry` 且未处于 `retrying` 禁用状态
- **THEN** 展示可点击的「重试」按钮

#### Scenario: 重试进行中
- **WHEN** `retrying` 为 true
- **THEN** 「重试」按钮 disabled 或展示进行中状态，防止重复提交

#### Scenario: 无重试回调
- **WHEN** 未提供 `onRetry`
- **THEN** 仅展示错误消息，不展示重试按钮
