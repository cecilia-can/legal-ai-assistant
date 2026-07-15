## Purpose

Define base UI primitives, theme tokens, empty states, and basic accessibility requirements for the legal AI assistant interface.

## Requirements

### Requirement: 基础按钮组件
系统 SHALL 提供用于常见操作的可复用按钮组件。

按钮组件 MUST 至少支持 primary 和 secondary 两种视觉变体、禁用状态和标准按钮属性。

#### Scenario: 渲染主要操作
- **WHEN** primary 按钮被渲染
- **THEN** 它在视觉上可识别为主要操作

#### Scenario: 渲染禁用操作
- **WHEN** 按钮处于禁用状态
- **THEN** 它在视觉上传达禁用状态，并阻止用户触发

### Requirement: 文本区域输入基础组件
系统 SHALL 提供用于多行文本输入的可复用文本区域组件。

文本区域 MUST 支持占位提示、值变更、禁用状态和可访问标签。

#### Scenario: 渲染占位提示
- **WHEN** 文本区域接收到占位提示文本
- **THEN** 文本区域为空时展示该占位提示

#### Scenario: 接收多行文本
- **WHEN** 用户输入包含换行的文本
- **THEN** 文本区域保留输入的换行

### Requirement: 空状态组件
系统 SHALL 提供可复用的空状态组件。

空状态组件 MUST 支持标题、可选描述和可选操作区域。

#### Scenario: 渲染空状态内容
- **WHEN** 空状态组件接收到标题和描述
- **THEN** 二者以视觉清晰的布局展示

#### Scenario: 渲染可选操作
- **WHEN** 空状态组件接收到操作元素
- **THEN** 操作元素与空状态内容一起展示

### Requirement: 主题 token
系统 SHALL 为法律 AI 助手 UI 定义基础视觉主题 token。

主题 token MUST 包含 background、foreground、surface、muted、border 和 primary 颜色值。

#### Scenario: 组件使用共享主题 token
- **WHEN** UI 组件渲染
- **THEN** 它们使用共享主题 token，而不是互不相关的硬编码颜色系统

#### Scenario: 页面背景使用应用主题
- **WHEN** 首页渲染
- **THEN** 它使用已配置的应用背景色和前景色

### Requirement: 基础可访问性
系统 SHALL 为交互式 UI 元素提供基础可访问性支持。

交互组件 MUST 提供可见的焦点状态；当可见文本不足以说明控件含义时，MUST 提供可访问标签。

#### Scenario: 键盘焦点可见
- **WHEN** 键盘用户聚焦某个交互元素
- **THEN** 被聚焦元素具有可见的焦点指示

#### Scenario: 仅图标或语义不明的控件具备标签
- **WHEN** 某个控件没有描述性可见文本
- **THEN** 它提供可访问标签
