# 部署策略（Deployment）

本文档记录法律 AI 助手项目的部署架构决策，对比 **Vercel + Neon** 与 **Docker** 两种方案，并说明当前阶段的选择与后续迁移路径。

---

## 一、当前决策

**开发阶段采用：Vercel + Neon**

| 层级 | 方案 | 说明 |
|------|------|------|
| 应用托管 | [Vercel](https://vercel.com) | 与 Next.js 原生集成，Push 即部署 |
| 代码来源 | GitHub | 仓库 `cecilia-can/legal-ai-assistant` |
| 数据库 | [Neon](https://neon.tech) PostgreSQL | 通过 `DATABASE_URL` 连接 |
| 构建流程 | Vercel 默认检测 | `npm install` → `postinstall` → `npm run build` |

**上线阶段（功能完成后）再评估：** 是否切换为 Docker 自托管，或继续沿用 Vercel + Neon。

---

## 二、方案 A：Vercel + Neon（当前）

### 架构示意

```
GitHub Push
    ↓
Vercel 自动构建
    ├── npm install
    ├── postinstall: prisma generate
    └── npm run build (next build)
    ↓
Vercel Serverless 运行
    ↓ DATABASE_URL
Neon PostgreSQL（托管）
```

### 优点

- **零运维**：无需管理服务器、SSL、反向代理
- **与 Next.js 深度集成**：Preview 部署、分支预览、自动 HTTPS
- **开发体验好**：Push 即上线，适合快速迭代
- **Neon 托管数据库**：自动备份、连接池（pooler）、按需扩缩

### 缺点

- **平台绑定**：依赖 Vercel 生态，不宜使用 Vercel 专有 API（如 `@vercel/kv`）
- **Serverless 限制**：冷启动、执行时长、连接数需关注
- **数据出境**：若需内网或完全自托管，不适合

### 项目已做的 Vercel 适配

1. **`package.json` 中的 `postinstall`**

   Prisma Client 生成在 `app/generated/prisma/`，该目录被 `.gitignore` 忽略，Vercel 构建时必须在 `npm install` 后执行 `prisma generate`。

   ```json
   "postinstall": "prisma generate"
   ```

2. **Prisma 7 + PostgreSQL Adapter**

   `lib/db.ts` 使用 `@prisma/adapter-pg` 连接 Neon，符合 Prisma 7 要求：

   ```typescript
   const adapter = new PrismaPg({
     connectionString: process.env.DATABASE_URL!,
   });
   return new PrismaClient({ adapter });
   ```

3. **环境变量**

   Vercel 项目需配置：

   - `DATABASE_URL` — Neon 连接串，通常带 `?sslmode=require`
   - 开发/迁移时建议使用**不含 pooler** 的直连地址；应用运行时可用 pooler 地址

### 本地开发

```powershell
Copy-Item .env.example .env
# 编辑 .env，填入 Neon 或本地 PostgreSQL 的 DATABASE_URL

npm install
npx prisma migrate dev
npm run dev
```

### Phase 2 本地知识库数据库

Phase 2 使用 PostgreSQL + pgvector 保存法律知识库和文档向量。项目的
`docker-compose.yml` 已使用 `pgvector/pgvector:pg17` 镜像；首次使用或更换数据库
时，Prisma migration 会通过 `CREATE EXTENSION IF NOT EXISTS vector` 创建 pgvector
扩展。

```powershell
npm run db:up
npx prisma migrate dev
npx prisma generate
```

当前 Change 2.1 只建立知识库、文档、文档切片和 Embedding 数据模型，不会导入
原始资料或批量调用 Embedding 服务。向量索引和实际向量化在后续 Change 中完成。

如果本机已经存在名为 `legal-ai-postgres` 的容器，应先确认它使用
`pgvector/pgvector:pg17` 且端口映射到 5432；不要为解决容器名称冲突而删除或重置
包含用户数据的数据库。

---

## 三、方案 B：Docker 自托管（后续可选）

### 架构示意（最小可行）

```
┌─────────────────────────────────────┐
│  VPS / Coolify / 云容器平台          │
│  ┌─────────────┐   ┌──────────────┐ │
│  │ Caddy/Nginx │──▶│ Next.js 容器  │ │
│  │   (HTTPS)   │   │  :3000       │ │
│  └─────────────┘   └──────┬───────┘ │
└───────────────────────────┼─────────┘
                            │ DATABASE_URL
                            ▼
                    ┌───────────────┐
                    │ Neon 或自建    │
                    │ PostgreSQL    │
                    └───────────────┘
```

### 优点

- **完全掌控**：运行时、网络、数据存放位置自主决定
- **内网/离线部署**：适合数据不出境或私有化场景
- **固定成本**：流量大时可能比 Serverless 更省
- **环境一致**：同一镜像用于 dev / staging / prod

### 缺点

- **运维责任**：SSL、重启、日志、监控、备份需自行处理
- **无 Vercel 便利**：Preview 部署、CDN 需额外配置
- **Serverless → 常驻进程**：Prisma 连接池行为与 Vercel 略有不同

### 实施前需决策

| 决策项 | 选项 |
|--------|------|
| 容器运行位置 | VPS + Compose、Coolify、云容器服务（ECS / Cloud Run / Fly.io） |
| 数据库 | 继续 Neon，或 PostgreSQL 一并容器化 |
| 反向代理 | Nginx、Caddy、Traefik，或由 PaaS 平台提供 |
| CI/CD | GitHub Actions 构建镜像 → 推送 Registry → 部署 |

### Docker 化所需工作（功能完成后）

1. **`next.config.ts`** — 开启 `output: 'standalone'`，缩小镜像体积
2. **`Dockerfile`** — 多阶段构建（deps → build → runtime）
3. **`.dockerignore`** — 排除 `node_modules`、`.next`、`.git`、`.env`
4. **`docker-compose.yml`**（可选）— 定义 app 服务，按需加 postgres
5. **启动脚本** — 例如 `prisma migrate deploy && node server.js`
6. **CI/CD** — 自动构建、推送、部署流水线

构建阶段须执行 `prisma generate`；迁移建议在容器启动时或 CI 单独步骤执行 `prisma migrate deploy`。

---

## 四、方案对比

| 维度 | Vercel + Neon | Docker 自托管 |
|------|---------------|---------------|
| 运维复杂度 | 低 | 中高 |
| 部署触发 | Git Push 自动 | 需自建 CI/CD |
| HTTPS / 域名 | 自动 | 需反向代理或平台 |
| 数据库 | Neon 托管 | Neon 或自建 Postgres |
| 适用阶段 | 开发、演示、MVP | 功能稳定后、内网、长期自托管 |
| 代码改动 | 无额外要求 | 加 Dockerfile 等配置 |
| 平台绑定 | 依赖 Vercel | 无 |

---

## 五、分阶段策略（推荐）

```
Phase 1 开发（现在 → 功能完成）
├── 部署：Vercel + Neon
├── 专注：UI、API、AI 集成、业务逻辑
└── 原则：不引入 Vercel 专有依赖，配置走环境变量

Phase 2 上线评估（功能完成后）
├── 评估：继续 Vercel，或切换 Docker
├── 若 Docker：补 Dockerfile、Compose、CI/CD
├── 数据库：可继续 Neon，或迁到自建 Postgres
└── Vercel：可保留作 staging / 预览环境
```

**结论：** 开发阶段继续使用 Vercel + Neon 完全可行；项目功能完成后，再用 Docker 打包上线，**无需重写业务代码**。

---

## 六、开发阶段保持的可迁移习惯

为后期平滑切换到 Docker，开发时注意：

| 习惯 | 原因 |
|------|------|
| 敏感配置走环境变量 | Docker 同样通过 env 注入 |
| 不使用 Vercel 专有 API | 换部署方式后不可用 |
| 数据库变更用 `prisma migrate` | Docker 部署时同样执行 `migrate deploy` |
| 本地 `npm run build` 能通过 | Docker 构建阶段也会跑 build |
| 连接串不硬编码 | 各环境通过 `DATABASE_URL` 区分 |

当前项目已符合上述约定。

---

## 七、Neon 连接说明

Neon 提供两种连接地址：

| 类型 | 地址特征 | 适用场景 |
|------|----------|----------|
| 直连 | 不含 `pooler` | `prisma migrate dev`、schema 变更 |
| 连接池 | 含 `-pooler` | 应用运行时、Serverless、多实例 |

本地 `.env` 做迁移时用直连；Vercel 生产环境可用 pooler 地址，减少连接数压力。

---

## 八、相关文件

| 文件 | 作用 |
|------|------|
| `package.json` | `postinstall`、`build` 脚本 |
| `lib/db.ts` | Prisma Client 单例与 PostgreSQL Adapter |
| `.env.example` | 环境变量模板 |
| `prisma/schema.prisma` | 数据库模型 |
| `prisma/migrations/` | 迁移历史 |
| `.gitignore` | 忽略 `.env`、`app/generated/prisma` |

---

## 九、变更记录

| 日期 | 决策 |
|------|------|
| 2026-07-12 | 选用 Neon 作为 Phase 1 PostgreSQL 托管方案 |
| 2026-07-13 | 选用 Vercel 作为开发阶段应用托管；修复 `postinstall` 与 Prisma 7 Adapter |
| 2026-07-15 | 明确分阶段策略：开发用 Vercel + Neon，功能完成后再评估 Docker |
