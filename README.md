# 劳有据 AI（Laoyouju）

> 劳动问题，回答有依据。

## 一句话说明

劳有据 AI 是一个面向中国劳动争议场景的问答产品：用户提出劳动争议问题，产品基于审核过的法律法规与案例资料、由 DeepSeek 生成带可核验来源的回答，覆盖微信小程序与可被搜索引擎收录的网页端。

## 当前状态

**Phase 6 已完成（CloudBase 公网测试部署 + 真实 DeepSeek Smoke Test）**：已建立可审计内容 schema、首批真实全国性官方资料、确定性 n-gram/BM25 检索、服务端 DeepSeek 生成（引用校验）、Web `/ask` 真实问答，并已部署公网测试版。

- `packages/shared`：共用 API v1 契约（zod 运行时校验），回答结构为「初步说明 / 相关依据 / 下一步 / 信息边界 + AI 生成标识」，来源附带 citationRef/excerpt/reviewStatus；
- `packages/retrieval`：内容 schema、加载、全局校验、n-gram/BM25 检索（确定性关键词/意图/话题加权），`MIN_RELEVANCE_SCORE` 用于决定是否发起联网搜索与话题兜底（不再用于“资料不足拒答”）；内容根定位带「与部署包 `dist/` 相邻的 `../content`」兜底；
- `functions/api`：CloudBase HTTP 云函数（Node 原生 http + 原生 fetch），`POST /api/v1/ask` 执行「领域判定 → 检索（本地知识库 + 可选联网检索线索）→ 证据组织 → DeepSeek 生成 → 引用校验 → 结构化响应」，回答状态为三态 `answered`（八段结构与可核验来源）/ `needs_clarification`（法律框架+可能结论+需补事实+证据清单）/ `out_of_scope`（固定领域引导，不调用模型）；
- `apps/web`：`/ask` 真实问答页（三态结果展示、限流/配置缺失/服务异常等稳定错误态、可核验官方来源分组展示与如实核验状态），`/ask` noindex 且不进入 sitemap；
- 内容库：`content/laws/*.json`（34 部全国性规范）、`content/cases/*.json`（201 个官方案例，1276 条条文），`source_verified`。

**公网测试版（已部署，使用默认 CloudBase 测试域）**：
- 网站：`https://laoyouju-demo-d0g2c7d8sb319ddf3-1476043251.tcloudbaseapp.com`
- API：`https://laoyouju-demo-d0g2c7d8sb319ddf3.service.tcloudbase.com`（`POST /api/v1/ask`）
- 真实 DeepSeek Smoke Test：已通过（`outcome=answered`、四段结构、引用来自检索、无虚构/无密钥）；CORS 精确白名单已配置（非 `*`）。

**说明**：`source_verified` 用于明确标注的个人简历演示版，`legal_reviewed=0` 如实展示（已核对官方来源、尚待专业复核，不冒充律师审核）。默认 CloudBase 域名仅供测试；**未购买域名、未 ICP 备案、未做正式搜索收录、小程序未开发**。

**2026-08-28 更新**：Phase 7A 新版已部署公网测试版（34 部规范 / 53 个官方案例 / 1276 条条文 / 19 主题；三态回答 answered / needs_clarification / out_of_scope；联网搜索（WSA）仍未启用）。**真实 DeepSeek Smoke Test 已通过**：修复同步延迟根因（显式关闭思考模式 `thinking:{type:"disabled"}`、模型超时 45s→15s、输出上限 1300 tokens、调用前确定 needs_clarification 分支不再让模型双份输出）后，真实调用返回 **200 / 8.4s / answered / 5 项 A 级官方来源**（此前一次 502 约 20s 即思考模式+双份输出导致的真实延迟问题）。

**仍未完成**：小程序端（Phase 1D 延后）、独立域名/备案/正式搜索收录（Phase 7）、内容专业复核；**Phase 7B 官方案例库 201/200 达成，19/19 主题与 12 个省级地区均已达标，检索/语料质量门禁已全绿**（retrieval 28/28、case-corpus 14/14、shared 30/30、search 16/16、api 42/42、web 29/29；`pnpm run check` exit 0，详见 docs/PROGRESS.md）——**部署按项目经理最终指令暂停，等待验收后执行**（线上现仍为 96 例版本，未验证 201 例版线上行为）。

**下一阶段**：Phase 7 —— 小程序开发与搜索收录（独立域名/ICP 待办）。

产品当前为公网测试版，未宣称正式商用/已上线。

## 产品终端

- 微信小程序（首版终端之一，暂缓至 Web 端到端跑通之后）
- 可被搜索引擎收录的网页端（公开内容静态生成，私人问答不参与 SEO）

## 暂定技术架构

- Monorepo：pnpm workspace
- `apps/web`：Next.js，静态导出，公开内容支持 SEO；`/ask` 调用后端 API
- `apps/miniprogram`：微信小程序（原生；暂缓）
- `functions/api`：CloudBase 云函数（Node.js/TypeScript），唯一调用 DeepSeek 的入口
- `packages/shared`：共享数据结构、校验规则与 API 类型
- `packages/retrieval`：内容 schema、内容加载、校验与 n-gram/BM25 检索
- `content/`：审核后的法律法规、案例与公开问答材料（真源）
- `scripts/`：内容入库与校验工具

详细见 `docs/ARCHITECTURE.md`。

## 服务端 / Web 环境变量

- `DEEPSEEK_API_KEY`：仅服务端，严禁进入前端/日志/Git；未配置时 `/ask` 返回 503。
- `DEEPSEEK_BASE_URL`（默认 https://api.deepseek.com）、`DEEPSEEK_MODEL`（默认 deepseek-v4-flash）。
- `ALLOWED_ORIGINS` / `WEB_ALLOWED_ORIGIN`：服务端 CORS 白名单。
- `NEXT_PUBLIC_API_BASE_URL`：Web 端读取的 API 基地址（公开地址，非密钥）；未配置时 `/ask` 显示“服务尚未配置”。
- `NEXT_PUBLIC_SITE_URL`：SEO metadata 用（公开变量）。

## 尚未完成的功能

- 真实 DeepSeek 联调与云端 smoke test（Phase 6，当前无真实 Key）
- CloudBase 部署（Phase 6）
- 小程序端业务页面（Phase 1D 延后）
- 内容专业复核（当前为 `source_verified`）

## 内容库与检索命令

```bash
corepack pnpm run content:validate   # 校验内容库
corepack pnpm run retrieval:build    # 生成可复现的 BM25 索引（content/.index/index.json）
corepack pnpm run retrieval:query "<问题>" [topK] [topicId]
```

详见 `docs/CONTENT_REVIEW.md`、`docs/ARCHITECTURE.md`、`docs/SECURITY.md`。

## 成本原则

一切以最低现金支出为原则：

- 不购买独立服务器；优先采用腾讯云 CloudBase（Serverless）；
- 不使用香港或境外节点；
- 第一版不购买向量数据库、不接入付费 embedding API；
- 第一版不开发原生 App、不做支付、文件上传、复杂用户系统和运营管理后台。

## 安全原则

- 网页和小程序不得直接调用 DeepSeek；API Key 只存在于服务端环境变量；
- 不输出胜诉率、不冒充律师、不承诺案件结果；
- 不自动采集姓名、身份证、公司全称等非必要信息；
- 限制问题长度、调用频率和单次输出；
- 详细见 `docs/SECURITY.md`。

## 本地工具要求

- Node.js ≥ 20 且 < 25（本机当前为 24.x；生产云函数运行时为 Nodejs20.19）
- pnpm（经 Corepack 启用并锁定版本，见 `package.json` 的 `packageManager`）
- Git ≥ 2.x
- 微信开发者工具（开发小程序端时）

## 后续文档索引

- `docs/PROJECT_SCOPE.md` —— 首版范围与职责划分
- `docs/ARCHITECTURE.md` —— 架构与数据流
- `docs/DECISIONS.md` —— 决策记录（ADR）
- `docs/SECURITY.md` —— 安全要求
- `docs/PROGRESS.md` —— 阶段进度