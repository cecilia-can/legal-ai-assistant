# 项目愿景（Vision）

## 一、项目背景

本项目旨在从零开始构建一个 AI 法律助手平台，并通过持续迭代逐步演进为具备知识库、工具调用、智能体（Agent）以及案件工作空间能力的完整系统。

项目目标不仅是实现一个可用的法律 AI 产品，更重要的是在开发过程中系统性学习和实践现代 AI 应用架构。

---

## 二、项目目标

构建一个面向法律场景的 AI 助手平台。

系统将按照以下路线逐步演进：

ChatBot
→ Memory
→ RAG
→ Tool Calling
→ Agent
→ Case Workspace

最终形成一个围绕案件全生命周期协作的 AI 工作平台。

---

## 三、技术栈

### 前端

* Next.js（App Router）
* React
* TypeScript

### 后端

* Next.js Route Handlers
* Server Actions

### 数据库

* PostgreSQL
* Prisma

### 部署（开发阶段）

* 应用：[Vercel](https://vercel.com)（Git Push 自动部署）
* 数据库：[Neon](https://neon.tech) PostgreSQL（`DATABASE_URL`）
* 详见 [`docs/deployment.md`](./deployment.md)

### AI 能力

* OpenAI Compatible API
* Streaming Response

### 未来扩展

* pgvector
* Embedding Model
* Tool Calling
* Agent Framework
* Workflow Engine

---

## 四、阶段规划

### Phase 1：ChatBot

目标：

实现一个类似 ChatGPT 的多轮对话系统。

功能范围：

* 多会话管理
* 多轮对话
* 流式输出
* Markdown 渲染
* 代码高亮
* 聊天记录持久化
* 用户登录鉴权与数据隔离

学习目标：

* Next.js
* Streaming
* Prompt Engineering
* Conversation Management
* Authentication & Authorization

---

### Phase 2：法律知识库（RAG）

目标：

让系统具备法律知识检索能力。

知识来源：

* 法律法规
* 司法解释
* 裁判文书
* 合同模板

功能范围：

* 文档导入
* 文档切片
* 向量化
* 检索增强生成（RAG）

学习目标：

* Embedding
* Retrieval
* pgvector
* RAG Architecture

---

### Phase 3：合同审查

目标：

实现合同上传与风险分析能力。

功能范围：

* PDF 上传
* 文档解析
* 条款提取
* 风险识别
* 审查报告生成

学习目标：

* Document Parsing
* Tool Calling
* Workflow Design

---

### Phase 4：案件分析 Agent

目标：

实现多步骤法律分析能力。

功能范围：

* 事实提取
* 法律关系识别
* 法规检索
* 案例检索
* 风险分析
* 分析报告生成

学习目标：

* Agent
* Planner
* Multi-step Reasoning

---

### Phase 5：案件工作空间

目标：

构建以案件为中心的 AI 协作平台。

功能范围：

* 案件管理
* 证据管理
* 文档管理
* AI 分析
* 法律文书生成
* 长期记忆

学习目标：

* Workspace Architecture
* Long-term Memory
* Human-AI Collaboration

---

## 五、架构原则

### 1. 渐进式演进

优先实现最小可用系统（MVP），避免过度设计。

---

### 2. 保持模块边界清晰

系统应逐步拆分为：

* Chat
* Memory
* Retrieval
* Tool
* Agent

等独立模块。

---

### 3. 提前预留扩展能力

虽然早期阶段不会实现：

* Memory
* RAG
* Tool Calling
* Agent

但架构设计应考虑未来扩展需求。

---

### 4. 优先保证可理解性

项目以学习和实践为主要目标。

代码结构、文档质量和架构演进过程的重要性高于功能数量。

---

## 六、文档规范

项目内所有设计文档统一使用中文编写：

* Vision
* Roadmap
* Deployment
* PRD
* Spec
* ADR
* Archive
* Review

代码实现统一使用英文命名：

* 文件名
* 类名
* 函数名
* 数据表名
* 接口名

避免中英文混合命名。
