# ARCHITECTURE.md —— 架构记录

> 只记录已决定的内容；尚未实现的细节不在此虚构。

## Monorepo 结构

- pnpm workspace（`apps/*`、`functions/*`、`packages/*`）；
- `packages/shared` 提供两端与云函数共享的数据结构、校验规则与 API 类型；
- `packages/retrieval` 提供内容 schema、内容加载、全局校验、中文 n-gram/BM25 检索与 Web 构建期数据访问（唯一新增包）；
- `scripts/` 负责内容与索引构建（生成 content/laws、content/cases 的可复现工具；`content/*.json` 为真源）。
- `content/` 为内容真源：`content/laws/*.json`、`content/cases/*.json` 逐个为 schema 校验后的文档。

## 各端形态

- **apps/web**：Next.js，静态导出。公开内容页在构建期生成，可被搜索引擎收录；问答交互通过 HTTP 调用后端云函数。
- **apps/miniprogram**：微信原生小程序。问答交互通过 HTTP 调用后端云函数。
- **functions/api**：CloudBase 云函数（Node.js/TypeScript）。唯一调用 DeepSeek 的入口，持有 DeepSeek Key（服务端环境变量）。


## Phase 7A：回答引擎 v2（LocalKnowledge + Search + 三态）

- 回答状态（outcome）：`answered`（事实足够，八段结构）/ `needs_clarification`（事实不足，仍输出法律框架+可能结论+关键事实+证据清单）/ `out_of_scope`（非劳动争议，固定领域引导文案，不调用模型）。面向用户的"资料不足"泛化状态已废除。
- 领域识别：确定性规则（词表/正则，强劳动信号 → 强非劳动信号 → 弱语境词 → 问候/无信号）在服务端完成。修正：**"公司/老板/单位/怎么办/赔偿"不再单独构成领域证据**（如"公司股票明天会涨吗""老板推荐我买股票""普通交通事故怎么赔""公司让我做红烧肉""我想开公司怎么办"均判 out_of_scope）；"上班途中发生交通事故算工伤吗"因命中强劳动信号"工伤"判为 labor。无任何信号 → out_of_scope。
- 事实提取：地点（省/直辖市/主要城市）、时间/工龄、劳动关系类型、解除原因、工资/金额、未签合同、试用期、工伤、孕期、仲裁时效、劳务派遣、平台用工等（确定性正则）。
- 争议焦点拆分：复合问题按连接词切分，映射到 19 个话题（TopicId），话题与关键词为人工维护词表；未命中时按 FALLBACK_TOPIC_RULES 推断，仍无命中则 topicIds 为空（**不再无脑绑定"违法解除/经济补偿"话题**）。
- 裸劳动词（工伤/年假/社保/加班/辞退怎么办 等，短查询 + 有劳动主题 + 非个案描述）：不调用模型，按话题从索引确定性检索真实 A 级规范并返回证据驱动的 needs_clarification（法律框架/可能结论/需补充事实/证据清单）。
- 检索：先查本地权威知识库（话题过滤 + 全局混合，BM25）；`MIN_RELEVANCE_SCORE` 仅用于判断"是否需要联网搜索"，不再用于"资料不足拒答"；本地无 A 级命中时按话题兜底补充真实 A 级规范（保证 answered/needs_clarification 至少一项 A 类来源）。
- 联网检索：SearchProvider 抽象（`packages/search`）；`TencentWSASearchProvider` 按腾讯云官方文档（https://cloud.tencent.com/document/product/1806/130615）实现：`POST https://api.wsa.cloud.tencent.com/SearchPro`，Header `Authorization: Bearer ${WSA_API_KEY}` + `Content-Type: application/json; charset=UTF-8`，Body `{ Query, Cnt }`（Cnt 仅取官方允许值 10/20/30/40/50）；响应取自 `Response.Pages`（元素为 JSON 字符串，逐项安全解析；映射 title/url/passage|content/date/site → title/url/snippet/publishedAt/siteName）。类型化错误（missing_config/timeout/rate_limited/upstream_status/malformed/network），每问题最多 2 次；结果经 URL/域名/时间/一致性校验后仅作 C 级补充线索，绝不当作完整法条；未配置 `WSA_API_KEY` 时 provider=undefined，本地知识库独立工作。
- 证据组织：按来源分级（A>B>C）、效力（effective>amended>case）、相关性、时效性、地域适用性排序；保证至少一条 A 级规范；相似官方案例最多 3 条。
- 生成：DeepSeek 只依据本次 `[S#]` 证据；服务端逐项校验 citation（**出现任意未在本证据集内的 [S#] → 引用异常，返回证据驱动的 needs_clarification**，不再"删号保留未经支持的断言"；带"第X条"但无有效引用的结论段同样拒绝）；核心法律结论必须至少一项 A 类来源。
- 响应：`topicsId` 数组 + 分组来源（法律法规/司法解释与仲裁程序/官方案例/补充参考=law/judicial/case/supplement）。

## 内容与来源登记（Phase 7A）

- `content/sources/registry.json`：Source Registry（全部来源的登记记录；A/B 级 loaded=true、被替代档案与 C/D 线索 loaded=false）。
- `content/laws/*.json`、`content/cases/*.json`：schema v2 内容文档（全文条文拆分；案例字段 caseId/publishingAuthority/caseType/publicationDate/issues/keyFacts/holding/reasoning/citedProvisions 等）。案例按“官方发布批次”组织：`content/raw/cases/phase7b/<batch>.txt`（====CASE:N==== 分节块：标题/基本案情/处理结果/裁判要旨/案号）+ `content/sources/probe/cases-phase7b-*.json`（批次清单：官方URL/发布机关/发布日期/案例数/核验日期/地区/备注）。
- `content/raw/laws|cases/*.txt`：官方页面抓取的原始文本（审计底稿；程序化导入的唯一文本来源）。
- 导入流程（auditable，Phase 7B 部分构建）：`scripts/extract-case-batch.mjs`（官方 XML/HTML 结构化批次 → 分节块文本；支持【模块】/纯文字标题/指导性案例编号/“案例N”分隔/“一、基本案情”等页面结构；零编造、按字段上限截断、案号仅页面给出时记录）→ `scripts/import-cases.mjs`（分节块 → 逐案例 JSON；确定性 topicIds 规则；`--retag` 仅重算已有案例 topicIds）→ `scripts/import-registry.mjs`（汇总 registry）。导入脚本自行校验 textSha256/contentHash，随后 `pnpm run content:validate`（含 30 部规范/50 案例底线）；`scripts/audit-case-coverage.mjs` 生成 `docs/CASE_COVERAGE_AUDIT.md`（19 主题覆盖/重复检测/地区分布/批次清单）。
- 核验状态：`verificationStatus=official_source_verified`（与官方来源核验，可为程序化）与 `human_verified`（人工复核，必须伴随 `reviewStatus=legal_reviewed` 记录）是两个不同状态。
- 被替代/已废止文件：只保留 registry 记录（loaded=false，记 supersedes/supersededBy），不作为现行依据；校验保证替代关系链完整。
## 内容与回答流程

```
content（content/laws、content/cases，经 schema 校验的仓库真源）
   │  packages/retrieval：校验（content:validate）+ 生成索引（retrieval:build，可复现）
   ▼
index（本地 n-gram/BM25 索引，可完全从 content 重建）
   │  用户问题 → 领域判定（out_of_scope 直接返回固定引导，不调用模型/搜索）
   │  → 裸劳动词 → 话题兜底检索 → 证据驱动 needs_clarification
   │  → n-gram/BM25 检索（确定性关键词/意图/话题加权；支持 topicId 过滤、topK；同分稳定排序）
   ▼
retrieval 结果（sourceId、provisionId/chunk、标题、条款/案例规则、官方 URL、效力状态、reviewStatus、topicIds、分数）
   │  ① 可靠性判断：得分/话题证据决定是否发起联网搜索（每问题最多 2 次；搜索结果仅作 C 级线索）
   │  ② 本地无 A 级命中 → 按话题兜底补充真实 A 级规范
   │  ③ 把 top-N 组织为 [S1]…[Sn] 证据
   ▼
functions/api：DeepSeek 生成（仅基于证据；要求输出结构化 JSON；单次调用，超时/输出上限）
   │  parse 回答 → 提取 [S#] 引用 → 与本次证据白名单比对
   ▼
引用校验：出现未知 [S#] → 引用异常 → 证据驱动 needs_clarification；无“第X条”无引用的结论段同样拒绝；
   校验通过 → 返回结构化 citations（sourceId/title/officialUrl/条号/excerpt/reviewStatus）
   ▼ 畸形输出 / 无有效引用 / 校验失败 → 基于真实证据的 needs_clarification（绝不返回“资料不足”）
```

索引为构建产物（`content/.index/index.json`，已 gitignore），可由 `content/` 完全重建；联网抓取不是正常 build 步骤。DeepSeek 只在 `functions/api` 服务端调用；浏览器端不出现 API Key。

## 检索规范化与评分（packages/retrieval）

- 中文以字符 2-gram 与 3-gram 作为索引项；Unicode NFKC、ASCII 小写、去空白与无意义标点（保留条号与数字等有意义信息）；
- 标准 BM25（k1=1.5、b=0.75、idf 平滑 0.5）；同分按稳定 ID 排序，保证相同输入字节一致；
- **AUTHORITY_BOOST=1.45**：A 级法条（kind=provision）确定性权威加权，防止官方案例（B 级、文本长、关键词密集）在 BM25 原始分数上系统性挤占核心法条；**仅对已达相关性阈值（≥MIN_RELEVANCE_SCORE）的候选放大**——弱相关偶合命中（如“手续费→手续”类 2 词项重合）不会被放大越过阈值，兼顾 40+ 黄金查询的法条 top3 召回与无关查询负向约束（Phase 7B 检索质量修复；可解释、可测试）。
- 确定性字段/意图加权：`keywords` 字段命中加分（`KEYWORD_BOOST`）、查询意图命中 topic 时对该 topic 内文档加乘数（`TOPIC_BOOST`）、同义词扩展（辞退/解除、没签合同/二倍工资、周末/加班费标准等）为手工维护，不调用模型；
- `MIN_RELEVANCE_SCORE`：得分低于该值视为"本地证据不足"，仅用于决定是否发起联网搜索（并触发话题兜底补充），不再用于拒答。
- 内容校验（`content:validate`）：sourceId/provisionId 唯一、日期格式、官方 URL HTTPS、官方 host 白名单、全国版禁止地方资料、law/司法解释不得为 repealed/unknown、sourceText 非空、textSha256 一致、无重复 provision、source_verified 与 legal_reviewed 不混淆；topicIds 自 19 话题枚举。

## DeepSeek 集成（functions/api）

- 环境变量：`DEEPSEEK_API_KEY`（仅服务端）、`DEEPSEEK_BASE_URL`（默认 https://api.deepseek.com）、`DEEPSEEK_MODEL`（默认 deepseek-v4-flash）；`ALLOWED_ORIGINS` / `WEB_ALLOWED_ORIGIN`（CORS 白名单）。
- 使用 DeepSeek OpenAI-compatible `/chat/completions`，原生 `fetch`，不引入 SDK；请求 `response_format: json_object`、`max_tokens` 上限、超时；单次调用、不自动重试（避免重复扣费）。
- 缺 API Key → 503 `SERVICE_NOT_READY`；上游 429 → 503 `RATE_LIMITED`；超时/5xx → 502 `UPSTREAM_ERROR`（均为稳定、安全的错误响应，不泄露内部细节）。
- 引用校验：模型引用的每个 `[S#]` 必须属于本次检索证据；未知引用丢弃；无有效引用或输出畸形 → 安全降级为 `insufficient`。

## DeepSeek Key 的安全边界

- Key 只存在于云函数的环境变量；
- 网页构建产物、小程序代码、日志、测试快照、Git 中不得出现 Key；
- 客户端只持有 `NEXT_PUBLIC_API_BASE_URL`（公开地址，非密钥）。

## 部署（Phase 6，公网测试版）

- 环境：`laoyouju-demo-d0g2c7d8sb319ddf3`（ap-shanghai，体验版）；认证仅 `tcb login` 浏览器授权；CLI `@cloudbase/cli@3.8.1`（official registry）。
- 云函数 `laoyouju-api`：`type: HTTP` + `scf_bootstrap` 启动 `node dist/server.js`（监听 9000）；`Nodejs20.19`、256MB、60s、`installDependency=false`；`/api` 网关路由（`gatewayPath=/api`）。公网地址 `https://laoyouju-demo-d0g2c7d8sb319ddf3.service.tcloudbase.com`。
- Monorepo 打包：`esbuild@0.28.2` 打包 api+shared+retrieval+zod 为单文件（`deploy/api/dist/server.js`），并包含 `content/laws`、`content/cases`、`scf_bootstrap`、最小 `package.json`；不依赖 pnpm symlink；`deploy/` 已 gitignore。内容根定位带「与 `dist/` 相邻的 `../content`」兜底。
- Web 静态托管：`apps/web/out`（`NEXT_PUBLIC_API_BASE_URL`=真实 API 地址）→ `https://laoyouju-demo-d0g2c7d8sb319ddf3-1476043251.tcloudbaseapp.com`。
- CORS：`ALLOWED_ORIGINS`/`WEB_ALLOWED_ORIGIN`=站点 Origin（精确、非 `*`）；`DEEPSEEK_API_KEY` 由用户控制台配置，`cloudbaserc.json` 不写 `envVariables`（避免整体替换环境变量）。
- 详细与回滚见 `docs/DEPLOYMENT.md`；默认 CloudBase 测试域仅用于测试，正式域名/备案/搜索收录、小程序未完成。

## API v1（functions/api）

- 路径：`GET /api/v1/health`（健康检查）、`POST /api/v1/ask`（问答：检索 → DeepSeek 生成 → 引用校验）。
- 形态：CloudBase HTTP 云函数，Node 原生 `node:http` 实现（不使用 Express 等框架），监听 `0.0.0.0:9000`（`PORT` 环境变量可覆盖）；
- 启动：`scf_bootstrap`（LF、`/bin/sh`、fail-fast，启动 `dist/server.js`）；CloudBase HTTP 访问服务路由在 Phase 6 配置；
- 契约：请求/响应结构由 `packages/shared`（zod 运行时校验）统一定义；回答为「初步说明 / 相关依据 / 下一步 / 信息边界 + AI 生成标识」，来源为结构化 citations（含 citationRef/excerpt/reviewStatus）；
- 成功响应：`outcome: "answered" | "needs_clarification" | "out_of_scope"`（三态；"资料不足/insufficient"已废除）；`answered`/`needs_clarification` 至少一项 A 类来源；
- 安全：严格 CORS Origin 白名单、body ≤ 8192 bytes、question 2～500 字、统一错误结构、日志不记录用户问题、缺 Key 返回 503、上游异常返回稳定错误；out_of_scope 与裸劳动词路径不调用模型/搜索。

## 本地与生产运行时差异

- 本地开发：Node 24（允许），但代码不得依赖 Node 24 专有特性；
- 生产云函数：目标运行时 Nodejs20.19；
- 两套运行时在 Node 大版本与模块解析行为上存在差异，云函数代码须按 Nodejs20.19 兼容标准编写。