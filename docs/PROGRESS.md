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

- 工作目录 `E:\ds-workspace\Laoyouju` 为空目录；
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
- 本机 `corepack enable` 因无法写入 Node 安装目录（`D:\nodejs`）失败；已改用工作区内 COREPACK_HOME 方案，不影响功能。

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
## PHASE_7B_LIVE_DEPLOYMENT_AND_ACCEPTANCE（201 例版部署与线上验收，2026-08-28）

> 项目经理验收通过后授权执行。仅部署与线上验证；未修改检索算法/内容，未启用 WSA/域名/ICP/小程序/GitHub，未创建/升级付费资源，cloudbaserc.json 无 envVariables（未触碰控制台环境变量，未读/未回显 DEEPSEEK_API_KEY）。

- **门禁复核**：pnpm run check exit 0（retrieval 28/28、case-corpus 14/14、shared 30/30、search 16/16、api 42/42、web 29/29）。
- **部署 API**：build:deploy 生成 deploy/api（server.js 约 712KB；content/laws 34、content/cases 201、registry.json）；本地干净目录验证（health 200/支付宝 out_of_scope/红烧肉 out_of_scope/纯标点 400/工伤 needs_clarification/OPTIONS 204/evil 403）通过；tcb fn deploy api --yes 成功；未传 envVariables。
- **部署 Web**：以真实 API 地址（NEXT_PUBLIC_API_BASE_URL=…service.tcloudbase.com、NEXT_PUBLIC_SITE_URL=真实测试域）next build（15 路由）后 tcb hosting deploy apps/web/out（65 个文件）。
- **线上协议级验证（全部通过）**：health 200；/ /laws /cases /topics /ask 均 200；线上 /cases 402 个案例标记（=201 例×2，证明 201 例版）；OPTIONS /api/v1/ask 204 + 单值精确 ACAO + methods POST；允许 Origin 的 health/成功 POST ACAO 均单值精确=网站 Origin；evil Origin POST 403 且响应无 ACAO（不反射）；支付宝提现手续费是多少 → 200 out_of_scope（fixed 文案、sources=0）；怎么做红烧肉 → 200 out_of_scope 转题引导；/ask noindex；sitemap 9 条不含 /ask；robots Disallow /ask（+ /ask/）。
- **真实 DeepSeek Smoke Test**（唯一问题：竞业协议签了不想干了，公司要我赔钱怎么办？；累计真实调用 2 次——第 1 次 200/约 15.8s 但响应体未被本地脚本捕获（保存代码有误），第 2 次为同问题重放以完成内容验收，requestId 67ce95dc-9366-45a7-840e-40917c5bd010，200/约 16.0s）：outcome=answered；applicableLaw 9 条（全部 A 级：劳动合同法 §23/§24、解释一 §36–§40、解释二 §13/§14，均带 [S#]）；similarCases 2 条 B 级官方案例（[S10] case-cy-ldzzy-2024-01-10 川渝典型案例、[S11] case-zgf-zdxal-2022-32pi-06 最高法 32 批指导案例（马筱楠诉搜狐））；sources=11 全部来自本次证据集；issueIdentification/preliminaryConclusion/nextSteps/evidenceChecklist/factsToConfirm/boundaries/aiNotice（固定 AI 标识）齐全；无虚构法条/案号/法院/金额/网址；响应无密钥/堆栈/环境变量。
- **201 例版本证明**：① 部署包 content/cases=201 文件；② 线上 /cases 402 标记=201 例；③ Smoke Test 引用的 case-cy-ldzzy-2024-01-10 不在旧 53 例部署包批次内（Phase 7B 新增），证明 API 运行 201 例知识库。
- **备注**：同步耗时约 15.9–16.0s（模型超时 15s、链路上限约 20s），处于预算边缘但成功；已记录待跟进。
- **费用**：真实 DeepSeek 2 次调用（以腾讯云账单为准）；无付费资源创建/升级；未启用 WSA。
- **文件变更**：docs/DEPLOYMENT.md（当前部署状态表更新为本轮）、docs/PROGRESS.md（本记录）；无源码/内容/cloudbaserc.json 变更；未创建 commit/remote。

## PHASE_7C_SHANDONG_OFFICIAL_CORPUS（山东官方案例与裁审口径专项，2026-08-28）

> 阶段定义：山东官方案例 +30~50（目标 231~251 总量）+ 山东裁审口径收录；**结果：PARTIAL（新增 18 例）**——真实全文官方可用批次受限（山东法院网多站点 500/连接中断、多批次发布会页无案例全文、官方全文页未能全部定位），未达 30 例最低线；宁缺毋滥，未拆改凑数。分支 feat/shandong-official-corpus，未合并 main、未部署。

- **案例新增（18 例，全部官方全文）**：山东省高院 2021-04-29 劳动人事争议典型案例（8，ytlzfy/sdcourt 官方页）；山东省高院+省人社厅 2023-12-28 新就业形态劳动争议典型案例（6，聊城市人社局官网全文转载）；山东法院劳动者权益司法保护十大典型案件成员（1，齐某与某人力公司案，庆云法院网）；山东省 2024 年度劳动人事争议十大典型案例成员（1，安丘法院服务期违约金案，含诉讼请求）；《山东民事审判参考》典型案例栏目 2 例（济南期票案、肥城群体性纠纷案）——青岛黄某纺织公司案为入选最高法解释（二）典型案例，与库内 case-laodongzhengyi-typical-2025-05 重复，已跳过。
- **地方裁审口径（2 份，C 级）**：山东高院+省人社厅 2019-06-10《关于审理劳动人事争议案件若干问题会议纪要》（25 项）；山东高院 2021-11-01《劳动争议热点难点问题诉讼指引》（7 大部分）。
- **schema 最小扩展（含测试）**：law sourceType 新增 local_guidance（authorityLevel 允许 A/C、jurisdiction 允许省级；validator 双向强制：地方指引必须 C 级+省级，全国性规范必须 A 级+全国性+全国性机关）；CaseSourceSchema 新增可选 claims。
- **规模**：laws=34→36、cases=201→219、provisions=1276→1308、registry=251→271；19 主题每主题 ≥5 案例保持；省级地区覆盖 13（新增山东省）；去重：标题/URL/案情指纹无重复（含与既有 201 例交叉查重，case-corpus 14/14 通过）。
- **门禁/测试**：content:validate PASS（36/219/1308/271）；retrieval:build OK（docs=1527，两次构建字节一致）；retrieval.test **31/31**（原 28 + 新增 3 项：6 条山东黄金查询通用能力断言、山东案例数据层回归、地方指引 C 级/省级双约束校验）；case-corpus **14/14**；`pnpm run check` exit 0；git diff --check 通过；支付宝提现手续费/怎么做红烧肉等仍无劳动法证据（领域门控全绿）。
- **未收录（明确记录）**：菏泽“菏”法护薪品牌事例（工作事例非个案）；淄博高新区/省人社厅 2024 年度十大新闻（无全文，官方全文页未定位）；青岛中院 2022-04-28 白皮书十大案例（发布会页无全文）；山东法院“人民法院案例库裁判要旨汇总”（仅要旨无案情/结果）。
- **安全**：未读取/修改 DEEPSEEK_API_KEY；未调用真实 DeepSeek/WSA；未操作 CloudBase/未部署；无付费资源；未改 GitHub 可见性；未删除 phase-7b-live-201 标签；无 force push。
- **文件变更**：content/laws +2、content/cases +18、content/raw（phase7c 案例原文 + 2 份指引原文）、content/sources（probe 清单、registry 重建）、scripts/import-cases.mjs（phase7c/点评/claims 支持）、scripts/import-registry.mjs（authorityLevel 按文档）、scripts/import-sd-guidance.mjs（新增）、packages/retrieval schemas/validate/catalog、retrieval.test.mjs（+3 项）、docs/CONTENT_REVIEW.md、docs/CASE_COVERAGE_AUDIT.md（重建）、docs/DECISIONS.md（ADR-030）、本文件。