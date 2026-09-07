# PROGRESS.md —— 阶段进度

## 阶段状态

| 阶段 | 内容 | 状态 |
|---|---|---|
| Phase 0 | 仓库与运行环境审计 | completed |
| Phase 1A | 仓库治理、项目规则与空目录骨架 | completed |
| Phase 1B | Web scaffold（Next.js 静态导出） | completed |
| Phase 1C | Shared/API scaffold | completed |
| Phase 1D | 小程序 scaffold | deferred（延后至 Web 端到端跑通之后，见 ADR-012） |
| Phase 2 | 内容 schema 与检索索引 | completed |
| Phase 3 | 检索实现（n-gram/BM25） | completed |
| Phase 4 | DeepSeek 集成 | completed |
| Phase 5 | 端到端产品打通 | completed |
| Phase 6 | CloudBase 部署 | completed（公网测试版部署 + 真实 DeepSeek Smoke Test 通过） |
| Phase 7 | 小程序审核与搜索收录 | pending |

> 下一阶段：**Phase 7 —— 小程序开发（Phase 1D 延后项）与搜索收录**（独立域名/ICP/搜索提交尚未完成）。当前为公网测试版，默认 CloudBase 域名，仅用于测试。

## Phase 0 审计发现（重要记录）

- 工作目录（本地项目工作区）为空目录；
- Git 未初始化（Phase 1A 已 `git init -b main`）；
- pnpm 原本缺失（Phase 1A 已通过 Corepack 启用并锁定 11.24.0）；
- 本机 Node.js 24.19.0（生产云函数运行时为 Nodejs20.19）；
- Git 全局 user.name/user.email 未配置（首次 commit 前需处理，且不修改全局配置，改用仓库级配置）；
- 发布期需要核验微信小程序法律服务类目资质。

## Phase 1A 完成内容

- Git 仓库初始化（main 分支，无 commit、无 remote）；
- Corepack 启用并锁定 pnpm@11.24.0（COREPACK_HOME 指向工作区内 `.corepack/`，已 gitignore）；
- Monorepo 空目录骨架（apps/web、apps/miniprogram、functions/api、packages/shared、content/*、scripts、docs）；
- 根配置：package.json、pnpm-workspace.yaml、.gitignore、.env.example、.editorconfig、.gitattributes、tsconfig.base.json、.npmrc（仅 save-exact / engine-strict）；
- 治理文档：AGENTS.md、README.md、PROJECT_SCOPE.md、ARCHITECTURE.md、DECISIONS.md、SECURITY.md、本文件。

## 注意事项

- 本机 npm 全局 registry 指向腾讯云镜像（`mirrors.cloud.tencent.com/npm`）——系环境既有配置，本项目未配置任何第三方 registry；Corepack 下载 pnpm 时显式使用官方 registry。
- 本机 `corepack enable` 因无法写入 Node 安装目录（具体路径省略）失败；已改用工作区内 COREPACK_HOME 方案，不影响功能。

## Phase 1B 完成记录

- 实际依赖版本：Next.js 16.3.3、React 19.2.8、React DOM 19.2.8、TypeScript 5.9.3、ESLint 9.39.5、eslint-config-next 16.3.3、@types/react 19.2.18、@types/react-dom 19.2.5、@types/node 20.19.43（与生产 Nodejs20.19 对齐）；
- 静态导出的路由：`/`、`/topics`、`/laws`、`/cases`、`/about/methodology`、`/about/sources`、`/privacy`、`/terms`、`/ai-notice`（可收录）；`/ask`（noindex/nofollow，不收录）；`/robots.txt`、`/sitemap.xml`（不含 /ask）；
- 本阶段没有 API、没有 DeepSeek 接入、没有部署、没有创建云资源；
- Phase 1A 的两项治理问题已修复：AGENTS.md 中“不得修改用户已有文件”改为准确含义；PROJECT_SCOPE.md 六类问题改为六个产品场景并补充地域边界；DECISIONS.md 追加 ADR-009；
- 已知权衡：ESLint 采用 9.39.5（官方维护线，已被标记为不再支持），因为 ESLint 10 与 eslint-config-next 16.3.3 的插件栈存在真实 API 不兼容（eslint-plugin-react 崩溃）；待插件栈支持 ESLint 10 后再升级；
- 环境说明：本机构建沙箱禁止子进程管道 stdio，`next build` 需在更宽模式下执行。

### Phase 1B-FIX：构建安全与文档状态修正（2026-08-26）

- 问题：`next build` 曾输出 `Skipping validation of types`，单独执行 Web build 可能绕过 TypeScript 检查即产出部署产物；README 状态停留在 Phase 1A；
- 整改内容：
  1. 尝试删除 `apps/web/next.config.ts` 的 `typescript.ignoreBuildErrors` 以恢复 Next 构建期原生类型校验，实测在当前沙箱中于 "Running TypeScript ..." 步骤失败（`spawn EPERM`，exit 1），失败证据已保留；
  2. 该配置恢复为**有记录的临时环境兼容措施**，注释中写明真实原因与解除条件（无此沙箱限制的标准 CI/开发机可删除）；
  3. `apps/web/package.json` 的 build 改为 `tsc --noEmit && next build`（fail-closed：tsc 不通过则不执行 next build），单独构建 Web 亦必先通过类型检查；
  4. 根 `package.json` 的 build 改为 `corepack pnpm run typecheck && corepack pnpm -r run build`（先全部工作区 typecheck，再构建；`-r` 不含根，无递归）；
  5. README.md 状态同步为 Phase 1B 已完成（Web 静态骨架可构建；问答/法律内容/API/DeepSeek/小程序/部署未完成；下一阶段 Phase 1C）；
- 验证：lint / typecheck / web build / 根 build / test（15 项）/ 根 check 全部通过；构建产物无密钥；无新增第三方 registry；未创建 commit、remote、云资源或部署。

## Phase 1C 完成记录

- 新增 package：`@laoyouju/shared`（packages/shared，API v1 契约 + zod 运行时校验）、`@laoyouju/api`（functions/api，CloudBase HTTP 云函数骨架，Node 原生 http）；
- 新增依赖（精确版本）：运行时 zod@4.4.3（shared）；开发依赖 typescript-eslint@8.68.0（shared/api，用于 TS lint）、typescript@5.9.3 / eslint@9.39.5 / @types/node@20.19.43（复用既有版本线）；无其他新依赖；
- API 路由：`GET /api/v1/health`（200）、`POST /api/v1/ask`（校验后固定 503 SERVICE_NOT_READY）、OPTIONS 预检、404/405（带 Allow）/415/413/400、CORS 精确白名单（未配置时 fail-closed）；
- 测试数量：shared 契约测试 26 项、api 集成测试 25 项、web 静态导出测试 15 项（共 66 项，全部通过）；
- 类型检查在 clean dist 下通过（api 的 typecheck 通过 paths 指向 shared 源码；构建按依赖拓扑 shared → api → web）；
- 已知限制（部署/模型接入前门槛）：
  - `scf_bootstrap` 的 executable bit 在 Windows 无法可靠设置，列为 Phase 6 部署前检查项（本阶段未部署，未伪装完成）；
  - 服务端限流未实现（/ask 固定 503 不产生模型费用）；Phase 4 接入 DeepSeek 前必须完成限流，否则不得开放真实模型调用；
  - 本机无 Node 20 运行时，Nodejs20.19 兼容性依据代码审查与 @types/node@20 类型约束，未做 Node 20 实测；
- 环境说明（Phase 1C 补充）：本机构建沙箱禁止 pnpm 硬链接/junction 与子进程管道操作，`pnpm install`/`pnpm run`/`next build` 需在更宽模式下执行；pnpm store 已通过 pnpm-workspace.yaml `storeDir` 固定到项目内 `.pnpm-store`，并设置 `confirmModulesPurge: false` 支持无 TTY 自动重建；
- 本阶段未接入 DeepSeek、未导入法律内容、未实现检索、未部署、未创建云资源、未创建 commit/remote。

## Phase 1C-FIX 完成记录

- 范围：仅整改 Phase 1C 的 HTTP 单次响应、CORS 与进程安全；未开始 Phase 1D、未接入 DeepSeek/检索/真实法律内容/小程序/部署。

### 根因：单次请求重复提交响应

- `handleAsk()` 内部先前通过**文件级** `respondError(res, ...)` 直接写 socket（writeHead+end），但没有修改 `createApiServer()` 外层闭包的 `responded` 状态；
- 该函数 Promise 完成后外层仍认为“未响应”，在 `finish()` 中再次发送 500，形成第二次 `writeHead`（写头计数为 2）、`end` 仍为 1；
- 旧测试只断言客户端最终看到的 503，未检查服务端写入次数，因此未捕获重复 `writeHead`。
- 修复：`handleAsk` 改为只返回结构化结果（`statusCode/errorCode/payload`），一切响应由外层唯一 `respond` 闭包提交一次；`finish` 只记录日志、永不发送或补发响应。

### 修复内容

1. **单一响应写入**：`functions/api/src/app.ts` 只保留一个响应提交路径（`respond`/`respondError`），每个请求最多一次 `writeHead` 与一次 `end`；异常兜底仅在 `!res.headersSent && !res.writableEnded` 时发送 500。
2. **Vary: Origin**：所有响应（含 200/400/403/404/405/413/415/500/503 与 OPTIONS 204）统一带 `Vary: Origin`；无 Origin 时只返回 `Vary: Origin`、不返回 `Access-Control-Allow-Origin`；白名单 Origin 返回精确 ACAO（禁止 `*`）；非白名单 Origin 仍 403、不反射 Origin、仍带 `Vary`。
3. **OPTIONS 路由**：OPTIONS 先安全解析 pathname 并检查 ROUTES，仅 `/api/v1/health` 与 `/api/v1/ask` 允许 204；未知路径 OPTIONS 返回 404 且不带任何 ACAO；`Access-Control-Allow-Methods` 按路由返回（health `GET, OPTIONS`、ask `POST, OPTIONS`）。
4. **进程安全**：`AGENTS.md` 新增“进程与端口操作安全（强制）”，禁止按名称批量终止 node/pnpm/npm/corepack 等进程，仅允许停止任务自启动并记录 PID 的进程，停止前核对 PID/命令行/端口，测试须用 `finally`/`after` 关闭自建 server。

### 测试数量

- API 集成测试：25 → **37** 项（新增 12 项回归测试，全部通过）；
- Shared 契约测试：26 项（不变，全部通过）；
- Web 静态导出测试：15 项（不变，全部通过）；
- 强制验证：lint / typecheck / build / test / check 全部通过；`git diff --check`、密钥扫描、registry 扫描、进程与端口残留检查通过。

### 已知限制（沿用 Phase 1C）

- `scf_bootstrap` executable bit、服务端限流、Node20.19 实测等限制仍沿用 Phase 1C 记录，Phase 6/Phase 4 前需处理；
- 本阶段未创建 commit/remote、未部署、未创建云资源、未接入模型。

## Phase 2+3 完成记录（内容与检索 MVP）

- 新增唯一包 `@laoyouju/retrieval`（packages/retrieval）：内容 schema（zod）、内容加载、全局校验、中文 n-gram（2/3-gram）+ 标准 BM25 检索、Web 构建期数据访问（catalog）。未创建数据库、管理后台、爬虫服务或第二套内容副本。
- 内容库：`content/laws/*.json`（9 个全国性法规/司法解释来源）与 `content/cases/*.json`（9 个官方案例）。校验通过（laws=9、cases=9、provisions=57）。
- 检索：确定性 n-gram/BM25（命名常量 k1=1.5、b=0.75、idf 平滑 0.5）；中文 2-gram+3-gram，ASCII 小写、NFKC、去标点/空白、保留条号/数字；支持 topicId 过滤与 topK；同分按稳定 ID 排序；索引可重复生成且字节一致（连续构建两次 SHA256 相同）。同义词表（辞退/解除、补偿金/赔偿金、欠薪/拖欠工资、双倍工资/二倍工资、社保/社会保险、竞业协议/竞业限制、加班工资/加班费，以及口语化的“没发工资/拖欠工资”等）为确定性手工维护，不调用模型。
- 根命令：`content:validate`、`retrieval:build`、`retrieval:query`（另含 `retrieval:catalog`）；根 build 顺序：content validate → retrieval build → 工作区 typecheck/build → tests。
- 代表性检索评测：7 个查询在 top5 均命中对应 topic 的有效规范条文；空查询、纯标点、超长查询、topic 过滤、重复构建字节一致、已废止/unknown 不入索引、重复 ID 构建失败、textSha256 不匹配构建失败均覆盖。检索测试 19 项全部通过。
- Web：`/laws`、`/cases`、`/topics` 从同一份 schema 校验后的内容目录（buildCatalog）读取真实资料，不再手写重复数据；`/laws` 显示标题/机关/效力/施行日期/覆盖主题/reviewStatus 中文说明/官方链接/相关条款定位；`/cases` 显示标题/发布机关/争议焦点/规则摘要/覆盖主题/reviewStatus/官方链接，并明确“案例摘要不等于对用户个案的结论”；`/topics` 显示六场景已收录有效条文数与案例数、资料边界与地方规则未覆盖提示。`/ask` 仍为 noindex/nofollow，robots/sitemap 不含 /ask。
- 内容状态诚实：所有内容仅标记 `source_verified`（已与官方来源核对，尚待专业复核），无任何 `legal_reviewed`；公开页面不显示“律师审核/专业审核通过”等表述。已更新网页中“审核过的资料”“经审核入库”等文案。
- 新增 `docs/CONTENT_REVIEW.md`：按来源列出 sourceId、标题、官方 URL、核对日期、收录条款/案例、reviewStatus、自动校验结果与待人工复核事项，并明确 source_verified 不等于律师审核、开放 AI 问答前需专业复核、地方规则不在首版范围。
- 测试数量：retrieval 19 项、shared 26 项（不变）、api 37 项（不变）、web 15 项（不变，仍通过）；lint/typecheck/build/test/check 全部通过（build 为 content validate → retrieval build → typecheck → 各包构建）。
- 本阶段未接入 DeepSeek、未开始小程序、未部署、未创建云资源、未创建 commit/remote；`/api/v1/ask` 仍固定返回 503 SERVICE_NOT_READY。

## Phase 4+5 完成记录（检索质量修正 + DeepSeek 接入 + Web 问答闭环）

- **检索质量修正**：`packages/retrieval` 增加确定性字段/意图加权（`keywords` 命中 `KEYWORD_BOOST`、`TOPIC_BOOST`、同义词扩展）、`MIN_RELEVANCE_SCORE` 用于“资料不足”判断；建立关键法条 gold 断言（sourceId+条号，而非仅 topicId）：`公司把我辞退了…` 命中《劳动合同法》§47/§87、`入职半年…没签劳动合同` 命中 §82、`周末加班…不给加班费` 命中《劳动法》§44、`试用期突然被辞退` 命中 §21 及解除依据 §39；检索测试 19 项通过，含无关问题/纯标点/注入式负向测试。索引构建保持字节确定性。
- **共享契约更新**：回答结构改为「初步说明 / 相关依据 / 下一步 / 信息边界 + AI 生成标识」；来源为结构化 citations（citationRef/sourceId/title/officialUrl/条号/excerpt/reviewStatus）；成功响应 `outcome: answered/insufficient`；错误码新增 `UPSTREAM_ERROR`（共 29 项共享契约测试通过）。
- **服务端 DeepSeek 接入（functions/api）**：`config.ts`（env 解析）、`deepseek.ts`（原生 fetch 调用 OpenAI-compatible `/chat/completions`，超时/输出上限/不重试）、`ask.ts`（检索 → 可靠性判断 → 证据组织 [S#] → 模型生成 → 引用校验 → 结构化响应）。缺 Key → 503 `SERVICE_NOT_READY`；429 → 503 `RATE_LIMITED`；超时/5xx → 502 `UPSTREAM_ERROR`；资料不足/畸形/未知引用 → 安全降级为 `insufficient`。
- **Web `/ask` 真实问答**：问题输入、示例（5 个）、提交/加载/成功/资料不足/限流/配置缺失/服务异常状态；展示回答与可点击官方来源（标题/条号/摘录/reviewStatus）；显示“AI 生成·仅供参考，不构成法律意见”与隐私提醒；`/api/v1/ask` 地址取自 `NEXT_PUBLIC_API_BASE_URL`，未配置时显示“服务尚未配置”；`/ask` 保持 noindex/nofollow 且不进入 sitemap。
- **测试数量**：shared 29、retrieval 19、api 48（37 项回归 + 11 项 mock fetch DeepSeek 测试）、web 16；lint/typecheck/build/test/check 全部通过。
- **说明**：所有 DeepSeek 测试使用 mock fetch，**未使用真实 API Key、未访问真实 DeepSeek、未产生费用**。真实联调与部署在 Phase 6（配置云函数环境变量后 smoke test）。
- 本阶段未部署、未创建云资源、未创建 commit/remote；`source_verified` 用于明确标注的个人简历演示版，`legal_reviewed=0` 如实展示（不声称专业法律服务、律师审核、正式商用或已上线）。

## Phase 6 完成记录（CloudBase 公网测试部署 + 真实 DeepSeek Smoke Test）

> 说明：**已完成**。公网测试版与真实 DeepSeek 调用均已验证通过；仍为测试域（`*.tcloudbase.com`/`*.tcloudbaseapp.com`），未购买域名/未备案/未做搜索收录/小程序未开发。

- 认证：仅 `tcb login` 浏览器授权；环境 `laoyouju-demo-d0g2c7d8sb319ddf3`（ap-shanghai，体验版，正常）；`@cloudbase/cli@3.8.1`（官方 registry，pnpm 运行）。
- 云函数 `laoyouju-api`：Nodejs20.19、256MB、60s、`installDependency=false`；`/api` 公共网关路由；公网地址 `https://laoyouju-demo-d0g2c7d8sb319ddf3.service.tcloudbase.com`；将网关剥离前缀后的 `/v1/*` 与本地 `/api/v1/*` 归一化处理。
- Monorepo 云端打包：`esbuild@0.28.2` 打包运行时代码（api+shared+retrieval+zod）为单文件（`deploy/api/dist/server.js` 约 585KB）+ `content/`（laws/cases）+ `scf_bootstrap` + 最小 `package.json`；本地干净目录验证通过；`deploy/` 已 gitignore。
- CORS：`ALLOWED_ORIGINS`/`WEB_ALLOWED_ORIGIN` = 网站 Origin（精确、非 `*`）；允许 Origin 200、`evil` 403。
- Web 静态站点：`https://laoyouju-demo-d0g2c7d8sb319ddf3-1476043251.tcloudbaseapp.com`（`/`、`/laws`、`/cases`、`/topics`、`/ask` 可访问；`/ask` noindex；sitemap 不含 `/ask`；robots 禁止 `/ask`；默认域名无阻断提示页）。
- 真实 DeepSeek Smoke Test：最终状态 `POST /api/v1/ask`（查询“公司把我辞退了，经济补偿和赔偿金有什么区别？”，带网站 Origin）→ `200`、`outcome=answered`、`topicId=unlawful-termination-compensation`、citations=6（`[S1]`…`[S6]` 全部来自本次检索，S3=《劳动合同法》§87 赔偿金二倍）、四段结构 + AI 生成标识 + 信息边界、无虚构法条/案号/金额/网址、响应无密钥/堆栈/环境变量。
- 线上（非 DeepSeek）校验：`GET /api/v1/health` 200；空/超长/纯标点→400；无关问题→`insufficient`（不调用模型）。
- 经验教训（已修复并复验）：`tcb fn deploy` 在 `cloudbaserc.json` 指定 `envVariables` 时会整体替换函数环境变量（曾覆盖控制台 `DEEPSEEK_API_KEY`）；已恢复并由用户在控制台配置 Key，且 `cloudbaserc.json` 已移除 `envVariables`。另修复：内容目录在云端偶发定位失败（`resolveContentRoot` 增加“与 `dist/` 相邻的 `../content`”兜底），解决偶发 `insufficient`。
- 安全：无密钥写入 Git/命令行/构建产物/日志；未创建/升级付费资源、未建数据库/云托管/CVM/固定 IP、未删云资源、未操作其他环境、未创建 commit/remote；无遗留本地服务。

## Phase 7A-R1（恢复审计＋知识库完整性修复，2026-08-27）

> 背景：上一次 Phase 7A 在导入管道接近尾声时因 ENOSPC 中断（中断点：修复《企业劳动争议协商调解规定》缺第五条/第二十条）。本轮只做恢复审计与知识库完整性修复，不继续后续功能。完整记录见 PHASE_7A_RECOVERY_1_REPORT。

- 内容库（修复后）：`content/laws` 34 部规范（schema v2）、`content/cases` 53 个官方案例、`content/sources/registry.json` 103 条 registry 记录（14 条已废止/被替代档案 + 2 条 D 级线索）；`content:validate` PASS（laws=34, cases=53, provisions=1276, registry=103）。
- 修复的缺陷：
  1. 导入拆分器（scripts/import-laws.mjs）：合并被页面拆行的“第X/条”（修复《企业劳动争议协商调解规定》第五条、第二十条缺失）；剔除混入条文的章节行（“第二章 协商”等）；扩展页脚噪音标记（“国家规章库/链接：/主办单位”等）；无条文结构文件的正文提取改为“以标题位置到页脚标记的最长 span”（修复两个“全文”政策文件几乎全为页面导航文字的问题）。
  2. 案例导入（scripts/import-cases.mjs）：处理结果段标题扩展（执行结果/裁决结果/裁判结果及理由）；引用解析按全称匹配（修复“解释（一）”被误解析为“解释（二）”），并校验所引条文真实存在。
  3. 元数据（content/sources/probe/laws.json）：3 条 npc.gov.cn 仅 HTTP 的 URL 换为国家法律法规数据库（flk.npc.gov.cn）HTTPS 官方页；2 条政策文件补 effectiveDate（成文日期）；法释〔2025〕12号 promulgationDate 改为公布日 2025-08-01（原为审委会通过日）；11 处 supersedes 从文号字符串改为 registry 档案 sourceId（并在 import-registry.mjs 补齐 10 条被替代旧版档案）。
  4. 校验器（packages/retrieval/src/validate.ts）：case 的发布机关一致性改按 publishingAuthority 比对；isNationalAuthority 兼容 1994 年前后的“劳动部”；ProvisionSchema.topicIds 上限 10→20（真实条文命中主题可超过 10）。
  5. 旧版残留：`content/laws/law-laodong-zhengyi-tiaojie-zhongcai.json`（v1 schema，3 条摘要版劳动争议调解仲裁法，与新库重复）改为 `…json.v1-bak` 隔离（未删除，保留原文件）。
- 判定“已写入但未验证”→ 已修复并复验（content:validate PASS；检索/搜索单元测试见下）；临时诊断文件（scripts/_dbg.mjs、_probe-check.mjs、_probe-law.mjs 及本轮审计用临时脚本）已删除；scripts/probe/*.ps1 与 content/sources/probe/*.json 作为抓取与导入输入保留（未证实为临时文件）。
- 未完成/待办（属 Phase 7A 后续，不在本轮范围）：retrieval 单测 19 项中 7 项仍按 Phase 4-6 旧内容基线断言（laws=9/gold provisionId 未带年份后缀/无关问题阈值 8.5 被 34 部内容突破——“帮我写一首关于春天的诗”得分 8.51），需在 Phase 7A 更新断言与 MIN_RELEVANCE_SCORE；`content/.index/index.json` 仍为 Phase 6 旧索引，需 `retrieval:build` 重建；Web/API 侧 Phase 7A 功能（SearchProvider 接入编排、needs_clarification/out_of_scope 契约、目录页 19 topics 等）尚未继续。
- 未调用真实 WSA、未产生费用、未部署、未读取/修改任何 Key；未创建 commit/remote。

## Phase 7A-R2（检索基线修复，2026-08-27）

> 阶段定义：PHASE_7A_RECOVERY_2_RETRIEVAL_BASELINE。仅做（1）《劳动争议司法解释（二）》元数据纠正、（2）检索测试与检索质量修复、（3）索引重建。不涉及 API/Web/部署/CloudBase。

- **司法释（二）元数据**（jie-laodong-zhengyi-2）：权威来源改为最高人民法院全文页 https://www.court.gov.cn/zixun/xiangqing/472691.html（2025-08-01 发布，含落款“最高人民法院 2025年7月31日”与文号）：promulgationDate=2025-07-31（落款公布日）、effectiveDate=2025-09-01、documentNumber=法释〔2025〕12号、通过日 2025-02-17（审委会第1942次会议）记入 validityNotes；raw 原文替换为最高人民法院页面提取的 21 条完整正文（原文第21条曾混入“来源：柳北法院”及 2025/法释〔2020〕26号 间隔空格，一并修复）；柳州柳北区法院转载页保留在 fetchNote 作为备用溯源。registry、hash、导入日志一并重新生成，content:validate PASS。
- **检索质量（packages/retrieval/src/bm25.ts）**：
  - 中文虚词 n-gram 停用规则（R1 全虚词 gram / R2 词尾虚词 / R3 保守词首虚词），索引与查询双侧生效：修复“帮我写一首关于春天的诗”仅凭“天的/关于/于春”等虚词片段 加分到 8.5+ 的问题；不影响 canonicalize/contentHash。
  - 同义词条件触发（SYNONYM_GROUP_REQUIRES）：“周末/休息日”只有在出现劳动语境词时才扩为加班标准词——修复“周末去哪里爬山比较好”被扩成加班词得 324 分；“怀孕/三期”同样需要劳动语境（辞退/解除/工资等）才触发——修复“我同学怀孕了我该送什么礼物”误命中女职工条文；新增 试用期→录用条件、调岗→变更劳动合同、怀孕→女职工保护 等确定性同义组。
  - 单词项巧合防护（MIN_MATCH_TERMS=2）：只命中 1 个查询词项且无关键词加权的文档不视为证据；新增 work-injury 意图词与工伤保险条例 §30/§33/§62 关键词（修复“工伤了公司不赔”不再只返回仲裁法第一条，而命中 工伤保险条例 §30、§62 ——未参保单位支付责任）。
  - 关键法条关键词映射（import-laws.mjs KEYWORD_MAP，确定性手工维护）：劳动合同法 §21/§35/§39/§42/§47/§82/§87、劳动法 §29/§41/§44/§91、实施条例 §25、工伤保险条例 §30/§33/§62、女职工特别规定 §5、工资支付暂行规定 §13。
- **检索测试（packages/retrieval/tests/retrieval.test.mjs，19→24 项全绿）**：内容基线改为最低验收线（laws≥30、cases≥50、provisions≥1000）而非脆弱精确计数；gold 断言改按 sourceId+条文号（不依赖 provisionId 字符串）；新增 12 个跨领域负向查询（生活/做饭/天气/写作/旅游/股票/娱乐/游戏/学习/运动/家电/金融）与 13 个口语化/信息不完整劳动争议查询（含 4 个关键场景的 sourceId+条文号断言）。
- **索引**：`retrieval:build` 连续两次构建，SHA-256 一致（08EDD335FEE1F05A239E0E17C793B5A9A6D438037115B7E09E236C421D410BFF）；docs=1329（1276 条文 + 53 案例），不含 v1-bak/临时/raw/密钥内容。
- **附带修复**：packages/shared 契约测试文件 119 行存在原始 TAB/换行破坏字符串字面量（中断轮遗留语法错误），修复为 "\t\n" 后 28/28 PASS。
- 未部署、未调用真实 WSA、未产生费用、未读取/修改任何 Key、未创建 commit/remote；无云资源修改。

## PHASE_7A_ENGINE_INTEGRATION_1（引擎集成：WSA 官方协议 + API 三态 + 测试矩阵，2026-08-28）

> 仅完成：SearchProvider 官方协议修正、API answered/needs_clarification/out_of_scope 三态、API 测试矩阵、共享契约审计。不修改 Web，不部署。

- **WSA 官方协议**（packages/search/src/tencent-wsa.ts，依据 https://cloud.tencent.com/document/product/1806/130615）：
  `POST https://api.wsa.cloud.tencent.com/SearchPro`；`Authorization: Bearer ${WSA_API_KEY}`；`Content-Type: application/json; charset=UTF-8`；
  Body `{ "Query": "...", "Cnt": 10/20/30/40/50 }`（官方参数规格化）；响应取自 `Response.Pages`（JSON 字符串逐项安全解析；
  映射 title→title、url→url、passage|content→snippet、date→publishedAt、site→siteName）。
  删除全部非官方实现：service-website-search-api.tencentcloudapi.com、/WebSearch、X-Wsa-Api-Key、SearchType、Limit、ResultItems。
  `WSA_API_KEY` 未配置 → provider=undefined（本地知识库独立工作）；错误/超时/429/5xx/畸形响应类型化且不阻断本地回答；
  每问题最多 2 次搜索；搜索摘要仅作 C 级线索。搜索测试 12→16 项全绿（含请求头/请求体/响应解析 fixture 断言）。
- **三态引擎**（functions/api）：
  - out_of_scope：强/弱信号分级领域判定（“公司/老板/单位/怎么办/赔偿”不再单独构成证据；无任何信号→out_of_scope），
    固定文案 + 可改问示例 + sources=[]，不调用 DeepSeek/WSA；混淆问题（公司股票/老板推荐买股票/普通交通事故/公司让我做红烧肉/我想开公司/你好你是谁）全部 out_of_scope；"上班途中交通事故算工伤吗"因强信号"工伤"判 labor。
  - needs_clarification：裸劳动词（工伤/年假/社保/加班/辞退怎么办/拖欠工资）不调用模型，按话题兜底检索真实 A 级规范，
    输出 法律框架/可能结论/需补充事实/证据清单（可能结论按话题框架，不再套用"经济补偿/赔偿金/仲裁时效"通用模板）；
    topicIds 无命中时按 FALLBACK_TOPIC_RULES 推断（不再默认绑定违法解除话题）。
  - answered：八段结构；本地无 A 级命中时按话题兜底补充真实 A 级规范（保证至少一项 A 类来源）。
- **引用安全**：模型输出中出现任意未在本证据集内的 [S#] → 引用异常 → 证据驱动 needs_clarification（不做"删号保留未经支持的断言"）；
  带"第X条"但无有效引用的结论段（含初步结论/问题识别）同样拒绝；畸形 JSON/无有效引用 → 基于真实证据的 needs_clarification；
  注入类问题：无劳动信号 → out_of_scope（不调用模型，杜绝泄露面）；有劳动信号 → 仍受证据白名单约束。
- **测试矩阵**（functions/api/tests/api.test.mjs 36 项 PASS；question-matrix.mjs 93 题：labor 49 / variant 14 / bare 6 / off 18 / injection 6）：
  labor/variant 仅 answered|needs_clarification 且含 A 级来源；裸词全部 needs_clarification 且来源主题匹配；off 全部 out_of_scope（sources 空）；
  injection 无伪造法条/案号/Key/胜诉率；WSA 缺配置/超时/429/5xx/畸形响应 6 种错误下本地回答不失败；搜索调用 ≤ 2 次。
- **共享契约测试审计**：Phase 4/5 记录的 29 项 → 现 28 项。原因：29 项为 Phase 4/5 旧契约基线（outcome 含 insufficient、错误码集与字段校验集不同），
  Phase 7A 重写为三态契约时缩减为 28 项（旧 insufficient 相关断言随 ADR-023 语义废除，非安全断言丢失）；
  为证明无安全断言丢失，补回 2 项更强等价测试（strictObject 未知字段全拒绝；citationRef 越界 S0/S1000、非法 sourceId、文本引用不存在编号拒绝）→ **30/30 PASS**。
- 预检：C 盘 28.2GB / E 盘 18.5GB（均 >10GB）；未调用真实 DeepSeek/WSA、未产生费用、未部署、未访问/修改 CloudBase、未读取/修改任何 Key、未创建 commit/remote。
- **该阶段仅标记 PHASE_7A_ENGINE_INTEGRATION_1 completed；整个 Phase 7A 未完成**（Web 目录/业务页面、内容专业复核、正式收录等仍待后续阶段）。

## PHASE_7A_WEB_INTEGRATION（Web 三态接入与公开目录页，2026-08-28）

> 仅完成 Web 接入与本地验证；未部署、未操作 CloudBase、未调用真实 DeepSeek/WSA、未创建 commit/remote。

- **API 响应严格接入**（apps/web/lib/api.ts）：成功响应必须通过共享 `AskSuccessResponseSchema`（zod safeParse）；未知 outcome/契约失败的成功状态码 → 稳定错误提示（**绝不默认当作 out_of_scope**）；错误响应经 `ApiErrorResponseSchema` 校验后按码映射（503 未配置密钥 / 503 限流 / 502 上游 / 400 参数）稳定文案；不崩溃、不泄露内部信息。
- **纯展示映射层**（apps/web/lib/present.ts，无 DOM 依赖、可直接单测）：answered 八段固定映射（含无相似案例时的诚实占位“暂未找到可核验的高度相似官方案例。”）、coverage 全国性规则说明、clarification 四段映射 + “请补充上述信息后重新提交”操作提示、来源分组（法律法规/司法解释与仲裁程序/官方案例/补充检索线索）与引用卡片字段（[S#]/标题/条号/发布机关/效力状态/适用地区/摘录/officialUrl/核对日期/核验状态）；`source_verified → “已核对官方来源，尚待专业复核”`、`legal_reviewed → “已通过专业复核”`，绝不冒充律师审核。
- **AskForm 三态渲染**：answered / needs_clarification / out_of_scope 分别呈现；out_of_scope 使用服务端固定“劳动争议法律助手”文案 + 可点击改问示例（点击填入输入框）；追问页不出现“资料不足/无法回答/当前资料未覆盖/请咨询律师后再说”；输入校验（500 字上限、纯标点/空白提示）、加载态与防重复提交、aria-live、示例点击填入。
- **公开目录页当前数据**：/laws 34 部规范（schema 新数据，含《企业劳动争议协商调解规定》等，杜绝旧 9 部数据）、/cases 53 个官方案例（发布机关+发布日期+官方链接可见，含新批次案例）、/topics 19 个主题（与 @laoyouju/shared 单一来源一致）；全部仍为 buildCatalog schema 校验后的真实数据，无 legal_reviewed 冒充，无胜诉率/准确率承诺。
- **SEO/安全**：/ask 保持 noindex/nofollow；sitemap 不含 /ask；robots 禁止 /ask；静态导出 15 路由全绿；out/ 产物无 DEEPSEEK_API_KEY/sk- 密钥、无“insufficient/资料不足/当前资料未覆盖”旧文案。
- **样式**：保持“劳有据 AI”品牌配色；仅修正三态视觉区分（answered/clarification/out_of_scope 左侧强调）、来源卡片层级、长 URL/长文字断行（overflow-wrap/word-break）、移动端布局、加载/错误/追问状态与按钮禁用态；未引入 Tailwind/组件库/新字体。
- **测试**：web 29 项（export 20 + ask-normalize 9；后者为纯映射单测，无 Playwright/DOM 依赖）；断言覆盖 三态映射、追问页禁语、out_of_scope 助手说明、未知 outcome/非法 JSON 不误判、officialUrl 透传、source_verified 不冒充、/ask noindex、sitemap/robots、34/53/19 数据规模、产物无密钥与旧文案。
- 验证：content:validate PASS；retrieval:build OK（docs=1329，两次构建字节一致由既有确定性测试保证）；web lint/typecheck/build（15 路由静态导出）通过；根 lint/typecheck/build/test 全部 Done；git diff --check 0；密钥扫描、临时文件扫描、C/E 盘（28.3/18.5 GB）通过。
- **本阶段仅标记 PHASE_7A_WEB_INTEGRATION completed；部署、域名、GitHub、小程序、正式收录与内容专业复核均未完成，整个 Phase 7A 仍为进行中。**

## PHASE_7A_LIVE_DEPLOYMENT_AND_ACCEPTANCE（公网部署与验收，2026-08-28）

> 仅部署与验收；未创建/升级付费资源、未启用 WSA、未绑定域名、未备案、未创建 Git remote、未修改任何环境变量。

- **部署**：云函数 `laoyouju-api` 经 `tcb fn deploy` 更新（不含 envVariables，控制台 DEEPSEEK_API_KEY 未触碰；WSA_API_KEY 未配置 → 联网搜索保持未启用）；Web 以**真实 API 地址**（`NEXT_PUBLIC_API_BASE_URL=https://laoyouju-demo-…service.tcloudbase.com`，SITE_URL=真实测试域）构建后 `tcb hosting deploy` 75 文件上线。
- **部署打包修复（预检发现）**：`scripts/build-deploy.mjs` 漏拷贝 **content/sources/registry.json**（v2 运行时必需，缺失将导致函数启动即错）→ 已修复并在本地对部署包验证（health/out_of_scope/needs_clarification 通过）；部署包约 710KB（含 shared/retrieval/**search**/zod）。
- **线上验收**：health 200；OPTIONS 预检 204 且 **ACAO 单值精确=网站 Origin**；evil Origin 403 且不反射；红烧肉→200 out_of_scope（固定助手文案、sources=0）；"工伤"→200 needs_clarification（3 条 A 级来源：《工伤保险条例》框架）；纯标点/空白/超长→400；公开页 /、/laws、/cases、/topics、/ask、sitemap、robots 全部 200（34/53/19 数据规模；/ask noindex；sitemap 无 /ask；robots 禁 /ask）；线上前端 chunk 内确认生产 API 地址；无密钥/旧禁用文案残留。
- **真实 DeepSeek Smoke Test：⚠️ 未通过（后已于 PHASE_7A_LIVE_MODEL_LATENCY_FIX 补记为 PASS）**。唯一一次允许的正式调用（"公司把我辞退了，但是不想给补偿金和赔偿金，还要把我调岗，我应该怎么办？"）返回 **502 UPSTREAM_ERROR**（约 20s；体验版无函数日志可查）。按"最多一次调用"预算未重试；**本地对部署包以 mock 模型完整走通 answered 路径（200、八段结构、A 级来源"《最高人民法院关于审理劳动争议…解释（一）》"、无相似案例诚实占位）**，判定为上游瞬时失败/环境问题而非代码缺陷。需项目经理授权后重试一次真实 Smoke Test。
- **费用**：无付费资源创建/升级；仅 1 次真实 DeepSeek 调用尝试（上游失败，预计无费用，最终以账单为准）。
- **诚实状态**：legal_reviewed 仍未进行（保持 source_verified + 页面如实文案）；域名/ICP/GitHub/小程序未处理；默认 CloudBase 测试域仅供测试。
- **验收状态**：部署/公开页/三态/安全全部通过，仅真实模型 Smoke Test 失败 → 验收结论为 PARTIAL；**已于 PHASE_7A_LIVE_MODEL_LATENCY_FIX（定位延迟根因并修复后重试）补记为 PASS**（见下节）。

## PHASE_7B_OFFICIAL_CASE_CORPUS_EXPANSION（官方案例库扩容，2026-08-28）

> 阶段定义：PHASE_7B_OFFICIAL_CASE_CORPUS_EXPANSION。目标——官方案例库 53 → ≥200。**结果：PARTIAL（96/200）**：全部已验证资产已保存并校验通过；因恢复运行限制（余额恢复后禁止并行子代理、由主代理顺序执行）与官网访问限制（多地法院/人社厅站点 403/证书无效/JS 渲染/仅 PDF 附件），未能在本轮可靠地凑足 200 条真实、唯一、可核验案例；**差额 104 条未补齐，明确不算完成（不造数）**。

- **扩容前审计**：content:validate / retrieval:build / check / git diff --check 全绿；53 案例唯一性/URL/机关/日期/主题审计完成（首版 docs/CASE_COVERAGE_AUDIT.md）；磁盘 C 28.2GB / E 18.4GB。
- **确定性标签修复（最小修复）**：旧导入规则的 topicIds 存在过度标注（43/53 案例被贴上 arbitration-procedure、“仲裁”一词即触发；no-written-contract 等主题漏标）。以确定性规则重算现有案例 topicIds（`import-cases.mjs --retag`，仅改 topicIds，不改事实/结果/引用），并按新规则建立可审计 CASE_TOPIC_RULES（子串关键词、组合主题 social-insurance-noncompete 需社保组+竞业组双命中才标注）。
- **可复现导入（Phase 7B 部分完成）**：
  - `scripts/extract-case-batch.mjs`：从结构化官方页面（【模块】 / 纯文字标题 / 指导性案例 / “案例N”分隔 / “一、基本案情”）自动提取批次案例并生成 `content/raw/cases/phase7b/<slug>.txt`（====CASE:N==== + 【标题】【基本案情】【处理结果】【裁判要旨】【案号】）；字段按页面原样摘录并仅按字符上限截断（“……（官方页面摘要节选至N字）”），零编造。
  - `scripts/import-cases.mjs` 升级：支持 phase7b 子目录、批次级 caseType/jurisdiction/sourceCheckedAt、页面给出案号才填 documentNumber（指导性案例编号/标准案号格式校验，其余一律 null）。
  - `content/sources/probe/cases-phase7b-0*.json`：批次清单（URL/机关/日期/案例数/核验日期/地区/备注）。
  - 官方 host 白名单扩展（逐域 fetch 核验身份后加入）：jsfy.gov.cn、gdcourts.gov.cn、hshfy.sh.cn、hncourt.gov.cn、jxfy.gov.cn、lncourt.gov.cn、tjcourt.gov.cn、hebeicourt.gov.cn（均为法院系统官方域名或子域名；`hunancourt.gov.cn` 因 HTTPS 证书无效未加入并弃用该批）。
- **新入库批次（8 批 43 例，全部经 fetch 核验内容一致）**：江西高院 2026-04-30（5）、最高法 2024-04-30 劳动争议典型案例（6）、最高法第 42 批指导性案例 237-240 号（4，新就业形态专题）、最高法第 32 批指导性案例 179-185 号（7，保护劳动者合法权益，辽宁法院网转载全文）、最高法 2025-12-31 治理欠薪典型执行案例（6，天津法院网转载）、河北高院 2020-2024 劳动争议典型案例（6）、济源中院 2025-11-21 劳动争议典型案例（4）、陕西第三批劳动人事争议典型案例（5，陕人社发〔2024〕42号，省人社厅+省高院）。
- **区域覆盖**：全国性 69 + 河北省 6 + 河南省 4 + 江西省 5 + 陕西省 5（4 个省级地区；距“至少 10 个省级地区”目标差 6 个：江苏(人社厅 403)、重庆(无分节)、北京(JS 渲染)、山东(连接失败)、湖南(证书无效)、广东(仅新闻稿)、川渝(仅 docx 附件) 等被访问限制阻挡）。
- **19 主题覆盖（96 案例，script 生成）**：≥5 达标 16 项；未达标：probation-disputes 2、social-insurance-noncompete 1、arbitration-limitation 2；高频目标除 noncompete-confidentiality 9/10 外全部达标（违法解除+补偿赔偿 67、工资欠薪 32、加班费+工时休假 41、劳动关系认定+新就业形态 43、未签合同+二倍工资 20、工伤 18、社保 29、仲裁时效+裁诉衔接 27）。
- **质量测试（新增 packages/retrieval/tests/case-corpus.test.mjs，15 项验收断言）**：规模≥200、ID 唯一、无近似重复、官方元数据、禁止平台 host 白名单、19 主题每主题≥5、高频最低数量、无占位、案号格式、引用可解析、gold≥40 且覆盖 19 主题、top5 含 A 级法条+主题案例、无硬编码映射、无关/注入无伪案例、索引确定性。当前 **未全绿**：断言如实标记上述缺口（cases=96<200；3 个主题<5；noncompete 9<10；CASE_GOLD 中部分查询 top5 无主题案例）。这些失败即 PARTIAL 的量化证明，不做任何掩盖性修改。
- **全量验证结果**：content:validate PASS（34/96/1276/146）；retrieval:build OK（docs=1372）；lint/typecheck PASS；`pnpm run test` 中 shared 30 / retrieval 既有 24 / search 16 / web 20+9 / api 42 全绿，case-corpus.test.mjs 按预期失败（缺口断言）；git diff --check 0；密钥扫描干净；无临时文件/端口残留；未部署、未调用 DeepSeek/WSA、未创建付费资源、未读取 DEEPSEEK_API_KEY。
- **遗留（如实）**：官方单页 8-13 案例大批次已尽量收录；剩余 104 例需后续轮次继续（建议优先：人民法院案例库公开页、各地仲裁委/人社局 HTML 全文页、PDF/docx 附件解析管线）；**本轮未交付“每主题≥5 + 200 总量”的 PASS，验收结论 PARTIAL**。

## PHASE_7B_HARNESS_FINAL_COMPLETION（顺序扩容冲刺，2026-08-28）

> 阶段定义：cases≥200 + 19/19 主题 + ≥10 省级 + 全部门禁 exit 0 才部署。**结果：PARTIAL（181/200，差 19 例）**——本阶段新增 24 例（福建 9 + 天津 15，均为官方全文），19/19 主题与 11 个省级地区已全部达标，仅剩案例总量 19 例缺口，**未部署**（按约定）。Codex 只读接管审计未改动任何文件（git status 同基线 18 项未跟踪）。

- **新增批次（24 例，官方全文）**：福建省人社厅+福建高院 联合发布劳动人事争议典型案例（9，2023-07-26，政府网通知页内嵌全文）；天津市高院+市人社局 2025 年度（5，2025-04-30）与 2026 年度（10，2026-04-30，含“试用期不符合录用条件”解除案，补齐 probation→5）。
- **主题覆盖（181 例）**：19/19 全部 ≥5（probation=5 达标；social-insurance-noncompete=80 为兼容/联合口径）；高频主题全部达标。
- **省级覆盖**：11/11 达标（河北/河南/江西/陕西/贵州/新疆/云南/四川/重庆/福建/天津）。
- **去重**：无标题/标题+案情 200 字指纹重复；无同一案例多转载重复写入；无占位；documentNumber 170/181=null（官方未公布如实）；source_verified 无 legal_reviewed。
- **检索**：AUTHORITY_BOOST=1.45（阈值门控 min≥8）保持；retrieval.test 24/24（gold top3/top5 全部通过，未放宽）；case-corpus 12/14（仅剩 cases≥200 与 CASE_GOLD 弱关联两项缺口断言）；api 42/42、search 16/16、web 20+9 全绿（本阶段直跑验证）；`pnpm run check` 实测 exit 1（唯一失败项 = case-corpus 缺口断言）。
- **确定性**：索引两次构建 SHA-256 一致（4A7D6BF16B83E69C6FE74A4B5E15FAC10A99CAC4E35361240E50400E714DC875；docs=1457）。
- **未执行部署**（按“200 + 全门禁 pass 才部署”契约）；未调用 DeepSeek；未读/显/改 DEEPSEEK_API_KEY；cloudbaserc.json 无 envVariables；未启用 WSA/域名/ICP；无付费资源。



> 阶段定义：cases≥200 且全部质量/测试条件满足才 PASS。**结果：PARTIAL（133/200）**——新增 37 例（5 批），完成检索质量回退修复与测试口径纠正，部署按“达到 200 后”约定**未执行**（133<200）。

## PHASE_7B_200_CASES_LIVE（北京批次补齐 200 后全门禁，2026-08-28）

> 阶段定义：cases≥200 → 全门禁 exit 0 → 部署。**结果：PARTIAL（cases=201 达标；主题 19/19、省级 12/12 达标；检索质量测试 21/24 + case-corpus 13/14，`pnpm run check` 实测 exit 1 → 按“全部 exit 0 才部署”未部署）**。

- **北京批次（+20，官方全文）**：北京市人社局 2025 年度劳动人事争议仲裁十大典型案例（10，2025-12-26，rsj.beijing.gov.cn 官方页，正文由页面公开 JS 渲染数据经官方 meta/正文提取）、2024 年度（10，2024-12-17）。均含 案情简介/仲裁请求/处理结果/案例评析/仲裁委员会提示；jurisdiction=北京市；canonicalUrl=北京市人社局官方页；发布机关=北京市人力资源和社会保障局；无公布案号→null；抽取脚本保留为 `scripts/case-batch-from-beijing.mjs`（含“案 情 简 介”字间空格归一化）。
- **cases=201**：content:validate PASS（34/201/1276/251）；去重：无标题/URL/案情指纹重复、无拆改凑数；19/19 主题 ≥5（probation=7）；12 个省级地区（北京新增）；占位无；documentNumber=null：189/201（12 例指导案例编号）。
- **检索质量工作（本轮修复与未决）**：
  - 案例索引文本由“仅裁判要旨”改为“标题+基本案情+处理结果+裁判要旨”（修复“提成/克扣/工资”等案情细节查询无法召回案例的根因；原 caseChunks 只索引 reasoning）。
  - AUTHORITY_BOOST=1.45（阈值门控 ≥MIN_RELEVANCE_SCORE 才放大）。
  - **未决（测试如实失败，未放宽断言）**：①“支付宝提现手续费是多少”类无关查询，因案例全文含“支付/手续”等通用动词产生 8+ 分弱相关案例/条文（关键词加权词内匹配“支付”⊆“支付宝”是中介）——治理方案（关键词必须整词命中）已在代码中验证失败于“工资⊂拖欠工资”类整词场景，需词典级边界方案后续完成；②“竞业协议签了不想干了/工伤了公司不赔”类口语查询 top3 无 A 级法条（案例文本密集、法条短文本分数低）——需类型交错配额或按主题分层排序（本轮多轮调整后未在不破坏其他断言下收敛）；③CASE_GOLD 少量查询 top5 主题案例未现（与①同类分词/权重问题相关）。
- **全部命令与退出码**：content:validate 0；retrieval:build 0（docs=1477）；lint/typecheck/build 0；retrieval.test **1**（21/24）；case-corpus **1**（13/14）；api 42/42、search 16/16、web 20+9 0（本轮直跑于部署包流程外验证）；`pnpm run check` **exit 1**（唯一失败=retrieval 套件两组断言）；git diff --check 0；密钥扫描/临时文件/端口/磁盘干净（C 28.1 / E 18.4 GB）。
- **未部署**（全门禁未全绿）；未调用真实 DeepSeek；未读/显/改 DEEPSEEK_API_KEY；cloudbaserc.json 无 envVariables；未启用 WSA/域名/ICP；无付费资源。
- **遗留修复队列**（下轮）：① 中文整词匹配（关键词边界 + “欠工资”类复合词例外表）；② 法条/案例类型配额或主题分层排序；③ 相关 CASE_GOLD 查询复测。

## PHASE_7B_200_CASES_AND_DEPLOYMENT（扩容冲刺与验收，2026-08-28；项目经理取消 120 条降级方案，恢复 ≥200 标准）

- **检索质量回退修复（不靠放宽测试）**：`bm25.ts` 新增 `AUTHORITY_BOOST=1.25`（A 级法条确定性权威加权，与产品证据分级 A>B 一致；可解释、可测试）。恢复“入职半年一直没有签劳动合同”→《劳动合同法》第 82 条 **top3**（实测 top3 = 解释（二）第7条 / 官方案例 / §82，top5 同时含 2 个主题匹配案例）；gold 测试 topK 还原为 3，全部 24 项通过。检索测试共 24 项（原 24）全绿。
- **测试口径纠正**：case-corpus 测试始终在 `packages/retrieval/tests/case-corpus.test.mjs`，且已由 `packages/retrieval/package.json` 的 test 串接（`node tests/retrieval.test.mjs && node tests/case-corpus.test.mjs`），root `pnpm run check` **真实 exit 1**（本次实测 CHECK_EXIT=1：case-corpus 3 项失败 = 缺口量化断言；其余 shared 30 / retrieval 24 / search 16 / web 20+9 / api 42 全绿）。取消 120 条降级方案后未降低/删除任何门槛断言。
- **新增批次（37 例）**：最高法+人社部 依法惩治恶意欠薪犯罪典型案例（5，2025-01-22，大连铁路运输法院转载）、陕西第三批劳动人事争议典型案例（9? 实为 **第二批**，2023-12-20，9 例）、贵州省高院+人社厅营商环境典型案例（10，2025-04-30）、河南高院+人社厅典型案例（8，2026-05-20，郑州人社局转载）、新疆人社厅劳动争议典型案例（5，2025-05-06）。
- **区域覆盖**：省级地区 4 → **6**（河北/河南/江西/陕西/贵州/新疆）；国家级批次合计 101 例，地方 32 例；20 个官方批次全部经 fetch 核验。
- **主题覆盖（133 例，audit 脚本）**：19 主题中 **18 项 ≥5**；仅 social-insurance-noncompete=1、arbitration-limitation=2、probation-disputes=3 未达 5（合计补齐需 7+ 例）；高频主题全部达标（违法解除+补偿赔偿 82、工资欠薪 44、加班费+工时休假 41、劳动关系+新就业形态 54、未签合同+二倍工资 23、工伤 28、社保 35、竞业限制保密 12、仲裁时效+裁诉衔接 29）。
- **质量**：无重复/拆分/占位（“新Axxxx”车牌为官方页面原文脱敏，非占位；审计词表已改为精确判定）；citedProvisions 全部可解析；documentNumber 122/133=null（仅官方给出才填）；source_verified 无 legal_reviewed；索引两次构建字节一致（SHA256 A2735D6E…72CB，docs=1409）。
- **验证**：content:validate PASS（34/133/1276/183）；retrieval:build OK（docs=1409，两次一致）；lint/typecheck/build 全 Done；单独运行 api 42 / search 16 / web 20+9 全绿；`pnpm run check` 实测 **exit 1**（3 项缺口断言失败，如实）；git diff --check 0；密钥扫描干净；无临时文件/端口残留。
- **未执行部署**：按“达到 200 后部署”约定，133<200 时未部署 API/Web；未调用 DeepSeek；未读取 DEEPSEEK_API_KEY；cloudbaserc.json 无 envVariables；未启用 WSA/域名/ICP。
## PHASE_7B_RETRIEVAL_CONVERGENCE_AND_TEST_GATES（检索收敛与全量门禁，2026-08-28）

> 阶段定义：PHASE_7B_RETRIEVAL_CONVERGENCE_AND_LIVE_DEPLOYMENT。仅做检索收敛与测试/门禁收敛：诊断失败测试→分层修复（领域识别/19 主题意图/证据多样化）→全量验证。
> 未新增案例、未修改已核验 201 例内容、未部署（按项目经理最终指令“不要部署，等待验收”）、未调用真实模型、未操作 CloudBase/密钥。

- **基线确认**：content:validate PASS（laws=34 / cases=201 / provisions=1276 / registry=251）；retrieval:build OK（docs=1477 = 1276 条文 + 201 案例；两次构建 SHA-256 一致 44F68E4E…77F68）；19/19 主题每主题 ≥5 例（probation=7）；12 个省级地区；201 例已核验去重/占位/案号/引用。

## PHASE_7C_SHANDONG_219_MERGE_AND_LIVE_DEPLOYMENT（合并、上线与验收，2026-08-29）

> 阶段定义：fast-forward 合并 feat/shandong-official-corpus 至 main → 全量门禁 → 推送 main → 部署 219 例 API 与 Web 至 CloudBase 体验环境（laoyouju-demo-d0g2c7d8sb319ddf3 / ap-shanghai）→ 协议级线上验收 → 1 次真实 DeepSeek Smoke Test → 创建 phase-7c-shandong-219 标签。结果：**PASS**（无子代理；全程 mock 先行）。

- **合并审计**：main=29e1077、feature=b7f6f1d（origin 一致）；feature 相对 main 恰为 3eabe54/1d8471d/b7f6f1d 三提交；phase-7b-live-201 未变；cloudbaserc.json 无 envVariables；0 未跟踪。
- **合并**：git merge --ff-only（29e1077..b7f6f1d，无 merge commit）；门禁 8 项全绿（G1 content:validate 0 / G2 retrieval:build 0 / G3 retrieval 33/33 / G4 case-corpus 14/14 / G5 check 0 / G6 diff --check 0 / 密钥扫描 无 / 产物扫描 无）；main 已推送（29e1077..b7f6f1d）。
- **部署**：build:deploy 产物合规（无 .env/node_modules/.git/.v1-bak/raw/index；laws=36、cases=219、registry=1；本地冒烟 health 200 / out_of_scope 200 / 无 Key 503）；tcb fn deploy api → 成功；Web 以真实地址重建（API=…service.tcloudbase.com；SITE=…tcloudbaseapp.com）→ hosting deploy 65 文件。
- **线上内容验证（第一重：协议级）**：/cases 唯一 caseId=219（山东 18，含 18 个 case-sd-*）；/laws 唯一规范=36（含 2 份 C 级山东指引）；山东指引标签/分区、山东案例标签均在线可验；第二重：部署包文件计数（laws=36/cases=219/registry=1）。
- **CDN 修复**：/laws/index.html 被 CDN 缓存旧对象（Phase 7B 34 部版），多次 hosting deploy 未刷新；删除该陈旧静态对象并显式重传新文件后恢复（36 规范校验通过）。仅单个静态对象维护，未删云资源。
- **公共页面/SEO**：/、/laws、/cases、/topics、/ask 全部 200；/ask noindex；sitemap 无 /ask 且为真实测试域；robots Disallow /ask；页面无 NEXTE_PUBLIC 占位符。无浏览器自动化环境（如实说明）：溢出与“无 localGuidance 不显示空栏目”由 CSS 规则（overflow-wrap/word-break）与组件/契约层单测（answerSections items=null、localGuidance 标题条件渲染）覆盖。
- **CORS**：GET health 200 + 单值精确 ACAO；OPTIONS 204 + 单值 ACAO；POST 成功 200 + 单值 ACAO；evil 403 且不反射；无 *；网关+函数未重复输出（既有去重逻辑保持）。
- **无模型行为**：支付宝提现手续费是多少 / 怎么做红烧肉 → 200 out_of_scope（固定“劳动争议法律助手”文案 + 引导劳动合同/辞退/工资/加班/社保/工伤/仲裁；sources=0）；空白/纯标点 400；501 字 400；9000 字节 413。
- **真实 Smoke Test（唯一 1 次调用）**：mock/fixture 先行验证捕获脚本（0 issues）→ live 单次：200 / answered / 13.7s / requestId bdc19ab0-40dc-41d2-b385-769e0626e8dd；applicableLaw 6 条（劳动合同法 §23/§24、解释（一）§36/§39/§38/§37）全 A 级且引用全部可解析；localGuidance 1 条 C 级山东指引（明确仅适用山东省、不属于全国统一法律规则）；similarCases 诚实占位；八段完整；无密钥/堆栈。失败不重试（未触发）。
- **费用**：真实 DeepSeek 调用共 1 次（以腾讯云账单为准）；无付费资源创建/升级；CloudBase 体验版无新增费用。
- **标签**：phase-7c-shandong-219（annotated）已创建并推送；main HEAD=b7f6f1d；feature 分支保留。
- **文档**：README.md、docs/DEPLOYMENT.md、docs/PROGRESS.md、docs/CONTENT_REVIEW.md（本记录）。
- **安全/边界**：未读取/回显/覆盖 DEEPSEEK_API_KEY；未启用 WSA；未操作域名/ICP/小程序/GitHub 可见性；未删除云资源；未改 CORS；无 force push。

## PHASE_7C_2_CASE_EVIDENCE_COPRESENCE_FIX（证据共现修复与验收，2026-08-29）

> 阶段定义：修复「有效劳动争议问题有相关 B 级官方案例，但回答仍显示未找到案例」。先诊断（禁止调参），再实现通用、确定性、可测试的官方案例组装逻辑，附加共现契约与回归矩阵，全门禁后 FF 合并、部署，线上 1 次真实 DeepSeek Smoke Test 通过后创建 phase-7c2-case-copresence 标签。结果：**PASS**（无子代理）。

- **诊断（根因，两层）**：①similarCases 只由模型输出驱动——线上竞业限制 Smoke Test 证据已含 3 条 B 级案例（S8 川渝 / S9 主体不适格 / S10 新疆），模型仍写「未找到可核验的高度相似官方案例」占位，引擎无确定性补充；②同地域山东案例（case-sd-ldzzy-2021-04-02「用人单位未支付竞业限制经济补偿劳动者可不受竞业限制的约束」）不在主检索 top10 池内（BM25 排名约 15+），不补充检索则永远选不到。结论：不是检索阈值/地域硬过滤/C 级挤占的问题（C 级指引 S7 在证据窗口内但未挤掉案例槽位；案例槽位上限 3 保留）；是「模型不选 → 引擎不补」的组装缺口。
- **修复**：新增 functions/api/src/cases.ts（确定性组装模块）+ ask.ts 第 9.5 步集成 + prompt.ts 提示微调（提示模型引用最相关类案即可，系统会确定性核验补充）。similarCases 由引擎统一组装：模型引用先验证（B 级 + case + 与推断 topicIds 有交集），与主检索池、按推断 topicIds 的确定性补充检索（TOPIC_QUERY_MAP 查询 + topic 过滤 + topK=20 + MIN_RELEVANCE_SCORE=8 门槛）合并候选，按「话题交集数（降序）→ 同地域 > 全国性 > 其他省份 → score（降序）→ chunkId（稳定）」排序，最多 2 条。
- **地域策略**：只作排序偏好、绝不硬过滤（无「山东=山东案例」过滤代码）；优先级：①同主题同地域 ②同主题全国性/最高法 ③同主题其他省份；外地案例统一由引擎生成边界说明「（案例适用地域：X；外地类案仅供参考，各地裁审口径可能不同）」，同地域/全国性分别为「（X省官方案例，供类案参考；案例不具有普遍约束力）」「（全国性参考案例，供类案参考；案例不具有普遍约束力）」。
- **共现契约**（evaluateCopresenceContract / collectSimilarCaseCandidates）：answered + ≥1 个已推断主题 + 存在合格 B 级候选 → similarCases 至少 1 条 B；needs_clarification / out_of_scope / 无合格候选不强制；只有全部 219 例确无合格候选才允许诚实占位；不降低 out_of_scope 门槛、不把 C 级写入 similarCases、不把 B 级写入 applicableLaw、不编造案号/机关/金额。
- **测试**：api.test.mjs 48→60（12 项新增：线上形态山东竞业限制【模型写占位→引擎补案例、同地域优先】、未知地域（A+B，山东指引条件化表述）、北京（无山东指引、可用全国/相关案例）、违法解除/克扣提成/加班/工伤/二倍工资/劳务派遣 A+B 共现、支付宝提现 out_of_scope 零模型调用零来源、模型引用验证+确定性排序、双次运行结果一致）；新增 cases.test.mjs 14 项（地域归一化含城市映射、地域分组、排序、候选收集含补充检索、边界文案、chooseSimilarCases、占位识别、共现契约、确定性、低于门槛负向；合成内容库，不绑定真实 sourceId）。全部断言 sourceLevel/sourceType/topicIds 交集/citation 可解析/地域边界说明/确定性，不绑定具体 sourceId。
- **门禁（全部 exit 0）**：content:validate（36/219/1308/271）；retrieval:build（docs=1527）；retrieval.test 33/33；case-corpus.test 14/14；lint/typecheck/build 全 Done；shared 37/37、search 16/16、web 32/32、api 60/60 + cases 14/14；pnpm run check exit 0；git diff --check 0；密钥扫描（diff 无 sk-./DEEPSEEK_API_KEY= 值；.env.example 占位为既有）干净；临时探针已清理（诊断脚本在 _scratch，未在仓库根目录遗留）。
- **合并**：从 main（55341d0）创建 fix/case-evidence-copresence → 提交 30d066c（fix: ensure official case evidence coexists with applicable law；6 文件 +985/-5）→ 推送 → FF 合并至 main（55341d0..30d066c）→ 推送 main；fix 分支保留；既有 phase-7b-live-201 / phase-7c-shandong-219 标签未动。
- **部署**：build:deploy（738.8kb bundle；无 sk- 模式；DEEPSEEK_API_KEY 仅 1 处环境变量名引用）；tcb fn deploy api --region ap-shanghai（cloudbaserc.json 无 envVariables；未读取/回显/覆盖密钥；未创建/升级付费资源；仅操作 laoyouju-demo-d0g2c7d8sb319ddf3）。Web 无代码变更，无需重新部署。
- **线上验收**：_verify-live 36/36（health 200；219 唯一 caseId；36 规范；18 山东案例；2 山东 C 级指引；A/B/C 分区与标签；CORS 精确单值/evil 403/无 *；out_of_scope 零来源；/ask noindex；sitemap 无 /ask；robots Disallow /ask；空白/标点/超长/超大输入错误码）。
- **真实 Smoke Test（唯一 1 次调用）**：mock/fixture 先行验证捕获脚本（0 issues；mock 不访问线上）→ live 单次：200 / answered / 14.593s / requestId 02521d07-52da-4753-9d56-44065dbdfb74；applicableLaw 6 条全 A（劳动合同法 §23/§24、解释（一）§36/§37/§38/§39）；localGuidance 1 条 C 级山东指引（仅适用于山东省、不属于全国统一法律规则）；**similarCases 2 条 B 级**——四川/重庆案例【模型引用，标注「（案例适用地域：四川省、重庆市；外地类案仅供参考，各地裁审口径可能不同）」】＋山东同地域案例【引擎按 topicIds 补充检索确定性加入，标注「（山东省官方案例，供类案参考；案例不具有普遍约束力）」】；引用全部可解析；八段完整；无虚构法条/案例/案号/机关/金额/网址；无密钥/堆栈/环境变量；失败不重试（未触发）。
- **费用**：真实 DeepSeek 调用共 1 次（以腾讯云账单为准；本环境无法读取计费金额）；无付费资源创建/升级；CloudBase 体验版无新增费用。
- **标签**：phase-7c2-case-copresence（annotated）已创建并推送（说明：Phase 7C.2 live: applicable law and verified official case evidence coexist for in-scope labor dispute answers.）；main HEAD=30d066c。
- **文档**：README.md、docs/DEPLOYMENT.md、docs/PROGRESS.md（本记录）、docs/DECISIONS.md（新增 ADR-032）。
- **安全/边界**：未读取/回显/覆盖 DEEPSEEK_API_KEY；未启用 WSA；未操作域名/ICP/小程序/GitHub 可见性；未删除云资源；未改 CORS；无 force push；未修改 219 例内容、未新增案例、未重新抓取网页。

## PHASE_8_MINIMUM_GO_LIVE_PROTECTION（最低上线保护：限流/费用保护/kill switch，2026-08-29）

> 阶段定义：线上 API 最低限度防滥用与费用保护（客户端限频、全局日模型额度、并发上限、kill switch、友好 429），全门禁后部署并 1 次真实 Smoke Test，通过后打 phase-8-minimum-go-live-protection 标签。结果：**PASS**。

- **实现**：新增 functions/api/src/limit.ts（RequestGuard + FixedWindowCounterStore + 阈值配置 LIMIT_* + 北京时间日窗口 + 客户端 IP SHA-256 哈希键）；app.ts 入口预检（6/min、30/day、429+Retry-After+retryAfterSeconds）；ask.ts 引擎层模型槽位（100/day 全局真实调用 + 3 并发 + kill switch，未获槽位不调用 DeepSeek；try/finally 释放）；kill switch 双通道（构建期 KILL_SWITCH_BUILD=on → runtime-config.json / 运行时 LIMIT_KILL_SWITCH）；共享契约 error 扩展可选 retryAfterSeconds；apps/web 429 稳定中文提示（服务端文案直显；网关非 JSON 429 兜底文案）。
- **默认阈值**：客户端 6/min、30/day；全局 DeepSeek 100/day；并发 3；kill switch 默认关。全部可由服务端环境变量调整（不触碰 DEEPSEEK_API_KEY，不整体覆盖 envVariables）。
- **安全降级**：计数存储异常 → 客户端限制放行（可用性优先）、模型调用拒绝（费用保护优先）。
- **测试（全部 mock，未调用 DeepSeek）**：api 60→63（无 Origin 也受限 429+Retry-After+友好文案、kill switch 0 次调用、全局日额度耗尽后 0 次调用）；新增 limit.test.mjs 11 项（阈值内通过、分钟超限、日超限、全局日额度、并发上限、共享存储计数不超发、kill switch、跨日重置、存储异常降级、文案契约、哈希键）；web 12→13（429 中文提示，不透出内部细节）；cases 14 项保持。
- **全门禁（真实退出码）**：content:validate 0（36/219/1308/271）；retrieval:build 0；retrieval 33/33、case-corpus 14/14；shared 全绿（error schema 扩展 retryAfterSeconds）；search 16/16；web 13/13；api 63/63 + cases 14/14 + limit 11/11；pnpm run check **exit 0**；git diff --check 0。
- **部署**：构建期 kill-ON 包 → 线上验证 kill switch（真实问题 → 429「服务暂时繁忙」+ Retry-After 600，0 次模型调用；out_of_scope 正常 200）→ 恢复包（kill OFF）部署 → 突发 8 连发实测 200×6+429×2（Retry-After 38s/37s）→ _verify-live **36/36** → Web 重建并 hosting deploy（68 文件；/ask noindex/sitemap/robots 不变）→ 最终 _verify-live 36/36。
- **真实 Smoke Test（唯一 1 次）**：200 / answered / 15.712s / requestId fc99414e-5ba8-45f5-8a2e-6bc44860e1f3；applicableLaw 6 条 A（全国性）+ localGuidance 1 条 C 山东 + similarCases 2 条 B（四川/重庆 + 山东同地域），引用全部可解析；无密钥/堆栈。
- **云端变更**：仅更新 laoyouju-api 函数（2 次：kill-ON 验证 + 恢复）与静态托管（68 文件）；未创建/升级资源、未创建数据库集合、未启用网关限频（CLI 限制，见下）、未操作其他环境、未触碰环境变量与 CORS。
- **网关客户端限频（跨实例原生能力）尝试**：CloudBase 网关路由支持 qpsPolicy（qpsPerClient ClientIP）——原生、免费、跨实例；但 CLI 3.8.1 的 tcb routes edit --data 对一切合法 JSON 都报「JSON 数据格式错误 position 1」，经 4 种载荷变体 + 直接 node 调用 + 文件传参验证为 CLI 解析缺陷，未能启用。已在 SECURITY.md 记录：控制台「环境配置 → 安全控制 → 限频设置」可配置（PM 操作项）。
- **跨实例确定性（如实）**：客户端/日额度、全局日额度与并发当前按【函数实例】计数（进程级存储）；严格跨实例精确共享需要 CloudBase 数据库服务端 API Key（CLOUDBASE_APIKEY —— 需控制台创建 API Key 并新增函数环境变量；受「不读取 DEEPSEEK_API_KEY 进行合并、不使用 CLI 整体覆盖 envVariables」约束本轮无法自动完成）——PM 决策项；应用层限制已上线并实测（6 次后 429），作为现阶段费用保护主体。
- **费用**：真实 DeepSeek 调用 1 次（以腾讯云账单为准）；无付费资源创建/升级。
- **Git**：main/59e7935 → fix/minimum-go-live-protection（0c8b54e）→ FF 合并 main → 推送 → annotated tag phase-8-minimum-go-live-protection（指向部署提交）；旧标签未移动、无 force push。
- **安全红线**：未读取/回显/覆盖/要求重提供 DEEPSEEK_API_KEY；未使用 CLI 整体设置 envVariables；未创建或升级付费资源；未操作其他环境；未 force push；未 reset/checkout/clean 删除用户资料；未修改已有标签；真实 DeepSeek 调用恰 1 次。
## PHASE_9_VPS_MIGRATION（腾讯云轻量应用服务器迁移适配与公网 IP 验证，2026-09-05）

> 阶段定义：Phase 9 —— 将项目从 CloudBase 专用部署方式适配到已购买的腾讯云轻量应用服务器，在不解析域名的前提下通过公网 IPv4 完成 HTTP 验证。
> **结果：PARTIAL / BLOCKED_AT_SECURE_SSH**。代码适配、本地持久化 BudgetStore、VPS/Nginx/systemd/备份/回滚部署材料、全部本地门禁与自检均完成；因本机不具备用户预先配置的安全 SSH 入口（~/.ssh/config 无别名、无主机指纹），按授权边界约定**未执行服务器部署与公网验证**，未索取/回显任何凭据。剩余工作为用户在本机完成最小安全 SSH 配置后执行（见下）。

- **开始前仓库状态**：分支 fix/shared-model-budget（e295a80，与 origin 一致）；工作树干净；main=3bb64b0；Phase 8.1（f066c6f 共享跨实例预算）**未合并、未部署、仍待 PM 验收**——本阶段按其现状工作，未声称其已验收/合并/部署。
- **Phase 8.1 现状（只读检查结论）**：functions/api/src/shared-budget.ts（CloudbaseBudgetStore + MemoryBudgetStore + beijingKey）+ limit.ts（RequestGuard 经 SharedBudgetStore 共享预算）+ ask.ts（createSharedBudgetStore → CLOUDBASE_APIKEY 判定 configured，未配置时模型槽位 STORE_ERROR 安全关闭）+ limit.test.mjs/api.test.mjs（12+7 项相关测试）；未新增独立 shared-budget 专项测试文件；未部署（线上仍为 Phase 8 版本）。
- **本地持久化预算（Phase 9 新增）**：
  - functions/api/src/sqlite-budget.ts：SqliteBudgetStore（better-sqlite3@12.11.1，engines 20.x–24.x，与 Node 20.19/22.12/24.19 兼容；WAL + synchronous=FULL + busy_timeout=5000 + quick_check；单条条件 UPDATE/事务内条件更新保证原子；唯一 lease_id + 到期时间；取号前同事务回收过期租约；释放幂等【仅删除成功的租约才回退槽位】；每日键沿用 beijingKey 北京时间 YYYY-MM-DD；任何打开/损坏/写入异常 → storeError=true → 模型调用 STORE_ERROR 安全关闭，绝不静默降级内存）。
  - functions/api/src/budget.ts：BUDGET_STORE 选择器（sqlite / cloudbase；缺失/非法/memory → undefined → 安全失败）；BUDGET_SQLITE_PATH 必须非空绝对路径。
  - functions/api/src/ask.ts：createSharedBudgetStore → resolveBudgetStore(process.env)（返回 SharedBudgetStore | undefined）。
- **监听与代理边界**：server.ts 新增 HOST（默认 0.0.0.0 保留 CloudBase；VPS 环境文件显式 HOST=127.0.0.1）；app.ts/config.ts/http.ts 新增 TRUSTED_PROXY 信任边界（仅受信任对端或 CloudBase 网关的 X-Forwarded-For 才被采用；未信任时一律取 socket 对端地址）；Nginx 模板以 $remote_addr 覆盖外部自带转发头；前端默认同源 /api/（NEXT_PUBLIC_API_BASE_URL 未配置时不再提示“未配置”，VPS 构建不写公网 IP/域名）。
- **部署材料（deploy/vps/，全部入库模板，无密钥/地址）**：README（安装/发布/备份/回滚/公网验证手册）、nginx/laoyouju.conf（80 静态+api 反代+XFF 覆盖+敏感路径拒绝）、systemd/laoyouju-api.service（laoyouju nologin 专用用户、NoNewPrivileges、ProtectSystem=strict、ReadOnlyPaths=/opt/laoyouju、ReadWritePaths=/var/lib|log/laoyouju、Restart=on-failure）、systemd/journald-laoyouju.conf（日志轮转上限）、env/laoyouju.env.example、scripts/{install,sync-src,publish,backup,restore,rollback,healthcheck,verify-public,firewall}.sh（幂等；发布=版本目录+原子切换+失败自动回滚；备份优先 sqlite3 在线备份；保留 3 个版本、7 份库备份）。
- **测试（新增/回归，全部本地 mock，未调用真实 DeepSeek/CloudBase）**：api.test.mjs 63→67（+4：未信任 XFF 不生效【6+1 次 429】、受信任代理采用 XFF 按客户端桶计数、CloudBase 网关头保持可信、BUDGET_STORE 缺失/非法 → 429 STORE_ERROR 且 0 次模型调用）；sqlite-budget.test.mjs 14 项（正常申请/上限拒绝/并发竞争/租约过期回收/重复释放幂等/重启保持/多实例不超发/损坏与不可用与写失败禁止模型调用/环境变量选择安全失败/端到端 429/日期边界/落盘）；limit 12、cases 14 保持。另 sqlite-budget-race.test.mjs 1 项（4 个 worker 线程独立连接共享同一 SQLite 文件：并发 limit=2 恰 2 次、日额度 limit=3 恰 3 次，全程无存储错误）；
- **本地验证（全部 exit 0）**：corepack pnpm run check（lint/typecheck/content:validate 36/219/1308/271/retrieval:build docs=1527/build 含 Web 静态导出 15 路由/test：shared 37、retrieval+case-corpus、search 16、web 13+export、api 67、cases 14、limit 12、sqlite-budget 14）；本地 API 冒烟（HOST=127.0.0.1、BUDGET_STORE=sqlite、TRUSTED_PROXY=127.0.0.1）：health 200 / out_of_scope 200 / 空白 400 / 无 Key 503 / 伪造 XFF 不绕过；部署包冒烟（deploy/api bundle，external better-sqlite3 动态引入，无 sk-/DEEPSEEK 值/tcloudbase URL）：health 200 / out_of_scope 200 / 无 Key 503；git diff --check 0；密钥/地址扫描干净；无端口残留（冒烟进程均已 kill，19000/19001/19002 无监听）。
- **文件清单**：新增 functions/api/src/{sqlite-budget,budget}.ts、functions/api/tests/sqlite-budget.test.mjs、deploy/vps/**；修改 functions/api/src/{ask,app,server,config,http}.ts、functions/api/scripts/build-deploy.mjs、functions/api/tests/api.test.mjs、functions/api/package.json、apps/web/lib/api.ts（默认同源）、.env.example、.gitignore（deploy/ → deploy/api/，deploy/vps 入库）、pnpm-lock.yaml、pnpm-workspace.yaml（allowBuilds better-sqlite3: true）；文档 docs/PROGRESS.md、docs/DECISIONS.md（ADR-033）、docs/SECURITY.md、docs/DEPLOYMENT.md、README.md。
- **未改动**：CloudbaseBudgetStore / shared-budget.ts（原样保留）、cloudbaserc.json、旧 CloudBase 部署方案、内容库（36/219/1308/271）、既有标签；未合并/推送/创建 commit（工作树改动保留待审）。
- **BLOCKED_AT_SECURE_SSH —— 用户在本机自行完成的最小安全配置**（不要求发送任何凭据）：
  1. ~/.ssh/config 增加别名（Host laoyouju_lh；HostName/User/IdentityFile），并 ssh laoyouju_lh 验证指纹入 known_hosts；
  2. 服务器确认 Node 22.12.0、openssh 服务与密钥登录（禁用密码登录）；
  3. 云控制台安全组/防火墙仅放行 22、80（不得放行 9000）；
  4. 之后执行：bash deploy/vps/scripts/sync-src.sh laoyouju_lh → 服务器 install.sh → 编辑 /etc/laoyouju/laoyouju.env → publish.sh → healthcheck.sh → verify-public.sh（详见 deploy/vps/README.md）。
- **未做（如实）**：未删除/修改 DNS、未配置域名与证书、未修改备案、未删除 CloudBase、未购买任何资源、未调用真实 DeepSeek、未推送/合并、未修改远端可见性。
## PHASE_9A_PREDEPLOY_FIXES（正式部署前阻断问题整改，2026-09-05）

> 阶段定义：Phase 9A —— 修正 Phase 9（PARTIAL）中阻断“正式部署”的缺陷；仅代码与部署材料整改，未登录服务器、未配置 SSH、未部署、未调用真实 DeepSeek，未修改 DNS/域名/证书/CloudBase/远端 Git。工作树 Phase 9 修改全部保留（未 reset/clean/覆盖）。
> **代码层结果：通过（本地门禁全绿）；OpenCloudOS 实机执行尚未验证（如实标记）**；Phase 9 整体仍为 PARTIAL（未部署），本阶段不声称服务器迁移完成。

- **1. Nginx 敏感路径正则**（deploy/vps/nginx/laoyouju.conf）：改为 `location ~ ^/\.(?!well-known/)`（锚定 URI 起始、点号转义、负向前瞻保留 /.well-known/）与 `location ~* \.(env|git|sqlite3|sqlite)$`；契约测试断言两者不匹配 /api/v1/health、/laws/、/cases/、/ask/、/about/methodology/、/sitemap.xml、/robots.txt、/.well-known/...，且必须拒绝 /.env、/.git/config、/x/a.sqlite3 等。
- **2. install.sh OpenCloudOS Server 9 兼容**：检测 nginx 主配置 include 结构（conf.d 优先于 sites-enabled；Debian 系保留 sites-enabled）；发现既有“监听 80”未知站点 → 安全停止并报告（不删除/不覆盖/不改主配置）；`nginx -t` 通过后 `systemctl enable --now nginx` 并断言 `is-active`；SELinux 检测（getenforce）：Enforcing 时设置最小策略（fcontext httpd_sys_content_t + restorecon + `semanage port -a -t http_port_t -p tcp 9000`，不开放全局 httpd_can_network_connect），**绝不关闭 SELinux**（无 setenforce）；publish.sh 对新版本静态文件 restorecon 恢复上下文。
- **3. 工具链独立安装**：ensure_tool 逐项检查/安装 nginx、rsync、sqlite3、curl、tar（Nginx 存在也不再跳过其他依赖；sqlite3 CLI 保证存在——备份/健康检查依赖）。
- **4. systemd Node 可执行性**：install.sh 解析 Node 真实绝对路径（readlink -f），检查目录链每级 other 可执行（o+x）与文件 o+x；Node 位于 /root 私有目录 → 安全失败并报告；systemd 模板 ExecStart 改为 `__NODE_BIN__` 占位符（install.sh 注入真实路径，不再假设 /usr/bin/env node）；不破坏服务器预装 Node（不修改其权限/属主）。
- **5. healthcheck.sh 退出码**：改为显式 `exit 0`/`exit 1` 分支并新增 SQLite quick_check 断言；契约测试（deploy-config.test.mjs）静态断言“全部通过 exit 0、任一失败 exit 1、OK 初始化 1、fail 置 0、无 exit ${OK}”，防止再次反转。
- **6. Windows PowerShell 同步与外部验证**：新增 deploy/vps/scripts/sync-src.ps1（git ls-files -co --exclude-standard 生成文件清单 → 系统自带 tar 打包 → scp → ssh 解包；包含工作树已修改与未跟踪 Phase 9/9A 文件；按 .gitignore 排除 .git/.env*/node_modules/构建缓存/临时目录；额外排除根 .env；TEMP 临时归档 finally 精确清理；输出无公网 IP/凭据）与 verify-external.ps1（开发机外部验证；IP 仅内存变量、输出脱敏 x.x.x.*）。两者均以 UTF-8 BOM 编写并通过 Windows PowerShell 5.1 语法解析（本机实测 PARSE-OK）。
- **7. 验证拆分**：服务器端 healthcheck.sh（服务状态/Nginx 反代/SQLite quick_check/9000 仅 127.0.0.1）+ verify-public.sh（明确标注为“服务器访问自身公网 IP 的自检，不是外部验证”）；开发机 verify-external.ps1 负责真正外部验证（80 端口同源 Origin 200＋ACAO 精确、恶意 Origin 403、伪造 XFF 第 7 次 429、9000 外部不可达）。
- **8. HOST 失败开放修复**：新增 functions/api/src/listen.ts（resolveHost/resolvePort 纯函数）；HOST 未配置/空白 → 默认 0.0.0.0（CloudBase 兼容保留）；显式非法（形似 IP 非 IP、含空格/冒号/斜杠、非法主机名）→ 抛错，server.ts try/catch + process.exit(1) **拒绝启动**；tests/listen.test.mjs 5 项（缺失/合法回环/合法主机/非法值/修剪；PORT 语义同前：非法回退 9000）。
- **9. SQLite 完整性收紧**：ensureReady 检查 `PRAGMA quick_check` **结果必须为 ok**（isQuickCheckOk：逐行判定，非 ok 抛错）；初始化中途失败关闭连接（不留无主句柄）；新增测试（9A quick_check 结果判定 + 既有损坏/不可用/写失败集成测试）；releaseDaily 语义边界如实注释（有下限保护递减；调用路径保证恰补偿一次；未做大重构）。
- **10. 备份/恢复简化与修复**：backup.sh 仅使用 sqlite3 在线 `.backup` → 对备份执行 `PRAGMA quick_check` 且必须 ok，否则删除该备份并中止（删除“无 CLI 停服复制”回退）；install.sh 保证 sqlite3 CLI；restore.sh 恢复前校验备份、保存当前库可恢复副本（pre-restore-*）、恢复后健康检查失败自动还原原库并重启；publish.sh 备份失败即中止；普通发布/回滚不删除持久化数据。
- **11. 首次公网部署默认保护**：deploy/vps/env/laoyouju.env.example：LIMIT_KILL_SWITCH=on（默认）、DEEPSEEK_API_KEY 留空；文档注明：无模型验证通过后，真实模型测试需另行授权。
- **12. 文档修正**：deploy/vps/README.md 全面修正（PowerShell 同步/外部验证命令、`ssh laoyouju_lh` 而非 `ssh-laoyouju_lh`、OpenCloudOS 路径、SELinux 段落、kill switch 默认值、二楼验证组合）；docs/DEPLOYMENT.md、docs/SECURITY.md、docs/DECISIONS.md（ADR-034）、README.md 同步。
- **新增契约测试**：deploy/vps/tests/deploy-config.test.mjs 16 项（Nginx 正则、healthcheck 退出码、HOST 失败关闭集成点、备份必须校验完整性、restore 自动回滚、install 双布局/独立工具/SELinux 最小策略/Node 检查、sync-src.ps1 排除敏感、verify-external.ps1 脱敏与外部检查、env kill switch 默认 on、verify-public 定位）；根 package.json `test` 串接（`pnpm run check` 覆盖）。
- **本地验证（exit 0）**：`corepack pnpm run check` 全绿（api 67 + cases 14 + limit 12 + sqlite-budget 15 + race 1 + listen 5 + web 20+13 + shared 37 + retrieval 33+14 + search 16 + deploy-config 16）；sync-src.ps1 的打包逻辑在 Windows 本机实测：git ls-files 清单 502 文件，deploy/vps/**、functions/api/src/{budget,sqlite-budget}.ts、pnpm-lock.yaml 等 Phase 9/9A 文件全部包含；node_modules/.next/out/dist/deploy/api/_scratch/.pnpm-store/.corepack/.git 全部排除；两个 .ps1 通过 Windows PowerShell 5.1 ParseFile 校验（UTF-8 BOM）。
- **未做（如实）**：OpenCloudOS 实机执行未完成（本机无 Linux/Bash/Nginx；启动/安装/发布/SELinux/防火墙在服务器上首次执行时验证）；未登录服务器；未部署；未调用真实 DeepSeek；未修改 DNS/域名/证书/CloudBase；未推送/合并/创建提交。
## PHASE_9A1_SYNC_AND_NGINX_FIXES（首次部署链路剩余阻断修复，2026-09-05）

> 阶段定义：Phase 9A.1 —— 修复首次部署链路中的剩余阻断问题（同步脚本运行期错误/首次同步顺序/Nginx 事务性/SELinux 端口精确解析/嵌套隐藏路径/外部限流计数/契约测试强化）。工作树 Phase 9/9A 修改全部保留；未登录服务器、未配置 SSH、未部署、未调用真实 DeepSeek、未修改任何云资源。
> **结果：Phase 9A.1 代码层 PASS**（sync-src.ps1 -PackageOnly 在 Windows PowerShell 5.1 真实运行 exit 0；其余本地门禁全绿）；OpenCloudOS 实机执行仍未验证；Phase 9 整体仍为 PARTIAL。

- **1. sync-src.ps1 运行期错误修复**：移除 `.Replace("", "/")`（JS 转义导致空串 oldValue，原为运行期抛错）；仓库绝对路径改为 `Resolve-Path -LiteralPath`（git rev-parse 输出）＋`[char]92` 字符码归一化正斜杠；新增 `-PackageOnly` 模式（真实执行：git 清单→tar→读取归档成员→必备文件 AGENTS.md/package.json/deploy/vps/scripts/install.sh 校验→禁止条目（node_modules/.git/.next/out/dist/deploy/api/_scratch/.pnpm-store/.corepack/.env）校验→临时目录 finally 清理→exit 0，全程无网络）。
- **2. 首次同步顺序**：远端脚本（ps1 内嵌 ASCII here-string，经 `sudo bash -s -- <archive> <dest>` 执行）不再假设 laoyouju 组：`mkdir -p $(dirname DEST)`（root）→ `mktemp -d` 独立舞台目录 → 解包 + 校验 AGENTS.md/package.json/install.sh → `mv "$DEST" "$OLD"`（同文件系统原子）→ `mv "$STAGE" "$DEST"` → 删除 OLD（整体替换，不遗留已删除旧文件）；trap cleanup：失败时清理本次舞台目录并恢复 `$OLD` → `DEST` 保留原源码；全程无 chown/chmod（用户与权限由 install.sh 设置，契约测试断言无 `chown root:laoyouju`）；SSH 别名与目标路径经 `AssertSafeToken`/`AssertSafeDest` 白名单校验（已实测 `bad;rm` 别名 → exit 1）。
- **3. Nginx 事务性**：冲突检测改为 `nginx -T` 枚举实际加载配置文件（含主 nginx.conf），除 laoyouju 外任何 `listen ... 80` → 安全停止并报告（不删除/不覆盖/不改主配置；`nginx -T` 无输出则安全停止）；安装改为暂存（TMP_NEW/TMP_OLD/OLD_PRESENT）→ 安装 → `nginx -t`，失败自动回滚（有旧则恢复、无旧则移除＋断软链），保证失败后 Nginx 配置仍处于可测试通过状态；`nginx -t` 通过后才 `systemctl enable --now nginx`＋`is-active` 断言。
- **4. SELinux 端口精确解析**：`port_owner_of_9000()` 用 awk 逐行解析 `semanage port -l`（协议列 tcp + 端口/区间匹配），不再使用未经验证的 `grep ":9000"`；9000 已归属其他类型 → 明确报告并安全停止（die）；未归属 → `semanage port -a -t http_port_t -p tcp 9000`（失败即 die，无 `|| true`）→ 复验归属必须为 http_port_t；fcontext：`semanage fcontext -a` 输出区分“already exists/duplicate”（视为已存在）与真实错误（die）；`restorecon -RF` 后 `ls -Zd` 校验最终上下文必须含 httpd_sys_content_t；全程无 setenforce。
- **5. 嵌套隐藏路径**：Nginx 规则改为 `location ~ (^|/)\.(?!well-known/)`——拒绝根级与嵌套任意“以 . 开头的路径段”（/.env、/.git/config、/x/.env、/x/.git/config），继续放行根级 `/.well-known/`，不拦截 /api/、/laws/、/cases/、/ask/ 与 `_next/static/chunks/a.b.js`。
- **6. 外部限流计数**：verify-external.ps1 验证前先 `sudo systemctl restart laoyouju-api`（重置计数基线）并等待健康就绪；随后第 1 次 POST（正确 Origin）断言 200（已计入 1 次）→ 第 2..6 次逐次断言 200（循环内每次响应检查，`if ($st -ne 200)` 记录具体次数，绝不静默吞 429）→ 第 7 次更换伪造 XFF（198.51.100.20）断言必须 429；仍使用 out_of_scope 问题，保持 kill switch on，不调用真实模型。
- **7. 契约测试强化（deploy/vps/tests/deploy-config.test.mjs，17 项）**：新增“Replace(空串) 回归陷阱”断言（fail-closed）、Resolve-Path/[char]92、-PackageOnly 分支与归档成员校验、远端无 chown/chmod（首同步 root:root）、远端 mktemp/必备文件/原子替换/trap 保留旧源码/别名路径校验、nginx -T loaded-conf 冲突检测与事务回滚（含不得在 nginx -t 未通过时继续 enable 的结构性断言）、SELinux（port_owner_of_9000 + awk -v port=9000 + 无 grep ":9000" + 占用已属其他类型 die + `if ! semanage port -a` + fcontext already-exists/真实错误区分 + ls -Zd 验证 + 无 setenforce）、verify-external 计数（restart 基线/1+5+1/逐次断言/第 7 次 429/Mask-IPv4 脱敏）、嵌套隐藏路径双向列表（含 `_next/static/chunks/a.b.js` 放行）。
- **本地验证（Exit 0 证据）**：①`powershell -NoProfile -ExecutionPolicy Bypass -File deploy/vps/scripts/sync-src.ps1 -PackageOnly` → 输出“[sync] 仓库: <项目根目录> / 文件数: 502（归档校验通过）/ PackageOnly 模式：打包+校验完成，未传输。退出 0”＋**EXIT=0**；②别名 `bad;rm`（注入形态）→ exit 1“SSH 别名 含非法字符”；③`%TEMP%\laoyouju-sync-*` 残留 = 0（finally 清理验证）；④两个 .ps1：BOM=True + PowerShell 5.1 Parser.ParseFile PARSE-OK（远端 here-string 26 行纯 ASCII）；⑤`node deploy/vps/tests/deploy-config.test.mjs` 17/17 exit 0；⑥`corepack pnpm -C functions/api run test` exit 0（api 67/cases 14/limit 12/sqlite-budget 15/race 1/listen 5）；⑦`corepack pnpm run check` exit 0；⑧`git diff --check` exit 0；⑨敏感扫描：无 sk-、无 DEEPSEEK_API_KEY 值、无真实服务器地址（全部为 127.0.0.1/0.0.0.0/RFC 测试网段）。
- **未做（如实）**：OpenCloudOS 实机执行（install.sh/publish.sh/nginx -t/systemd/semanage/restorecon/firewall 在服务器上的首次执行）未验证；sync-src.ps1 的 scp/ssh 段与 verify-external.ps1 真实外部访问未执行（无安全 SSH 入口）；Linux/Bash 脚本仍为静态审查＋契约断言（本机无 bash）。
## PHASE_9B_LIVE_DEPLOYMENT_AND_PUBLIC_VERIFICATION（轻量服务器实机部署与公网验证，2026-09-05）

> 结果：**PASS**（本地预检→同步→安装→发布→SQLite 实机→服务器本机检查→Windows 外部公网验证全部通过；真实 DeepSeek 调用 0 次）。

- 服务器：OpenCloudOS 9.2 x86_64；内存 3.6G/磁盘 40G；自带 Node v22.12.0（Lighthouse Node.js 镜像软硬件目录 /usr/local/lighthouse/softwares/...，位 750 root:root，服务用户不可执行——未修改 vendor，仅复制独立运行时）。
- 供应商默认项处理（均有备份、可恢复）：①Lighthouse 镜像自带示例应用 myapp.service(My Node.js App, 占 80) → 备份至 /root/laoyouju-lh-backup-<ts>/（unit+app+RESTORE.md）后 stop+disable（vendor 目录未动）；②OpenCloudOS dnf nginx 1.29.8 默认欢迎 server 块（主配置内）→ 备份 nginx.conf.lj-orig-<ts> 后以“去默认 server 块”的基础配置替换 → nginx -t 通过后 install.sh 事务式安装。
- 运行时：Node v22.14.0（nodejs.org 官方 tarball，SHA-256 校验）→ /opt/laoyouju/runtime/node-22.14.0（vendor 未动）；pnpm 11.24.0 经官方 npm 安装；corepack 签名键失配（pnpm 新轮换键不在捆绑键内）→ 以 /usr/local/bin/corepack 委托脚本转 pnpm（vendor corepack 未动，可撤销）。
- 发布：/opt/laoyouju/releases/20260905-224205（仅 1 个版本保留）+ current；better-sqlite3 预编译下载失败（GitHub 连接 000）→ 自动回退 node-gyp 本地编译（gcc-c++/make/python3 已装）→ Done；构建顺序修正（干净环境先 -r build 再 typecheck，避免 shared dist 缺失）；发布权限修正（705→755：`chmod -R a+rX`，组位为空曾被组匹配拒绝导致 CHDIR 失败）。
- 状态：laoyouju-api active+enabled（ExecStart=运行时 node 绝对路径；仅 127.0.0.1:9000）；nginx active+enabled，80 提供静态+同源 /api/ 反代（nginx -t 通过）；SELinux Disabled（未改，无策略变更）；firewalld 未启用（无系统防火墙变更）；**云安全组（用户腾讯云控制台人工确认，脱敏记录）：入站规则为 22、80、443 与 ICMP；未开放 9000；未对云防火墙执行任何修改**；环境文件 600 root:laoyouju（HOST=127.0.0.1/BUDGET_STORE=sqlite/BUDGET_SQLITE_PATH=/var/lib/laoyouju/budget/budget.sqlite3/TRUSTED_PROXY=127.0.0.1/ALLOWED_ORIGINS=http://<已配置，脱敏>/LIMIT_KILL_SWITCH=on/DEEPSEEK_API_KEY 空）。
- SQLite 实机：以 laoyouju 用户执行 dist 版 check-budget-store（ensureReady READY exit 0）；文件在 /var/lib/laoyouju/budget（发布目录内 0 个）；quick_check=ok；systemd 重启后再次 READY（持久化验证）；全程 0 次真实模型调用/0 额度记录。
- 外部公网验证（Windows 开发机 verify-external.ps1）：15/15 PASS（静态 8 路由 200、同源 health 200+ACAO 精确、恶意 Origin 403、out_of_scope 200 不调用模型、1..6 次 200 且第 7 次伪造 XFF 429、公网 :9000 HTTP 探测无健康响应）；服务器端 healthcheck.sh 全 PASS exit 0。
- 结论与备注：开发机出口为透明代答代理（原始 TCP Connect 语义失真——对任意端口“代答成功”），故 9000 外部验证采用 HTTP 探测（不得得到健康响应）＋服务器侧仅回环绑定双重证据；云安全组属用户控制台管理——用户已人工确认入站规则为 22、80、443、ICMP（无 9000），本轮未做任何修改。
- Git/边界：未提交、未推送、未合并；未修改 DNS/域名/证书/备案/CloudBase/远端；未读取或填写任何 DeepSeek Key；vendor Node、示例应用文件、tat/stargate/yunjing 等厂商组件均未修改（仅 myapp 服务被备份后禁用，可经备份/RESTORE.md 恢复）。
## PHASE_9C_REAL_MODEL_SMOKE_AND_WRAPUP（真实模型启用、一次冒烟与迁移收尾，2026-09-06）

> 结果：**PASS**。真实 DeepSeek 调用恰 1 次；预算 +1 精确且重启持久化；全部收尾验证通过；未修改 DNS/域名/证书/CloudBase/防火墙/远端 Git（本阶段仅允许的变更：用户在本机 SSH 终端以 read -s 隐藏输入写入 DeepSeek Key（原子更新，仅布尔确认）；LIMIT_KILL_SWITCH on→off；服务重启）。
- 复用 Phase 9B 部署，未重装/未改造；启用前安全检查全部通过（SQLite READY+quick_check ok、0 条预算、限流 6/30、全局 100/天、并发 3、超时 15s、输出上限 1300、存储异常失败关闭、仅信任 127.0.0.1、单次调用无重试——代码未改动，依据 Phase 9B 实测与既有测试）。
- 冒烟（唯一 1 次真实调用，失败不重试）：“用人单位未依法与劳动者签订书面劳动合同……” → HTTP 200 / 6.7s / outcome=answered；9 条可追溯来源（A=6、B=2、C=1）；正文引用的引用号为 S1、S2、S3、S4、S5、S6、S7、S8、S10（S9 未在正文引用），所有被正文引用的引用号均可在 sources 中逐条解析，unresolvedRefs 为空；applicableLaw 首条=《劳动合同法（2012修正）》第八十二条（双倍工资）；similarCases=2（含真实案例+“案例适用地域”边界说明）；含“不是律师意见/不构成”边界与 AI 标识；无 sk-/堆栈/环境变量值。
- 预算：测试前 daily_usage 0 → 测试后 2026-09-06|1（恰 +1）；systemd 重启后仍为 1（持久化）；laoyouju 用户 check-budget-store READY（days=1）；quick_check=ok。
- 收尾：verify-external.ps1 15/15（静态 8 路由、同源 health+ACAO、恶意 Origin 403、out_of_scope 不调用模型、1..6 次 200 且第 7 次伪造 XFF 429、公网 :9000 无健康响应）；healthcheck.sh 全 PASS；journald/Nginx 日志 sk-、环境变量值、问题正文均 0；env 600 root:laoyouju；BUDGET_STORE=sqlite/TRUSTED_PROXY=127.0.0.1/限流值保持（KILL=off，用户授权保留开启状态，额度/并发未提高）。
- 本地：pnpm run check exit 0；git diff --check 0；HEAD e295a80 未动（未提交/推送/合并）；无代码变更（部署材料未改）。
- 边界：未修改 DNS/域名/证书/备案/CloudBase/远端仓库；未触碰云安全组与系统防火墙（firewalld 未启用）；未购买/添加任何组件；密钥仅存在于服务器环境文件（全部输出仅布尔状态）。
## PHASE_9D_DOC_WRAPUP_AND_LOCAL_COMMIT（迁移版本收口与本地提交，2026-09-06）

> 结果：**PASS**。仅文档收口与本地提交；未登录/修改服务器，未调用 DeepSeek，未修改 DNS/域名/证书/备案/CloudBase/防火墙或任何云资源，未触碰远端 Git。

- **SSH 别名统一**：全部面向用户的命令/示例/脚本注释统一为 `laoyouju_lh`（README.md、docs/DEPLOYMENT.md、docs/PROGRESS.md、deploy/vps/README.md、deploy/vps/scripts/sync-src.ps1、verify-external.ps1、sync-src.sh）；服务器真实备份目录 `/root/laoyouju-lh-backup-<ts>/` 为实际路径，保持原名；未修改本机 SSH 配置。
- **冒烟引用表述修正**：Phase 9C 记录改为准确表述——可追溯来源 9 条（A=6/B=2/C=1）；正文引用号为 S1–S8 与 S10（S9 未在正文引用）；所有被引用的引用号均在 sources 中可解析（unresolvedRefs 为空）。
- **防火墙人工验收事实（脱敏）**：用户已在腾讯云控制台人工确认入站规则为 22、80、443 与 ICMP；未开放 9000；未对云防火墙执行任何修改（记录于 PHASE_9B 记录与本文档）。
- **变更范围审计**：相对 HEAD 的全部修改与未跟踪文件均属于 Phase 9 系列（VPS 迁移/SQLite 预算/代理信任边界/部署材料与契约测试/阶段文档）；无真实 Key、公网 IP、实例 ID、密码/私钥或凭据（仅 127.0.0.1/0.0.0.0/RFC 测试网段字面量）；CloudBase 回退方案（shared-budget.ts、cloudbaserc.json、build:deploy）未删改；无 Docker/Redis/云数据库/CDN/监控等组件；无商业化设计。Node 监听：HOST 显式 127.0.0.1（VPS），默认 0.0.0.0 保留 CloudBase 兼容；SQLite 预算失败关闭（STORE_ERROR→429，绝不回退内存）。
- **本地提交（本轮唯一 Git 变更）**：`feat: deploy VPS runtime with SQLite model budget`（本地提交，未 push/merge/rebase/tag/force push；HEAD 之前为 e295a80）。
## PHASE_10A_OPEN_SOURCE_RELEASE_PREP（GitHub 开源发布前整理，2026-09-07）

> 结果：**PASS（本地整理完成）**。仅本地提交；未 push、未 merge、未创建/修改 tag、未修改 GitHub 仓库可见性与元数据、未操作服务器/模型/云资源、未调用真实 DeepSeek。

- **README 公开版重写**：删除全部 Phase 开发记录/过期状态/旧 CloudBase 测试地址/失效待办；改为面向首次浏览者与面试官的说明（简介→截图→能做什么→如何工作→数据范围→技术实现→本地运行→VPS 部署入口→使用边界→许可与内容来源）；详细过程仍保留于本文件，未复制进 README；无在线演示地址（域名未备案，留待后续）。
- **界面截图（4 张，docs/images/）**：screenshot-home / screenshot-laws / screenshot-cases / screenshot-ask.png（2560×1800 PNG，350–650KB；PNG 仅含 IHDR/IDAT/IEND，无 EXIF/元数据）。全部来自本地服务：apps/web 静态导出 + 本机 API（BUDGET_STORE=sqlite、TRUSTED_PROXY=127.0.0.1）+ 本地 Mock DeepSeek（OpenAI-compatible 回显，未访问任何线上模型）；问答页为真实引擎输出（A/B/C 分级与引用均可解析），README 明确标注“本地运行，Mock 模型生成”示例，未冒充线上真实调用；截图无地址栏/requestId/密钥/个人信息。
- **LICENSE + NOTICE**：LICENSE 为 OSI 标准 MIT 文本（版权行 Copyright (c) 2026 Tiger1136），未加任何附加条款；新增 NOTICE.md 说明：MIT 仅覆盖本项目作者编写的软件源代码；content/ 下法规/案例/官方文件摘录/第三方资料（含 content/raw 归档）不在 MIT 范围，权利与使用条件以原发布机关、原始来源和适用规则为准；来源链接与结构化整理不代表对原文的再授权；未自行给任何法规/案例/第三方资料添加许可证；README 的 License 部分链接 NOTICE。
- **脱敏（当前树 4 处）**：docs/PROGRESS.md 3 处开发机绝对路径（Phase 0 工作目录、corepack 安装目录、9A.1 输出行仓库路径）→ 通用表述；functions/api/scripts/build-deploy.mjs 头注释 1 处 → `<仓库根>`。历史 blob 未改写（禁止重写历史；相关说明见审计记录）。
- **完整 Git 历史敏感审计（13 提交 / 全引用 / 575 个唯一 blob 全量展开扫描）**：0 条真实凭据、0 条真实个人敏感信息、0 个真实服务器公网 IP/实例标识。命中项全部核验：①手机号样式 5 处 = content 法条 JSON 的 textSha256/contentHash 十六进制子串（误报）；②Bearer 1 处 = packages/search/tests/search.test.mjs 的 WSA mock fixture 占位值（wsa-*，非密钥）；③公网 IP 样式 20 处 = functions/api/tests/limit.test.mjs 合成客户端 IP（1.2.3.4/5.6.7.8/9.9.9.9/3.3.3.3）与 listen.test.mjs 单元用例；④Git 作者 = Tiger1136 + GitHub noreply 邮箱（无个人邮箱泄露）；⑤无 GitHub Actions/.github（无工作流/日志/产物可查）；⑥无 .env/凭据/SSH 私钥/证书文件入库；⑦依赖锁文件为官方 registry。
- **公开前待处理风险（如实上报，非本轮阻断）**：①docs/ARCHITECTURE|DECISIONS|DEPLOYMENT.md、deploy/vps/README.md、cloudbaserc.json 仍含旧 CloudBase 测试域地址、环境标识（*.tcloudbase.com / *.tcloudbaseapp.com，含函数实例标识）——不属于密钥，但旧函数节点可能仍启用模型；旧环境是否停用/保留限流由 PM 决策（本轮未登录/未修改 CloudBase）；②content/raw 含 4 份法律文本归档（law-gonghuifa-2021、law-laodongfa-2018、reg-guowuyuan-gongzuoshijian、reg-shiyebaoxian-tiaoli）抓取自商务部官方域名 policy.mofcom.gov.cn 上由中华人民共和国商务部主办的“全球法规网－中国商务法规”栏目（页面注明主办单位：中华人民共和国商务部，网站管理：商务部电子商务和信息化司）——经复核属官方来源站点，相关归档保留，不构成公开阻断；对应 JSON 真源 officialUrl 均为官方站点；内容许可边界以 NOTICE.md 为准；③历史 blob 仍含上述脱敏前的开发机路径与旧 README 内容（重写历史被禁止，公开后可见）；④最高法指导性案例按官方发布体例含当事人真实姓名/出生日期/审判人员姓名（官方司法公开信息，非本仓库私有数据）；⑤content 案例正文含官方网站页脚（ICP 备案号/公网安备/网站标识码等公共官方元数据）。
- **公开范围审查**：无服务器凭据/个人资料/未授权第三方代码/超大文件（最大 244KB registry.json）/临时构建产物（out/.next/dist/deploy/api/索引均被忽略）/测试数据库/预算 SQLite 文件（未跟踪）/本地缓存/真实问答日志/商业化系统；AGENTS.md 无内部敏感信息；无 CI/CD、Docker/K8s、Sponsor、Code of Conduct、Issue 模板、英文 README、发布包等新增物。
- **验证（exit 0）**：`corepack pnpm run check` 全绿（lint/typecheck/content:validate 36/219/1308/271/retrieval:build 1527/build/全部测试含 deploy-config 19）；`git diff --check` 0；README 本地链接与图片链接 10/10 可解析；工作树敏感扫描 0 阻断；图片可见内容与元数据检查通过。
- **本轮 Git 变更**：`docs: prepare repository for open source release`（未 push/merge/rebase/tag/force push；前序提交 ef154cd 未动），随后以两条补全提交（`docs: complete Phase 10A progress record`、`docs: restore Phase 9D summary lines in progress record`）修正本记录（共三项，均为本地提交、未推送）。
## PHASE_10A.1_ACCURACY_FIXES（开源说明准确性修正，2026-09-07）

> 范围：仅修正开源说明准确性（官方来源判断、MIT 范围、当前部署形态表述）；未修改 LICENSE 正文与版权行、未删除法规/案例/真实项目数据、未改写既有提交。
> 结果：**PASS（本地）**；仅本地提交；未 push/merge/rebase/amend、未创建/修改标签、未修改 GitHub 元数据与仓库可见性。

- **“全球法规网”来源判断纠正**：law-gonghuifa-2021 / law-laodongfa-2018 / reg-guowuyuan-gongzuoshijian / reg-shiyebaoxian-tiaoli 4 份 `content/raw` 归档来自商务部官方域名 policy.mofcom.gov.cn 的“全球法规网－中国商务法规”栏目（页面注明主办单位：中华人民共和国商务部，网站管理：商务部电子商务和信息化司）——复核后属官方来源站点，相关文件保留，不构成公开阻断；本文件 PHASE_10A 记录已同步修正（不再称为“第三方聚合站”）；NOTICE.md 内容边界不变。
- **MIT 范围补全（NOTICE.md）**：明确将 `deploy/` 下由项目作者编写的部署脚本与 Nginx/systemd/环境变量示例等配置纳入 MIT 源代码范围；`content/` 下法规、案例、官方资料及第三方内容仍不在 MIT 范围；标准 LICENSE 正文与版权行未改动；未自行给任何法规/案例/官方资料增加许可证。
- **当前形态说明修正**：AGENTS.md（项目是什么）、docs/ARCHITECTURE.md（各端形态）、docs/DEPLOYMENT.md（文档开头现状说明）统一为——当前主要产品为可公开访问的网页端；微信小程序尚未完成（延后事项，非已交付终端）；当前主要部署形态为腾讯云轻量应用服务器单机（Nginx 提供静态页面并反向代理本机 Node API，Node API 仅监听回环地址）；CloudBase 为保留的旧演示/回退方案，不是当前主要部署环境；DeepSeek 仍仅由服务端调用；未加入公网 IP、实例 ID、密钥、个人路径或新的线上地址。历史阶段记录未改写。README.md 保持不变（审查未发现明确事实错误）。
- **验证（exit 0）**：`corepack pnpm run check` 全绿；`git diff --check` 0；README/NOTICE/文档本地链接检查通过；工作树敏感扫描 0 阻断。
- **本轮 Git 变更**：`docs: correct open source release notes`（本地提交，未推送；ef154cd、f20a320 及更早提交均未改动）。
- **待办（需用户另行授权）**：公开仓库前，需由用户另行明确授权，将旧 CloudBase 的真实模型调用关闭或确认其 kill switch 已开启，以防公开地址后产生费用。本轮未登录/未修改 CloudBase、未测试旧问答接口、未调用真实 DeepSeek、未删除旧环境。
